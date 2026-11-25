interface LogoProps {
  size?: number;
}

export function Logo({ size = 22 }: LogoProps) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3 21 10h-2.5l5 7h-3l5.5 8H6l5.5-8h-3l5-7H11Z"
        fill="#2c8a62"
      />
      <path d="M16 3 21 10h-2.5l5 7h-3l5.5 8H16Z" fill="#4ec78f" />
      <path
        d="M16 25v5"
        stroke="#9fdcf0"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M9 30q7-3 14 0"
        stroke="#9fdcf0"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
