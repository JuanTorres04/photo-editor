import { create } from "zustand";
import { DEFAULT_SETTINGS } from "../develop/settings";
import type { EditSettings, SettingKey } from "../develop/settings";
import type { CurveChannel, Point } from "../develop/curves";
import { saveEdit } from "../lib/edits";
import { useToastStore } from "./toastStore";

const SAVE_DELAY_MS = 700;
const GROUP_WINDOW_MS = 600;
const MAX_HISTORY = 100;

let timer: number | undefined;
let lastKey: string | null = null;
let lastChange = 0;

interface DevelopState {
  photoId: string | null;
  settings: EditSettings;
  savedJson: string;
  saving: boolean;
  saveFailed: boolean;
  past: EditSettings[];
  future: EditSettings[];
  open: (photoId: string, settings: EditSettings) => void;
  setValue: (key: SettingKey, value: number) => void;
  setCurve: (
    channel: CurveChannel,
    points: Point[],
    discrete?: boolean,
  ) => void;
  resetKey: (key: SettingKey) => void;
  resetAll: () => void;
  applySettings: (settings: EditSettings) => void;
  undo: () => void;
  redo: () => void;
  flush: () => Promise<void>;
}

export const useDevelopStore = create<DevelopState>((set, get) => {
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  };

  /** Remembers the current settings so the next change can be undone. */
  const remember = () => {
    const { settings, past } = get();
    set({ past: [...past, settings].slice(-MAX_HISTORY), future: [] });
  };

  return {
    photoId: null,
    settings: DEFAULT_SETTINGS,
    savedJson: JSON.stringify(DEFAULT_SETTINGS),
    saving: false,
    saveFailed: false,
    past: [],
    future: [],

    open: (photoId, settings) => {
      window.clearTimeout(timer);
      lastKey = null;
      set({
        photoId,
        settings,
        savedJson: JSON.stringify(settings),
        saving: false,
        saveFailed: false,
        past: [],
        future: [],
      });
    },

    setValue: (key, value) => {
      // One drag of a slider is one undo step: only start a new step for a different slider or after a pause
      const now = Date.now();
      if (key !== lastKey || now - lastChange > GROUP_WINDOW_MS) remember();
      lastKey = key;
      lastChange = now;
      set((state) => ({ settings: { ...state.settings, [key]: value } }));
      schedule();
    },

    setCurve: (channel, points, discrete = false) => {
      // Dragging a point is one undo step; presets and removing a point are steps of their own
      const key = `curve:${channel}`;
      const now = Date.now();
      if (discrete || key !== lastKey || now - lastChange > GROUP_WINDOW_MS)
        remember();
      lastKey = discrete ? null : key;
      lastChange = now;
      set((state) => ({
        settings: {
          ...state.settings,
          curves: { ...state.settings.curves, [channel]: points },
        },
      }));
      schedule();
    },

    resetKey: (key) => {
      lastKey = null;
      remember();
      set((state) => ({
        settings: { ...state.settings, [key]: DEFAULT_SETTINGS[key] },
      }));
      schedule();
    },

    applySettings: (next) => {
      lastKey = null;
      remember();
      set({ settings: next });
      schedule();
    },

    resetAll: () => get().applySettings(DEFAULT_SETTINGS),

    undo: () => {
      const { past, future, settings } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      lastKey = null;
      set({
        settings: previous,
        past: past.slice(0, -1),
        future: [settings, ...future].slice(0, MAX_HISTORY),
      });
      schedule();
    },

    redo: () => {
      const { past, future, settings } = get();
      const next = future[0];
      if (!next) return;
      lastKey = null;
      set({
        settings: next,
        past: [...past, settings].slice(-MAX_HISTORY),
        future: future.slice(1),
      });
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
