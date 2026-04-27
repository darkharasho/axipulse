import { useEffect, useState } from 'react';
import { Activity, Clock3, Dices, GanttChart, MapPin, Minus, RefreshCw, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore, type View } from '../store';
import { ToastContainer } from './Toast';
import { PulseView } from '../views/PulseView';
import { TimelineView } from '../views/TimelineView';
import { MapView } from '../views/MapView';
import { HistoryView } from '../views/HistoryView';
import { SettingsView } from '../views/SettingsView';
import { useFightListener } from './useFightListener';
import { DotnetModal } from './DotnetModal';
import { WhatsNewModal } from '../WhatsNewModal';

const NAV_ITEMS: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'pulse', label: 'Pulse', icon: Activity },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'history', label: 'History', icon: Clock3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const IS_DEV = import.meta.env.DEV;

export function AppLayout() {
    const view = useAppStore(s => s.view);
    const setView = useAppStore(s => s.setView);
    const isParsing = useAppStore(s => s.isParsing);
    const currentFight = useAppStore(s => s.currentFight);
    const whatsNewRequest = useAppStore(s => s.whatsNewRequest);
    const requestWhatsNew = useAppStore(s => s.requestWhatsNew);
    const clearWhatsNew = useAppStore(s => s.clearWhatsNew);

    const [appVersion, setAppVersion] = useState<string | null>(null);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<string | null>(null);
    const [showDotnetModal, setShowDotnetModal] = useState(false);

    useFightListener();

    useEffect(() => {
        window.electronAPI?.getSettings().then(s => {
            if (s.logDirectory) useAppStore.getState().setLogDirectory(s.logDirectory);
        });
        window.electronAPI?.getAppVersion().then((v: string) => setAppVersion(v));
        window.electronAPI?.eiCheckDotnet().then((result: { available: boolean }) => {
            if (!result.available) setShowDotnetModal(true);
        }).catch(() => {});
        const cleanupDownloaded = window.electronAPI?.onUpdateDownloaded(() => setUpdateDownloaded(true));
        let dismissTimer: ReturnType<typeof setTimeout>;
        let fallbackTimer: ReturnType<typeof setTimeout>;
        const showStatus = (msg: string, autoDismiss = false) => {
            clearTimeout(dismissTimer);
            clearTimeout(fallbackTimer);
            setUpdateStatus(msg);
            if (autoDismiss) dismissTimer = setTimeout(() => setUpdateStatus(null), 3000);
            else fallbackTimer = setTimeout(() => setUpdateStatus(null), 10000);
        };
        const cleanupChecking = window.electronAPI?.onUpdateChecking(() => showStatus('Checking for updates\u2026'));
        const cleanupAvailable = window.electronAPI?.onUpdateAvailable(() => showStatus('Downloading update\u2026'));
        const cleanupNotAvailable = window.electronAPI?.onUpdateNotAvailable(() => showStatus('Up to date', true));
        const cleanupError = window.electronAPI?.onUpdateError(() => showStatus('Update check failed', true));
        return () => {
            clearTimeout(dismissTimer);
            clearTimeout(fallbackTimer);
            cleanupDownloaded?.();
            cleanupChecking?.();
            cleanupAvailable?.();
            cleanupNotAvailable?.();
            cleanupError?.();
        };
    }, []);

    useEffect(() => {
        if (!IS_DEV) return;
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                window.electronAPI?.devParseRandom();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (!appVersion) return;
        let cancelled = false;
        (async () => {
            const lastSeen = await window.electronAPI?.getLastSeenVersion?.();
            if (cancelled) return;
            if (lastSeen === appVersion) return;
            const result = await window.electronAPI?.getReleaseNotes?.(appVersion);
            if (cancelled) return;
            if (result?.markdown) {
                requestWhatsNew({ version: appVersion, markdown: result.markdown, source: 'auto' });
            } else {
                await window.electronAPI?.setLastSeenVersion?.(appVersion);
            }
        })();
        return () => { cancelled = true; };
    }, [appVersion, requestWhatsNew]);

    const handleWhatsNewClose = async () => {
        const wasAutoOpened = whatsNewRequest?.source === 'auto';
        clearWhatsNew();
        if (wasAutoOpened && appVersion) {
            await window.electronAPI?.setLastSeenVersion?.(appVersion);
        }
    };

    const isFirstParse = isParsing && !currentFight;

    return (
        <div className="h-full w-full flex flex-col select-none">
            {/* Title Bar */}
            <div
                className="h-11 shrink-0 w-full flex justify-between items-center px-4 border-b drag-region"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
            >
                <div className="flex items-center gap-2.5">
                    <img src="./img/axipulse-white.png" alt="AxiPulse" className="h-4 w-auto object-contain opacity-90" draggable={false} />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Axi</span>
                        <span style={{ color: 'var(--brand-primary)' }}>Pulse</span>
                    </span>
                    {currentFight && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded border"
                            style={{ color: 'var(--brand-primary)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }}>
                            F{currentFight.fightNumber}
                        </span>
                    )}
                    {currentFight && (
                        <span className="text-[10px] truncate max-w-[300px]" style={{ color: 'var(--text-secondary)' }}>
                            {currentFight.mapName}
                            {currentFight.nearestLandmark && <> — {currentFight.nearestLandmark}</>}
                            {' — '}{currentFight.durationFormatted}
                            {' — '}{currentFight.eliteSpec || currentFight.profession}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 no-drag">
                    {isParsing && currentFight && (
                        <Activity className="w-4 h-4 heartbeat-pulse" style={{ color: 'var(--brand-primary)' }} />
                    )}
                    <div className="flex items-center gap-2">
                        <AnimatePresence>
                            {updateDownloaded ? (
                                <motion.button
                                    key="restart"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="text-[10px] px-2 py-0.5 rounded-[4px] border font-medium transition-colors hover:brightness-110"
                                    style={{ color: 'var(--brand-primary)', borderColor: 'var(--brand-primary)', background: 'rgba(16, 185, 129, 0.1)' }}
                                    onClick={() => window.electronAPI?.restartApp()}
                                    title="Restart to install update"
                                >
                                    Restart to Update
                                </motion.button>
                            ) : updateStatus && (
                                <motion.span
                                    key="status"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-[10px] px-2 py-0.5 rounded-[4px] border flex items-center gap-1.5 font-medium"
                                    style={updateStatus.includes('failed')
                                        ? { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }
                                        : { color: 'var(--brand-primary)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }
                                    }
                                >
                                    <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Up to date') || updateStatus.includes('failed') ? '' : 'animate-spin'}`} />
                                    {updateStatus}
                                </motion.span>
                            )}
                        </AnimatePresence>
                        {appVersion && (
                            <span
                                className="text-[10px] px-2 py-0.5 rounded-[4px] border cursor-pointer select-none transition-colors hover:border-[color:var(--border-hover)]"
                                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
                                onClick={() => {
                                    if (!updateStatus && !updateDownloaded) {
                                        setUpdateStatus('Checking for updates\u2026');
                                        window.electronAPI?.checkForUpdates();
                                    }
                                }}
                                title="Check for updates"
                            >
                                v{appVersion}
                            </span>
                        )}
                    </div>
                    <button onClick={() => window.electronAPI?.windowControl('minimize')} className="text-gray-400 hover:text-white transition-colors">
                        <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.electronAPI?.windowControl('maximize')} className="text-gray-400 hover:text-white transition-colors">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => window.electronAPI?.windowControl('close')} className="text-gray-400 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Nav Bar */}
            <div
                className="flex items-center justify-between px-3 py-1.5 border-b shrink-0"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
                <div className="flex items-center gap-1">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            title={label}
                            onClick={() => setView(id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                view === id
                                    ? 'text-[color:var(--brand-primary)]'
                                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                            }`}
                            style={view === id ? { background: 'var(--accent-bg)' } : {}}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {IS_DEV && (
                    <span title="Parse random log (Ctrl+Shift+P)" onClick={() => window.electronAPI?.devParseRandom()} className="cursor-pointer text-amber-300 hover:text-amber-200 transition-colors">
                        <Dices className="w-4 h-4" />
                    </span>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">
                {isFirstParse ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Activity className="w-10 h-10 heartbeat-pulse" style={{ color: 'var(--brand-primary)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Parsing combat log...</span>
                    </div>
                ) : (
                    <>
                        {view === 'pulse' && <PulseView />}
                        {view === 'timeline' && <TimelineView />}
                        {view === 'map' && <MapView />}
                        {view === 'history' && <HistoryView />}
                        {view === 'settings' && <SettingsView onOpenDotnetModal={() => setShowDotnetModal(true)} />}
                    </>
                )}
            </div>

            <ToastContainer />
            <AnimatePresence>
                {showDotnetModal && <DotnetModal onDismiss={() => setShowDotnetModal(false)} />}
            </AnimatePresence>
            <WhatsNewModal
                open={whatsNewRequest !== null}
                version={whatsNewRequest?.version ?? ''}
                markdown={whatsNewRequest?.markdown ?? null}
                onClose={handleWhatsNewClose}
            />
        </div>
    );
}
