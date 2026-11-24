import { useId } from "react";

interface MountainArtProps {
  className?: string;
  variant?: "hero" | "wide" | "banner";
}

const VIEWS = {
  hero: { box: "0 0 800 900", align: "xMidYMax slice" },
  wide: { box: "0 230 800 450", align: "xMidYMid slice" },
  banner: { box: "0 240 800 310", align: "xMidYMid slice" },
} as const;

/** A jagged line of fir trees across the full width. The same inputs always give the same trees. */
function treeline(
  baseY: number,
  height: number,
  step: number,
  seed: number,
): string {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  let path = `M0 900 V${baseY}`;
  let x = 0;
  while (x < 800) {
    const width = step * (0.8 + random() * 0.5);
    const ground = baseY + Math.sin(x / 70 + seed) * 12;
    const top = ground - height * (0.45 + random() * 0.55);
    path += ` L${(x + width / 2).toFixed(1)} ${top.toFixed(1)} L${(x + width).toFixed(1)} ${ground.toFixed(1)}`;
    x += width;
  }
  return `${path} V900 Z`;
}

const FAR_FIRS = treeline(655, 52, 15, 7);
const MID_FIRS = treeline(725, 72, 16, 19);
const NEAR_FIRS = treeline(850, 64, 18, 31);
const FRONT_FIRS = treeline(885, 46, 20, 53);

const TOWER_LEFT = 300;
const TOWER_RIGHT = 640;
const TOWER_TOP = 478;
const DECK = 770;

// The vertical suspender cables hanging from the main cable to the deck
const SUSPENDERS = Array.from({ length: 27 }, (_, i) => {
  const t = (i + 1) / 28;
  const x = TOWER_LEFT + (TOWER_RIGHT - TOWER_LEFT) * t;
  const y =
    (1 - t) ** 2 * TOWER_TOP + 2 * (1 - t) * t * 960 + t ** 2 * TOWER_TOP;
  return { x, y };
});

function Tower({ x }: { x: number }) {
  return (
    <g fill="#e8582f">
      <rect x={x - 22} y="478" width="11" height="330" />
      <rect x={x + 11} y="478" width="11" height="330" />
      <rect x={x - 22} y="474" width="44" height="8" />
      <rect x={x - 22} y="528" width="44" height="7" />
      <rect x={x - 22} y="590" width="44" height="7" />
      <rect x={x - 22} y="660" width="44" height="7" />
      <rect x={x - 22} y="735" width="44" height="7" />
    </g>
  );
}

