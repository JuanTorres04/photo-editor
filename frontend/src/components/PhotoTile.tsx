import { useState } from "react";
import type { CSSProperties } from "react";
import type { Photo } from "../lib/photos";

interface PhotoTileProps {
  photo: Photo;
  url: string | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export function PhotoTile({
  photo,
  url,
  selected,
  onSelect,
  onOpen,
}: PhotoTileProps) {
  const [loaded, setLoaded] = useState(false);
  const label = photo.title || "Untitled photo";
  const ratio = photo.width / photo.height;
  // Rows fill the full width: each tile grows in proportion to its aspect ratio
  const style = {
    flex: `${Math.round(ratio * 100)} 1 calc(var(--tile, 200px) * ${ratio.toFixed(4)})`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className="tile"
      style={style}
      aria-pressed={selected}
      onClick={() => onSelect(photo.id)}
      onDoubleClick={() => onOpen(photo.id)}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          className={loaded ? "loaded" : undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
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
