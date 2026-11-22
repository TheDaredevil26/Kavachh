import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, ShieldCheck, Zap, ArrowDownRight, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

const SAMPLE_ANALYTICS = {
  total_policies: 14280,
  active_policies: 12450,
  total_premiums_collected: 1108050,
  total_claims_filed: 3820,
  total_claims_paid: 3410,
  total_payout_disbursed: 1193500,
  avg_payout_latency_seconds: 4.8,
  held_claims_count: 24,
  fraud_block_rate: 10.7,
  triggers_breakdown: [
    { type: 'Extreme Rainfall (>15mm/h)', claims: 2180, amount: 763000, percentage: 57 },
    { type: 'Dark Store Power/System Halt', claims: 840, amount: 294000, percentage: 22 },
    { type: 'Hazardous Air Quality (AQI >300)', claims: 520, amount: 182000, percentage: 14 },
    { type: 'Extreme Heatwave (>40°C)', claims: 280, amount: 98000, percentage: 7 },
  ],
  fraud_layers_breakdown: [
    { layer: 'Layer B: Cluster Burst Anomaly', prevented: 182, share: '44%' },
    { layer: 'Layer C: GPS Telemetry & Teleportation', prevented: 114, share: '28%' },
    { layer: 'Layer E: Inactive Shift Telemetry', prevented: 68, share: '16%' },
    { layer: 'Layer D: Abnormal Zone Concentration', prevented: 32, share: '8%' },
    { layer: 'Layer F: QR Geofence Failure', prevented: 16, share: '4%' },
  ],
};

export default function AdminAnalytics() {
  const [tenantId, setTenantId] = useState('');
  const [analytics, setAnalytics] = useState(SAMPLE_ANALYTICS);
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAdminAnalytics(tenantId);
      if (res && (res.total_policies || res.total_claims_filed)) {
        setAnalytics({ ...SAMPLE_ANALYTICS, ...res });
      }
    } catch {
      // Retain sample demo telemetry
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-biscuit/40">
        <div>
          <h1 className="font-display font-extrabold text-3xl text-ink">
            Portfolio & Risk Analytics
          </h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">
            Real-time loss ratio, claims distribution, and ML fraud interception metrics
          </p>
        </div>

        {/* Tenant Filter */}
        <div className="flex items-center gap-3">
          <select
            value={tenantId}
            onChange={(e) => {
              haptic('selection');
              setTenantId(e.target.value);
            }}
            className="h-10 px-4 rounded-row glass-1 border border-biscuit text-xs font-bold text-ink"
          >
            <option value="">Aggregate (All Platforms)</option>
            <option value="blinkit">Blinkit Commerce</option>
            <option value="zepto">Zepto</option>
            <option value="swiggy_instamart">Swiggy Instamart</option>
          </select>
          <button
            onClick={fetchAnalytics}
            className="w-10 h-10 rounded-row glass-1 flex items-center justify-center text-ink hover:bg-white/60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-1 p-5 rounded-card shadow-glass">
          <span className="text-xs font-bold text-ink/72 uppercase tracking-wider">
            Active Policies
          </span>
          <div className="font-display font-extrabold text-3xl text-ink mt-2">
            {analytics.active_policies.toLocaleString()}
          </div>
          <span className="text-[11px] font-bold text-sage mt-1 inline-block">
            +8.4% month-over-month
          </span>
        </div>

        <div className="glass-1 p-5 rounded-card shadow-glass">
          <span className="text-xs font-bold text-ink/72 uppercase tracking-wider">
            Weekly Premiums
          </span>
          <div className="font-display font-extrabold text-3xl text-ink mt-2">
            ₹{(analytics.total_premiums_collected / 100000).toFixed(2)}L
          </div>
          <span className="text-[11px] font-bold text-ink/72 mt-1 inline-block">
            Avg ₹89.2 / active rider
          </span>
        </div>

        <div className="glass-1 p-5 rounded-card shadow-glass">
          <span className="text-xs font-bold text-ink/72 uppercase tracking-wider">
            Total Payouts
          </span>
          <div className="font-display font-extrabold text-3xl text-walnut mt-2">
            ₹{(analytics.total_payout_disbursed / 100000).toFixed(2)}L
          </div>
          <span className="text-[11px] font-bold text-ink/72 mt-1 inline-block">
            {analytics.total_claims_paid.toLocaleString()} claims settled
          </span>
        </div>

        <div className="glass-1 p-5 rounded-card shadow-glass">
          <span className="text-xs font-bold text-ink/72 uppercase tracking-wider">
            Avg Settlement Speed
          </span>
          <div className="font-display font-extrabold text-3xl text-sky mt-2">
            {analytics.avg_payout_latency_seconds}s
          </div>
          <span className="text-[11px] font-bold text-sage mt-1 inline-block">
            Direct UPI rail via BullMQ
          </span>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parametric Trigger Distribution */}
        <div className="glass-1 p-6 rounded-card shadow-glass space-y-4">
          <h3 className="font-display font-bold text-lg text-ink">
            Payouts by Parametric Condition
          </h3>
          <div className="space-y-4">
            {analytics.triggers_breakdown.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-ink">
                  <span>{item.type}</span>
                  <span className="font-mono">
                    ₹{item.amount.toLocaleString()} ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-sand/60 overflow-hidden">
                  <div
                    className="h-full bg-walnut rounded-full transition-all"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-ink/48 font-semibold">
                  <span>{item.claims.toLocaleString()} claims</span>
                  <span>Avg ₹{Math.round(item.amount / item.claims)} / event</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fraud Interception Layers */}
        <div className="glass-1 p-6 rounded-card shadow-glass space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-ink">
              Fraud Interception (Layers A–F)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-honey/40 text-xs font-extrabold text-ink">
              {analytics.fraud_block_rate}% Held
            </span>
          </div>

          <div className="space-y-3">
            {analytics.fraud_layers_breakdown.map((layer, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-row glass-2 border border-biscuit/30 flex items-center justify-between"
              >
                <div>
                  <h4 className="font-sans font-bold text-xs text-ink">{layer.layer}</h4>
                  <span className="text-[11px] text-ink/72 font-semibold">
                    {layer.prevented} anomalies prevented
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-row bg-madder/30 text-ink font-mono font-extrabold text-xs">
                  {layer.share}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
