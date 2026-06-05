import { motion, AnimatePresence } from "framer-motion";
import { RichButton } from "@/components/ui/rich-button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px] bg-white rounded-md border border-black/[0.06] shadow-sm p-8"
            style={{ fontFamily: "'Suisse Intl', 'Geist Sans', system-ui, sans-serif" }}
          >
            <h2 className="text-[18px] font-bold tracking-[-0.02em] text-black">
              {title}
            </h2>
            <p className="mt-2 text-[14px] text-black/50 leading-relaxed">
              {message}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="h-10 px-4 text-[13px] font-semibold text-black/60 hover:text-black transition-colors duration-200"
              >
                {cancelLabel}
              </button>
              <RichButton
                onClick={onConfirm}
                size="default"
                color="default"
                className="h-10 px-5 rounded-lg"
              >
                {confirmLabel}
              </RichButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
