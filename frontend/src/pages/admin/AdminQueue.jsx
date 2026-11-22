import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Clock, AlertTriangle, CheckCircle, RefreshCw, XCircle, ArrowUpRight, Search } from 'lucide-react';
import { api } from '../../services/api';
import useEventStream from '../../hooks/useEventStream';
import StatusPill from '../../components/StatusPill';
import Button from '../../components/Button';
import Banner from '../../components/Banner';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

const SAMPLE_HELD_CLAIMS = [
  {
    id: 'clm_held_0189',
    claim_id: 'clm_held_0189',
    worker_id: 'wrk_98213',
    worker_name: 'Suresh Patil',
    tenant_id: 'blinkit',
    trigger_type: 'rainfall',
    requested_amount: 350,
    fraud_score: 0.68,
    priority: 92,
    status: 'held',
    time_held: '1h 12m ago',
    hours_left: 22,
    signals: [
      { name: 'Location physics', status: 'normal', desc: 'No velocity spikes detected' },
      { name: 'Account network', status: 'suspicious', desc: '4 accounts share dark store device fingerprint' },
      { name: 'Claim burst', status: 'normal', desc: 'Single claim in zone time window' },
      { name: 'Zone claim rate', status: 'normal', desc: 'Within expected 15% rate' },
      { name: 'Recent deliveries', status: 'suspicious', desc: 'Zero dispatch logs in 3 hours preceding alert' },
      { name: 'Dark store check-in', status: 'normal', desc: 'Scanned QR code 42 mins prior' },
    ],
    shap_factors: [
      { feature: 'inactive_hours_before_alert', impact: '+0.32' },
      { feature: 'shared_device_cluster', impact: '+0.24' },
      { feature: 'verified_qr_checkin', impact: '-0.18' },
    ],
  },
  {
    id: 'clm_held_0204',
    claim_id: 'clm_held_0204',
    worker_id: 'wrk_77142',
    worker_name: 'Anil Verma',
    tenant_id: 'zepto',
    trigger_type: 'platform_outage',
    requested_amount: 500,
    fraud_score: 0.54,
    priority: 85,
    status: 'held',
    time_held: '3h 40m ago',
    hours_left: 20,
    signals: [
      { name: 'Location physics', status: 'normal', desc: 'Coordinates align with Koramangala' },
      { name: 'Account network', status: 'normal', desc: 'Independent single device' },
      { name: 'Claim burst', status: 'suspicious', desc: 'Fired 3 claims in last 10 days' },
      { name: 'Zone claim rate', status: 'normal', desc: 'Standard zone load' },
      { name: 'Recent deliveries', status: 'suspicious', desc: 'App opened only after trigger broadcast' },
      { name: 'Dark store check-in', status: 'normal', desc: 'Valid HMAC code' },
    ],
    shap_factors: [
      { feature: 'claim_frequency_30d', impact: '+0.28' },
      { feature: 'trigger_to_open_delta_sec', impact: '+0.19' },
    ],
  },
];

