import { useState, useEffect } from 'react';
import ConnectionDot from './ConnectionDot';

export default function TopBar({
  userName = '',
  zoneName = '',
  connectionStatus = 'live',
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const initial = userName ? userName.charAt(0).toUpperCase() : '?';

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <header
      className={`
        fixed top-0 inset-x-0 z-40
        flex items-center justify-between
        px-4 md:px-8
        h-14
        pt-safe-t
        transition-all duration-300 ease-spring
        ${scrolled ? 'glass-2 shadow-glass' : 'bg-transparent'}
      `}
    >
      {/* Left: avatar + greeting */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-walnut flex items-center justify-center">
          <span className="text-sm font-bold text-oat">{initial}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-ink leading-tight">
            {greeting}, {userName}
          </span>
          {zoneName && (
            <span className="text-xs text-ink/48">{zoneName}</span>
          )}
        </div>
      </div>

      {/* Right: connection dot */}
      <ConnectionDot status={connectionStatus} />
    </header>
  );
}
