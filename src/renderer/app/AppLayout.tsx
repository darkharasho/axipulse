// src/renderer/app/AppLayout.tsx
import { Activity, Clock3, GanttChart, Minus, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { useAppStore, type View, type PulseSubview, type TimelinePreset } from '../store';
import { SubviewToggle, SubviewPillExpansion } from './SubviewPillBar';
import { ToastContainer } from './Toast';

const NAV_ITEMS: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'pulse', label: 'Pulse', icon: Activity },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'history', label: 'History', icon: Clock3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const PULSE_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'damage', label: 'Damage' },
    { id: 'support', label: 'Support' },
    { id: 'defense', label: 'Defense' },
    { id: 'boons', label: 'Boons' },
];

const TIMELINE_PILLS = [
    { id: 'why-died', label: 'Why did I die?' },
    { id: 'my-damage', label: 'My damage' },
    { id: 'support', label: 'Am I getting support?' },
    { id: 'positioning', label: 'Positioning' },
    { id: 'custom', label: 'Custom' },
];

export function AppLayout() {
    const view = useAppStore(s => s.view);
    const setView = useAppStore(s => s.setView);
    const pulseSubview = useAppStore(s => s.pulseSubview);
    const setPulseSubview = useAppStore(s => s.setPulseSubview);
    const timelinePreset = useAppStore(s => s.timelinePreset);
    const setTimelinePreset = useAppStore(s => s.setTimelinePreset);
    const applyPreset = useAppStore(s => s.applyPreset);
    const activeFightNumber = useAppStore(s => s.activeFightNumber);

    const hasSubviews = view === 'pulse' || view === 'timeline';
    const pills = view === 'pulse' ? PULSE_PILLS : view === 'timeline' ? TIMELINE_PILLS : [];
    const activeSubviewId = view === 'pulse' ? pulseSubview : view === 'timeline' ? timelinePreset : '';

    const handleSubviewSelect = (id: string) => {
        if (view === 'pulse') {
            setPulseSubview(id as PulseSubview);
        } else if (view === 'timeline') {
            if (id !== 'custom') {
                applyPreset(id as Exclude<TimelinePreset, 'custom'>);
            }
            setTimelinePreset(id as TimelinePreset);
        }
    };

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
                    {activeFightNumber !== null && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded border"
                            style={{ color: 'var(--brand-primary)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }}>
                            F{activeFightNumber}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 no-drag">
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
                {hasSubviews && (
                    <SubviewToggle pills={pills} activeId={activeSubviewId} />
                )}
            </div>

            {/* Subview pill expansion area */}
            {hasSubviews && (
                <SubviewPillExpansion pills={pills} activeId={activeSubviewId} onSelect={handleSubviewSelect} />
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">
                {view === 'pulse' && <PlaceholderView label="Pulse" sublabel={pulseSubview} />}
                {view === 'timeline' && <PlaceholderView label="Timeline" sublabel={timelinePreset} />}
                {view === 'history' && <PlaceholderView label="History" />}
                {view === 'settings' && <PlaceholderView label="Settings" />}
            </div>

            <ToastContainer />
        </div>
    );
}

function PlaceholderView({ label, sublabel }: { label: string; sublabel?: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-[color:var(--text-muted)]">
            <p className="text-sm font-medium text-[color:var(--text-secondary)]">{label}</p>
            {sublabel && <p className="text-xs">{sublabel}</p>}
        </div>
    );
}
