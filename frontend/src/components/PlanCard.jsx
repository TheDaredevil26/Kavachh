import { Check } from 'lucide-react';
import Button from './Button';
import { haptic } from '../lib/haptics';

export default function PlanCard({
  tier,
  weeklyPrice,
  perEvent,
  daysPerMonth,
  selected = false,
  onSelect,
  className = '',
}) {
  const handleSelect = () => {
    haptic('selection');
    onSelect?.();
  };

  return (
    <div
      className={`
        glass-1 rounded-card p-5
        flex flex-col gap-3
        transition-all duration-200 ease-spring
        ${selected ? 'ring-2 ring-walnut' : ''}
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-ink">{tier}</span>
        {selected && (
          <div className="w-6 h-6 rounded-full bg-walnut flex items-center justify-center">
            <Check className="h-4 w-4 text-oat" />
          </div>
        )}
      </div>

      {/* Hero price */}
      <div className="flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold text-ink tabular-nums">
          ₹{weeklyPrice}
        </span>
        <span className="text-sm text-ink/48">/week</span>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1 text-sm text-ink/72">
        {perEvent && <span>₹{perEvent} per event</span>}
        {daysPerMonth && <span>{daysPerMonth} days/month coverage</span>}
      </div>

      {/* Select button */}
      <Button
        variant={selected ? 'secondary' : 'primary'}
        compact
        onClick={handleSelect}
      >
        {selected ? 'Selected' : 'Select Plan'}
      </Button>
    </div>
  );
}
