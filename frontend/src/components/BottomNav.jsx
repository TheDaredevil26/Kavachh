import { Shield, Layers, QrCode, Receipt, User } from 'lucide-react';
import { haptic } from '../lib/haptics';

const tabs = [
  { id: 'home', label: 'Home', icon: Shield },
  { id: 'plans', label: 'Plans', icon: Layers },
  { id: 'checkin', label: '', icon: QrCode, center: true },
  { id: 'claims', label: 'Claims', icon: Receipt },
  { id: 'me', label: 'Me', icon: User },
];

export default function BottomNav({
  activeTab = 'home',
  claimCount = 0,
  onNavigate,
}) {
  const handleNav = (id) => {
    haptic('selection');
    onNavigate?.(id);
  };

  return (
    <nav
      className="
        fixed bottom-3 left-3 right-3 z-50
        h-[72px] glass-2 rounded-full shadow-float
        flex items-center justify-around
        px-2 pb-safe-b
      "
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        if (tab.center) {
          return (
            <button
              key={tab.id}
              onClick={() => handleNav(tab.id)}
              className="
                -mt-6 w-16 h-16 rounded-full bg-sky
                flex items-center justify-center
                shadow-float
                active:scale-95 transition-transform
              "
              aria-label="QR Check-in"
            >
              <Icon className="h-7 w-7 text-ink" />
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => handleNav(tab.id)}
            className={`
              relative flex flex-col items-center justify-center gap-0.5
              min-w-[56px] h-full px-2
              transition-colors
              ${isActive ? 'text-ink' : 'text-ink/48'}
            `}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive && (
              <span className="absolute inset-x-1 top-2.5 bottom-2.5 bg-sky/30 rounded-full" />
            )}
            <span className="relative">
              <Icon className="h-5 w-5" />
              {tab.id === 'claims' && claimCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-madder text-[10px] font-bold text-oat flex items-center justify-center">
                  {claimCount > 99 ? '99+' : claimCount}
                </span>
              )}
            </span>
            <span className="relative text-[10px] font-bold">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
