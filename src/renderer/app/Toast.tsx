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
                        className="px-3 py-2 rounded-md border text-xs max-w-[280px]"
                        style={{
                            background: 'var(--bg-card)',
                            borderColor: 'var(--accent-border)',
                            boxShadow: 'var(--shadow-dropdown)',
                        }}
                    >
                        <div className="text-[color:var(--brand-primary)] font-medium">{toast.fightLabel}</div>
                        <div className="text-[color:var(--text-secondary)] mt-0.5">{toast.message}</div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
