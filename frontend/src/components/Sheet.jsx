import { useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';

const SNAP_POINTS = { sm: 0.4, lg: 0.9 };

export default function Sheet({
  isOpen = false,
  onClose,
  snapPoint = 'sm',
  children,
}) {
  const sheetRef = useRef(null);
  const y = useMotionValue(0);

  const snapHeight =
    typeof window !== 'undefined'
      ? window.innerHeight * (SNAP_POINTS[snapPoint] || 0.4)
      : 400;

  useEffect(() => {
    if (isOpen) {
      animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [isOpen, y]);

  const handleDragEnd = (_, info) => {
    if (info.velocity.y > 300 || info.offset.y > snapHeight * 0.4) {
      onClose?.();
    } else {
      animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            className="fixed inset-0 z-50 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className="
              fixed bottom-0 inset-x-0 z-50
              glass-2 rounded-t-sheet
              shadow-float
              pb-safe-b
              overflow-auto
            "
            style={{ height: snapHeight, y }}
            initial={{ y: snapHeight }}
            animate={{ y: 0 }}
            exit={{ y: snapHeight }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-[5px] rounded-full bg-biscuit/60" />
            </div>

            {/* Content */}
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
