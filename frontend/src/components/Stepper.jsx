export default function Stepper({ steps = 3, current = 1, className = '' }) {
  return (
    <div className={`flex gap-2 ${className}`} role="progressbar" aria-valuemin={1} aria-valuemax={steps} aria-valuenow={current}>
      {Array.from({ length: steps }, (_, i) => {
        const stepNum = i + 1;
        const filled = stepNum <= current;

        return (
          <div
            key={i}
            className={`
              h-1.5 flex-1 rounded-full
              transition-colors duration-300 ease-spring
              ${filled ? 'bg-walnut' : 'bg-biscuit/40'}
            `}
          />
        );
      })}
    </div>
  );
}
