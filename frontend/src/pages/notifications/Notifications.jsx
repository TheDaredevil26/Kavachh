import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CloudRain, CheckCircle, Shield, ChevronRight } from 'lucide-react';
import ListGroup from '../../components/ListGroup';
import ListRow from '../../components/ListRow';
import EmptyState from '../../components/EmptyState';
import { api } from '../../services/api';
import { haptic } from '../../lib/haptics';

const MOCK_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'alert',
    icon: CloudRain,
    title: 'Rain expected 3–6 PM tomorrow',
    body: 'Koramangala zone forecast predicts heavy showers. Your Standard plan covers this.',
    time: '2 hours ago',
  },
  {
    id: 'n2',
    type: 'payout',
    icon: CheckCircle,
    title: '₹350 sent to your bank account',
    body: 'Settlement completed for rainfall event on 17 Nov. Ref: IMPS-789123.',
    time: 'Yesterday',
  },
  {
    id: 'n3',
    type: 'policy',
    icon: Shield,
    title: 'Weekly cover renewing on Sunday',
    body: 'Standard plan will auto-renew for ₹89. You have ₹1,050 cover balance remaining.',
    time: '3 days ago',
  },
];

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const res = await api.getNotifications();
        if (Array.isArray(res) && res.length > 0) {
          setNotifications(res);
        }
      } catch {
        // fallback to mock notices
      }
    }
    loadNotifications();
  }, []);

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
        <h1 className="font-display font-extrabold text-2xl text-ink">Notifications</h1>
      </div>

      {notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((n) => {
            const Icon = n.icon || Bell;
            return (
              <div
                key={n.id}
                className="glass-1 p-4 rounded-card flex items-start gap-3.5 shadow-glass"
              >
                <div className="w-10 h-10 rounded-full bg-powder flex items-center justify-center text-walnut shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm text-ink">{n.title}</h3>
                    <span className="text-[10px] text-ink/48 font-semibold">{n.time}</span>
                  </div>
                  <p className="text-xs font-semibold text-ink/72 mt-1 leading-relaxed">
                    {n.body || n.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="All caught up"
          description="You have no unread notifications. Alerts for rain and claims will appear here."
          actionLabel="Back to home"
          onAction={() => navigate('/home')}
        />
      )}
    </div>
  );
}
