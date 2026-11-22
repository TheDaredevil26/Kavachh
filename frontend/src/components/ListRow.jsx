import { ChevronRight } from 'lucide-react';

export default function ListRow({
  icon: Icon,
  label,
  value,
  trailing,
  onClick,
  className = '',
}) {
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      className={`
        flex items-center gap-3 w-full min-h-[64px] px-4 py-3
        text-left
        ${onClick ? 'cursor-pointer hover:bg-sand/20 active:bg-sand/30 transition-colors' : ''}
        ${className}
      `}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {/* Leading icon */}
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-sand flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-walnut" />
        </div>
      )}

      {/* Label */}
      <span className="flex-1 text-sm font-semibold text-ink truncate">{label}</span>

      {/* Trailing */}
      {trailing ? (
        trailing
      ) : value !== undefined ? (
        <span className="text-sm text-ink/72 tabular-nums">{value}</span>
      ) : onClick ? (
        <ChevronRight className="h-5 w-5 text-ink/48 shrink-0" />
      ) : null}
    </Wrapper>
  );
}
