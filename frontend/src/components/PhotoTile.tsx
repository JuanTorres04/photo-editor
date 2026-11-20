import type { Photo } from "../lib/photos";

interface PhotoTileProps {
  photo: Photo;
  url: string | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function PhotoTile({ photo, url, selected, onSelect }: PhotoTileProps) {
  const label = photo.title || "Untitled photo";

  return (
    <button
      type="button"
      className="tile"
      aria-pressed={selected}
      onClick={() => onSelect(photo.id)}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <span className="tile-fallback">
          <span className="visually-hidden">{label}</span>
        </span>
      )}
      <span className="tile-meta" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}