export default function AdminQueue() {
  const [claims, setClaims] = useState(SAMPLE_HELD_CLAIMS);
  const [selectedClaim, setSelectedClaim] = useState(SAMPLE_HELD_CLAIMS[0]);
  const [loading, setLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAdminQueue();
      const list = Array.isArray(res) ? res : res.claims || res.queue || [];
      if (list.length > 0) {
        setClaims(list);
        setSelectedClaim(list[0]);
      }
    } catch {
      // Keep sample claims for test preview
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEventStream('/stream/admin', (eventName, data) => {
    if (eventName === 'claim.held' || eventName === 'fraud.ring_suspected') {
      setToastMessage(`Admin Alert: ${eventName}`);
      fetchQueue();
    }
  });

  const handleDecision = async (decisionType, percentage = 100) => {
    if (!selectedClaim) return;
    haptic('selection');

    try {
      await api.reviewClaim(selectedClaim.id || selectedClaim.claim_id, {
        decision: decisionType,
        review_notes: reviewNotes || `Adjudicated as ${decisionType} by desk officer`,
        payout_percentage: percentage,
      });

      setToastMessage(`Claim #${selectedClaim.id} marked as ${decisionType.toUpperCase()}`);
      setClaims((prev) => prev.filter((c) => (c.id || c.claim_id) !== (selectedClaim.id || selectedClaim.claim_id)));
      setSelectedClaim(null);
      setReviewNotes('');
    } catch (err) {
      alert(`Decision error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-2 px-5 py-3 rounded-row border-2 border-walnut shadow-float text-sm font-bold text-ink">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-biscuit/40">
        <div>
          <h1 className="font-display font-extrabold text-3xl text-ink">
            Review Queue
          </h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">
            Priority min-heap for claims held by XGBoost fraud telemetry (Layers A–F)
          </p>
        </div>

        <button
          onClick={fetchQueue}
          className="h-10 px-4 rounded-row glass-1 flex items-center gap-2 text-xs font-bold text-ink hover:bg-white/60 self-start"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Priority List */}
        <div className="lg:col-span-5 glass-1 rounded-card p-4 space-y-3 shadow-glass">
          <div className="flex items-center justify-between pb-2 border-b border-biscuit/40">
            <span className="font-display font-bold text-sm text-ink">
              Held Claims ({claims.length})
            </span>
            <span className="text-xs font-semibold text-ink/48">Ranked by Priority</span>
          </div>

          <div className="space-y-2">
            {claims.map((c) => {
              const isSelected = (selectedClaim?.id || selectedClaim?.claim_id) === (c.id || c.claim_id);
              return (
                <button
                  key={c.id || c.claim_id}
                  onClick={() => {
                    haptic('selection');
                    setSelectedClaim(c);
                  }}
                  className={`w-full text-left p-3.5 rounded-row transition-all ${
                    isSelected
                      ? 'bg-sky text-ink border-2 border-walnut shadow-glass'
                      : 'glass-2 hover:bg-white/60 text-ink/72'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-ink">
                      #{c.id || c.claim_id}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-honey/40 text-[10px] font-extrabold text-ink">
                      Priority {c.priority || 85}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <h4 className="font-sans font-bold text-sm text-ink">
                        {c.worker_name || c.worker_id}
                      </h4>
                      <span className="text-xs capitalize font-semibold opacity-80">
                        {c.tenant_id?.toUpperCase()} • {c.trigger_type}
                      </span>
                    </div>
                    <span className="font-display font-extrabold text-base text-ink">
                      {formatMoney(c.requested_amount || 350)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-biscuit/20 text-[11px] font-semibold opacity-75">
                    <Clock size={12} />
                    <span>Held {c.time_held || '2h ago'} (SLA {c.hours_left || 22}h left)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Decision Support & Adjudication */}
        <div className="lg:col-span-7 glass-1 rounded-card p-6 shadow-glass space-y-6">
          {selectedClaim ? (
            <>
              <div className="flex items-start justify-between pb-4 border-b border-biscuit/40">
                <div>
                  <span className="text-xs font-bold text-ink/72 uppercase">
                    Adjudication Details
                  </span>
                  <h2 className="font-display font-extrabold text-2xl text-ink">
                    Claim #{selectedClaim.id || selectedClaim.claim_id}
                  </h2>
                  <p className="text-xs font-semibold text-ink/72 mt-0.5">
                    Rider: <span className="text-ink font-bold">{selectedClaim.worker_name || selectedClaim.worker_id}</span> • Platform: <span className="text-ink font-bold">{selectedClaim.tenant_id?.toUpperCase()}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-ink/72 uppercase">Claimed Amount</span>
                  <div className="font-display font-extrabold text-2xl text-ink">
                    {formatMoney(selectedClaim.requested_amount || 350)}
                  </div>
                </div>
              </div>

              {/* Confidence & XGBoost Fraud Score */}
              <div className="glass-sand p-4 rounded-row space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase">Model Fraud Probability</span>
                  <span className="font-mono font-bold text-base text-madder">
                    {(selectedClaim.fraud_score || 0.68).toFixed(2)} (Threshold: 0.40)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-sand overflow-hidden">
                  <div
                    className="h-full bg-madder rounded-full"
                    style={{ width: `${(selectedClaim.fraud_score || 0.68) * 100}%` }}
                  />
                </div>
              </div>

              {/* Signals Checklist */}
              <div>
                <h3 className="font-display font-bold text-base text-ink mb-3">
                  Telemetry Signals Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(selectedClaim.signals || []).map((sig, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-row glass-2 border border-biscuit/30 flex items-start gap-2.5"
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                          sig.status === 'normal' ? 'bg-sage' : 'bg-honey animate-pulse'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-ink">{sig.name}</div>
                        <div className="text-[11px] font-semibold text-ink/72 mt-0.5">
                          {sig.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SHAP Explanation Factors */}
              {selectedClaim.shap_factors && (
                <div className="glass-2 p-4 rounded-row space-y-2 border border-biscuit/40">
                  <span className="text-xs font-bold text-ink uppercase">Top SHAP Model Factors</span>
                  <div className="space-y-1">
                    {selectedClaim.shap_factors.map((f, idx) => (
                      <div key={idx} className="flex justify-between text-xs font-mono">
                        <span className="text-ink/72">{f.feature}</span>
                        <span className={f.impact.startsWith('+') ? 'text-madder font-bold' : 'text-sage font-bold'}>
                          {f.impact}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjudicator Notes */}
              <div>
                <label className="block text-xs font-bold text-ink/72 uppercase mb-2">
                  Adjudicator Notes & Rationale
                </label>
                <textarea
                  rows={2}
                  placeholder="Record investigation findings before committing decision..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full glass-solid p-3 rounded-field border border-biscuit text-xs text-ink placeholder-ink/48 focus:outline-walnut"
                />
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Button variant="primary" onClick={() => handleDecision('approve', 100)}>
                  Approve 100%
                </Button>
                <Button variant="secondary" onClick={() => handleDecision('partial', 60)}>
                  Approve 60%
                </Button>
                <Button variant="danger" onClick={() => handleDecision('reject', 0)}>
                  Reject Claim
                </Button>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-sm font-semibold text-ink/72">
              Select a held claim from the left pane to inspect telemetry and review.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
