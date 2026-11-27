import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { applyLook, lookOnly } from "../develop/looks";
import type { DevelopRenderer } from "../develop/renderer";
import { DEFAULT_SETTINGS } from "../develop/settings";
import type { EditSettings } from "../develop/settings";
import { getErrorMessage } from "../lib/errors";
import { createPreset, deletePreset, listPresets } from "../lib/presets";
import type { Preset } from "../lib/presets";
import { useToastStore } from "../store/toastStore";

const THUMB_EDGE = 112;

function Thumb({ data }: { data: ImageData | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d")?.putImageData(data, 0, 0);
  }, [data]);

  return <canvas ref={ref} className="preset-thumb" aria-hidden="true" />;
}

interface PresetsPanelProps {
  photoId: string;
  settings: EditSettings;
  /** True once the photo is loaded into the graphics card and previews can be drawn. */
  ready: boolean;
  getRenderer: () => DevelopRenderer | null;
  onApply: (settings: EditSettings) => void;
}

export function PresetsPanel({
  photoId,
  settings,
  ready,
  getRenderer,
  onApply,
}: PresetsPanelProps) {
  const push = useToastStore((state) => state.push);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, ImageData>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const crop = settings.crop;

  useEffect(() => {
    let cancelled = false;
    listPresets()
      .then((rows) => {
        if (!cancelled) setPresets(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPresets([]);
        push(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [push]);

  // Draw each preview on the actual photo. This only re-runs when the photo or its crop changes, not on every slider move.
  useEffect(() => {
    const renderer = getRenderer();
    if (!ready || !renderer || !presets) return;
    const base: EditSettings = { ...DEFAULT_SETTINGS, crop };
    const next: Record<string, ImageData> = {
      original: renderer.renderThumb(base, THUMB_EDGE),
    };
    for (const preset of presets) {
      next[preset.id] = renderer.renderThumb(
        applyLook(preset.settings, base),
        THUMB_EDGE,
      );
    }
    setThumbs(next);
  }, [ready, presets, crop, photoId, getRenderer]);

  const apply = (look: EditSettings) => onApply(applyLook(look, settings));

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const preset = await createPreset(trimmed, lookOnly(settings));
      setPresets((previous) => [...(previous ?? []), preset]);
      setName("");
      push(`Saved preset "${trimmed}".`, "success");
    } catch (err) {
      push(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (preset: Preset) => {
    try {
      await deletePreset(preset.id);
      setPresets((previous) =>
        (previous ?? []).filter((item) => item.id !== preset.id),
      );
    } catch (err) {
      push(getErrorMessage(err));
    }
  };

  const builtin = (presets ?? []).filter((preset) => preset.builtin);
  const mine = (presets ?? []).filter((preset) => !preset.builtin);

  const cell = (preset: Preset) => (
    <li key={preset.id} className="preset-cell">
      <button
        type="button"
        className="preset"
        aria-label={`Apply ${preset.name}`}
        onClick={() => apply(preset.settings)}
      >
        <Thumb data={thumbs[preset.id]} />
        <span>{preset.name}</span>
      </button>
      {!preset.builtin && (
        <button
          type="button"
          className="preset-delete"
          aria-label={`Delete preset ${preset.name}`}
          onClick={() => void handleDelete(preset)}
        >
          ×
        </button>
      )}
    </li>
  );

  return (
    <div className="presets">
      {presets === null && <p className="muted">Loading...</p>}

      {presets !== null && (
        <ul className="preset-grid">
          <li className="preset-cell">
            <button
              type="button"
              className="preset"
              aria-label="Remove all edits except the crop"
              onClick={() => apply(DEFAULT_SETTINGS)}
            >
              <Thumb data={thumbs.original} />
              <span>No edit</span>
            </button>
          </li>
          {builtin.map(cell)}
        </ul>
      )}

      {mine.length > 0 && (
        <>
          <p className="preset-heading">My presets</p>
          <ul className="preset-grid">{mine.map(cell)}</ul>
        </>
      )}

      <form className="preset-form" onSubmit={(e) => void handleSave(e)}>
        <label className="visually-hidden" htmlFor="preset-name">
          Preset name
        </label>
        <input
          id="preset-name"
          type="text"
          placeholder="Save this look as a preset"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={busy || name.trim() === ""}>
          Save
        </button>
      </form>
      <p className="muted">
        A preset keeps your sliders, curve, and effects. It never changes your
        crop.
      </p>
    </div>
  );
}
