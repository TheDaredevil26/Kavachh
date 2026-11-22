import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useEventStream } from '../hooks/useEventStream';
import Card from '../components/Card';
import StatusPill from '../components/StatusPill';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [policy, setPolicy] = useState(null);
  const [triggers, setTriggers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingTriggerId, setClaimingTriggerId] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [policiesRes, triggersRes, claimsRes] = await Promise.allSettled([
        api.getPolicies(),
        api.getActiveTriggers(),
        api.getClaims(),
      ]);

      if (policiesRes.status === 'fulfilled' && policiesRes.value) {
        const list = Array.isArray(policiesRes.value)
          ? policiesRes.value
          : policiesRes.value.policies || [];
        // Find active policy
        const active = list.find((p) => p.status === 'active') || list[0] || null;
        setPolicy(active);
      }

      if (triggersRes.status === 'fulfilled' && triggersRes.value) {
        const list = Array.isArray(triggersRes.value)
          ? triggersRes.value
          : triggersRes.value.triggers || [];
        setTriggers(list);
      }

      if (claimsRes.status === 'fulfilled' && claimsRes.value) {
        const list = Array.isArray(claimsRes.value)
          ? claimsRes.value
          : claimsRes.value.claims || [];
        setClaims(list);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Subscribe to live SSE worker updates
  const { isConnected: sseConnected } = useEventStream(
    '/stream/worker',
    (eventName, data) => {
      if (eventName === 'trigger.announced') {
        setToastMessage(`New trigger announced: ${data?.trigger_type || 'Weather event'} in your zone!`);
        api.getActiveTriggers().then((res) => {
          setTriggers(Array.isArray(res) ? res : res.triggers || []);
        });
      } else if (eventName === 'claim.state_changed' || eventName === 'payout.disbursed') {
        setToastMessage(`Claim update: ${data?.claim_id || ''} is now ${data?.state || data?.status}`);
        api.getClaims().then((res) => {
          setClaims(Array.isArray(res) ? res : res.claims || []);
        });
      }
    },
    loadDashboardData
  );

  // Clear toast after 5s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fast claim filing against active trigger
  const handleFileClaim = async (trigger) => {
    if (!policy) {
      setClaimError('An active policy is required to file a claim.');
      return;
    }

    setClaimingTriggerId(trigger.id);
    setClaimError(null);

    try {
      // Get device GPS location if available
      let lat = 12.9352;
      let lng = 77.6245;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // fallback to default zone coords
        }
      }

      const claimRes = await api.fileClaim({
        trigger_event_id: trigger.id,
        policy_id: policy.id,
        gps_lat: lat,
        gps_lng: lng,
      });

      const newClaimId = claimRes.claim_id || claimRes.id;
      navigate(`/claims/${newClaimId}`);
    } catch (err) {
      setClaimError(err.message || 'Failed to file claim.');
    } finally {
      setClaimingTriggerId(null);
    }
  };

  // Simulate a trigger for instant testing
  const handleSimulateTrigger = async (type = 'rainfall') => {
    setSimulating(true);
    try {
      await api.simulateTrigger({
        trigger_type: type,
        zone_id: user?.zone_id || 'blr_koramangala_1',
        intensity: 55,
      });
      setToastMessage(`Simulated ${type} trigger broadcasted!`);
      setTimeout(loadDashboardData, 1000);
    } catch (err) {
      // If endpoint not mounted or error, add client mock trigger for demonstration
      const mockTrigger = {
        id: 'trig-' + Math.random().toString(36).substring(2, 9),
        trigger_type: type,
        zone_id: user?.zone_id || 'blr_koramangala_1',
        intensity_value: 52.4,
        unit: 'mm/h',
        status: 'active',
        created_at: new Date().toISOString(),
      };
      setTriggers((prev) => [mockTrigger, ...prev]);
      setToastMessage(`Created demo ${type} trigger!`);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Live SSE Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-slide-up">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-xs font-medium">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white text-xs ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-amber-100/60 via-amber-50/40 to-white p-6 rounded-3xl border border-amber-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome back, {user?.name || 'Delivery Partner'}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                sseConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {sseConnected ? 'Live Stream Active' : 'Connecting Stream...'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Zone: <span className="font-mono font-semibold text-slate-800">{user?.zone_id || 'blr_koramangala_1'}</span> •{' '}
            Partner ID: <span className="font-mono text-slate-800">{user?.platform_worker_id || 'BLK-98210'}</span>
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2.5">
          <Link
            to="/checkin"
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Dark Store Check-in
          </Link>
          <Link
            to="/policies/buy"
            className="px-3.5 py-2 rounded-xl bg-[#5A4030] hover:bg-[#483326] text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            {policy ? 'Upgrade Policy' : 'Buy Policy'}
          </Link>
        </div>
      </div>

      {claimError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{claimError}</span>
          <button onClick={() => setClaimError(null)} className="text-rose-500 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Grid: Active Policy & Zone Triggers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Policy Card */}
        <Card
          title="Active Policy Coverage"
          subtitle="Real-time parametric protection parameters"
          action={
            policy ? (
              <StatusPill status={policy.status || 'active'} />
            ) : (
              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Not Covered
              </span>
            )
          }
          className="lg:col-span-1"
        >
          {policy ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/70">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-amber-900 font-medium">Policy Tier</span>
                  <span className="text-sm font-bold text-amber-950">
                    {policy.tier_name || `Tier ${policy.tier || 1}`}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900 font-mono">
                  ₹{policy.max_payout_per_event || 350}
                  <span className="text-xs font-normal text-slate-500 ml-1">/ trigger event</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                  <span className="text-slate-500 text-[11px]">Monthly Ceiling</span>
                  <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                    ₹{policy.coverage_ceiling || 1400}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                  <span className="text-slate-500 text-[11px]">Claims Limit</span>
                  <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                    {policy.claims_count || 0} / {policy.max_payouts_per_month || 4} this mo
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-100">
                <div className="flex justify-between">
                  <span>Auto-Renew:</span>
                  <span className="font-semibold text-slate-800">
                    {policy.auto_renew !== false ? 'Enabled (UPI Auto-Debit)' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Covered Disruptions:</span>
                  <span className="font-semibold text-slate-800">Rain, Heat, AQI, Outage</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-800">No Active Policy Found</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                You are currently exposed to weather and outage income drops.
              </p>
              <Link
                to="/policies/buy"
                className="inline-flex px-4 py-2 rounded-xl bg-[#5A4030] text-white text-xs font-semibold shadow-sm hover:bg-[#483326] transition"
              >
                Get Protected (from ₹49/mo)
              </Link>
            </div>
          )}
        </Card>

        {/* Live Zone Triggers Card */}
        <Card
          title="Live Zone Trigger Feed"
          subtitle={`Parametric monitoring for ${user?.zone_id || 'blr_koramangala_1'}`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={simulating}
                onClick={() => handleSimulateTrigger('rainfall')}
                className="text-[11px] font-semibold text-amber-900 bg-amber-100/80 hover:bg-amber-200 border border-amber-300 px-2 py-1 rounded-lg transition"
                title="Trigger simulated rainfall for instant testing"
              >
                {simulating ? 'Simulating...' : '+ Simulate Rain'}
              </button>
            </div>
          }
          className="lg:col-span-2"
        >
          {triggers.length > 0 ? (
            <div className="space-y-3">
              {triggers.map((trig) => (
                <div
                  key={trig.id}
                  className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      {trig.trigger_type === 'rainfall' ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm capitalize">
                          {trig.trigger_type.replace('_', ' ')} Disruption
                        </span>
                        <StatusPill status={trig.status || 'active'} size="sm" />
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Intensity:{' '}
                        <span className="font-semibold font-mono text-slate-800">
                          {trig.intensity_value || 52} {trig.unit || 'mm/h'}
                        </span>{' '}
                        • Zone: <span className="font-mono">{trig.zone_id}</span>
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Announced {new Date(trig.created_at || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleFileClaim(trig)}
                    disabled={claimingTriggerId === trig.id || !policy}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    {claimingTriggerId === trig.id ? (
                      'Filing Claim...'
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        One-Tap Claim ₹{policy?.max_payout_per_event || 350}
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 rounded-xl border border-dashed border-slate-200">
              <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xs font-semibold text-slate-800">No Disruptive Triggers Active</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Normal delivery conditions reported across {user?.zone_id || 'your zone'}.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSimulateTrigger('rainfall')}
                  className="text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1 rounded-lg hover:bg-sky-100 transition"
                >
                  Test Rainfall Trigger (55 mm/h)
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateTrigger('platform_outage')}
                  className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-100 transition"
                >
                  Test Platform Outage
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Claims History Card */}
      <Card
        title="Claims & Payout History"
        subtitle="Transparent parametric settlement logs"
        className="w-full"
      >
        {claims.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3">Claim ID</th>
                  <th className="py-3 px-3">Trigger Event</th>
                  <th className="py-3 px-3">Payout Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Filed At</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((claim) => (
                  <tr key={claim.id || claim.claim_id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-mono font-medium text-slate-800">
                      {String(claim.id || claim.claim_id).substring(0, 8)}...
                    </td>
                    <td className="py-3 px-3 capitalize font-medium text-slate-700">
                      {claim.trigger_type || claim.triggerEvent?.triggerType || 'Weather Disruption'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                      ₹{claim.payout_amount || claim.requested_amount || 350}
                    </td>
                    <td className="py-3 px-3">
                      <StatusPill status={claim.status} size="sm" />
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(claim.created_at || Date.now()).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/claims/${claim.id || claim.claim_id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#5A4030] hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition"
                      >
                        Live Tracker
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-xs text-slate-500">No claims filed yet.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              When weather triggers occur in your zone, you can file instant one-tap claims here.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
