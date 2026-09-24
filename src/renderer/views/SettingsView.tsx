// src/renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { FolderOpen, CheckCircle, AlertCircle, Loader2, Dices, ExternalLink, Stethoscope } from 'lucide-react';
import { TroubleshootModal } from './TroubleshootModal';
import { ACCENTS } from '../themes/accents';

const IS_DEV = import.meta.env.DEV;

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="axi-panel" style={{ ['--axi-panel-pad' as string]: '16px' }}>
            <div className="flex items-center gap-2.5 mb-3.5">
                <div className="w-0.5 h-3.5 flex-shrink-0" style={{ background: 'var(--axi-accent)' }} />
                <span className="axi-eyebrow" style={{ margin: 0 }}>
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
    const variantClass = variant === 'primary' ? ' axi-btn--primary' : variant === 'ghost' ? ' axi-btn--ghost' : '';
    const dangerStyle: React.CSSProperties | undefined = variant === 'danger'
        ? { color: 'var(--axi-danger)', border: 'var(--axi-border-control) solid var(--axi-danger)' }
        : undefined;
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`axi-btn${variantClass}`}
            style={{ padding: '5px 10px', font: 'var(--axi-t-micro)', letterSpacing: 'var(--axi-ls-micro)', ...dangerStyle }}
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
    const accentId = useAppStore(s => s.accentId);
    const setAccentId = useAppStore(s => s.setAccentId);
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
                        <div className="flex-1 px-2.5 py-1.5 text-[11px] truncate font-mono min-w-0"
                            style={{ background: 'var(--axi-ground)', color: logDirectory ? 'var(--axi-text)' : 'var(--axi-text-faint)', border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                            {logDirectory || 'Not configured'}
                        </div>
                        <Btn onClick={handleBrowse} variant="primary">
                            <FolderOpen className="w-3.5 h-3.5" /> Browse
                        </Btn>
                    </div>
                    {logDirectory && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: 'var(--axi-ok)' }}>
                            <CheckCircle className="w-3 h-3" /> Watching for new logs
                        </div>
                    )}
                </SectionCard>

                {/* Accent */}
                <SectionCard label="Accent">
                    <div className="flex flex-wrap gap-2">
                        {ACCENTS.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                title={a.label}
                                aria-label={a.label}
                                aria-pressed={a.id === accentId}
                                className={`ap-swatch${a.id === accentId ? ' ap-swatch--active' : ''}`}
                                style={{ background: a.hex }}
                                onClick={() => {
                                    setAccentId(a.id);
                                    window.electronAPI?.saveSettings({ accentId: a.id });
                                }}
                            />
                        ))}
                    </div>
                </SectionCard>

                {/* Timeline */}
                <SectionCard label="Timeline">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px]" style={{ color: 'var(--axi-text-faint)' }}>Bucket size</span>
                        <div className="flex overflow-hidden" style={{ border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                            {[1000, 2000, 3000, 5000].map((ms, i) => (
                                <button
                                    key={ms}
                                    onClick={() => setBucketSizeMs(ms)}
                                    className="px-3 py-1 text-[11px] transition-colors"
                                    style={{
                                        background: bucketSizeMs === ms ? 'var(--axi-accent)' : 'transparent',
                                        color: bucketSizeMs === ms ? 'var(--axi-accent-ink)' : 'var(--axi-text-faint)',
                                        borderLeft: i > 0 ? 'var(--axi-border-control) solid var(--axi-ink-line)' : 'none',
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
                    <p className="text-[11px] mb-3" style={{ color: 'var(--axi-text-dim)' }}>
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
                        <div className="mt-2.5 flex items-start gap-1.5 text-[11px]" style={{ color: debugResult.ok ? 'var(--axi-ok)' : 'var(--axi-danger)' }}>
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
                        <span className="text-[11px]" style={{ color: 'var(--axi-text-dim)' }}>
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
                            className="axi-btn"
                            style={{ padding: '6px 12px', font: 'var(--axi-t-micro)', letterSpacing: 'var(--axi-ls-micro)' }}
                        >
                            <ExternalLink className="w-3 h-3" /> Discord
                        </button>
                        <button
                            onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/axipulse')}
                            className="axi-btn"
                            style={{ padding: '6px 12px', font: 'var(--axi-t-micro)', letterSpacing: 'var(--axi-ls-micro)' }}
                        >
                            <ExternalLink className="w-3 h-3" /> GitHub
                        </button>
                    </div>
                </SectionCard>

                {IS_DEV && (
                    <div
                        className="axi-panel"
                        style={{ ['--axi-panel-pad' as string]: '16px', border: 'var(--axi-border-control) solid var(--axi-warn)' }}
                    >
                        <div className="flex items-center gap-2.5 mb-3.5">
                            <div className="w-0.5 h-3.5 flex-shrink-0" style={{ background: 'var(--axi-warn)' }} />
                            <span className="axi-eyebrow" style={{ margin: 0, color: 'var(--axi-warn)' }}>
                                Dev Tools
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px]" style={{ color: 'var(--axi-text-dim)' }}>Min file size (KB)</span>
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
                                className="axi-input w-24"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                            />
                            {devMinFileSize > 0 && (
                                <span className="text-[11px]" style={{ color: 'var(--axi-warn)' }}>
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
