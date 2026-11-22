import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Check } from 'lucide-react';
import Button from '../../components/Button';
import Banner from '../../components/Banner';
import { api } from '../../services/api';
import { haptic } from '../../lib/haptics';

const REASONS = [
  'Payout amount is lower than expected',
  'I was actively delivering during the event',
  'Bank transfer reference was not received',
  'Incorrect dark store location recorded',
  'Other issue with this settlement',
];

export default function Dispute() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [selectedReason, setSelectedReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    haptic('selection');

    setLoading(true);
    try {
      await api.disputeClaim(id, `${selectedReason}. ${details}`);
      haptic('success');
      setSubmitted(true);
      setTimeout(() => {
        navigate(`/claims/${id}`);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Unable to submit dispute. 2-hour window may have closed.');
      haptic('error');
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="font-display font-extrabold text-2xl text-ink">Raise a problem</h1>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {submitted ? (
        <div className="glass-1 p-8 rounded-hero text-center space-y-4 shadow-glass">
          <div className="w-16 h-16 rounded-full bg-sage flex items-center justify-center text-walnut mx-auto">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-ink">Dispute Submitted</h2>
          <p className="text-sm font-semibold text-ink/72 leading-relaxed">
            Your review request has been logged. An adjudicator will check your trip logs within 24 hours.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="glass-1 p-6 rounded-card shadow-glass space-y-4">
            <span className="text-xs font-bold text-ink/72 uppercase">Select primary reason</span>
            <div className="space-y-2">
              {REASONS.map((r) => {
                const isSelected = selectedReason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      haptic('selection');
                      setSelectedReason(r);
                    }}
                    className={`w-full text-left p-3.5 rounded-row text-sm font-semibold transition-all ${
                      isSelected
                        ? 'bg-sky text-ink border-2 border-walnut font-bold shadow-glass'
                        : 'glass-1 text-ink/72 hover:bg-white/60'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-ink/72 uppercase mb-2">
                Additional context (optional)
              </label>
              <textarea
                rows={3}
                placeholder="Mention any delivery order ID or specific timings..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full glass-solid p-3 rounded-field border border-biscuit text-sm text-ink placeholder-ink/48 focus:outline-walnut"
              />
            </div>
          </div>

          <div className="glass-sand p-4 rounded-card text-xs text-ink/72 leading-relaxed">
            <span className="font-bold text-ink">Fairness Guarantee: </span>
            Disputes are reviewed alongside your dark store shift records. Honest riders are protected against false telemetric declines.
          </div>

          <Button variant="primary" type="submit" loading={loading}>
            Send Dispute for Review
          </Button>
        </form>
      )}
    </div>
  );
}
