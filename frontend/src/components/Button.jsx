import { Loader2 } from 'lucide-react';
import { haptic } from '../lib/haptics';

const variants = {
  primary: 'bg-sky text-ink',
  secondary: 'glass-1 text-ink',
  ghost: 'bg-transparent text-ink underline-offset-4 focus:underline',
  danger: 'bg-madder/40 text-ink ring-1 ring-madder',
};

export default function Button({
  variant = 'primary',
  compact = false,
  icon: Icon,
  children,
  loading = false,
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const handleClick = (e) => {
    if (disabled || loading) return;
    haptic('selection');
    onClick?.(e);
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        ${compact ? 'h-12' : 'h-14'}
        rounded-row px-6
        text-lg font-bold
        transition-all duration-150 ease-spring
        active:translate-y-px active:shadow-press
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-walnut focus-visible:outline-offset-2
        disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant] || variants.primary}
        ${className}
      `}
      disabled={disabled || loading}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : Icon ? (
        <Icon className="h-5 w-5" />
      ) : null}
      {children}
    </button>
  );
}