export function MountainArt({ className, variant = "hero" }: MountainArtProps) {
  const uid = useId().replace(/:/g, "");
  const ref = (name: string) => `${uid}-${name}`;
  const view = VIEWS[variant];

  return (
    <svg
      className={className}
      viewBox={view.box}
      preserveAspectRatio={view.align}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ref("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#08141c" />
          <stop offset="0.35" stopColor="#123646" />
          <stop offset="0.6" stopColor="#2d6470" />
          <stop offset="0.8" stopColor="#7fb0aa" />
          <stop offset="0.92" stopColor="#d6e6d6" />
        </linearGradient>
        <radialGradient
          id={ref("warm")}
          cx="120"
          cy="610"
          r="340"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffd2a0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffd2a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ref("body")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f93a8" />
          <stop offset="0.5" stopColor="#3d6073" />
          <stop offset="1" stopColor="#254452" />
        </linearGradient>
        <linearGradient id={ref("snow")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfe6f5" />
        </linearGradient>
        <linearGradient id={ref("haze")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe5dd" stopOpacity="0" />
          <stop offset="1" stopColor="#cfe5dd" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={ref("fog")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9cfc8" stopOpacity="0" />
          <stop offset="1" stopColor="#a9cfc8" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={ref("ray")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8fff0" stopOpacity="0.14" />
          <stop offset="1" stopColor="#e8fff0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ref("falls")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6fcff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#b9e2f2" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={ref("veil")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1211" stopOpacity="0.6" />
          <stop offset="1" stopColor="#0a1211" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* sky and the warm glow low on the left */}
      <rect width="800" height="900" fill={`url(#${ref("sky")})`} />
      <rect width="800" height="900" fill={`url(#${ref("warm")})`} />
      <g fill="#ffffff" fillOpacity="0.65">
        <circle cx="90" cy="70" r="1.4" />
        <circle cx="260" cy="130" r="1.1" />
        <circle cx="400" cy="60" r="1.4" />
        <circle cx="640" cy="90" r="1.2" />
        <circle cx="730" cy="190" r="1.1" />
        <circle cx="170" cy="230" r="1" />
      </g>

      {/* Mt. Rainier */}
      <path
        d="M120 700 L230 560 L300 500 L360 430 L410 360 L455 300 L495 262 L520 250 L548 262 L590 300 L640 360 L690 430 L750 500 L820 580 L900 700 V900 H120Z"
        fill={`url(#${ref("body")})`}
      />
      <path
        d="M520 250 L548 262 L590 300 L640 360 L690 430 L750 500 L820 580 L900 700 H640 L560 520 L540 400Z"
        fill="#0c2230"
        fillOpacity="0.35"
      />
      <path
        d="M360 430 L410 360 L455 300 L495 262 L520 250 L548 262 L590 300 L640 360 L690 430 L664 418 L640 446 L612 420 L585 452 L556 424 L526 458 L498 426 L470 456 L442 424 L414 452 L388 424Z"
        fill={`url(#${ref("snow")})`}
      />
      <path
        d="M520 250 L548 262 L590 300 L640 360 L690 430 L664 418 L640 446 L612 420 L585 452 L556 424 L540 440Z"
        fill="#8fb4cc"
        fillOpacity="0.5"
      />
      <path
        d="M360 430 L410 360 L455 300 L495 262 L520 250"
        stroke="#ffd9b0"
        strokeOpacity="0.6"
        strokeWidth="1.5"
        fill="none"
      />
      <rect y="500" width="800" height="200" fill={`url(#${ref("haze")})`} />

      {/* distant firs, then the cliff and waterfall */}
      <path d={FAR_FIRS} fill="#2c5f5c" />
      <path d="M0 500 L70 492 L150 500 L196 548 L205 800 H0Z" fill="#13252a" />
      <path
        d="M0 500 L70 492 L150 500 L172 520 L0 532Z"
        fill="#2f7a55"
        fillOpacity="0.9"
      />
      <g stroke="#1f3b3b" strokeWidth="1.5" opacity="0.7">
        <path d="M40 540V780M80 535V780M150 545V780" />
      </g>
      <path
        d="M106 506 L124 506 L122 618 L108 618Z"
        fill={`url(#${ref("falls")})`}
      />
      <ellipse
        cx="115"
        cy="622"
        rx="15"
        ry="4"
        fill="#eaf8ff"
        fillOpacity="0.6"
      />
      <path
        d="M106 626 L126 626 L124 758 L108 758Z"
        fill={`url(#${ref("falls")})`}
      />
      <ellipse
        cx="116"
        cy="762"
        rx="48"
        ry="14"
        fill="#dff3f6"
        fillOpacity="0.3"
      />

      {/* light shafts through the forest */}
      <polygon
        points="40,0 150,0 430,700 260,700"
        fill={`url(#${ref("ray")})`}
      />
      <polygon
        points="210,0 270,0 570,700 480,700"
        fill={`url(#${ref("ray")})`}
      />

      <path d={MID_FIRS} fill="#17403c" />

      {/* the Golden Gate Bridge */}
      <g stroke="#f26a3c" strokeOpacity="0.8" fill="none" strokeLinecap="round">
        <path
          d={`M${TOWER_LEFT} ${TOWER_TOP} Q470 960 ${TOWER_RIGHT} ${TOWER_TOP}`}
          strokeWidth="3"
        />
        <path
          d={`M${TOWER_LEFT} ${TOWER_TOP} Q140 650 -20 730`}
          strokeWidth="3"
        />
        <path
          d={`M${TOWER_RIGHT} ${TOWER_TOP} Q800 650 820 735`}
          strokeWidth="3"
        />
      </g>
      <g stroke="#f26a3c" strokeOpacity="0.55" strokeWidth="1">
        {SUSPENDERS.map(({ x, y }) => (
          <line key={x} x1={x} y1={y} x2={x} y2={DECK} />
        ))}
      </g>
      <Tower x={TOWER_LEFT} />
      <Tower x={TOWER_RIGHT} />
      <rect x="-20" y={DECK - 5} width="860" height="9" fill="#d9532c" />
      <rect
        x="-20"
        y={DECK + 4}
        width="860"
        height="6"
        fill="#8f3a22"
        fillOpacity="0.8"
      />
      <rect y="600" width="800" height="220" fill={`url(#${ref("fog")})`} />

      {/* foreground firs */}
      <path d={NEAR_FIRS} fill="#0d2422" />
      <path d={FRONT_FIRS} fill="#06100f" />

      {variant === "hero" && (
        <rect width="800" height="330" fill={`url(#${ref("veil")})`} />
      )}
    </svg>
  );
}
