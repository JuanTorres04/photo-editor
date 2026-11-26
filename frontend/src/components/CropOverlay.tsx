import { useRef } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { MIN_CROP, clampToFit, rectOf } from "../develop/geometry";
import type { CropSettings, Rect, Size } from "../develop/geometry";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface CropOverlayProps {
  crop: CropSettings;
  /** The size of the straightened picture in pixels, which sets the shape of the frame. */
  frame: Size;
  /** The locked shape of the crop (width divided by height), or null to crop freely. */
  ratio: number | null;
  onChange: (next: CropSettings, key: string, discrete?: boolean) => void;
}

interface Drag {
  handle: Handle;
  startX: number;
  startY: number;
  rect: Rect;
}

/** Works out the new crop box while a handle is dragged to (px, py), both as fractions of the frame. */
function nextRect(
  drag: Drag,
  px: number,
  py: number,
  ratio: number | null,
  frame: Size,
): Rect {
  const { rect, handle } = drag;
  if (handle === "move") {
    return {
      ...rect,
      x: rect.x + (px - drag.startX),
      y: rect.y + (py - drag.startY),
    };
  }

  let left = rect.x;
  let right = rect.x + rect.w;
  let top = rect.y;
  let bottom = rect.y + rect.h;
  if (handle.includes("w")) left = Math.min(px, right - MIN_CROP);
  if (handle.includes("e")) right = Math.max(px, left + MIN_CROP);
  if (handle.includes("n")) top = Math.min(py, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = Math.max(py, top + MIN_CROP);

  if (ratio !== null) {
    const freeWidth = (right - left) * frame.width;
    const freeHeight = (bottom - top) * frame.height;
    const corner = handle.length === 2;
    let widthPx: number;
    let heightPx: number;
    if (corner) {
      widthPx = Math.max(freeWidth, freeHeight * ratio);
      heightPx = widthPx / ratio;
    } else if (handle === "e" || handle === "w") {
      widthPx = freeWidth;
      heightPx = widthPx / ratio;
    } else {
      heightPx = freeHeight;
      widthPx = heightPx * ratio;
    }
    const w = widthPx / frame.width;
    const h = heightPx / frame.height;
    // keep the opposite side (or corner) where it was
    if (corner) {
      left = handle.includes("w") ? rect.x + rect.w - w : rect.x;
      top = handle.includes("n") ? rect.y + rect.h - h : rect.y;
    } else if (handle === "e") {
      left = rect.x;
      top = rect.y + rect.h / 2 - h / 2;
    } else if (handle === "w") {
      left = rect.x + rect.w - w;
      top = rect.y + rect.h / 2 - h / 2;
    } else if (handle === "s") {
      top = rect.y;
      left = rect.x + rect.w / 2 - w / 2;
    } else {
      top = rect.y + rect.h - h;
      left = rect.x + rect.w / 2 - w / 2;
    }
    right = left + w;
    bottom = top + h;
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

function scaleRect(rect: Rect, factor: number): Rect {
  const w = Math.max(MIN_CROP, rect.w * factor);
  const h = Math.max(MIN_CROP, rect.h * factor);
  return {
    x: rect.x + rect.w / 2 - w / 2,
    y: rect.y + rect.h / 2 - h / 2,
    w,
    h,
  };
}

export function CropOverlay({
  crop,
  frame,
  ratio,
  onChange,
}: CropOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const apply = (next: Rect, key: string) => {
    const valid = clampToFit(rectOf(crop), next, crop.angle, frame);
    onChange({ ...crop, ...valid }, key);
  };

  const point = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): [number, number] => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return [0, 0];
    return [
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
    ];
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const handle = target.dataset.handle as Handle | undefined;
    if (!handle) return;
    const [x, y] = point(event);
    drag.current = { handle, startX: x, startY: y, rect: rectOf(crop) };
    rootRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const [px, py] = point(event);
    apply(nextRect(active, px, py, ratio, frame), "crop");
  };

  const handlePointerUp = () => {
    drag.current = null;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const rect = rectOf(crop);
    let next: Rect;
    switch (event.key) {
      case "ArrowLeft":
        next = { ...rect, x: rect.x - step };
        break;
      case "ArrowRight":
        next = { ...rect, x: rect.x + step };
        break;
      case "ArrowUp":
        next = { ...rect, y: rect.y - step };
        break;
      case "ArrowDown":
        next = { ...rect, y: rect.y + step };
        break;
      case "+":
      case "=":
        next = scaleRect(rect, 1 + step * 2);
        break;
      case "-":
      case "_":
        next = scaleRect(rect, 1 - step * 2);
        break;
      default:
        return;
    }
    event.preventDefault();
    apply(next, "crop-key");
  };

  const left = crop.x * 100;
  const top = crop.y * 100;
  const width = crop.w * 100;
  const height = crop.h * 100;

  return (
    <div
      ref={rootRef}
      className="crop-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="crop-dim"
        style={{ left: 0, right: 0, top: 0, height: `${top}%` }}
      />
      <div
        className="crop-dim"
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          height: `${100 - top - height}%`,
        }}
      />
      <div
        className="crop-dim"
        style={{
          left: 0,
          top: `${top}%`,
          width: `${left}%`,
          height: `${height}%`,
        }}
      />
      <div
        className="crop-dim"
        style={{
          right: 0,
          top: `${top}%`,
          width: `${100 - left - width}%`,
          height: `${height}%`,
        }}
      />

      <div
        className="crop-box"
        data-handle="move"
        tabIndex={0}
        role="group"
        aria-label="Crop box. Use the arrow keys to move it, and plus or minus to resize it."
        onKeyDown={handleKeyDown}
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
      >
        <span className="crop-grid" aria-hidden="true" />
        {HANDLES.map((handle) => (
          <span
            key={handle}
            className={`crop-handle crop-${handle}`}
            data-handle={handle}
          />
        ))}
      </div>
    </div>
  );
}
