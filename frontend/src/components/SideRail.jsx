import { Shield, Layers, QrCode, Receipt, User, BarChart3, ListFilter, Activity } from 'lucide-react';
import { haptic } from '../lib/haptics';

export default function SideRail({ activeTab = 'home', onNavigate, isAdmin = false }) {
  const workerTabs = [
    { id: 'home', label: 'Home', icon: Shield },
    { id: 'plans', label: 'Plans', icon: Layers },
    { id: 'claims', label: 'Claims', icon: Receipt },
    { id: 'checkin', label: 'Store Check-in', icon: QrCode },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const adminTabs = [
    { id: 'queue', label: 'Review Queue', icon: ListFilter },
    { id: 'live', label: 'Live Stream', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const tabs = isAdmin ? adminTabs : workerTabs;

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 glass-2 border-r border-white/60 p-6 z-40">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-walnut flex items-center justify-center text-oat shadow-press">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl text-ink leading-tight">Kavach</h1>
          <span className="text-xs font-semibold text-ink/72">
            {isAdmin ? 'Admin Console' : 'Income Cover'}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                haptic('selection');
                onNavigate?.(tab.id);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-row font-sans text-base font-bold transition-all ${
                isActive
                  ? 'bg-sky text-ink shadow-glass'
                  : 'text-ink/72 hover:bg-white/40 hover:text-ink'
              }`}
            >
              <Icon className="w-5 h-5 text-walnut" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-biscuit/40 text-xs text-ink/48">
        Kavach Parametric Protection v3.1
      </div>
    </aside>
  );
}
