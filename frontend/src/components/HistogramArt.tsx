export function HistogramArt() {
  return (
    <svg
      className="histogram"
      viewBox="0 0 600 300"
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hist-pink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8da1" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8da1" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path
        d="M0 300 C 40 290 70 200 110 170 C 150 140 170 210 210 150 C 250 90 290 40 340 80 C 390 120 420 60 470 130 C 520 200 560 260 600 290 L600 300 Z"
        fill="url(#hist-pink)"
      />
      <path
        d="M0 300 C 60 280 100 250 150 230 C 200 210 240 120 300 110 C 360 100 400 190 450 200 C 510 212 560 270 600 296 L600 300 Z"
        fill="#ffffff"
        fillOpacity="0.14"
      />
      <path
        d="M0 300 C 80 295 130 270 190 250 C 250 230 280 180 330 170 C 390 160 430 230 490 250 C 540 266 580 290 600 298 L600 300 Z"
        fill="#9a9a9a"
        fillOpacity="0.2"
      />
    </svg>
  );
}
