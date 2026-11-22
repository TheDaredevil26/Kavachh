import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudRain, Receipt, PlusCircle, Filter } from 'lucide-react';
import ListGroup from '../../components/ListGroup';
import ListRow from '../../components/ListRow';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { api } from '../../services/api';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

export default function ClaimsList() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'in_progress' | 'paid' | 'not_paid'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClaims() {
      try {
        setLoading(true);
        const res = await api.getClaims();
        if (Array.isArray(res)) {
          setClaims(res);
        }
      } catch (err) {
        console.warn('Failed loading claims:', err);
      } finally {
        setLoading(false);
      }
    }
    loadClaims();
  }, []);

  const filteredClaims = claims.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'in_progress') return ['filed', 'validated', 'scoring', 'payout_pending', 'held'].includes(c.state);
    if (filter === 'paid') return ['paid', 'closed'].includes(c.state);
    if (filter === 'not_paid') return ['rejected', 'expired'].includes(c.state);
    return true;
  });

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      <div className="px-1 flex items-center justify-between">
        <div>
          <h1 className="font-display font-extrabold text-3xl text-ink">Your claims</h1>
          <p className="text-sm font-semibold text-ink/72 mt-1">Automatic parametric income protection</p>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-none">
        {[
          { id: 'all', label: 'All' },
          { id: 'in_progress', label: 'In Progress' },
          { id: 'paid', label: 'Paid' },
          { id: 'not_paid', label: 'Not Paid' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => {
              haptic('selection');
              setFilter(f.id);
            }}
            className={`h-9 px-4 rounded-full text-xs font-bold transition-all shrink-0 ${
              filter === f.id
                ? 'bg-walnut text-oat shadow-press'
                : 'glass-1 text-ink/72 hover:bg-white/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="card" height="72px" />
          <Skeleton variant="card" height="72px" />
          <Skeleton variant="card" height="72px" />
        </div>
      ) : filteredClaims.length > 0 ? (
        <ListGroup>
          {filteredClaims.map((claim) => (
            <ListRow
              key={claim.id}
              icon={CloudRain}
              title={claim.trigger_event?.title || 'Weather Disruption'}
              subtitle={new Date(claim.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              value={formatMoney(claim.calculated_payout || claim.requested_payout || 350)}
              status={claim.state}
              onClick={() => {
                haptic('selection');
                navigate(`/claims/${claim.id}`);
              }}
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState
          icon={Receipt}
          title="No claims yet"
          description="When rain, extreme heat, or dark store halts disrupt orders, automatic claims appear here."
          actionLabel="Check local weather conditions"
          onAction={() => navigate('/home')}
        />
      )}
    </div>
  );
}
