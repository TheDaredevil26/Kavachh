import { X } from 'lucide-react';

const tintClasses = {
  sky: 'bg-sky/20 border-sky/40',
  sand: 'bg-sand/40 border-biscuit/40',
  madder: 'bg-madder/20 border-madder/40',
};

export default function Banner({
  tint = 'sky',
  icon: Icon,
  children,
  actionLabel,
  onAction,
  onDismiss,
  className = '',
}) {
  return (
    <div
      className={`
        w-full flex items-center gap-3
        px-4 py-3
        rounded-card border
        ${tintClasses[tint] || tintClasses.sky}
        ${className}
      `}
      role="status"
    >
      {Icon && <Icon className="h-5 w-5 text-ink shrink-0" />}
      <span className="flex-1 text-sm font-semibold text-ink">{children}</span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-sm font-bold text-ink underline underline-offset-4 shrink-0"
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded-full hover:bg-ink/5 shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-ink/48" />
        </button>
      )}
    </div>
  );
}
