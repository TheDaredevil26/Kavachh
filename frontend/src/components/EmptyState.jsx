import Button from './Button';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}>
      {Icon && (
        <div className="w-20 h-20 rounded-full bg-sand/50 flex items-center justify-center mb-6">
          <Icon className="h-10 w-10 text-mocha" />
        </div>
      )}
      {title && (
        <h3 className="text-lg font-bold text-ink mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-ink/48 max-w-xs mb-6">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
