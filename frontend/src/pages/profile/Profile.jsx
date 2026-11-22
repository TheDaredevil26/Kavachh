import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, CreditCard, Globe, Eye, Sliders, LogOut, Check } from 'lucide-react';
import ListGroup from '../../components/ListGroup';
import ListRow from '../../components/ListRow';
import Button from '../../components/Button';
import useAuth from '../../hooks/useAuth';
import { haptic } from '../../lib/haptics';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, switchRole, role } = useAuth();

  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('kavach_high_contrast') === 'on');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('kavach_data_saver') === 'on');
  const [buttonMode, setButtonMode] = useState(() => localStorage.getItem('kavach_button_mode') === 'on');

  const toggleHighContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    localStorage.setItem('kavach_high_contrast', next ? 'on' : 'off');
    document.documentElement.classList.toggle('high-contrast', next);
    haptic('selection');
  };

  const toggleDataSaver = () => {
    const next = !dataSaver;
    setDataSaver(next);
    localStorage.setItem('kavach_data_saver', next ? 'on' : 'off');
    document.documentElement.classList.toggle('data-saver', next);
    haptic('selection');
  };

  const toggleButtonMode = () => {
    const next = !buttonMode;
    setButtonMode(next);
    localStorage.setItem('kavach_button_mode', next ? 'on' : 'off');
    haptic('selection');
  };

  const handleLogout = () => {
    haptic('selection');
    logout();
    navigate('/login');
  };

  const handleToggleAdmin = () => {
    haptic('selection');
    const newRole = role === 'admin' ? 'worker' : 'admin';
    switchRole(newRole);
    if (newRole === 'admin') {
      navigate('/admin/queue');
    } else {
      navigate('/home');
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      {/* Profile Header */}
      <div className="glass-1 p-6 rounded-hero flex items-center gap-4 shadow-glass">
        <div className="w-16 h-16 rounded-full bg-walnut flex items-center justify-center text-oat font-display font-extrabold text-2xl shadow-press shrink-0">
          {user?.name ? user.name.charAt(0).toUpperCase() : 'R'}
        </div>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-ink">
            {user?.name || 'Rajan Kumar'}
          </h1>
          <p className="text-xs font-bold text-ink/72 mt-0.5">
            {user?.tenant_slug ? user.tenant_slug.toUpperCase() : 'BLINKIT'} • Koramangala Hub
          </p>
          <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-sage text-ink text-[10px] font-extrabold">
            Active Rider Partner
          </span>
        </div>
      </div>

      {/* Account Settings */}
      <div>
        <h2 className="font-display font-bold text-lg text-ink mb-3 px-1">Payout & Identity</h2>
        <ListGroup>
          <ListRow
            icon={CreditCard}
            title="UPI / Bank Account"
            subtitle="HDFC Bank •••• 4821"
            value="Verified"
            status="paid"
          />
          <ListRow
            icon={Globe}
            title="App Language"
            subtitle="English"
            onClick={() => navigate('/welcome')}
          />
        </ListGroup>
      </div>

      {/* Accessibility & Sunlight Controls */}
      <div>
        <h2 className="font-display font-bold text-lg text-ink mb-3 px-1">Field Accessibility</h2>
        <div className="glass-1 p-5 rounded-card space-y-4 shadow-glass">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-sans font-bold text-sm text-ink">High Contrast (Sunlight Mode)</h4>
              <p className="text-xs text-ink/72">Ultra-high black borders for harsh outdoor glare</p>
            </div>
            <button
              onClick={toggleHighContrast}
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                highContrast ? 'bg-sky' : 'bg-sand'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-walnut transition-transform ${
                  highContrast ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-biscuit/40">
            <div>
              <h4 className="font-sans font-bold text-sm text-ink">Data Saver Mode</h4>
              <p className="text-xs text-ink/72">Removes background blur for low-spec phones</p>
            </div>
            <button
              onClick={toggleDataSaver}
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                dataSaver ? 'bg-sky' : 'bg-sand'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-walnut transition-transform ${
                  dataSaver ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-biscuit/40">
            <div>
              <h4 className="font-sans font-bold text-sm text-ink">Button Tap instead of Swipe</h4>
              <p className="text-xs text-ink/72">Single hold-to-confirm alternative to swipe</p>
            </div>
            <button
              onClick={toggleButtonMode}
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${
                buttonMode ? 'bg-sky' : 'bg-sand'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-walnut transition-transform ${
                  buttonMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Dev Switcher: Toggle Admin Portal */}
      <div className="glass-sand p-4 rounded-card flex items-center justify-between">
        <div>
          <span className="font-display font-bold text-sm text-ink">Developer Test Role</span>
          <p className="text-xs text-ink/72">Current view: {role.toUpperCase()}</p>
        </div>
        <button
          onClick={handleToggleAdmin}
          className="h-9 px-3 rounded-row bg-walnut text-oat text-xs font-bold shadow-press active:scale-95"
        >
          Switch to {role === 'admin' ? 'Worker' : 'Admin'} View
        </button>
      </div>

      <div className="pt-2">
        <Button variant="danger" onClick={handleLogout} icon={LogOut}>
          Log out
        </Button>
      </div>
    </div>
  );
}
