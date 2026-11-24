import { useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  KeyboardEvent,
} from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ImportPanel } from "../components/ImportPanel";
import { PhotoTile } from "../components/PhotoTile";
import { getErrorMessage } from "../lib/errors";
import { MAX_PHOTOS } from "../lib/photos";
import { useAuthStore } from "../store/authStore";
import { useLibraryStore } from "../store/libraryStore";
import { useToastStore } from "../store/toastStore";
import { useNavigate } from "react-router-dom";
import { MountainArt } from "../components/MountainArt";

const URL_REFRESH_MS = 50 * 60 * 1000;

export function LibraryPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const photos = useLibraryStore((state) => state.photos);
  const urls = useLibraryStore((state) => state.urls);
  const status = useLibraryStore((state) => state.status);
  const error = useLibraryStore((state) => state.error);
  const selectedId = useLibraryStore((state) => state.selectedId);
  const imports = useLibraryStore((state) => state.imports);
  const importing = useLibraryStore((state) => state.importing);
  const load = useLibraryStore((state) => state.load);
  const refreshUrls = useLibraryStore((state) => state.refreshUrls);
  const select = useLibraryStore((state) => state.select);
  const importFiles = useLibraryStore((state) => state.importFiles);
  const remove = useLibraryStore((state) => state.remove);
  const dismissImports = useLibraryStore((state) => state.dismissImports);
  const push = useToastStore((state) => state.push);

  const fileInput = useRef<HTMLInputElement>(null);
  const [tileSize, setTileSize] = useState(200);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const userId = user?.id;
  const selected = photos.find((photo) => photo.id === selectedId) ?? null;

  useEffect(() => {
    if (userId) void load(userId);
  }, [userId, load]);

  // Signed thumbnail links expire after an hour, so renew them quietly
  useEffect(() => {
    const timer = window.setInterval(() => void refreshUrls(), URL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshUrls]);

  const startImport = (files: File[]) => {
    if (!userId || importing || files.length === 0) return;
    void importFiles(files, userId);
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    startImport(Array.from(event.target.files ?? []));
    event.target.value = ""; // lets the same file be picked again
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    startImport(Array.from(event.dataTransfer.files));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Delete" && selected) setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await remove(selected);
      push("Photo deleted.", "success");
      setConfirmOpen(false);
    } catch (err) {
      push(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const openPicker = () => fileInput.current?.click();
  const gridStyle = { "--tile": `${tileSize}px` } as CSSProperties;
  const showSkeleton = status === "loading" && photos.length === 0;

  return (
    <div
      className="lib"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={handlePick}
      />

      <div className="lib-toolbar">
        <div className="lib-title">
          <h1>Library</h1>
          {status === "ready" && (
            <span className="lib-count">
              {photos.length} of {MAX_PHOTOS} photos
            </span>
          )}
        </div>
        <span className="lib-spacer" />
        <div className="tile-size">
          <label htmlFor="tile-size">Size</label>
          <input
            id="tile-size"
            type="range"
            min={120}
            max={360}
            step={10}
            value={tileSize}
            onChange={(e) => setTileSize(Number(e.target.value))}
          />
        </div>
        <button
          disabled={!selected}
          onClick={() => selected && navigate(`/develop/${selected.id}`)}
        >
          Develop
        </button>
        <button disabled={!selected} onClick={() => setConfirmOpen(true)}>
          Delete
        </button>
        <button className="primary" disabled={importing} onClick={openPicker}>
          {importing ? "Importing..." : "Import photos"}
        </button>
      </div>

      <div className="grid-wrap">
        {showSkeleton && (
          <div
            className="grid"
            style={gridStyle}
            aria-busy="true"
            aria-label="Loading photos"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="state-card" role="alert">
            <h2>Couldn't load your library</h2>
            <p>{error}</p>
            <button onClick={() => userId && void load(userId)}>
              Try again
            </button>
          </div>
        )}

        {status === "ready" && photos.length === 0 && (
          <div className="empty">
            <MountainArt className="empty-art" />
            <h2>Your library is empty</h2>
            <p>
              Drag photos here or import them. JPEG, PNG, and WebP up to 10 MB
              each. Your originals are never changed.
            </p>
            <button className="primary" onClick={openPicker}>
              Import photos
            </button>
          </div>
        )}

        {photos.length > 0 && (
          <div className="grid" style={gridStyle}>
            {photos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                url={urls[photo.id]}
                selected={photo.id === selectedId}
                onSelect={select}
                onOpen={(id) => navigate(`/develop/${id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {dragging && <div className="drop-overlay">Drop photos to import</div>}

      <ImportPanel
        items={imports}
        importing={importing}
        onDismiss={dismissImports}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this photo?"
        message={`"${selected?.title || "Untitled photo"}" and all of its edits will be permanently deleted.`}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
