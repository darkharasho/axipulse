// src/renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { FolderOpen, Download, RefreshCw, Trash2, CheckCircle, AlertCircle, Loader2, Dices, ExternalLink, Bug } from 'lucide-react';

const IS_DEV = import.meta.env.DEV;

interface Props {
    onOpenDotnetModal?: () => void;
}

export function SettingsView({ onOpenDotnetModal }: Props) {
    const logDirectory = useAppStore(s => s.logDirectory);
    const setLogDirectory = useAppStore(s => s.setLogDirectory);
    const eiStatus = useAppStore(s => s.eiStatus);
    const setEiStatus = useAppStore(s => s.setEiStatus);
    const bucketSizeMs = useAppStore(s => s.bucketSizeMs);
    const setBucketSizeMs = useAppStore(s => s.setBucketSizeMs);
    const [eiProgress, setEiProgress] = useState<string>('');
    const [devMinFileSize, setDevMinFileSize] = useState<number>(0);
    const [debugParsing, setDebugParsing] = useState(false);
    const [debugResult, setDebugResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [dotnetStatus, setDotnetStatus] = useState<{ available: boolean; managed: boolean; version?: string } | null>(null);

    useEffect(() => {
        window.electronAPI?.getSettings().then(s => {
            if (s.logDirectory) setLogDirectory(s.logDirectory);
            if (s.devMinFileSize) setDevMinFileSize(s.devMinFileSize);
        });
        window.electronAPI?.eiGetStatus().then(setEiStatus);
        window.electronAPI?.eiCheckDotnet().then(setDotnetStatus).catch(() => {});

        const cleanupProgress = window.electronAPI?.onEiDownloadProgress((p) => {
            setEiProgress(p.stage + (p.percent != null ? ` (${p.percent}%)` : ''));
        });
        const cleanupStatus = window.electronAPI?.onEiStatusChanged(setEiStatus);

        return () => { cleanupProgress?.(); cleanupStatus?.(); };
    }, []);

    const handleDebugParse = async () => {
        setDebugParsing(true);
        setDebugResult(null);
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

    const handleBrowse = async () => {
        const dir = await window.electronAPI?.selectDirectory();
        if (dir) {
            setLogDirectory(dir);
            window.electronAPI?.startWatching(dir);
            window.electronAPI?.saveSettings({ logDirectory: dir });
        }
    };

    const handleEiAction = async (action: 'install' | 'update' | 'reinstall' | 'uninstall') => {
        setEiStatus({ ...eiStatus, installing: true, error: null });
        try {
            if (action === 'install') await window.electronAPI?.eiInstall();
            else if (action === 'update') await window.electronAPI?.eiUpdate();
            else if (action === 'reinstall') await window.electronAPI?.eiReinstall();
            else if (action === 'uninstall') await window.electronAPI?.eiUninstall();
        } catch (err: any) {
            setEiStatus({ ...eiStatus, installing: false, error: err?.message ?? 'Failed' });
        }
        setEiProgress('');
    };

    return (
        <div className="max-w-md space-y-6">
            {/* Log Directory */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Log Directory</h3>
                <div className="flex items-center gap-2">
                    <div className="flex-1 text-xs px-2.5 py-1.5 rounded truncate"
                        style={{ background: 'var(--bg-input)', color: logDirectory ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {logDirectory || 'Not configured'}
                    </div>
                    <button onClick={handleBrowse}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)]">
                        <FolderOpen className="w-3.5 h-3.5" /> Browse
                    </button>
                </div>
                {logDirectory && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[color:var(--status-success)]">
                        <CheckCircle className="w-3 h-3" /> Watching for new logs
                    </div>
                )}
            </section>

            {/* Elite Insights */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Elite Insights</h3>
                <div className="text-xs text-[color:var(--text-secondary)] mb-2">
                    {eiStatus.installed
                        ? <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-[color:var(--status-success)]" /> Installed {eiStatus.version ? `v${eiStatus.version}` : ''}</span>
                        : <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-[color:var(--status-warning)]" /> Not installed</span>
                    }
                </div>
                {eiStatus.installing && eiProgress && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--text-muted)] mb-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> {eiProgress}
                    </div>
                )}
                {eiStatus.error && (
                    <div className="text-[10px] text-[color:var(--status-error)] mb-2">{eiStatus.error}</div>
                )}
                <div className="flex gap-2">
                    {!eiStatus.installed && (
                        <button onClick={() => handleEiAction('install')} disabled={eiStatus.installing}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors bg-[color:var(--accent-bg)] text-[color:var(--brand-primary)] hover:bg-[color:var(--accent-bg-strong)] disabled:opacity-50">
                            <Download className="w-3 h-3" /> Install
                        </button>
                    )}
                    {eiStatus.installed && (
                        <>
                            <button onClick={() => handleEiAction('update')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)] disabled:opacity-50">
                                <Download className="w-3 h-3" /> Update
                            </button>
                            <button onClick={() => handleEiAction('reinstall')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)] disabled:opacity-50">
                                <RefreshCw className="w-3 h-3" /> Reinstall
                            </button>
                            <button onClick={() => handleEiAction('uninstall')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--status-error)] disabled:opacity-50">
                                <Trash2 className="w-3 h-3" /> Uninstall
                            </button>
                        </>
                    )}
                </div>

                <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>.NET Runtime</span>
                        {dotnetStatus === null && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                            </div>
                        )}
                        {dotnetStatus?.available && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px]" style={{ color: 'var(--status-success)' }}>
                                <CheckCircle className="w-3 h-3" />
                                {dotnetStatus.version ? `v${dotnetStatus.version}` : 'Available'}
                                {dotnetStatus.managed && <span style={{ color: 'var(--text-muted)' }}> — managed</span>}
                            </div>
                        )}
                        {dotnetStatus && !dotnetStatus.available && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px]" style={{ color: 'var(--status-warning)' }}>
                                <AlertCircle className="w-3 h-3" /> Not found
                            </div>
                        )}
                    </div>
                    {dotnetStatus && !dotnetStatus.available && onOpenDotnetModal && (
                        <button
                            onClick={onOpenDotnetModal}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors bg-[color:var(--accent-bg)] text-[color:var(--brand-primary)] hover:bg-[color:var(--accent-bg-strong)]"
                        >
                            <Download className="w-3 h-3" /> Setup .NET
                        </button>
                    )}
                    {dotnetStatus?.available && (
                        <button
                            onClick={() => window.electronAPI?.eiCheckDotnet().then(setDotnetStatus).catch(() => {})}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--text-muted)]"
                            title="Re-check"
                        >
                            <RefreshCw className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </section>

            {/* Timeline Bucket Size */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Timeline</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-[color:var(--text-secondary)]">Bucket size:</span>
                    {[1000, 2000, 3000, 5000].map(ms => (
                        <button
                            key={ms}
                            onClick={() => setBucketSizeMs(ms)}
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                                bucketSizeMs === ms
                                    ? 'text-[color:var(--brand-primary)] bg-[color:var(--accent-bg)] border border-[color:var(--accent-border)]'
                                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]'
                            }`}
                        >
                            {ms / 1000}s
                        </button>
                    ))}
                </div>
            </section>

            {/* Debug */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2 flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5" /> Debug
                </h3>
                <p className="text-[11px] text-[color:var(--text-secondary)] mb-2">
                    Parse a random log from your log directory to test the full pipeline (Elite Insights, .NET, etc.).
                </p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDebugParse}
                        disabled={debugParsing || !logDirectory}
                        className="flex items-center gap-1.5 px-3 py-1 text-[11px] rounded transition-colors bg-white/5 border border-white/10 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-white/20 disabled:opacity-40"
                    >
                        {debugParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dices className="w-3 h-3" />}
                        Parse Random Log
                    </button>
                    {!logDirectory && (
                        <span className="text-[11px] text-[color:var(--text-muted)]">Set a log directory first</span>
                    )}
                </div>
                {debugResult && (
                    <div className={`mt-2 flex items-start gap-1.5 text-[11px] ${debugResult.ok ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-error)]'}`}>
                        {debugResult.ok
                            ? <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
                            : <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                        <span className="break-all">{debugResult.msg}</span>
                    </div>
                )}
            </section>

            {/* Links */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Links</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => window.electronAPI?.openExternal?.('https://discord.gg/UjzMXMGXEg')}
                        className="flex items-center gap-1.5 px-3 py-1 text-[11px] rounded-full border border-white/10 bg-white/5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-white/20 transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" /> Discord
                    </button>
                    <button
                        onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/axipulse')}
                        className="flex items-center gap-1.5 px-3 py-1 text-[11px] rounded-full border border-white/10 bg-white/5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-white/20 transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" /> GitHub
                    </button>
                </div>
            </section>

            {IS_DEV && (
                <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                        <Dices className="w-3.5 h-3.5" /> Dev Tools
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-[color:var(--text-secondary)]">Min file size (KB):</span>
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
                            className="w-24 px-2 py-1 text-xs rounded text-[color:var(--text-primary)] outline-none focus:ring-1 focus:ring-amber-400/50"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                        />
                        {devMinFileSize > 0 && (
                            <span className="text-[11px] text-amber-300">
                                ≥ {devMinFileSize >= 1024 ? `${(devMinFileSize / 1024).toFixed(1)} MB` : `${devMinFileSize} KB`}
                            </span>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
