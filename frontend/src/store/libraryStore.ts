import { create } from "zustand";
import { getErrorMessage } from "../lib/errors";
import {
  MAX_PHOTOS,
  deletePhoto,
  importPhoto,
  listPhotos,
  signThumbs,
} from "../lib/photos";
import type { Photo } from "../lib/photos";

export type ImportState = "queued" | "working" | "done" | "error";

export interface ImportItem {
  key: string;
  name: string;
  state: ImportState;
  message?: string;
}

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  ownerId: string | null;
  photos: Photo[];
  urls: Record<string, string>;
  status: LoadStatus;
  error: string | null;
  selectedId: string | null;
  imports: ImportItem[];
  importing: boolean;
  load: (userId: string) => Promise<void>;
  refreshUrls: () => Promise<void>;
  select: (id: string | null) => void;
  importFiles: (files: File[], userId: string) => Promise<void>;
  remove: (photo: Photo) => Promise<void>;
  dismissImports: () => void;
}

const EMPTY = {
  photos: [] as Photo[],
  urls: {} as Record<string, string>,
  selectedId: null as string | null,
  imports: [] as ImportItem[],
  importing: false,
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ownerId: null,
  ...EMPTY,
  status: "idle",
  error: null,

  load: async (userId) => {
    // Never show one account's photos to another account on the same browser
    if (get().ownerId !== userId) set({ ...EMPTY, ownerId: userId });
    set({ status: "loading", error: null });
    try {
      const photos = await listPhotos();
      const urls = await signThumbs(photos);
      set({ photos, urls, status: "ready" });
    } catch (err) {
      set({ status: "error", error: getErrorMessage(err) });
    }
  },

  refreshUrls: async () => {
    try {
      const urls = await signThumbs(get().photos);
      set({ urls });
    } catch {
      // The old links keep working until they expire; the next refresh will try again
    }
  },

  select: (id) => set({ selectedId: id }),

  importFiles: async (files, userId) => {
    if (get().importing || files.length === 0) return;

    const batch = Date.now();
    const items: ImportItem[] = files.map((file, index) => ({
      key: `${batch}-${index}`,
      name: file.name,
      state: "queued",
    }));
    set({ imports: items, importing: true });

    const patch = (key: string, change: Partial<ImportItem>) =>
      set((state) => ({
        imports: state.imports.map((item) =>
          item.key === key ? { ...item, ...change } : item,
        ),
      }));

    for (const [index, file] of files.entries()) {
      const key = items[index].key;
      patch(key, { state: "working" });
      try {
        if (get().photos.length >= MAX_PHOTOS) {
          throw new Error(
            `You can keep up to ${MAX_PHOTOS} photos. Delete one to import more.`,
          );
        }
        const photo = await importPhoto(file, userId);
        let urls: Record<string, string> = {};
        try {
          urls = await signThumbs([photo]);
        } catch {
          // The photo is saved; its thumbnail link will arrive on the next refresh
        }
        set((state) => ({
          photos: [photo, ...state.photos],
          urls: { ...state.urls, ...urls },
        }));
        patch(key, { state: "done" });
      } catch (err) {
        patch(key, { state: "error", message: getErrorMessage(err) });
      }
    }
    set({ importing: false });
  },

  remove: async (photo) => {
    await deletePhoto(photo);
    set((state) => ({
      photos: state.photos.filter((item) => item.id !== photo.id),
      selectedId: state.selectedId === photo.id ? null : state.selectedId,
    }));
  },

  dismissImports: () => set({ imports: [] }),
}));
