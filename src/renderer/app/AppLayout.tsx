import { Activity, Clock3, GanttChart, Minus, Settings as SettingsIcon, Square, X } from 'lucide-react';
import type { View } from '../App';

interface AppLayoutProps {
    view: View;
    setView: (view: View) => void;
}

const NAV_ITEMS: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'pulse', label: 'Pulse', icon: Activity },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'history', label: 'History', icon: Clock3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function AppLayout({ view, setView }: AppLayoutProps) {
    return (
        <div className="h-full w-full flex flex-col select-none">
            {/* Title Bar */}
            <div
                className="h-11 shrink-0 w-full flex justify-between items-center px-4 border-b drag-region"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
            >
                <div className="flex items-center gap-2.5">
                    <img
                        src="./img/axipulse-white.png"
                        alt="AxiPulse"
                        className="h-4 w-auto object-contain opacity-90"
                        draggable={false}
                    />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Axi</span>
                        <span style={{ color: 'var(--brand-primary)' }}>Pulse</span>
                    </span>
                </div>
                <div className="flex items-center gap-4 no-drag">
                    <button
                        onClick={() => window.electronAPI?.windowControl('minimize')}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.windowControl('maximize')}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <Square className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.windowControl('close')}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Nav Bar */}
            <div
                className="flex items-center px-3 py-1.5 gap-1 border-b shrink-0"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
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

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">
                {view === 'pulse' && <PulseView />}
                {view === 'timeline' && <GanttChartView />}
                {view === 'history' && <HistoryView />}
                {view === 'settings' && <SettingsView />}
            </div>
        </div>
    );
}

function PulseView() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
            <Activity className="w-12 h-12 opacity-30" />
            <div className="text-center">
                <p className="text-sm font-medium text-[color:var(--text-secondary)]">Waiting for combat data</p>
                <p className="text-xs mt-1">Set your arcdps log directory in Settings to begin</p>
            </div>
        </div>
    );
}

function GanttChartView() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
            <GanttChart className="w-12 h-12 opacity-30" />
            <div className="text-center">
                <p className="text-sm font-medium text-[color:var(--text-secondary)]">Fight GanttChart</p>
                <p className="text-xs mt-1">GanttChart analysis will appear here after a fight is parsed</p>
            </div>
        </div>
    );
}

function HistoryView() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
            <Clock3 className="w-12 h-12 opacity-30" />
            <div className="text-center">
                <p className="text-sm font-medium text-[color:var(--text-secondary)]">Session History</p>
                <p className="text-xs mt-1">Past fights from this session will appear here</p>
            </div>
        </div>
    );
}

function SettingsView() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
            <SettingsIcon className="w-12 h-12 opacity-30" />
            <div className="text-center">
                <p className="text-sm font-medium text-[color:var(--text-secondary)]">Settings</p>
                <p className="text-xs mt-1">Configure your log directory and parser settings</p>
            </div>
        </div>
    );
}
