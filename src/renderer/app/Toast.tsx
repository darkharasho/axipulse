// src/renderer/app/Toast.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store';

export function ToastContainer() {
    const toasts = useAppStore(s => s.toasts);

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="axi-notice text-xs max-w-[280px]"
                    >
                        <div>
                            <div style={{ color: 'var(--axi-accent)' }} className="font-medium">{toast.fightLabel}</div>
                            <div style={{ color: 'var(--axi-text-dim)' }} className="mt-0.5">{toast.message}</div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
