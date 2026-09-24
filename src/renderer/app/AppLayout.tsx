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

    useFightListener();

    useEffect(() => {
        window.electronAPI?.getSettings().then(s => {
            if (s.logDirectory) useAppStore.getState().setLogDirectory(s.logDirectory);
        });
        window.electronAPI?.getAppVersion().then((v: string) => setAppVersion(v));
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
            const result = await window.electronAPI?.getReleaseNotes?.(appVersion, lastSeen ?? null);
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
        <div className="axi-window select-none">
            {/* Title Bar */}
            <div className="axi-titlebar draggable px-4 justify-between">
                <div className="flex items-center gap-2.5">
                    <img src="./img/axipulse-glyph.svg" alt="AxiPulse" className="h-5 w-5 object-contain opacity-90" draggable={false} />
                    <span className="axi-brand">
                        <span style={{ color: 'var(--axi-text)' }}>Axi</span>
                        <span style={{ color: 'var(--axi-accent)' }}>Pulse</span>
                    </span>
                    {currentFight && (
                        <span className="ml-1 axi-chip axi-chip--accent">
                            F{currentFight.fightNumber}
                        </span>
                    )}
                    {currentFight && (
                        <span className="text-[10px] truncate max-w-[300px]" style={{ color: 'var(--axi-text-dim)' }}>
                            {currentFight.mapName}
                            {currentFight.nearestLandmark && <> — {currentFight.nearestLandmark}</>}
                            {' — '}{currentFight.durationFormatted}
                            {' — '}{currentFight.eliteSpec || currentFight.profession}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 no-drag">
                    {isParsing && currentFight && (
                        <Activity className="w-4 h-4 ap-work" style={{ color: 'var(--axi-accent)' }} />
                    )}
                    <div className="flex items-center gap-2">
                        <AnimatePresence>
                            {updateDownloaded ? (
                                <motion.button
                                    key="restart"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="axi-chip axi-chip--accent"
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
                                    className={updateStatus.includes('failed') ? 'axi-chip' : 'axi-chip axi-chip--accent'}
                                >
                                    <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Up to date') || updateStatus.includes('failed') ? '' : 'animate-spin'}`} />
                                    {updateStatus}
                                </motion.span>
                            )}
                        </AnimatePresence>
                        {appVersion && (
                            <span
                                className="axi-chip cursor-pointer select-none"
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
                    <div className="axi-titlebar__btns">
                        <button onClick={() => window.electronAPI?.windowControl('minimize')}>
                            <Minus className="w-4 h-4" />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl('maximize')}>
                            <Square className="w-3 h-3" />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl('close')}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Nav Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--axi-ink-line)', background: 'var(--axi-surface-raised)' }}>
                <div className="flex items-center gap-1">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            title={label}
                            onClick={() => setView(id)}
                            className={`ap-navbtn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${view === id ? 'ap-navbtn--active' : ''}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {IS_DEV && (
                    <span title="Parse random log (Ctrl+Shift+P)" onClick={() => window.electronAPI?.devParseRandom()} className="cursor-pointer transition-colors" style={{ color: 'var(--axi-warn)' }}>
                        <Dices className="w-4 h-4" />
                    </span>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">
                {isFirstParse ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Activity className="w-10 h-10 ap-work" style={{ color: 'var(--axi-accent)' }} />
                        <span className="text-sm" style={{ color: 'var(--axi-text-dim)' }}>Parsing combat log...</span>
                    </div>
                ) : (
                    <>
                        {view === 'pulse' && <PulseView />}
                        {view === 'timeline' && <TimelineView />}
                        {view === 'map' && <MapView />}
                        {view === 'history' && <HistoryView />}
                        {view === 'settings' && <SettingsView />}
                    </>
                )}
            </div>

            <ToastContainer />
            <WhatsNewModal
                open={whatsNewRequest !== null}
                version={whatsNewRequest?.version ?? ''}
                markdown={whatsNewRequest?.markdown ?? null}
                onClose={handleWhatsNewClose}
            />
        </div>
    );
}
