import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import Timeline from '../../components/Timeline';
import StatusPill from '../../components/StatusPill';
import Banner from '../../components/Banner';
import Skeleton from '../../components/Skeleton';
import Button from '../../components/Button';
import { api } from '../../services/api';
import useEventStream from '../../hooks/useEventStream';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

export default function ClaimTracker() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [disputeTimeLeft, setDisputeTimeLeft] = useState('1h 54m');

  const fetchClaim = async () => {
    try {
      setLoading(true);
      const res = await api.getClaim(id);
      setClaim(res);
    } catch (err) {
      console.warn('Fallback simulated claim:', err);
      // Demo mock fallback if claim ID is new or offline
      setClaim({
        id: id || 'clm_demo_101',
        state: 'scoring',
        calculated_payout: 350,
        trigger_event: { title: 'Heavy Rainfall in Koramangala' },
        created_at: new Date().toISOString(),
        state_history: [
          { to_state: 'filed', created_at: new Date().toISOString() },
          { to_state: 'validated', created_at: new Date().toISOString() },
          { to_state: 'scoring', created_at: new Date().toISOString() },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaim();
  }, [id]);

  // Subscribe to live SSE updates for this specific claim
  useEventStream(`/stream/claims/${id}`, (eventName, data) => {
    if (eventName === 'claim.state_changed' || eventName === 'payout.disbursed') {
      haptic('selection');
      fetchClaim();
    }
  });

  if (loading) {
    return (
      <div className="p-4 space-y-4 max-w-xl mx-auto">
        <Skeleton variant="hero" height="180px" />
        <Skeleton variant="card" height="300px" />
      </div>
    );
  }

  const currentState = claim?.state || 'filed';
  const payoutAmount = claim?.calculated_payout || claim?.requested_payout || 350;

  // Map state machine states to timeline steps
  const steps = [
    {
      label: 'Claim received',
      subText: 'We have received your parametric claim.',
      status: ['filed', 'validated', 'scoring', 'decided', 'payout_pending', 'paid', 'closed'].includes(currentState)
        ? (currentState === 'filed' ? 'current' : 'done')
        : 'future',
    },
    {
      label: 'Cover checked',
      subText: 'Active policy coverage confirmed for this disruption.',
      status: ['validated', 'scoring', 'decided', 'payout_pending', 'paid', 'closed'].includes(currentState)
        ? (currentState === 'validated' ? 'current' : 'done')
        : 'future',
    },
    {
      label: 'Verifying',
      subText: 'Telemetric shift and GPS physics check.',
      status: ['scoring', 'decided', 'payout_pending', 'paid', 'closed'].includes(currentState)
        ? (currentState === 'scoring' ? 'current' : 'done')
        : 'future',
    },
    {
      label: 'Approved',
      subText: 'Claim authorized. Transfer initiated.',
      status: ['decided', 'payout_pending', 'paid', 'closed'].includes(currentState)
        ? (currentState === 'decided' ? 'current' : 'done')
        : 'future',
    },
    {
      label: 'Sending money',
      subText: 'Direct IMPS/UPI disbursement to your bank.',
      status: ['payout_pending', 'paid', 'closed'].includes(currentState)
        ? (currentState === 'payout_pending' ? 'current' : 'done')
        : 'future',
    },
    {
      label: 'Money sent',
      subText: 'Reached your bank account.',
      status: ['paid', 'closed'].includes(currentState) ? 'done' : 'future',
    },
  ];

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            haptic('selection');
            navigate('/home');
          }}
          className="w-10 h-10 rounded-full glass-1 flex items-center justify-center text-ink"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-ink">Your claim</h1>
      </div>

      {/* Claim Summary Card */}
      <div className="glass-sky p-6 rounded-hero space-y-3 shadow-glass">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink/72 uppercase">
            {claim?.trigger_event?.title || 'Disruption Event'}
          </span>
          <StatusPill status={currentState === 'paid' ? 'safe' : currentState === 'held' ? 'attention' : 'in-progress'} label={currentState.toUpperCase()} />
        </div>
        <div className="font-display font-extrabold text-5xl text-ink tabular-nums">
          {formatMoney(payoutAmount)}
        </div>
        <p className="text-xs font-semibold text-ink/72">
          Claim ID: <span className="font-mono text-ink">{id}</span>
        </p>
      </div>

      {/* Held/Review Notice if applicable */}
      {currentState === 'held' && (
        <div className="glass-sand p-5 rounded-card border-2 border-honey space-y-2">
          <div className="flex items-center gap-2 text-walnut font-bold text-base">
            <Clock className="w-5 h-5" />
            <span>Under Manual Verification</span>
          </div>
          <p className="text-xs text-ink/72 leading-relaxed">
            Your claim is being reviewed by a desk officer to verify dark store GPS boundaries. You will hear back within 24 hours.
          </p>
        </div>
      )}

      {/* Live Timeline */}
      <div className="glass-1 p-6 rounded-card shadow-glass">
        <h3 className="font-display font-bold text-lg text-ink mb-4">Claim Status Progress</h3>
        <Timeline steps={steps} />
        <div className="mt-4 pt-3 border-t border-biscuit/40 text-xs text-ink/48 text-center">
          Parametric auto-settlements usually complete in under 15 minutes.
        </div>
      </div>

      {/* 2-Hour Dispute Window Card if paid */}
      {currentState === 'paid' && (
        <div className="glass-sand p-5 rounded-card flex items-center justify-between">
          <div>
            <h4 className="font-display font-bold text-sm text-ink">Something wrong?</h4>
            <span className="text-xs text-ink/72">Dispute window open ({disputeTimeLeft} left)</span>
          </div>
          <button
            onClick={() => {
              haptic('selection');
              navigate(`/claims/${id}/dispute`);
            }}
            className="h-10 px-4 rounded-row bg-walnut text-oat text-xs font-bold shadow-press active:scale-95 transition-transform"
          >
            Raise a problem
          </button>
        </div>
      )}
    </div>
  );
}
