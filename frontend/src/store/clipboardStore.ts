import { create } from "zustand";
import type { EditSettings } from "../develop/settings";

interface ClipboardState {
  copied: EditSettings | null;
  /** The title of the photo the edit came from */
  from: string;
  copy: (settings: EditSettings, from: string) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  copied: null,
  from: "",
  copy: (settings, from) => set({ copied: settings, from }),
}));
