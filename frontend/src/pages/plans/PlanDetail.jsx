import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Shield, CloudRain, Flame, Wind, AlertTriangle, Store } from 'lucide-react';
import Button from '../../components/Button';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

const PLAN_DETAILS = {
  basic: {
    name: 'Basic Cover',
    price: 49,
    perEvent: 200,
    maxDays: 3,
    eventsCovered: [
      { icon: CloudRain, title: 'Heavy Rainfall', desc: 'Precipitation exceeding 15 mm/hr' },
      { icon: Flame, title: 'Extreme Heat', desc: 'Temperature exceeding 42 °C' },
    ],
  },
  standard: {
    name: 'Standard Cover',
    price: 89,
    perEvent: 350,
    maxDays: 4,
    eventsCovered: [
      { icon: CloudRain, title: 'Heavy Rainfall', desc: 'Precipitation exceeding 15 mm/hr' },
      { icon: Flame, title: 'Extreme Heat', desc: 'Temperature exceeding 40 °C' },
      { icon: Wind, title: 'Air Pollution Index', desc: 'AQI exceeding 300' },
      { icon: Store, title: 'Dark Store Power/System Halt', desc: 'Hub shutdown > 45 minutes' },
    ],
  },
  premium: {
    name: 'Premium Cover',
    price: 129,
    perEvent: 500,
    maxDays: 6,
    eventsCovered: [
      { icon: CloudRain, title: 'Heavy Rainfall & Flooding', desc: 'Precipitation exceeding 12 mm/hr' },
      { icon: Flame, title: 'Extreme Heat Wave', desc: 'Temperature exceeding 38 °C' },
      { icon: Wind, title: 'Severe Air Pollution', desc: 'AQI exceeding 250' },
      { icon: AlertTriangle, title: 'Civic Curfews & Strikes', desc: 'Police/municipal delivery bans' },
      { icon: Store, title: 'Dark Store Full Outage', desc: 'Hub offline > 30 minutes' },
    ],
  },
};

export default function PlanDetail() {
  const { tier } = useParams();
  const navigate = useNavigate();

  const details = PLAN_DETAILS[tier?.toLowerCase()] || PLAN_DETAILS.standard;

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            haptic('selection');
            navigate(-1);
          }}
          className="w-10 h-10 rounded-full glass-1 flex items-center justify-center text-ink"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-ink">{details.name}</h1>
      </div>

      <div className="glass-1 p-6 rounded-hero space-y-4 shadow-glass">
        <div className="flex justify-between items-baseline">
          <div>
            <span className="text-xs font-bold text-ink/72 uppercase">Weekly Premium</span>
            <div className="font-display font-extrabold text-4xl text-ink">
              {formatMoney(details.price)}{' '}
              <span className="text-sm font-bold text-ink/72 font-sans">/ week</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-ink/72 uppercase">Per Event Payout</span>
            <div className="font-display font-extrabold text-3xl text-walnut">
              {formatMoney(details.perEvent)}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-biscuit/40 flex items-center justify-between text-xs font-bold text-ink/72">
          <span>Max payout events: {details.maxDays} times / month</span>
          <span className="text-sage">Instant UPI Transfer</span>
        </div>
      </div>

      <div>
        <h2 className="font-display font-bold text-xl text-ink mb-3">Disruptions covered</h2>
        <div className="space-y-3">
          {details.eventsCovered.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="glass-1 p-4 rounded-card flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-powder flex items-center justify-center text-walnut shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-ink">{item.title}</h3>
                  <p className="text-xs font-semibold text-ink/72 mt-0.5">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-sand p-4 rounded-card text-xs font-semibold text-ink/72 leading-relaxed flex items-start gap-3">
        <Shield className="w-5 h-5 text-walnut shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-ink">72-Hour Waiting Period: </span>
          Parametric sensor verification activates 72 hours after initial subscription to ensure community fund integrity.
        </div>
      </div>

      <div className="pt-2">
        <Button
          variant="primary"
          onClick={() => {
            haptic('success');
            navigate(`/plans/${tier}/activate`);
          }}
        >
          Proceed to Activation
        </Button>
      </div>
    </div>
  );
}
