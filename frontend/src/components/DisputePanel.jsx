import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

/**
 * DisputePanel provides a countdown for the 2-hour dispute window
 * and allows riders to contest held or rejected payouts.
 */
export default function DisputePanel({
  claimId,
  endsAt,
  onDone,
  canDispute = true,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!endsAt) return;

    function updateTimer() {
      const target = new Date(endsAt).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setIsExpired(true);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n) => String(n).padStart(2, '0');
      setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('Please provide at least 10 characters explaining your dispute.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.disputeClaim(claimId, reason.trim());
      setSuccess(true);
      if (onDone) {
        setTimeout(onDone, 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit dispute. The dispute window may have closed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isExpired && !success) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 flex items-center justify-between">
        <span>The 2-hour dispute window for this claim has closed.</span>
        <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-600">Expired</span>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
        <div className="flex items-center gap-2 font-semibold">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          Dispute Submitted Successfully
        </div>
        <p className="text-xs text-emerald-700 mt-1">
          Our claims assessment team has received your note and will review GPS telemetry and platform logs.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/60 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-amber-950 flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            2-Hour Dispute Window
          </h4>
          <p className="text-xs text-slate-600 mt-0.5">
            Disagree with the payout amount or verification result? File a quick contest.
          </p>
        </div>

        {timeLeft && (
          <div className="text-right">
            <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-100/90 border border-amber-200 font-mono text-xs font-semibold text-amber-900 shadow-inner">
              ⏳ {timeLeft}
            </span>
          </div>
        )}
      </div>

      {!isOpen ? (
        <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">Fast human-in-the-loop review within 15 mins</span>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-sm transition"
          >
            Raise Dispute
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 pt-3 border-t border-amber-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reason for Dispute (min 10 characters)
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., I was actively on delivery near Koramangala 5th block during the rainfall trigger..."
              className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              maxLength={1000}
              required
            />
            <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
              <span>{reason.length < 10 ? `${10 - reason.length} more characters required` : 'Ready'}</span>
              <span>{reason.length}/1000</span>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 10}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {submitting ? 'Submitting...' : 'Submit Dispute'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
