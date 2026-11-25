import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  CHANNELS,
  MIN_GAP,
  S_CURVES,
  curveSamples,
  insertPoint,
  isLinear,
  linearPoints,
  sCurve,
} from "../develop/curves";
import type { CurveChannel, CurveSet, Point } from "../develop/curves";
import type { ScopeData } from "../develop/scopes";

const SIZE = 256;
const COLORS: Record<CurveChannel, string> = {
  master: "#e8f2ee",
  red: "#ff6b6b",
  green: "#6fdc9c",
  blue: "#6fb3ff",
};
const LABELS: Record<CurveChannel, string> = {
  master: "RGB",
  red: "Red",
  green: "Green",
  blue: "Blue",
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

interface CurveEditorProps {
  curves: CurveSet;
  scope: ScopeData | null;
  onChange: (
    channel: CurveChannel,
    points: Point[],
    discrete?: boolean,
  ) => void;
}

export function CurveEditor({ curves, scope, onChange }: CurveEditorProps) {
  const [channel, setChannel] = useState<CurveChannel>("master");
  const [selected, setSelected] = useState<number | null>(null);
  const dragging = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = curves[channel];
  const color = COLORS[channel];
  const lastIndex = points.length - 1;

  // the photo's own histogram sits faintly behind the curve, so you can see where the tones are
  const histogram = useMemo(() => {
    if (!scope) return "";
    let path = `M0 ${SIZE}`;
    for (let v = 0; v < 256; v++) {
      const bin = (scope.r[v] + scope.g[v] + scope.b[v]) / 3;
      path += ` L${v} ${SIZE - Math.min(1, bin / scope.histMax) * SIZE * 0.55}`;
    }
    return `${path} L255 ${SIZE} Z`;
  }, [scope]);

  const curvePath = curveSamples(points)
    .map(
      ([x, y], i) =>
        `${i === 0 ? "M" : "L"}${(x * SIZE).toFixed(1)} ${((1 - y) * SIZE).toFixed(1)}`,
    )
    .join(" ");

  const locate = (event: { clientX: number; clientY: number }): Point => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return [0, 0];
    return [
      clamp((event.clientX - box.left) / box.width, 0, 1),
      clamp(1 - (event.clientY - box.top) / box.height, 0, 1),
    ];
  };

  const nearest = (at: Point): number | null => {
    let best: number | null = null;
    let bestDistance = 0.06;
    for (let i = 0; i < points.length; i++) {
      const distance = Math.hypot(points[i][0] - at[0], points[i][1] - at[1]);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = locate(event);
    let index = nearest(at);
    if (index === null) {
      // clicking empty space adds a point there, which can be dragged straight away
      const added = insertPoint(points, at);
      if (!added) return;
      index = added.index;
      onChange(channel, added.points);
    }
    dragging.current = index;
    setSelected(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const index = dragging.current;
    if (index === null) return;
    const at = locate(event);
    const next: Point[] = points.map(([x, y]): Point => [x, y]);
    if (index === 0 || index === lastIndex) {
      next[index] = [next[index][0], at[1]];
    } else {
      next[index] = [
        clamp(
          at[0],
          next[index - 1][0] + MIN_GAP,
          next[index + 1][0] - MIN_GAP,
        ),
        at[1],
      ];
    }
    onChange(channel, next);
  };

  const handlePointerUp = () => {
    dragging.current = null;
  };

  const handleDoubleClick = (event: { clientX: number; clientY: number }) => {
    const index = nearest(locate(event));
    if (index !== null && index > 0 && index < lastIndex) {
      onChange(
        channel,
        points.filter((_, i) => i !== index),
        true,
      );
      setSelected(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const next: Point[] = points.map(([x, y]): Point => [x, y]);
    const interior = index > 0 && index < lastIndex;

    switch (event.key) {
      case "ArrowUp":
        next[index][1] = clamp(next[index][1] + step, 0, 1);
        break;
      case "ArrowDown":
        next[index][1] = clamp(next[index][1] - step, 0, 1);
        break;
      case "ArrowLeft":
        if (interior)
          next[index][0] = clamp(
            next[index][0] - step,
            next[index - 1][0] + MIN_GAP,
            next[index + 1][0] - MIN_GAP,
          );
        break;
      case "ArrowRight":
        if (interior)
          next[index][0] = clamp(
            next[index][0] + step,
            next[index - 1][0] + MIN_GAP,
            next[index + 1][0] - MIN_GAP,
          );
        break;
      case "Delete":
      case "Backspace":
        if (interior) {
          event.preventDefault();
          onChange(
            channel,
            points.filter((_, i) => i !== index),
            true,
          );
          setSelected(null);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    onChange(channel, next);
  };

  return (
    <div className="curve">
      <div className="curve-tabs" role="group" aria-label="Curve channel">
        {CHANNELS.map((key) => (
          <button
            key={key}
            type="button"
            className="seg"
            aria-pressed={channel === key}
            style={{ borderColor: channel === key ? COLORS[key] : undefined }}
            onClick={() => {
              setChannel(key);
              setSelected(null);
            }}
          >
            {LABELS[key]}
            {!isLinear(curves[key]) && (
              <span
                className="curve-dot"
                style={{ background: COLORS[key] }}
                aria-label=" (edited)"
              />
            )}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="curve-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label={`${LABELS[channel]} tone curve editor`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {histogram && <path d={histogram} fill="rgba(255,255,255,0.09)" />}
        <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
          <path
            d={`M${SIZE / 4} 0V${SIZE}M${SIZE / 2} 0V${SIZE}M${(SIZE * 3) / 4} 0V${SIZE}`}
          />
          <path
            d={`M0 ${SIZE / 4}H${SIZE}M0 ${SIZE / 2}H${SIZE}M0 ${(SIZE * 3) / 4}H${SIZE}`}
          />
        </g>
        <path
          d={`M0 ${SIZE} L${SIZE} 0`}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
          fill="none"
        />
        <path
          d={curvePath}
          stroke={color}
          strokeWidth="2.2"
          fill="none"
          strokeLinejoin="round"
        />

        {points.map(([x, y], index) => (
          <g
            key={index}
            className="curve-point"
            tabIndex={0}
            role="slider"
            aria-label={`${LABELS[channel]} curve point ${index + 1} of ${points.length}`}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(y * 100)}
            aria-valuetext={`input ${Math.round(x * 100)} percent, output ${Math.round(y * 100)} percent`}
            onFocus={() => setSelected(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <circle
              cx={x * SIZE}
              cy={(1 - y) * SIZE}
              r="14"
              fill="transparent"
            />
            <circle
              cx={x * SIZE}
              cy={(1 - y) * SIZE}
              r={selected === index ? 6.5 : 5}
              fill={selected === index ? color : "#0e1917"}
              stroke={color}
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>

      <div className="curve-presets">
        {S_CURVES.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(channel, sCurve(preset.strength), true)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="ghost"
          disabled={isLinear(points)}
          onClick={() => onChange(channel, linearPoints(), true)}
        >
          Straighten
        </button>
      </div>
      <p className="muted">
        Click the graph to add a point and drag to shape it. Double-click a
        point to remove it. With a point focused, use the arrow keys to move it
        (Shift for bigger steps) and Delete to remove it.
      </p>
    </div>
  );
}
