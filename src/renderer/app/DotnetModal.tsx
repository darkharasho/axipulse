import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Download, X, XCircle } from 'lucide-react';

type Phase = 'checking' | 'needed' | 'installing' | 'done' | 'error';

interface Props {
    onDismiss: () => void;
}

export function DotnetModal({ onDismiss }: Props) {
    const [phase, setPhase] = useState<Phase>('checking');
    const [errorMsg, setErrorMsg] = useState('');
    const [installStage, setInstallStage] = useState('');
    const [installPercent, setInstallPercent] = useState<number | undefined>();
    const outputRef = useRef<HTMLDivElement>(null);
    const [outputLines, setOutputLines] = useState<string[]>([]);
    const cleanupRef = useRef<(() => void) | undefined>(undefined);

    useEffect(() => {
        window.electronAPI?.eiCheckDotnet().then((result: { available: boolean }) => {
            if (result.available) {
                onDismiss();
            } else {
                setPhase('needed');
            }
        }).catch(() => setPhase('needed'));
    }, []);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [outputLines]);

    const handleInstall = async () => {
        setPhase('installing');
        setOutputLines([]);

        const cleanupProgress = window.electronAPI?.onEiDownloadProgress((p: { stage: string; percent?: number }) => {
            setInstallStage(p.stage);
            setInstallPercent(p.percent);
        });
        const cleanupOutput = window.electronAPI?.onEiDotnetInstallOutput((line: string) => {
            setOutputLines(prev => [...prev, line.trimEnd()].slice(-80));
        });
        cleanupRef.current = () => { cleanupProgress?.(); cleanupOutput?.(); };

        try {
            await window.electronAPI?.eiInstallDotnet();
            setPhase('done');
        } catch (err: any) {
            setErrorMsg(err?.message || 'Installation failed');
            setPhase('error');
        } finally {
            cleanupRef.current?.();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border shadow-2xl flex flex-col"
                style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                    width: 440,
                    maxHeight: '80vh',
                }}
            >
                <div className="px-6 pt-5 pb-4 border-b flex items-start justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            .NET 8.0 Runtime Required
                        </h2>
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Elite Insights requires the .NET 8.0 runtime to parse combat logs.
                        </p>
                    </div>
                    <button
                        onClick={onDismiss}
                        className="ml-4 shrink-0 text-gray-500 hover:text-white transition-colors"
                        title="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-5 flex-1 overflow-hidden flex flex-col gap-4">
                    <AnimatePresence mode="wait">
                        {phase === 'checking' && (
                            <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                                <svg className="animate-spin w-4 h-4" style={{ color: 'var(--brand-primary)' }} viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                                </svg>
                                Checking .NET availability...
                            </motion.div>
                        )}

                        {phase === 'needed' && (
                            <motion.div key="needed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                                <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                                    .NET 8.0 was not found on your system. AxiPulse can install it locally without requiring administrator access.
                                </p>
                                <button
                                    onClick={handleInstall}
                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors hover:brightness-110"
                                    style={{ background: 'var(--brand-primary)', color: '#000' }}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Install .NET 8.0 Locally
                                </button>
                            </motion.div>
                        )}

                        {phase === 'installing' && (
                            <motion.div key="installing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    <svg className="animate-spin w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary)' }} viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                                    </svg>
                                    <span>{installStage || 'Installing...'}</span>
                                    {installPercent !== undefined && <span style={{ color: 'var(--brand-primary)' }}>{installPercent}%</span>}
                                </div>
                                {installPercent !== undefined && (
                                    <div className="w-full h-1 rounded-full" style={{ background: 'var(--bg-card)' }}>
                                        <div
                                            className="h-1 rounded-full transition-all"
                                            style={{ width: `${installPercent}%`, background: 'var(--brand-primary)' }}
                                        />
                                    </div>
                                )}
                                {outputLines.length > 0 && (
                                    <div
                                        ref={outputRef}
                                        className="rounded-lg p-2 text-[9px] font-mono overflow-y-auto leading-relaxed"
                                        style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', maxHeight: 160 }}
                                    >
                                        {outputLines.map((line, i) => <div key={i}>{line}</div>)}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {phase === 'done' && (
                            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-2">
                                <CheckCircle className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} />
                                <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>.NET 8.0 installed successfully.</p>
                                <button
                                    onClick={onDismiss}
                                    className="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:brightness-110"
                                    style={{ background: 'var(--brand-primary)', color: '#000' }}
                                >
                                    Continue
                                </button>
                            </motion.div>
                        )}

                        {phase === 'error' && (
                            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                                <div className="flex items-start gap-2">
                                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--status-error)' }} />
                                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{errorMsg}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleInstall}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:brightness-110"
                                        style={{ background: 'var(--brand-primary)', color: '#000' }}
                                    >
                                        Retry
                                    </button>
                                    <button
                                        onClick={onDismiss}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                                        style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                                    >
                                        Skip for now
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
