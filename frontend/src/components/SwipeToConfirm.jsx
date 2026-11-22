import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Shield, Check, X, Loader2 } from 'lucide-react';
import { haptic } from '../lib/haptics';

export default function SwipeToConfirm({
  label = 'Swipe to confirm',
  successLabel = 'Confirmed',
  onConfirm,
  disabled = false,
  disabledReason,
  variant = 'primary',
}) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const trackRef = useRef(null);
  const x = useMotionValue(0);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (trackRef.current) {
      setTrackWidth(trackRef.current.offsetWidth - 56);
    }
  }, []);

  // Idle hint nudge
  useEffect(() => {
    if (state !== 'idle') return;
    const timer = setTimeout(() => {
      animate(x, 24, { type: 'spring', stiffness: 300, damping: 20 });
      setTimeout(() => animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 }), 400);
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, x]);

  const progressWidth = useTransform(x, [0, trackWidth], ['0%', '100%']);
  const progressOpacity = useTransform(x, [0, trackWidth * 0.3, trackWidth], [0, 0.3, 0.6]);

  const handleDragEnd = useCallback(async () => {
    if (state !== 'idle' || !trackWidth) return;
    const current = x.get();
    if (current >= trackWidth * 0.85) {
      haptic('success');
      setState('loading');
      animate(x, trackWidth, { type: 'spring', stiffness: 300, damping: 30 });
      try {
        await onConfirm?.();
        setState('success');
      } catch {
        setState('error');
        haptic('error');
        setTimeout(() => {
          setState('idle');
          animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
        }, 1200);
      }
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
    }
  }, [state, trackWidth, onConfirm, x]);

  const handleKeyDown = useCallback(
    async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state !== 'idle' || disabled) return;
        haptic('success');
        setState('loading');
        animate(x, trackWidth, { type: 'spring', stiffness: 300, damping: 30 });
        try {
          await onConfirm?.();
          setState('success');
        } catch {
          setState('error');
          haptic('error');
          setTimeout(() => {
            setState('idle');
            animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
          }, 1200);
        }
      }
    },
    [state, disabled, onConfirm, x, trackWidth]
  );

  const thumbBg = variant === 'danger' ? 'bg-madder' : 'bg-walnut';
  const fillBg = state === 'success' ? 'bg-sage' : state === 'error' ? 'bg-madder/40' : 'bg-sky';

  return (
    <div
      className="relative"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
    >
      {disabled && disabledReason && (
        <p className="text-sm text-ink/48 mb-1">{disabledReason}</p>
      )}
      <div
        ref={trackRef}
        className={`
          relative h-16 w-full glass-1 rounded-full overflow-hidden
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {/* Progress fill */}
        <motion.div
          className={`absolute inset-y-0 left-0 ${fillBg} rounded-full`}
          style={{ width: progressWidth, opacity: progressOpacity }}
        />

        {/* Label */}
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-ink/48 select-none pointer-events-none">
          <span aria-live="polite">
            {state === 'success' ? successLabel : state === 'loading' ? 'Processing…' : state === 'error' ? 'Try again' : label}
          </span>
        </span>

        {/* Thumb */}
        <motion.div
          className={`
            absolute top-1 left-1
            w-14 h-14 rounded-full ${thumbBg}
            flex items-center justify-center
            shadow-glass cursor-grab active:cursor-grabbing
            touch-none
          `}
          style={{ x }}
          drag={state === 'idle' && !disabled ? 'x' : false}
          dragConstraints={{ left: 0, right: trackWidth }}
          dragElastic={0}
          onDragEnd={handleDragEnd}
        >
          {state === 'loading' ? (
            <Loader2 className="h-6 w-6 text-oat animate-spin" />
          ) : state === 'success' ? (
            <Check className="h-6 w-6 text-oat" />
          ) : state === 'error' ? (
            <X className="h-6 w-6 text-oat" />
          ) : (
            <Shield className="h-6 w-6 text-oat" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
