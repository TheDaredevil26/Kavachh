import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CloudRain, MapPin, Shield, AlertTriangle } from 'lucide-react';
import SwipeToConfirm from '../../components/SwipeToConfirm';
import Banner from '../../components/Banner';
import Skeleton from '../../components/Skeleton';
import { api } from '../../services/api';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

export default function AlertPage() {
  const { triggerId } = useParams();
  const navigate = useNavigate();

  const [trigger, setTrigger] = useState(null);
  const [activePolicy, setActivePolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [trigRes, polRes] = await Promise.all([
          api.getTrigger(triggerId).catch(() => null),
          api.getPolicies().catch(() => []),
        ]);

        if (trigRes) {
          setTrigger(trigRes);
        } else {
          // Fallback mock trigger representation
          setTrigger({
            id: triggerId,
            trigger_type: 'rainfall',
            title: 'Heavy Rainfall in Koramangala',
            payout_amount: 350,
            severity: 'high',
            created_at: new Date().toISOString(),
          });
        }

        if (Array.isArray(polRes) && polRes.length > 0) {
          setActivePolicy(polRes.find((p) => p.status === 'active') || polRes[0]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [triggerId]);

  const handleClaimSwipe = async () => {
    haptic('selection');
    let lat = 12.9352;
    let lon = 77.6245;

    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        // use default coordinates
      }
    }

    try {
      const res = await api.fileClaim({
        trigger_event_id: triggerId,
        policy_id: activePolicy?.id,
        gps_latitude: lat,
        gps_longitude: lon,
      });

      haptic('success');
      navigate(`/claims/${res.id || res.claim_id}`);
    } catch (err) {
      setError(err.message || 'Unable to file claim. Please retry.');
      haptic('error');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 max-w-xl mx-auto">
        <Skeleton variant="hero" height="240px" />
        <Skeleton variant="card" height="120px" />
      </div>
    );
  }

  const payoutAmount = trigger?.payout_amount || 350;

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      {/* Handle bar representing bottom sheet / alert modal */}
      <div className="w-12 h-1.5 rounded-full bg-walnut/30 mx-auto" />

      {error && <Banner variant="danger">{error}</Banner>}

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-sky flex items-center justify-center text-walnut shrink-0">
          <CloudRain className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <span className="text-xs font-bold text-walnut uppercase tracking-wider">
            Parametric Alert
          </span>
          <h1 className="font-display font-extrabold text-2xl text-ink leading-tight">
            {trigger?.title || 'Severe Weather Disruption'}
          </h1>
        </div>
      </div>

      <div className="glass-sky p-6 rounded-hero space-y-3 shadow-glass">
        <span className="text-xs font-bold text-ink/72 uppercase">Eligible Disruption Income</span>
        <div className="font-display font-extrabold text-5xl text-ink tabular-nums">
          {formatMoney(payoutAmount)}
        </div>
        <p className="text-xs font-semibold text-ink/72 pt-2 border-t border-biscuit/40">
          Standard plan • Instant transfer to primary UPI account upon verification
        </p>
      </div>

      <div className="glass-1 p-5 rounded-card space-y-3">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-walnut shrink-0 mt-0.5" />
          <div className="text-xs font-semibold text-ink/72 leading-relaxed">
            We verify your dark store proximity and active delivery shift telemetry automatically. No forms or bills required.
          </div>
        </div>
        <div className="flex items-start gap-3 pt-2 border-t border-biscuit/30">
          <Shield className="w-5 h-5 text-walnut shrink-0 mt-0.5" />
          <div className="text-xs font-semibold text-ink/72 leading-relaxed">
            AI fraud defense protects the pool for honest delivery partners.
          </div>
        </div>
      </div>

      <div className="pt-4 space-y-3">
        <SwipeToConfirm
          label={`Swipe to claim ${formatMoney(payoutAmount)}`}
          successLabel="Claim filed!"
          onConfirm={handleClaimSwipe}
        />
        <button
          onClick={() => navigate('/home')}
          className="w-full text-center text-sm font-bold text-ink/72 hover:text-ink py-2"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
