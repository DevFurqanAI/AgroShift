export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#14532D" />
      <path
        d="M8 21.5C11.5 16.5 17 14 24 14C22 19.5 17.5 23 11.5 23C10.2 23 9 22.4 8 21.5Z"
        fill="#10B981"
      />
      <path
        d="M16.5 8.5C12.8 9.2 9.8 11.8 8.8 15.5C12.3 13.8 16.2 12.6 20.5 12.4C19.6 10.3 18.2 9 16.5 8.5Z"
        fill="#FFFFFF"
        fillOpacity="0.9"
      />
    </svg>
  );
}
