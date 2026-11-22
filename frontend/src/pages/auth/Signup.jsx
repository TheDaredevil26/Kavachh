import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, ShieldCheck, ArrowRight, Lock } from 'lucide-react';
import Stepper from '../../components/Stepper';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import Banner from '../../components/Banner';
import useAuth from '../../hooks/useAuth';
import { haptic } from '../../lib/haptics';

const PLATFORMS = [
  { slug: 'blinkit', name: 'Blinkit' },
  { slug: 'zepto', name: 'Zepto' },
  { slug: 'swiggy_instamart', name: 'Swiggy Instamart' },
];

export default function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    phoneNumber: '',
    password: '',
    name: '',
    platform: 'blinkit',
    riderId: '',
    pincode: '560034',
    zone: 'Koramangala, Bengaluru',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePincodeChange = (e) => {
    const pin = e.target.value;
    setForm((prev) => ({
      ...prev,
      pincode: pin,
      zone: pin.startsWith('560') ? 'Koramangala, Bengaluru' : 'Central Zone',
    }));
  };

  const handleNext = async () => {
    setError(null);
    haptic('selection');

    if (currentStep === 1) {
      if (!form.phoneNumber || form.phoneNumber.length < 10) {
        setError('Please enter a valid 10-digit phone number');
        haptic('error');
        return;
      }
      if (!form.password || form.password.length < 6) {
        setError('Password must be at least 6 characters');
        haptic('error');
        return;
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!form.name.trim()) {
        setError('Please enter your full name');
        haptic('error');
        return;
      }
      if (!form.riderId.trim()) {
        setError('Please enter your Delivery Rider ID');
        haptic('error');
        return;
      }
      setCurrentStep(3);
      return;
    }

    if (currentStep === 3) {
      setLoading(true);
      try {
        await register({
          phone_number: form.phoneNumber.startsWith('+91')
            ? form.phoneNumber
            : `+91${form.phoneNumber.replace(/^0+/, '')}`,
          password: form.password,
          name: form.name,
          tenant_slug: form.platform,
          platform_worker_id: form.riderId,
          zone_id: 'blr_koramangala',
        });
        haptic('success');
        navigate('/home');
      } catch (err) {
        setError(err.message || 'Registration failed. Please check your details.');
        haptic('error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 max-w-md mx-auto">
      <div>
        <div className="pt-6 pb-4">
          <Stepper total={3} current={currentStep} />
          <h1 className="font-display font-extrabold text-2xl text-ink mt-4">
            {currentStep === 1 && 'Your phone & password'}
            {currentStep === 2 && 'Where do you deliver?'}
            {currentStep === 3 && 'Link delivery platform'}
          </h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">
            {currentStep === 1 && 'Step 1: Set up your account credentials'}
            {currentStep === 2 && 'Step 2: Connect your delivery partner profile'}
            {currentStep === 3 && 'Step 3: Verify and link your active account'}
          </p>
        </div>

        {error && (
          <div className="mb-4">
            <Banner variant="danger">{error}</Banner>
          </div>
        )}

        <div className="glass-1 p-6 rounded-card shadow-glass space-y-4">
          {currentStep === 1 && (
            <>
              <TextField
                label="Phone number"
                name="phoneNumber"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={form.phoneNumber}
                onChange={handleChange}
              />

              <div className="relative">
                <TextField
                  label="Create a password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="8+ characters"
                  value={form.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-10 text-ink/48 hover:text-ink"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <TextField
                label="Full name"
                name="name"
                placeholder="Rajan Kumar"
                value={form.name}
                onChange={handleChange}
              />

              <div>
                <label className="block text-xs font-bold text-ink/72 uppercase tracking-wider mb-2">
                  Delivery Platform
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((p) => {
                    const isSelected = form.platform === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => {
                          haptic('selection');
                          setForm((prev) => ({ ...prev, platform: p.slug }));
                        }}
                        className={`h-12 rounded-row text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-sky text-ink border-2 border-walnut shadow-glass'
                            : 'glass-1 text-ink/72 hover:bg-white/60'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <TextField
                label="Rider Partner ID"
                name="riderId"
                placeholder="e.g. BLK-89214"
                value={form.riderId}
                onChange={handleChange}
              />

              <div>
                <TextField
                  label="Dark Store Pincode"
                  name="pincode"
                  inputMode="numeric"
                  placeholder="560034"
                  value={form.pincode}
                  onChange={handlePincodeChange}
                />
                {form.zone && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-bold text-walnut">
                    <CheckCircle2 className="w-4 h-4 text-walnut" />
                    <span>Zone: {form.zone}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {currentStep === 3 && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-powder flex items-center justify-center text-walnut mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="font-display font-bold text-xl text-ink">
                Link your {PLATFORMS.find((p) => p.slug === form.platform)?.name} profile
              </h3>
              <p className="text-sm font-semibold text-ink/72 leading-relaxed">
                We verify active rider status with {PLATFORMS.find((p) => p.slug === form.platform)?.name} without ever seeing your password.
              </p>
              <div className="glass-sand p-4 rounded-row text-left flex items-start gap-3">
                <Lock className="w-5 h-5 text-walnut shrink-0 mt-0.5" />
                <span className="text-xs text-ink/72">
                  Parametric claims depend on dark store radius authentication.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-6 pb-2 space-y-3">
        <Button
          variant="primary"
          onClick={handleNext}
          loading={loading}
          icon={currentStep === 3 ? ShieldCheck : ArrowRight}
        >
          {currentStep === 3 ? 'Confirm & Link' : 'Next'}
        </Button>

        <p className="text-center text-sm font-semibold text-ink/72">
          Already registered?{' '}
          <Link to="/login" className="text-ink font-bold underline">
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}
