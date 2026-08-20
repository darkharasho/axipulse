// src/renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { FolderOpen, CheckCircle, AlertCircle, Loader2, Dices, ExternalLink, Stethoscope } from 'lucide-react';
import { TroubleshootModal } from './TroubleshootModal';

const IS_DEV = import.meta.env.DEV;

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-2.5 mb-3.5">
                <div className="w-0.5 h-3.5 rounded-full flex-shrink-0" style={{ background: 'var(--brand-primary)' }} />
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {label}
                </span>
            </div>
            {children}
        </div>
    );
}

function Btn({ onClick, disabled, variant = 'ghost', children, title }: {
    onClick?: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'ghost' | 'danger';
    children: React.ReactNode;
    title?: string;
}) {
    const styles: Record<string, React.CSSProperties> = {
        primary: { background: 'var(--accent-bg)', color: 'var(--brand-primary)', border: '1px solid var(--accent-border)' },
        ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' },
        danger: { background: 'transparent', color: 'var(--status-error)', border: '1px solid rgba(248,113,113,0.2)' },
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-opacity hover:opacity-80 disabled:opacity-40"
            style={styles[variant]}
        >
            {children}
        </button>
    );
}

export function SettingsView() {
    const logDirectory = useAppStore(s => s.logDirectory);
    const setLogDirectory = useAppStore(s => s.setLogDirectory);
    const bucketSizeMs = useAppStore(s => s.bucketSizeMs);
    const setBucketSizeMs = useAppStore(s => s.setBucketSizeMs);
    const setView = useAppStore(s => s.setView);
    const requestWhatsNew = useAppStore(s => s.requestWhatsNew);
    const [devMinFileSize, setDevMinFileSize] = useState<number>(0);
    const [debugParsing, setDebugParsing] = useState(false);
    const [debugResult, setDebugResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [troubleshootOpen, setTroubleshootOpen] = useState(false);
    useEffect(() => {
        window.electronAPI?.getSettings().then(s => {
            if (s.logDirectory) setLogDirectory(s.logDirectory);
            if (s.devMinFileSize) setDevMinFileSize(s.devMinFileSize);
        });
    }, []);

    const handleDebugParse = async () => {
        setDebugParsing(true);
        setDebugResult(null);
        setView('pulse');
        try {
            const result = await window.electronAPI?.devParseRandom();
            if (result?.success) {
                setDebugResult({ ok: true, msg: `Parsed: ${result.logPath?.split(/[\\/]/).pop()}` });
            } else {
                setDebugResult({ ok: false, msg: result?.error ?? 'Unknown error' });
            }
        } catch (err: any) {
            setDebugResult({ ok: false, msg: err?.message ?? 'Failed' });
        }
        setDebugParsing(false);
    };

    const handleOpenWhatsNew = async () => {
        const version = await window.electronAPI?.getAppVersion?.();
        if (!version) return;
        const result = await window.electronAPI?.getReleaseNotes?.(version);
        requestWhatsNew({ version, markdown: result?.markdown ?? null, source: 'manual' });
    };

    const handleBrowse = async () => {
        const dir = await window.electronAPI?.selectDirectory();
        if (dir) {
            setLogDirectory(dir);
            window.electronAPI?.startWatching(dir);
            window.electronAPI?.saveSettings({ logDirectory: dir });
        }
    };

    return (
        <div className="flex justify-center">
        <div className="w-full max-w-md space-y-3">

                {/* Log Directory */}
                <SectionCard label="Log Directory">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 px-2.5 py-1.5 rounded text-[11px] truncate font-mono min-w-0"
                            style={{ background: 'var(--bg-input)', color: logDirectory ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                            {logDirectory || 'Not configured'}
                        </div>
                        <Btn onClick={handleBrowse} variant="primary">
                            <FolderOpen className="w-3.5 h-3.5" /> Browse
                        </Btn>
                    </div>
                    {logDirectory && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: 'var(--status-success)' }}>
                            <CheckCircle className="w-3 h-3" /> Watching for new logs
                        </div>
                    )}
                </SectionCard>

                {/* Timeline */}
                <SectionCard label="Timeline">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Bucket size</span>
                        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                            {[1000, 2000, 3000, 5000].map((ms, i) => (
                                <button
                                    key={ms}
                                    onClick={() => setBucketSizeMs(ms)}
                                    className="px-3 py-1 text-[11px] transition-colors"
                                    style={{
                                        background: bucketSizeMs === ms ? 'var(--accent-bg)' : 'transparent',
                                        color: bucketSizeMs === ms ? 'var(--brand-primary)' : 'var(--text-muted)',
                                        borderLeft: i > 0 ? '1px solid var(--border-default)' : 'none',
                                        fontWeight: bucketSizeMs === ms ? 600 : 400,
                                    }}
                                >
                                    {ms / 1000}s
                                </button>
                            ))}
                        </div>
                    </div>
                </SectionCard>

                {/* Troubleshooting */}
                <SectionCard label="Troubleshooting">
                    <p className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
                        Run a step-by-step check of your setup — log directory, arcdps WvW logging, and a live parse test.
                    </p>
                    <div className="flex items-center gap-3">
                        <Btn onClick={() => setTroubleshootOpen(true)} variant="primary">
                            <Stethoscope className="w-3.5 h-3.5" /> Run Troubleshooter
                        </Btn>
                        <Btn onClick={handleDebugParse} disabled={debugParsing || !logDirectory} variant="ghost">
                            {debugParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dices className="w-3 h-3" />}
                            Parse Random Log
                        </Btn>
                    </div>
                    {debugResult && (
                        <div className="mt-2.5 flex items-start gap-1.5 text-[11px]" style={{ color: debugResult.ok ? 'var(--status-success)' : 'var(--status-error)' }}>
                            {debugResult.ok
                                ? <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                : <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                            <span className="break-all">{debugResult.msg}</span>
                        </div>
                    )}
                </SectionCard>

                {troubleshootOpen && <TroubleshootModal onClose={() => setTroubleshootOpen(false)} />}

                {/* About */}
                <SectionCard label="About">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            See what changed in this version
                        </span>
                        <Btn variant="ghost" onClick={handleOpenWhatsNew}>
                            What's New
                        </Btn>
                    </div>
                </SectionCard>

                {/* Links */}
                <SectionCard label="Links">
                    <div className="flex gap-2">
                        <button
                            onClick={() => window.electronAPI?.openExternal?.('https://discord.gg/UjzMXMGXEg')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full transition-opacity hover:opacity-80"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                        >
                            <ExternalLink className="w-3 h-3" /> Discord
                        </button>
                        <button
                            onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/axipulse')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full transition-opacity hover:opacity-80"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                        >
                            <ExternalLink className="w-3 h-3" /> GitHub
                        </button>
                    </div>
                </SectionCard>

                {IS_DEV && (
                    <div
                        className="rounded-lg p-4"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(251,191,36,0.25)' }}
                    >
                        <div className="flex items-center gap-2.5 mb-3.5">
                            <div className="w-0.5 h-3.5 rounded-full flex-shrink-0" style={{ background: '#fbbf24' }} />
                            <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#fbbf24', textTransform: 'uppercase' }}>
                                Dev Tools
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Min file size (KB)</span>
                            <input
                                type="number"
                                min={0}
                                step={100}
                                value={devMinFileSize}
                                onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setDevMinFileSize(val);
                                    window.electronAPI?.saveSettings({ devMinFileSize: val });
                                }}
                                className="w-24 px-2 py-1 text-xs rounded outline-none"
                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                            />
                            {devMinFileSize > 0 && (
                                <span className="text-[11px]" style={{ color: '#fcd34d' }}>
                                    ≥ {devMinFileSize >= 1024 ? `${(devMinFileSize / 1024).toFixed(1)} MB` : `${devMinFileSize} KB`}
                                </span>
                            )}
                        </div>
                    </div>
                )}

        </div>
        </div>
    );
}
