import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { X, Loader2, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store';

type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn';

interface Step {
    id: string;
    label: string;
    status: StepStatus;
    detail?: string;
    fix?: string;
}

const INITIAL_STEPS: Step[] = [
    { id: 'log-dir', label: 'Log directory configured', status: 'pending' },
    { id: 'log-files', label: 'Logs found in directory', status: 'pending' },
    { id: 'arcdps', label: 'arcdps WvW logging', status: 'pending' },
    { id: 'parse', label: 'Parse test', status: 'pending' },
];

function StepIcon({ status }: { status: StepStatus }) {
    switch (status) {
        case 'running':
            return <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--axi-accent)' }} />;
        case 'pass':
            return <span className="ap-status-dot ap-status-dot--ok flex-shrink-0" />;
        case 'fail':
            return <span className="ap-status-dot ap-status-dot--danger flex-shrink-0" />;
        case 'warn':
            return <span className="ap-status-dot ap-status-dot--warn flex-shrink-0" />;
        default:
            return <span className="ap-status-dot ap-status-dot--idle flex-shrink-0" />;
    }
}

interface Props {
    onClose: () => void;
}

export function TroubleshootModal({ onClose }: Props) {
    const logDirectory = useAppStore(s => s.logDirectory);
    const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
    const [done, setDone] = useState(false);
    const runId = useRef(0);

    const update = (id: string, patch: Partial<Step>, currentRun: number) => {
        if (currentRun !== runId.current) return;
        setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    };

    const run = async () => {
        const id = ++runId.current;
        setSteps(INITIAL_STEPS);
        setDone(false);

        const u = (stepId: string, patch: Partial<Step>) => update(stepId, patch, id);

        // Step 1: Log directory configured
        u('log-dir', { status: 'running' });
        await delay(300);
        if (!logDirectory) {
            u('log-dir', {
                status: 'fail',
                detail: 'No log directory set.',
                fix: 'Go to Settings → Log Directory and click Browse to select your arcdps log folder.',
            });
            if (id !== runId.current) return;
            setDone(true);
            return;
        }
        const parts = logDirectory.replace(/\\/g, '/').split('/').filter(Boolean);
        const shortPath = parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : logDirectory;
        u('log-dir', { status: 'pass', detail: shortPath });

        // Step 2: Logs found
        u('log-files', { status: 'running' });
        await delay(400);
        const logCheck = await window.electronAPI?.troubleshootCheckLogDir(logDirectory);
        if (id !== runId.current) return;
        if (!logCheck?.exists) {
            u('log-files', {
                status: 'fail',
                detail: 'Directory does not exist or cannot be read.',
                fix: 'Verify the path is correct and that the folder exists.',
            });
        } else if (logCheck.count === 0) {
            u('log-files', {
                status: 'warn',
                detail: 'No .evtc or .zevtc files found.',
                fix: 'Play a WvW session with arcdps installed. Logs are saved after each fight ends.',
            });
        } else {
            u('log-files', { status: 'pass', detail: 'Logs found' });
        }

        // Step 3: arcdps WvW setting
        u('arcdps', { status: 'running' });
        await delay(500);
        const arcdps = await window.electronAPI?.troubleshootCheckArcdps();
        if (id !== runId.current) return;
        if (!arcdps?.found) {
            u('arcdps', {
                status: 'warn',
                detail: 'arcdps config not found.',
                fix: 'Could not locate arcdps.ini. Ensure arcdps is installed. In-game press Alt+Shift+T, go to Logging, and enable "Save WvW Encounters".',
            });
        } else if (!arcdps.wvwEnabled) {
            u('arcdps', {
                status: 'fail',
                detail: 'WvW logging is disabled.',
                fix: 'In-game press Alt+Shift+T to open arcdps options, go to Logging, and enable "Save WvW Encounters".',
            });
        } else {
            u('arcdps', { status: 'pass', detail: 'WvW logging is enabled' });
        }

        // Step 4: Parse test — read current step state to decide whether to skip
        const freshSteps = await new Promise<Step[]>(resolve => {
            setSteps(prev => { resolve(prev); return prev; });
        });
        if (id !== runId.current) return;
        const freshLogFiles = freshSteps.find(s => s.id === 'log-files');

        u('parse', { status: 'running' });
        await delay(300);

        if (freshLogFiles?.status !== 'pass') {
            u('parse', { status: 'pending', detail: 'Skipped — no logs to parse.' });
        } else {
            const result = await window.electronAPI?.troubleshootParseTest();
            if (id !== runId.current) return;
            if (result?.success) {
                const filename = result.logPath?.split(/[\\/]/).pop() ?? '';
                u('parse', { status: 'pass', detail: `Parsed ${filename}`, fix: undefined });
            } else {
                u('parse', {
                    status: 'fail',
                    detail: result?.error ?? 'Parse failed.',
                    fix: 'The log may be truncated or from an unsupported arcdps build. Try another log.',
                });
            }
        }

        if (id !== runId.current) return;
        setDone(true);
    };

    useEffect(() => { run(); }, []);

    const hasFailures = steps.some(s => s.status === 'fail');
    const hasWarnings = steps.some(s => s.status === 'warn');

    const summary = !done ? null
        : hasFailures ? { label: 'Issues found', color: 'var(--axi-danger)' }
        : hasWarnings ? { label: 'Warnings', color: 'var(--axi-warn)' }
        : { label: 'All checks passed', color: 'var(--axi-ok)' };

    return (
        <div className="axi-scrim flex items-center justify-center">
            <div className="axi-panel w-full max-w-md" style={{ '--axi-panel-pad': 0 } as CSSProperties}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: 'var(--axi-border-hairline) solid var(--axi-rule)' }}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-0.5 h-4" style={{ background: 'var(--axi-accent)' }} />
                        <span style={{ font: 'var(--axi-t-label)', letterSpacing: 'var(--axi-ls-label)', textTransform: 'uppercase', color: 'var(--axi-text)' }}>
                            Troubleshoot
                        </span>
                    </div>
                    <button onClick={onClose} className="ap-icon-btn">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Steps */}
                <div className="px-5 py-4 space-y-1">
                    {steps.map((step) => (
                        <div key={step.id}>
                            <div className="flex items-start gap-3 py-2">
                                <div className="mt-0.5">
                                    <StepIcon status={step.status} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-3 min-w-0">
                                        <span className="text-xs flex-shrink-0" style={{ color: step.status === 'pending' ? 'var(--axi-text-faint)' : 'var(--axi-text)' }}>
                                            {step.label}
                                        </span>
                                        {step.detail && (
                                            <span className="text-[11px] truncate min-w-0 text-right" style={{
                                                color: step.status === 'pass' ? 'var(--axi-ok)'
                                                    : step.status === 'fail' ? 'var(--axi-danger)'
                                                    : step.status === 'warn' ? 'var(--axi-warn)'
                                                    : 'var(--axi-text-faint)',
                                            }}>
                                                {step.detail}
                                            </span>
                                        )}
                                    </div>
                                    {step.fix && (step.status === 'fail' || step.status === 'warn') && (
                                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] px-2 py-1.5" style={{ background: 'var(--axi-ground)', color: 'var(--axi-text-dim)' }}>
                                            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--axi-accent)' }} />
                                            <span>{step.fix}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* separator */}
                            <div style={{ height: 'var(--axi-border-hairline)', background: 'var(--axi-rule)', marginLeft: '28px' }} />
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 pb-5 pt-3">
                    {summary && (
                        <span className="text-[11px] font-medium" style={{ color: summary.color }}>
                            {summary.label}
                        </span>
                    )}
                    {!summary && <span />}
                    <div className="flex gap-2">
                        {done && (
                            <button
                                onClick={run}
                                className="axi-btn axi-btn--primary"
                            >
                                Run Again
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--ghost"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
