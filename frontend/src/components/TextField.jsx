import { AlertCircle } from 'lucide-react';

export default function TextField({
  label,
  error,
  className = '',
  ...inputProps
}) {
  const id = inputProps.id || inputProps.name || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-bold text-ink"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`
          h-14 px-4
          bg-white/50 backdrop-blur-sm
          rounded-field
          border transition-colors
          text-base text-ink placeholder:text-ink/30
          focus:outline-none focus:ring-2 focus:ring-walnut focus:border-transparent
          ${error ? 'border-madder border-[1.5px]' : 'border-biscuit border-[1.5px]'}
        `}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1 text-xs font-semibold text-madder"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
