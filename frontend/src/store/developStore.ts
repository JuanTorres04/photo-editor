import { create } from "zustand";
import { DEFAULT_SETTINGS } from "../develop/settings";
import type { EditSettings, SettingKey } from "../develop/settings";
import { saveEdit } from "../lib/edits";
import { useToastStore } from "./toastStore";

const SAVE_DELAY_MS = 700;
let timer: number | undefined;

interface DevelopState {
  photoId: string | null;
  settings: EditSettings;
  savedJson: string;
  saving: boolean;
  saveFailed: boolean;
  open: (photoId: string, settings: EditSettings) => void;
  setValue: (key: SettingKey, value: number) => void;
  resetKey: (key: SettingKey) => void;
  resetAll: () => void;
  flush: () => Promise<void>;
}

export const useDevelopStore = create<DevelopState>((set, get) => {
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  };

  return {
    photoId: null,
    settings: DEFAULT_SETTINGS,
    savedJson: JSON.stringify(DEFAULT_SETTINGS),
    saving: false,
    saveFailed: false,

    open: (photoId, settings) => {
      window.clearTimeout(timer);
      set({
        photoId,
        settings,
        savedJson: JSON.stringify(settings),
        saving: false,
        saveFailed: false,
      });
    },

    setValue: (key, value) => {
      set((state) => ({ settings: { ...state.settings, [key]: value } }));
      schedule();
    },

    resetKey: (key) => get().setValue(key, DEFAULT_SETTINGS[key]),

    resetAll: () => {
      set({ settings: DEFAULT_SETTINGS });
      schedule();
    },

    flush: async () => {
      window.clearTimeout(timer);
      const { photoId, settings, savedJson, saving } = get();
      const json = JSON.stringify(settings);
      if (!photoId || saving || json === savedJson) return;

      set({ saving: true, saveFailed: false });
      try {
        await saveEdit(photoId, settings);
        if (get().photoId === photoId) set({ savedJson: json });
      } catch {
        if (get().photoId === photoId) set({ saveFailed: true });
        else
          useToastStore
            .getState()
            .push("Couldn't save your last changes to a photo.");
      } finally {
        if (get().photoId === photoId) set({ saving: false });
      }

      // Changes made while the save was in flight get saved too
      const after = get();
      if (
        after.photoId === photoId &&
        !after.saveFailed &&
        JSON.stringify(after.settings) !== after.savedJson
      ) {
        schedule();
      }
    },
  };
});
