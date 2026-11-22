import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Check } from 'lucide-react';
import SwipeToConfirm from '../../components/SwipeToConfirm';
import Banner from '../../components/Banner';
import { api } from '../../services/api';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

const PLAN_PRICES = {
  basic: 49,
  standard: 89,
  premium: 129,
};

export default function ActivatePlan() {
  const { tier } = useParams();
  const navigate = useNavigate();

  const selectedTier = tier?.toLowerCase() || 'standard';
  const price = PLAN_PRICES[selectedTier] || 89;

  const [autoRenew, setAutoRenew] = useState(true);
  const [error, setError] = useState(null);
  const [activated, setActivated] = useState(false);

  const handleConfirmActivation = async () => {
    setError(null);
    haptic('selection');

    try {
      await api.buyPolicy({
        tier: selectedTier,
        auto_renew: autoRenew,
      });

      haptic('success');
      setActivated(true);
      setTimeout(() => {
        navigate('/home');
      }, 1800);
    } catch (err) {
      setError(err.message || 'Failed to activate plan. Please verify platform link.');
      haptic('error');
      throw err;
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
        <h1 className="font-display font-extrabold text-2xl text-ink">Confirm your plan</h1>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {activated ? (
        <div className="glass-1 p-8 rounded-hero text-center space-y-4 shadow-glass">
          <div className="w-16 h-16 rounded-full bg-sage flex items-center justify-center text-walnut mx-auto">
            <Check className="w-9 h-9" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-ink">Plan Activated!</h2>
          <p className="text-sm font-semibold text-ink/72">
            Your {selectedTier.toUpperCase()} cover is now registered. Redirecting to home...
          </p>
        </div>
      ) : (
        <>
          <div className="glass-1 p-6 rounded-card space-y-4 shadow-glass">
            <div className="flex justify-between items-center pb-3 border-b border-biscuit/40">
              <div>
                <span className="text-xs font-bold text-ink/72 uppercase">Selected Cover</span>
                <h3 className="font-display font-extrabold text-xl text-ink">
                  {selectedTier.toUpperCase()} PLAN
                </h3>
              </div>
              <div className="text-right">
                <span className="font-display font-extrabold text-2xl text-ink">
                  {formatMoney(price)}
                </span>
                <span className="text-xs font-bold text-ink/72 block">per week</span>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <h4 className="font-sans font-bold text-sm text-ink">Weekly Auto-Renewal</h4>
                <p className="text-xs font-semibold text-ink/72">
                  Automatically renew every Sunday evening
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic('selection');
                  setAutoRenew(!autoRenew);
                }}
                className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                  autoRenew ? 'bg-sky' : 'bg-sand'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-walnut transition-transform ${
                    autoRenew ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 text-xs font-semibold text-ink/72 space-y-1">
              <div>• Instant payouts to verified UPI/Bank</div>
              <div>• 72-hour initial waiting period applies</div>
              <div>• Automated weather and dark store sensors</div>
            </div>
          </div>

          <div className="pt-4">
            <SwipeToConfirm
              label={`Swipe to pay ${formatMoney(price)}`}
              successLabel="Plan active!"
              onConfirm={handleConfirmActivation}
            />
            <p className="text-center text-xs font-semibold text-ink/48 mt-3">
              By swiping you authorize weekly parametric protection terms.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
