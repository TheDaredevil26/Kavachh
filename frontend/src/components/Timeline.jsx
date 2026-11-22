import { Check } from 'lucide-react';

export default function Timeline({ steps = [], className = '' }) {
  return (
    <div className={`flex flex-col ${className}`}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className="flex gap-3">
            {/* Dot column */}
            <div className="flex flex-col items-center">
              {/* Dot */}
              {step.status === 'done' ? (
                <div className="w-6 h-6 rounded-full bg-walnut flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-oat" />
                </div>
              ) : step.status === 'current' ? (
                <div className="relative w-6 h-6 shrink-0">
                  <div className="absolute inset-0 rounded-full border-2 border-sky" />
                  <div className="absolute inset-1 rounded-full bg-sky animate-pulse" />
                </div>
              ) : step.status === 'branch' ? (
                <div className="w-6 h-6 rounded-full border-2 border-dashed border-honey shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-biscuit shrink-0" />
              )}

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 min-h-[24px] ${
                    step.status === 'done' ? 'bg-walnut' : 'bg-biscuit/40'
                  }`}
                />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
              <p className="text-sm font-bold text-ink leading-tight">{step.label}</p>
              {step.subText && (
                <p className="text-xs text-ink/48 mt-0.5">{step.subText}</p>
              )}
              {step.time && (
                <p className="text-xs text-ink/48 mt-0.5">{step.time}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
