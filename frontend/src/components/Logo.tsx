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
      <path d="M4 23 16 6l12 17Z" fill="#2f8f86" />
      <path d="M16 6l12 17H16Z" fill="#1f6b66" />
      <path d="M16 6l3.6 5.4-3.6-1-3.6 1Z" fill="#eaf6ff" />
      <g stroke="#f26a3c" strokeLinecap="round" fill="none">
        <path d="M9 17v11M23 17v11" strokeWidth="2.2" />
        <path d="M1 27 9 17Q16 25 23 17l8 10" strokeWidth="1.8" />
        <path d="M1 27.5h30" strokeWidth="1.6" />
      </g>
    </svg>
  );
}
