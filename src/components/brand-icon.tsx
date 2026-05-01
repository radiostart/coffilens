interface BrandIconProps {
  size?: number;
}

export function BrandIcon({ size = 64 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="var(--color-primary-subtle)"
        stroke="var(--color-primary)"
        strokeWidth="2"
      />
      <circle
        cx="32"
        cy="32"
        r="14"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="3"
      />
      <circle cx="32" cy="32" r="3" fill="var(--color-primary)" />
    </svg>
  );
}
