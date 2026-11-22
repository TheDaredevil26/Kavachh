import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudRain, Flame, Wind, QrCode, ArrowRight } from 'lucide-react';
import HeroCard from '../../components/HeroCard';
import ConditionTile from '../../components/ConditionTile';
import ListGroup from '../../components/ListGroup';
import ListRow from '../../components/ListRow';
import StatusPill from '../../components/StatusPill';
import Skeleton from '../../components/Skeleton';
import SwipeToConfirm from '../../components/SwipeToConfirm';
import Button from '../../components/Button';
import KavachShield from '../../assets/KavachShield';
import { api } from '../../services/api';
import useAuth from '../../hooks/useAuth';
import useEventStream from '../../hooks/useEventStream';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activePolicy, setActivePolicy] = useState(null);
  const [activeTrigger, setActiveTrigger] = useState(null);
  const [recentClaims, setRecentClaims] = useState([]);
  const [coverageData, setCoverageData] = useState({ remaining: 1050, total: 1400 });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [policiesRes, triggersRes, claimsRes] = await Promise.allSettled([
        api.getPolicies(),
        api.getActiveTriggers(),
        api.getClaims(),
      ]);

      if (policiesRes.status === 'fulfilled' && Array.isArray(policiesRes.value)) {
        const current = policiesRes.value.find((p) => p.status === 'active') || policiesRes.value[0];
        setActivePolicy(current || null);
        if (current) {
          const rem = (current.max_monthly_payout || 1400) - (current.total_payout_made || 350);
          setCoverageData({
            remaining: Math.max(0, rem),
            total: current.max_monthly_payout || 1400,
          });
        }
      }

      if (triggersRes.status === 'fulfilled' && Array.isArray(triggersRes.value) && triggersRes.value.length > 0) {
        setActiveTrigger(triggersRes.value[0]);
      } else {
        setActiveTrigger(null);
      }

      if (claimsRes.status === 'fulfilled' && Array.isArray(claimsRes.value)) {
        setRecentClaims(claimsRes.value.slice(0, 3));
      }
    } catch (err) {
      console.error('Home load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Listen to SSE live worker stream for disruption announcements or claim status changes
  useEventStream('/stream/worker', (eventName, data) => {
    if (eventName === 'trigger.announced') {
      haptic('selection');
      setActiveTrigger(data);
    } else if (eventName === 'claim.state_changed' || eventName === 'payout.disbursed') {
      fetchData();
    }
  });

  const handleClaimSwipe = async () => {
    if (!activeTrigger || !activePolicy) return;
    haptic('selection');

    // Get current GPS location or default
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
        // Fallback to zone coordinates
      }
    }

    const claimData = {
      trigger_event_id: activeTrigger.id,
      policy_id: activePolicy.id,
      gps_latitude: lat,
      gps_longitude: lon,
    };

    const res = await api.fileClaim(claimData);
    haptic('success');
    navigate(`/claims/${res.id || res.claim_id || 'new'}`);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 max-w-xl mx-auto">
        <Skeleton variant="hero" height="240px" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
          <Skeleton variant="card" height="110px" />
        </div>
        <Skeleton variant="card" height="90px" />
        <Skeleton variant="card" height="140px" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      {/* Hero Card: Cover Status */}
      {activePolicy ? (
        <HeroCard className="relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-walnut flex items-center justify-center text-oat shadow-press">
                <KavachShield className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-ink uppercase tracking-wider">
                  Cover Active
                </span>
                <h2 className="font-display font-extrabold text-xl text-ink">
                  {activePolicy.tier ? activePolicy.tier.toUpperCase() : 'STANDARD'} PLAN
                </h2>
              </div>
            </div>
            <StatusPill status="safe" label="Protected" />
          </div>

          <div className="my-5 flex items-baseline gap-2">
            <span className="font-display font-extrabold text-5xl text-ink tabular-nums">
              {formatMoney(coverageData.remaining)}
            </span>
            <span className="text-sm font-bold text-ink/72">left this month</span>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-ink/72 pt-3 border-t border-biscuit/40">
            <span>Renews {new Date(activePolicy.end_date || Date.now() + 7 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            <span className="text-walnut">Auto-renew ON</span>
          </div>
        </HeroCard>
      ) : (
        <div className="glass-1 p-6 rounded-hero text-center space-y-4 border border-biscuit/60">
          <div className="w-14 h-14 rounded-full bg-sand flex items-center justify-center text-walnut mx-auto">
            <KavachShield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-display font-extrabold text-2xl text-ink">You are not covered yet</h2>
            <p className="text-sm font-semibold text-ink/72 mt-1">
              Protect your weekly delivery income from weather and dark store disruptions.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/plans')} icon={ArrowRight}>
            See plans from ₹49/week
          </Button>
        </div>
      )}

      {/* Disruption Alert Dock (Live Trigger Available) */}
      {activeTrigger && (
        <div className="glass-2 p-5 rounded-card border-2 border-sky shadow-float space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudRain className="w-6 h-6 text-walnut animate-bounce" />
              <div>
                <span className="text-xs font-bold text-walnut uppercase tracking-wider">
                  Disruption Detected
                </span>
                <h3 className="font-display font-bold text-lg text-ink">
                  {activeTrigger.title || `${activeTrigger.trigger_type || 'Heavy Rain'} Alert`}
                </h3>
              </div>
            </div>
            <span className="text-sm font-extrabold text-ink bg-sky px-2.5 py-1 rounded-full">
              ₹{activeTrigger.payout_amount || 350}
            </span>
          </div>

          <SwipeToConfirm
            label={`Swipe to claim ₹${activeTrigger.payout_amount || 350}`}
            successLabel="Claim filed!"
            onConfirm={handleClaimSwipe}
          />
        </div>
      )}

      {/* Right now in your area */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-display font-bold text-xl text-ink">Right now in your area</h2>
          <span className="text-xs font-semibold text-ink/72">Koramangala Zone</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ConditionTile
            icon={CloudRain}
            name="Rainfall"
            value="0 mm/h"
            state="safe"
          />
          <ConditionTile
            icon={Flame}
            name="Heat Index"
            value="31 °C"
            state="safe"
          />
          <ConditionTile
            icon={Wind}
            name="Air Quality"
            value="142 AQI"
            state="watch"
          />
        </div>
      </div>

      {/* Store Check-In Prompt */}
      <div className="glass-sand p-5 rounded-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sand flex items-center justify-center text-walnut shrink-0">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-ink">At your dark store?</h3>
            <p className="text-xs font-semibold text-ink/72">Check in to strengthen automatic claims</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/checkin')}
          className="h-10 px-4 rounded-row bg-walnut text-oat text-xs font-bold shrink-0 shadow-press active:scale-95 transition-transform"
        >
          Scan QR
        </button>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-display font-bold text-xl text-ink">Recent claims</h2>
          {recentClaims.length > 0 && (
            <button
              onClick={() => navigate('/claims')}
              className="text-xs font-bold text-ink/72 hover:text-ink underline"
            >
              View all
            </button>
          )}
        </div>

        {recentClaims.length > 0 ? (
          <ListGroup>
            {recentClaims.map((claim) => (
              <ListRow
                key={claim.id}
                icon={CloudRain}
                title={claim.trigger_event?.title || 'Weather Disruption'}
                subtitle={new Date(claim.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                value={formatMoney(claim.calculated_payout || claim.requested_payout || 350)}
                status={claim.state}
                onClick={() => navigate(`/claims/${claim.id}`)}
              />
            ))}
          </ListGroup>
        ) : (
          <div className="glass-1 p-6 rounded-card text-center text-sm font-semibold text-ink/72">
            No claims yet. When weather disruptions occur, payouts appear here.
          </div>
        )}
      </div>
    </div>
  );
}
