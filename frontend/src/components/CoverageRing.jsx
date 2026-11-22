import { useEffect, useState } from 'react';

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CoverageRing({ total = 100, used = 0, label }) {
  const [animatedOffset, setAnimatedOffset] = useState(CIRCUMFERENCE);
  const remaining = Math.max(0, total - used);
  const fraction = total > 0 ? remaining / total : 0;
  const targetOffset = CIRCUMFERENCE * (1 - fraction);

  useEffect(() => {
    // Trigger animation on mount or change
    const timer = requestAnimationFrame(() => {
      setAnimatedOffset(targetOffset);
    });
    return () => cancelAnimationFrame(timer);
  }, [targetOffset]);

  const formatAmount = (n) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        {/* Track */}
        <circle
          cx="48"
          cy="48"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          className="text-sand"
          strokeWidth="6"
        />
        {/* Fill */}
        <circle
          cx="48"
          cy="48"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          className="text-walnut"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={animatedOffset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-base font-bold text-ink leading-none">
          {formatAmount(remaining)}
        </span>
        {label && (
          <span className="text-[10px] text-ink/48 mt-0.5">{label}</span>
        )}
      </div>
    </div>
  );
}
