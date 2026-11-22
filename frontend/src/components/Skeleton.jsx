const variantClasses = {
  text: 'h-4 rounded-md',
  circle: 'rounded-full',
  card: 'h-32 rounded-card',
  hero: 'h-48 rounded-hero',
};

export default function Skeleton({
  variant = 'text',
  className = '',
  width,
  height,
}) {
  return (
    <div
      className={`
        animate-pulse bg-sand/60
        ${variantClasses[variant] || variantClasses.text}
        ${className}
      `}
      style={{
        width: width ?? (variant === 'circle' ? 48 : '100%'),
        height: height ?? (variant === 'circle' ? 48 : undefined),
      }}
      aria-hidden="true"
    />
  );
}
