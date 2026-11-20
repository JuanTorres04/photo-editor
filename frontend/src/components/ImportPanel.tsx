import type { ImportItem } from "../store/libraryStore";

interface ImportPanelProps {
  items: ImportItem[];
  importing: boolean;
  onDismiss: () => void;
}

function stateLabel(item: ImportItem): string {
  if (item.state === "queued") return "Waiting";
  if (item.state === "working") return "Importing...";
  if (item.state === "done") return "Done";
  return item.message ?? "Failed";
}

export function ImportPanel({ items, importing, onDismiss }: ImportPanelProps) {
  if (items.length === 0) return null;
  const done = items.filter((item) => item.state === "done").length;

  return (
    <aside className="import-panel" aria-label="Import progress">
      <header>
        <strong>
          {importing
            ? `Importing ${done} of ${items.length}`
            : `Imported ${done} of ${items.length}`}
        </strong>
        {!importing && (
          <button
            className="ghost"
            onClick={onDismiss}
            aria-label="Dismiss import summary"
          >
            ×
          </button>
        )}
      </header>
      <ul aria-live="polite">
        {items.map((item) => (
          <li key={item.key} className={`import-row ${item.state}`}>
            <span className="import-name">{item.name}</span>
            <span className="import-state">{stateLabel(item)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
