import StatusPill from './StatusPill';

const stateToStatus = {
  Safe: 'success',
  Watch: 'attention',
  Triggered: 'problem',
};

export default function ConditionTile({
  icon: Icon,
  name,
  value,
  state = 'Safe',
  className = '',
}) {
  return (
    <div
      className={`
        glass-1 rounded-card p-4
        flex flex-col gap-2
        ${className}
      `}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-mocha" />}
        <span className="text-sm font-bold text-ink">{name}</span>
      </div>
      <span className="text-2xl font-display font-bold text-ink tabular-nums">
        {value}
      </span>
      <StatusPill
        status={stateToStatus[state] || 'info'}
        label={state}
      />
    </div>
  );
}
