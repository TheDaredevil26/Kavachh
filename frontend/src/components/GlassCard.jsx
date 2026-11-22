const tintMap = {
  none: '',
  sky: 'bg-sky/10',
  sand: 'bg-sand/10',
};

const radiusMap = {
  card: 'rounded-card',
  hero: 'rounded-hero',
};

export default function GlassCard({
  level = 1,
  tint = 'none',
  radius = 'card',
  className = '',
  children,
}) {
  return (
    <div
      className={`
        glass-${level}
        ${tintMap[tint] || ''}
        ${radiusMap[radius] || radiusMap.card}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
