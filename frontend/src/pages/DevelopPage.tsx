import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdjustSlider } from "../components/AdjustSlider";
import { DevelopRenderer } from "../develop/renderer";
import { SLIDER_GROUPS, isDefault } from "../develop/settings";
import { loadEdit } from "../lib/edits";
import { getErrorMessage } from "../lib/errors";
import { downloadPreview, getPhoto } from "../lib/photos";
import type { Photo } from "../lib/photos";
import { useDevelopStore } from "../store/developStore";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; photo: Photo; bitmap: ImageBitmap };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DevelopPage() {
  const { photoId } = useParams<{ photoId: string }>();
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [glError, setGlError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<DevelopRenderer | null>(null);

  const settings = useDevelopStore((state) => state.settings);
  const savedJson = useDevelopStore((state) => state.savedJson);
  const saving = useDevelopStore((state) => state.saving);
  const saveFailed = useDevelopStore((state) => state.saveFailed);
  const setValue = useDevelopStore((state) => state.setValue);
  const resetKey = useDevelopStore((state) => state.resetKey);
  const resetAll = useDevelopStore((state) => state.resetAll);
  const flush = useDevelopStore((state) => state.flush);

  const invalidId = !photoId || !UUID.test(photoId);
  const view: LoadState = invalidId ? { status: "missing" } : load;
  const readyBitmap = view.status === "ready" ? view.bitmap : null;
  const dirty =
    view.status === "ready" && JSON.stringify(settings) !== savedJson;

  // 1. Load the photo row, its saved edit, and the preview image
  useEffect(() => {
    if (!photoId || !UUID.test(photoId)) return;
    let cancelled = false;

    const run = async () => {
      try {
        const photo = await getPhoto(photoId);
        if (!photo) {
          if (!cancelled) setLoad({ status: "missing" });
          return;
        }
        const [blob, saved] = await Promise.all([
          downloadPreview(photo),
          loadEdit(photo.id),
        ]);
        const bitmap = await createImageBitmap(blob);
        if (cancelled) {
          bitmap.close();
          return;
        }
        useDevelopStore.getState().open(photo.id, saved);
        setLoad({ status: "ready", photo, bitmap });
      } catch (err) {
        if (!cancelled)
          setLoad({ status: "error", message: getErrorMessage(err) });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [photoId, attempt]);

  // 2. Free the decoded image when it is no longer needed
  useEffect(() => {
    return () => {
      if (load.status === "ready") load.bitmap.close();
    };
  }, [load]);

  // 3. Set up the GPU renderer once the image is ready
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !readyBitmap) return;

    let renderer: DevelopRenderer | null = null;
    try {
      renderer = new DevelopRenderer(canvas, readyBitmap);
      rendererRef.current = renderer;
      renderer.render(useDevelopStore.getState().settings);
    } catch (err) {
      setGlError(getErrorMessage(err));
    }
    return () => {
      renderer?.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [readyBitmap]);

  // 4. Redraw whenever a slider moves (once per frame at most)
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      rendererRef.current?.render(settings),
    );
    return () => cancelAnimationFrame(frame);
  }, [settings]);

  // 5. Save pending changes when leaving the page
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  // 6. Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  let saveLabel = "All changes saved";
  if (saveFailed) saveLabel = "Couldn't save changes";
  else if (saving) saveLabel = "Saving...";
  else if (dirty) saveLabel = "Unsaved changes";

  const retryLoad = () => {
    setLoad({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return (
    <div className="develop">
      <section className="stage" aria-label="Photo preview">
        <div className="stage-bar">
          <Link className="back" to="/">
            ← Library
          </Link>
          <span className="stage-title">
            {view.status === "ready"
              ? view.photo.title || "Untitled photo"
              : ""}
          </span>
          {view.status === "ready" && (
            <span
              className={saveFailed ? "save-state failed" : "save-state"}
              role="status"
            >
              {saveLabel}
              {saveFailed && (
                <button className="ghost" onClick={() => void flush()}>
                  Retry
                </button>
              )}
            </span>
          )}
        </div>

        <div className="stage-canvas">
          {view.status === "loading" && (
            <div className="stage-status" role="status">
              <span className="spinner" aria-hidden="true" />
              <span className="visually-hidden">Loading photo</span>
            </div>
          )}
          {view.status === "missing" && (
            <div className="state-card">
              <h2>Photo not found</h2>
              <p>It may have been deleted, or it belongs to another account.</p>
              <button onClick={() => navigate("/")}>Back to library</button>
            </div>
          )}
          {view.status === "error" && (
            <div className="state-card" role="alert">
              <h2>Couldn't open this photo</h2>
              <p>{view.message}</p>
              <button onClick={retryLoad}>Try again</button>
            </div>
          )}
          {view.status === "ready" && glError && (
            <div className="state-card" role="alert">
              <h2>The editor can't start</h2>
              <p>{glError}</p>
            </div>
          )}
          {view.status === "ready" && !glError && (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Preview of ${view.photo.title || "your photo"}`}
            />
          )}
        </div>
      </section>

      <aside className="adjust-panel" aria-label="Adjustments">
        {view.status === "ready" && (
          <>
            <div className="panel-head">
              <h2>Basic</h2>
              <button
                className="ghost"
                disabled={isDefault(settings)}
                onClick={resetAll}
              >
                Reset all
              </button>
            </div>
            {SLIDER_GROUPS.map((group) => (
              <details key={group.id} className="group" open>
                <summary>{group.title}</summary>
                <div className="group-body">
                  {group.sliders.map((spec) => (
                    <AdjustSlider
                      key={spec.key}
                      spec={spec}
                      value={settings[spec.key]}
                      onChange={setValue}
                      onReset={resetKey}
                    />
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
