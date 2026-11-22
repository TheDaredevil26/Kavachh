export default function KavachShield({ size = 40, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kavach shield logo"
      role="img"
      {...props}
    >
      <path
        d="M32 4L8 16v16c0 14.4 10.2 27.6 24 31 13.8-3.4 24-16.6 24-31V16L32 4Z"
        fill="#5A4030"
      />
      <path
        d="M32 10l-18 9v12c0 11.4 7.8 21.8 18 24.6 10.2-2.8 18-13.2 18-24.6V19L32 10Z"
        fill="#8A6A4F"
        opacity="0.35"
      />
      <path
        d="M32 18l-10 5v8c0 6.6 4.4 12.6 10 14.2 5.6-1.6 10-7.6 10-14.2v-8L32 18Z"
        fill="#EFE6D8"
        opacity="0.9"
      />
    </svg>
  );
}
