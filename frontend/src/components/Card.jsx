import React from 'react';

/**
 * Reusable Card component for dashboard widgets, policy items, and administrative panels.
 */
export default function Card({
  title,
  subtitle,
  action,
  children,
  footer,
  className = '',
  headerBorder = false,
  variant = 'default',
}) {
  const variantStyles = {
    default: 'bg-white border-slate-200/80 shadow-sm',
    bordered: 'bg-white border-slate-300 shadow-none',
    glass: 'bg-white/85 backdrop-blur-md border-amber-900/10 shadow-sm',
    highlight: 'bg-gradient-to-br from-amber-50/70 to-white border-amber-200/80 shadow-md',
    sky: 'bg-gradient-to-br from-sky-50/70 to-white border-sky-200 shadow-sm',
  };

  const selectedVariant = variantStyles[variant] || variantStyles.default;

  return (
    <div className={`rounded-2xl border transition-all duration-200 ${selectedVariant} ${className}`}>
      {(title || subtitle || action) && (
        <div
          className={`flex items-start justify-between px-5 py-4 ${
            headerBorder ? 'border-b border-slate-100' : ''
          }`}
        >
          <div>
            {title && <h3 className="font-semibold text-slate-900 text-lg">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="ml-4 flex-shrink-0">{action}</div>}
        </div>
      )}

      <div className="p-5">{children}</div>

      {footer && (
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl text-sm text-slate-600">
          {footer}
        </div>
      )}
    </div>
  );
}
