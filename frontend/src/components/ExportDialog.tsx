import { useEffect, useMemo, useRef, useState } from "react";
import {
  FORMAT_INFO,
  exportSizes,
  gpuMaxEdge,
  renderExport,
} from "../develop/export";
import type { ExportFormat, ExportPhase } from "../develop/export";
import { downloadBlob, exportFileName } from "../lib/download";
import { getErrorMessage } from "../lib/errors";
import { downloadOriginal } from "../lib/photos";
import type { Photo } from "../lib/photos";
import { useDevelopStore } from "../store/developStore";
import { useToastStore } from "../store/toastStore";

type Phase = "downloading" | ExportPhase;

const PHASE_LABEL: Record<Phase, string> = {
  downloading: "Getting your original...",
  decoding: "Opening the photo...",
  rendering: "Applying your edits...",
  encoding: "Creating the file...",
};

const FORMATS = Object.keys(FORMAT_INFO) as ExportFormat[];

interface ExportDialogProps {
  photo: Photo;
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ photo, open, onClose }: ExportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const push = useToastStore((state) => state.push);
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [sizeId, setSizeId] = useState("original");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const crop = useDevelopStore((state) => state.settings.crop);
  const sizes = useMemo(
    () => exportSizes(photo.width, photo.height, crop, gpuMaxEdge()),
    [photo.width, photo.height, crop],
  );
  const size = sizes.find((item) => item.id === sizeId) ?? sizes[0];
  const busy = phase !== null;
  const info = FORMAT_INFO[format];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const handleExport = async () => {
    setError(null);
    setPhase("downloading");
    try {
      const source = await downloadOriginal(photo);
      const settings = useDevelopStore.getState().settings;
      const blob = await renderExport(
        source,
        settings,
        size,
        format,
        quality / 100,
        setPhase,
      );
      const type = blob.type || info.mime;

      downloadBlob(blob, exportFileName(photo.title, type));
      push(`Exported ${(blob.size / 1024 / 1024).toFixed(1)} MB.`, "success");
      if (type !== info.mime) {
        push(
          `This browser can't create ${info.label} files, so the photo was saved in a different format.`,
        );
      }
      onClose();
    } catch (err) {
      setError(
        `${getErrorMessage(err)} If this keeps happening, try a smaller size.`,
      );
    } finally {
      setPhase(null);
    }
  };

  return (
    <dialog
      ref={ref}
      className="export-dialog"
      aria-labelledby="export-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="export-title">Export</h2>
      <p>
        Your edits are applied to the original photo. The original itself stays
        unchanged.
      </p>

      <fieldset className="export-group" disabled={busy}>
        <legend>Format</legend>
        <div className="format-row">
          {FORMATS.map((key) => (
            <label key={key} className="choice">
              <input
                type="radio"
                name="export-format"
                checked={format === key}
                onChange={() => setFormat(key)}
              />
              {FORMAT_INFO[key].label}
            </label>
          ))}
        </div>
      </fieldset>

      {info.lossy && (
        <div className="export-group">
          <label htmlFor="export-quality" className="quality-label">
            <span>Quality</span>
            <span>{quality}</span>
          </label>
          <input
            id="export-quality"
            type="range"
            min={50}
            max={100}
            step={1}
            value={quality}
            disabled={busy}
            onChange={(event) => setQuality(Number(event.target.value))}
          />
        </div>
      )}

      <fieldset className="export-group" disabled={busy}>
        <legend>Size</legend>
        {sizes.map((item) => (
          <label key={item.id} className="choice">
            <input
              type="radio"
              name="export-size"
              checked={item.id === size.id}
              onChange={() => setSizeId(item.id)}
            />
            <span>{item.label}</span>
            <span className="choice-meta">
              {item.width} × {item.height} ·{" "}
              {((item.width * item.height) / 1_000_000).toFixed(1)} MP
            </span>
          </label>
        ))}
      </fieldset>

      {busy && phase && (
        <p className="muted" role="status">
          {PHASE_LABEL[phase]}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void handleExport()}
          disabled={busy}
        >
          {busy ? "Exporting..." : "Export"}
        </button>
      </div>
    </dialog>
  );
}
