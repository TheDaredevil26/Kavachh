import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Card from '../components/Card';

const FALLBACK_TIERS = [
  {
    tier: 1,
    name: 'Tier 1 - Basic',
    premium: 49,
    max_payout_per_event: 200,
    max_payouts_per_month: 3,
    coverage_ceiling: 600,
    trigger_day_limit: 3,
    description: 'Essential parametric cover for part-time delivery partners.',
    triggers_covered: ['Rainfall', 'Severe Heat', 'Hazardous AQI', 'Curfew', 'Platform Outage'],
  },
  {
    tier: 2,
    name: 'Tier 2 - Standard',
    premium: 89,
    max_payout_per_event: 350,
    max_payouts_per_month: 4,
    coverage_ceiling: 1400,
    trigger_day_limit: 4,
    popular: true,
    description: 'Most popular protection for full-time 8-10 hour shift riders.',
    triggers_covered: ['Rainfall', 'Severe Heat', 'Hazardous AQI', 'Curfew', 'Platform Outage'],
  },
  {
    tier: 3,
    name: 'Tier 3 - Premium',
    premium: 129,
    max_payout_per_event: 500,
    max_payouts_per_month: 6,
    coverage_ceiling: 3000,
    trigger_day_limit: 6,
    description: 'Maximum financial armor for heavy weather seasons and peak shifts.',
    triggers_covered: ['Rainfall', 'Severe Heat', 'Hazardous AQI', 'Curfew', 'Platform Outage'],
  },
];

export default function BuyPolicy() {
  const navigate = useNavigate();

  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [selectedTier, setSelectedTier] = useState(2);
  const [autoRenew, setAutoRenew] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchTiers() {
      try {
        const res = await api.getTiers();
        if (Array.isArray(res) && res.length > 0) {
          setTiers(res);
        }
      } catch (err) {
        console.warn('Using fallback tiers:', err);
      }
    }
    fetchTiers();
  }, []);

  const handlePurchase = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      await api.buyPolicy({
        tier: Number(selectedTier),
        auto_renew: Boolean(autoRenew),
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to purchase policy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentTierObj = tiers.find((t) => t.tier === selectedTier) || tiers[1] || FALLBACK_TIERS[1];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Title */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100/70 border border-amber-300 px-3 py-1 rounded-full">
          Parametric Income Insurance
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-3">
          Choose Your Kavach Armor
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Zero claims paperwork. Automatic payouts directly to your UPI when rainfall, severe heat, or dark-store outages disrupt your delivery shift.
        </p>
      </div>

      {errorMsg && (
        <div className="max-w-2xl mx-auto p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="font-bold text-rose-500">
            ✕
          </button>
        </div>
      )}

      {success && (
        <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <svg className="w-6 h-6 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <h4 className="text-sm font-bold">Policy Activated Successfully!</h4>
            <p className="text-xs text-emerald-700">Redirecting to your rider dashboard...</p>
          </div>
        </div>
      )}

      {/* Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.tier;
          const isPopular = tier.popular || tier.tier === 2;

          return (
            <div
              key={tier.tier}
              onClick={() => setSelectedTier(tier.tier)}
              className={`relative rounded-3xl p-6 cursor-pointer transition-all border-2 flex flex-col justify-between ${
                isSelected
                  ? 'border-[#5A4030] bg-gradient-to-b from-amber-50/70 via-white to-white shadow-lg ring-2 ring-[#5A4030]/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
              }`}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#5A4030] text-amber-100 text-[10px] uppercase font-bold tracking-wider px-3 py-0.5 rounded-full shadow-sm">
                  Most Popular
                </span>
              )}

              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{tier.description}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'border-[#5A4030] bg-[#5A4030] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>

                <div className="mt-5 pb-5 border-b border-slate-100">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-black text-slate-900 font-mono">₹{tier.premium}</span>
                    <span className="text-xs text-slate-500 ml-1.5 font-medium">/ 30-day term</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Instant UPI claim payout: ₹{tier.max_payout_per_event} per event
                  </p>
                </div>

                <div className="mt-5 space-y-3 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Max Payout / Event:</span>
                    <span className="font-bold font-mono">₹{tier.max_payout_per_event}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Monthly Ceiling:</span>
                    <span className="font-bold font-mono">₹{tier.coverage_ceiling}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Max Claims / Month:</span>
                    <span className="font-bold">{tier.max_payouts_per_month} incidents</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Waiting Period:</span>
                    <span className="font-bold text-emerald-700">Zero (Instant Active)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedTier(tier.tier)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-[#5A4030] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isSelected ? 'Selected' : 'Select Plan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Auto-renew & Checkout Card */}
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Coverage Confirmation
        </h3>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60">
          <div>
            <div className="text-xs font-bold text-slate-900">{currentTierObj.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              30-day parametric income cover with up to ₹{currentTierObj.coverage_ceiling} protection
            </div>
          </div>
          <div className="text-lg font-black text-slate-900 font-mono">
            ₹{currentTierObj.premium}
          </div>
        </div>

        {/* Auto Renew Toggle */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#5A4030] focus:ring-[#5A4030]"
          />
          <div className="text-xs">
            <span className="font-semibold text-slate-800">
              Enable Auto-Renewal via UPI Auto-Debit
            </span>
            <p className="text-slate-500 mt-0.5">
              Automatically renews policy every 30 days to avoid gap in coverage during monsoon or extreme seasons. Cancel anytime.
            </p>
          </div>
        </label>

        <button
          onClick={handlePurchase}
          disabled={loading || success}
          className="w-full py-3.5 px-4 rounded-2xl text-sm font-bold text-white bg-[#5A4030] hover:bg-[#483326] shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Activating Policy...</span>
            </>
          ) : (
            `Pay ₹${currentTierObj.premium} & Activate Coverage`
          )}
        </button>
      </div>
    </div>
  );
}
