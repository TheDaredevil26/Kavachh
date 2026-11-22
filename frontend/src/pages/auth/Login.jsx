import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import Banner from '../../components/Banner';
import KavachShield from '../../assets/KavachShield';
import useAuth from '../../hooks/useAuth';
import { haptic } from '../../lib/haptics';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [phone, setPhone] = useState('9876543210');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    haptic('selection');

    if (!phone || phone.length < 10) {
      setError('Please enter your 10-digit registered mobile number');
      haptic('error');
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = phone.startsWith('+91')
        ? phone
        : `+91${phone.replace(/^0+/, '')}`;

      await login(formattedPhone, password);
      haptic('success');
      navigate('/home');
    } catch (err) {
      setError(err.message || 'That phone number or password is wrong. Try again.');
      haptic('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 max-w-md mx-auto">
      <div className="pt-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-full bg-walnut flex items-center justify-center shadow-press mb-3">
            <KavachShield className="w-8 h-8 text-oat" />
          </div>
          <h1 className="font-display font-extrabold text-3xl text-ink">Welcome back</h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">Log in to check your active cover</p>
        </div>

        {error && (
          <div className="mb-4">
            <Banner variant="danger">{error}</Banner>
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-1 p-6 rounded-card shadow-glass space-y-4">
          <TextField
            label="Phone number"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div className="relative">
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-10 text-ink/48 hover:text-ink"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="pt-2">
            <Button variant="primary" type="submit" loading={loading} icon={LogIn}>
              Log in
            </Button>
          </div>
        </form>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => alert('Please contact your dark store hub coordinator for password reset.')}
            className="text-xs font-bold text-ink/72 hover:text-ink underline"
          >
            Forgot password?
          </button>
        </div>
      </div>

      <div className="py-6 text-center">
        <p className="text-sm font-semibold text-ink/72">
          New to Kavach?{' '}
          <Link to="/signup" className="text-ink font-bold underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
