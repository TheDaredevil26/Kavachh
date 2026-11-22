import GlassCard from './GlassCard';

export default function HeroCard({ className = '', children }) {
  return (
    <GlassCard level={1} tint="sky" radius="hero" className={className}>
      {children}
    </GlassCard>
  );
}
