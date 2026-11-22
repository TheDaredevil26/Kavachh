import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PlanCard from '../../components/PlanCard';
import Button from '../../components/Button';
import Skeleton from '../../components/Skeleton';
import { api } from '../../services/api';
import { haptic } from '../../lib/haptics';

const DEFAULT_TIERS = [
  {
    tier: 'basic',
    name: 'Basic Cover',
    price_weekly: 49,
    payout_per_event: 200,
    max_events_per_month: 3,
    description: 'Essential protection for rainy shifts and heavy downpours',
  },
  {
    tier: 'standard',
    name: 'Standard Cover',
    price_weekly: 89,
    payout_per_event: 350,
    max_events_per_month: 4,
    description: 'Optimal coverage for full-time daily gig riders',
    recommended: true,
  },
  {
    tier: 'premium',
    name: 'Premium Cover',
    price_weekly: 129,
    payout_per_event: 500,
    max_events_per_month: 6,
    description: 'Maximum security against weather, pollution & dark store halts',
  },
];

export default function Plans() {
  const navigate = useNavigate();
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [selectedTier, setSelectedTier] = useState('standard');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadTiers() {
      try {
        setLoading(true);
        const res = await api.getTiers();
        if (Array.isArray(res) && res.length > 0) {
          setTiers(res);
        }
      } catch (err) {
        console.warn('Using default tiers fallback:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTiers();
  }, []);

  const handleSelect = (tierSlug) => {
    haptic('selection');
    setSelectedTier(tierSlug);
  };

  const handleContinue = () => {
    haptic('success');
    navigate(`/plans/${selectedTier}`);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 max-w-xl mx-auto">
        <Skeleton variant="hero" height="280px" />
        <Skeleton variant="hero" height="280px" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      <div className="px-1">
        <h1 className="font-display font-extrabold text-3xl text-ink">Choose your weekly cover</h1>
        <p className="text-sm font-semibold text-ink/72 mt-1">
          Pay weekly via UPI. Automatic claim deposits. Cancel anytime.
        </p>
      </div>

      {/* Snap Carousel for Plans */}
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 pt-1 px-1 scrollbar-none">
        {tiers.map((t) => {
          const isSelected = selectedTier === (t.tier || t.slug);
          return (
            <div key={t.tier || t.slug} className="w-[85%] sm:w-[320px] shrink-0 snap-center">
              <PlanCard
                tier={t.tier || t.slug}
                name={t.name || `${t.tier?.toUpperCase()} PLAN`}
                price={t.price_weekly || t.price}
                perEvent={t.payout_per_event || t.payoutPerEvent}
                maxEvents={t.max_events_per_month || t.maxDays}
                desc={t.description}
                selected={isSelected}
                recommended={t.recommended || t.tier === 'standard'}
                onSelect={() => handleSelect(t.tier || t.slug)}
              />
            </div>
          );
        })}
      </div>

      {/* 72-Hour Waiting Period Notice */}
      <div className="glass-1 p-4 rounded-card text-xs text-ink/72 leading-relaxed border border-biscuit/40">
        <span className="font-bold text-ink">Note: </span>
        Protection begins 72 hours after first weekly activation to prevent speculative registrations during active storms.
      </div>

      <div className="pt-2">
        <Button variant="primary" onClick={handleContinue}>
          Review Selected Plan
        </Button>
      </div>
    </div>
  );
}
