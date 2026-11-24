import { useId } from "react";

interface MountainArtProps {
  className?: string;
}

// Where the sun sits. The glow and the disc both read from here.
const SUN = { x: 450, y: 545 };

export function MountainArt({ className }: MountainArtProps) {
  const uid = useId().replace(/:/g, "");
  const sky = `${uid}-sky`;
  const glow = `${uid}-glow`;
  const veil = `${uid}-veil`;
  const cloud = `${uid}-cloud`;

  return (
    <svg
      className={className}
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120e26" />
          <stop offset="0.4" stopColor="#2b1f4d" />
          <stop offset="0.62" stopColor="#68457a" />
          <stop offset="0.76" stopColor="#d98b66" />
          <stop offset="0.88" stopColor="#f6c56d" />
        </linearGradient>
        <radialGradient
          id={glow}
          cx={SUN.x}
          cy={SUN.y}
          r="380"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffd88a" stopOpacity="0.75" />
          <stop offset="0.4" stopColor="#ff9a5c" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff9a5c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={veil} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e0c14" stopOpacity="0.6" />
          <stop offset="1" stopColor="#0e0c14" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={cloud} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd88a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffd88a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd88a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* sky, glow, stars, sun */}
      <rect width="800" height="900" fill={`url(#${sky})`} />
      <rect width="800" height="900" fill={`url(#${glow})`} />
      <g fill="#ffffff" fillOpacity="0.7">
        <circle cx="90" cy="70" r="1.4" />
        <circle cx="210" cy="140" r="1.1" />
        <circle cx="330" cy="60" r="1.5" />
        <circle cx="470" cy="120" r="1.1" />
        <circle cx="600" cy="50" r="1.4" />
        <circle cx="720" cy="150" r="1.2" />
        <circle cx="150" cy="240" r="1" />
        <circle cx="560" cy="230" r="1" />
        <circle cx="690" cy="300" r="1.1" />
      </g>
      <circle cx={SUN.x} cy={SUN.y} r="46" fill="#ffe3a8" />

      {/* thin clouds lit from below */}
      <rect
        x="110"
        y="500"
        width="340"
        height="4"
        rx="2"
        fill={`url(#${cloud})`}
      />
      <rect
        x="430"
        y="470"
        width="300"
        height="3"
        rx="1.5"
        fill={`url(#${cloud})`}
      />
      <rect
        x="30"
        y="545"
        width="250"
        height="3"
        rx="1.5"
        fill={`url(#${cloud})`}
      />

      {/* five ridgelines, hazy and light at the back, dark and sharp at the front */}
      <path
        d="M0 600 L60 560 L130 585 L210 520 L290 580 L370 540 L450 590 L540 530 L630 585 L710 545 L800 575 V900 H0Z"
        fill="#5a4684"
        fillOpacity="0.9"
      />
      <path
        d="M0 660 L100 585 L190 640 L300 500 L400 620 L500 560 L600 640 L700 520 L800 610 V900 H0Z"
        fill="#43336a"
      />
      <path
        d="M0 740 L130 630 L250 720 L360 400 L490 700 L560 650 L680 450 L800 700 V900 H0Z"
        fill="#2e2250"
      />

      {/* sunlit faces and rim light on the two big peaks */}
      <path d="M360 400 L490 700 L410 650Z" fill="#ffb878" fillOpacity="0.22" />
      <path d="M680 450 L560 650 L620 640Z" fill="#ffb878" fillOpacity="0.22" />
      <path
        d="M360 400 L490 700"
        stroke="#ffcf7a"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M680 450 L560 650"
        stroke="#ffcf7a"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M360 400 L382 448 L368 440 L360 456 L350 438 L338 446Z"
        fill="#efe7ff"
        fillOpacity="0.5"
      />
      <path
        d="M680 450 L698 488 L686 482 L680 494 L672 480 L662 486Z"
        fill="#efe7ff"
        fillOpacity="0.5"
      />

      <path
        d="M0 820 L140 740 L300 810 L470 750 L640 820 L800 770 V900 H0Z"
        fill="#171126"
      />

      {/* darkens the top so the headline stays readable */}
      <rect width="800" height="330" fill={`url(#${veil})`} />
    </svg>
  );
}
