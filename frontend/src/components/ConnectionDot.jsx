const statusConfig = {
  live: { dot: 'bg-sage', label: 'Live' },
  reconnecting: { dot: 'bg-honey', label: 'Reconnecting' },
  offline: { dot: 'bg-madder', label: 'Offline' },
};

export default function ConnectionDot({ status = 'live' }) {
  const config = statusConfig[status] || statusConfig.live;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${config.dot} ${
          status === 'live' ? 'animate-pulse' : ''
        }`}
      />
      <span className="text-xs font-semibold text-ink/48">{config.label}</span>
    </span>
  );
}
