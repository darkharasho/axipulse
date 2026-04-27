import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

type Props = {
    open: boolean;
    version: string;
    markdown: string | null;
    onClose: () => void;
};

export function WhatsNewModal({ open, version, markdown, onClose }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-6"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="relative w-full max-w-3xl rounded-lg border shadow-2xl flex flex-col"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b"
                            style={{ borderColor: 'var(--border-subtle)' }}>
                            <div className="flex items-center gap-2">
                                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '15px', color: 'var(--brand-primary)' }}>
                                    What's New
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    v{version}
                                </span>
                            </div>
                            <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-5 py-4 prose-whatsnew text-sm" style={{ maxHeight: '65vh' }}>
                            {markdown ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={mdComponents}
                                >
                                    {markdown}
                                </ReactMarkdown>
                            ) : (
                                <div className="italic" style={{ color: 'var(--text-muted)' }}>
                                    Couldn't load release notes for v{version}.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end px-5 py-3 border-t"
                            style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 text-xs rounded-md border transition-colors"
                                style={{ background: 'var(--accent-bg)', color: 'var(--brand-primary)', borderColor: 'var(--accent-border)' }}
                            >
                                Got it
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function openExternal(url: string) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

const mdComponents = {
    h1: ({ children }: { children?: ReactNode }) => (
        <h2 className="text-base font-semibold mb-2 mt-3" style={{ color: 'var(--text-primary)' }}>{children}</h2>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
        <h3 className="text-sm font-semibold uppercase tracking-wider mt-4 mb-1.5" style={{ color: 'var(--brand-primary)' }}>{children}</h3>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
        <h4 className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'var(--text-muted)' }}>{children}</h4>
    ),
    p: ({ children }: { children?: ReactNode }) => (
        <p className="mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</p>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
        <ul className="list-disc pl-5 mb-2 space-y-1" style={{ color: 'var(--text-secondary)' }}>{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
        <ol className="list-decimal pl-5 mb-2 space-y-1" style={{ color: 'var(--text-secondary)' }}>{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
    code: ({ children }: { children?: ReactNode }) => (
        <code className="px-1 py-0.5 rounded text-[0.85em]"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            {children}
        </code>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
        <pre className="overflow-x-auto rounded px-3 py-2 my-2 text-[0.85em]"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            {children}
        </pre>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
        <blockquote className="border-l-2 pl-3 my-2 italic"
            style={{ borderColor: 'var(--brand-primary)', color: 'var(--text-muted)' }}>
            {children}
        </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a
            href={href}
            onClick={e => { e.preventDefault(); if (href) openExternal(href); }}
            style={{ color: 'var(--brand-primary)' }}
            className="hover:underline"
        >
            {children}
        </a>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
        <strong style={{ color: 'var(--text-primary)' }}>{children}</strong>
    ),
};
