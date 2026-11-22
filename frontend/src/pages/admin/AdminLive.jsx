import { useState, useEffect } from 'react';
import { Activity, ShieldAlert, CheckCircle, AlertTriangle, RefreshCw, Pause, Play } from 'lucide-react';
import StatusPill from '../../components/StatusPill';
import useEventStream from '../../hooks/useEventStream';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

export default function AdminLive() {
  const [events, setEvents] = useState([
    {
      id: 'e1',
      type: 'claim.created',
      title: 'New claim filed: BLK-49102',
      details: 'Rainfall event in Koramangala • ₹350',
      time: '12s ago',
      level: 'info',
    },
    {
      id: 'e2',
      type: 'payout.disbursed',
      title: 'Payout disbursed: IMPS-98124',
      details: 'Sent to HDFC ••••4821 • ₹350',
      time: '45s ago',
      level: 'safe',
    },
    {
      id: 'e3',
      type: 'fraud.ring_suspected',
      title: 'Fraud ring alert: Zone HSR Layout',
      details: '6 claims filed within 4s from collocated device IDs',
      time: '2m ago',
      level: 'attention',
    },
  ]);

  const [isPaused, setIsPaused] = useState(false);

  useEventStream('/stream/admin', (eventName, data) => {
    if (isPaused) return;
    haptic('selection');
    setEvents((prev) => [
      {
        id: `e_${Date.now()}`,
        type: eventName,
        title: `${eventName.replace('.', ' ').toUpperCase()}`,
        details: JSON.stringify(data || {}).slice(0, 80),
        time: 'Just now',
        level: eventName.includes('fraud') ? 'attention' : eventName.includes('payout') ? 'safe' : 'info',
      },
      ...prev.slice(0, 49),
    ]);
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-extrabold text-3xl text-ink">Live Telemetry Stream</h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">
            Real-time SSE event bus: trigger announcements, claims, auto-adjudication & ring alerts
          </p>
        </div>

        <button
          onClick={() => {
            haptic('selection');
            setIsPaused(!isPaused);
          }}
          className="h-10 px-4 rounded-row glass-1 flex items-center gap-2 text-xs font-bold text-ink hover:bg-white/60"
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? 'Resume Stream' : 'Pause Stream'}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-1 p-5 rounded-card">
          <span className="text-xs font-bold text-ink/72 uppercase">Claims Today</span>
          <div className="font-display font-extrabold text-3xl text-ink mt-1">128</div>
        </div>
        <div className="glass-1 p-5 rounded-card">
          <span className="text-xs font-bold text-ink/72 uppercase">Auto-Settled</span>
          <div className="font-display font-extrabold text-3xl text-sage mt-1">94.2%</div>
        </div>
        <div className="glass-1 p-5 rounded-card">
          <span className="text-xs font-bold text-ink/72 uppercase">Flagged For Review</span>
          <div className="font-display font-extrabold text-3xl text-honey mt-1">7</div>
        </div>
      </div>

      <div className="glass-1 p-6 rounded-card shadow-glass space-y-3">
        <h3 className="font-display font-bold text-lg text-ink mb-2">Live Stream Feed</h3>
        <div className="space-y-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="p-3.5 rounded-row glass-2 flex items-center justify-between border border-biscuit/30"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    ev.level === 'safe'
                      ? 'bg-sage'
                      : ev.level === 'attention'
                      ? 'bg-honey animate-ping'
                      : 'bg-sky'
                  }`}
                />
                <div>
                  <h4 className="font-sans font-bold text-sm text-ink">{ev.title}</h4>
                  <p className="text-xs font-mono text-ink/72">{ev.details}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-ink/48">{ev.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
