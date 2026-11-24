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
      <circle cx="24" cy="7" r="3" fill="#ffd88a" />
      <path d="M2 27 12 8l10 19Z" fill="#8a6cf0" />
      <path d="M12 8l10 19H12Z" fill="#6c50d0" />
      <path d="M14 27l8-13 8 13Z" fill="#ff9a5c" />
      <path d="M22 14l8 13h-8Z" fill="#f0b44c" />
    </svg>
  );
}
