import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { EditSettings } from "../develop/settings";
import { createVersion, deleteVersion, listVersions } from "../lib/edits";
import type { EditVersion } from "../lib/edits";
import { getErrorMessage } from "../lib/errors";
import { useToastStore } from "../store/toastStore";

interface VersionsPanelProps {
  photoId: string;
  current: EditSettings;
  onApply: (settings: EditSettings) => void;
}

export function VersionsPanel({
  photoId,
  current,
  onApply,
}: VersionsPanelProps) {
  const push = useToastStore((state) => state.push);
  const [versions, setVersions] = useState<EditVersion[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listVersions(photoId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVersions([]);
        push(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [photoId, push]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const version = await createVersion(photoId, trimmed, current);
      setVersions((previous) => [version, ...(previous ?? [])]);
      setName("");
      push(`Saved version "${trimmed}".`, "success");
    } catch (err) {
      push(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (version: EditVersion) => {
    try {
      await deleteVersion(version.id);
      setVersions((previous) =>
        (previous ?? []).filter((item) => item.id !== version.id),
      );
    } catch (err) {
      push(getErrorMessage(err));
    }
  };

  return (
    <div className="versions">
      <form className="versions-form" onSubmit={(e) => void handleSave(e)}>
        <label className="visually-hidden" htmlFor="version-name">
          Version name
        </label>
        <input
          id="version-name"
          type="text"
          placeholder="Name this look"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={busy || name.trim() === ""}>
          Save
        </button>
      </form>

      {versions === null && <p className="muted">Loading...</p>}
      {versions !== null && versions.length === 0 && (
        <p className="muted">No saved versions yet.</p>
      )}
      {versions !== null && versions.length > 0 && (
        <ul className="version-list">
          {versions.map((version) => (
            <li key={version.id} className="version-row">
              <div className="version-info">
                <span className="version-name">{version.name}</span>
                <span className="version-date">
                  {new Date(version.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <button
                className="ghost"
                onClick={() => onApply(version.settings)}
                aria-label={`Apply ${version.name}`}
              >
                Apply
              </button>
              <button
                className="ghost"
                onClick={() => void handleDelete(version)}
                aria-label={`Delete ${version.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
