import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const typeIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

export default function Toast({
  message,
  icon: CustomIcon,
  type = 'info',
  onDismiss,
}) {
  const y = useMotionValue(0);
  const Icon = CustomIcon || typeIcons[type] || Info;

  // Auto-dismiss after 3.5s
  useEffect(() => {
    const timer = setTimeout(() => onDismiss?.(), 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDragEnd = useCallback(
    (_, info) => {
      if (info.offset.y < -30) {
        onDismiss?.();
      }
    },
    [onDismiss]
  );

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="
            fixed top-4 inset-x-4 z-[60]
            flex items-center gap-3
            glass-2 rounded-full shadow-float
            px-5 py-3
          "
          style={{ y }}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          drag="y"
          dragConstraints={{ top: -80, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          role="alert"
        >
          <Icon className="h-5 w-5 text-ink shrink-0" />
          <span className="text-sm font-semibold text-ink flex-1">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
