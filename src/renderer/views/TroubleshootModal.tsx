import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
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
    { id: 'ei', label: 'Elite Insights installed', status: 'pending' },
    { id: 'dotnet', label: '.NET runtime available', status: 'pending' },
    { id: 'parse', label: 'Parse test', status: 'pending' },
];

function StepIcon({ status }: { status: StepStatus }) {
    switch (status) {
        case 'running':
            return <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />;
        case 'pass':
            return <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-success)' }} />;
        case 'fail':
            return <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-error)' }} />;
        case 'warn':
            return <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-warning)' }} />;
        default:
            return <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: '1px solid var(--border-default)' }} />;
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
            await runEiAndDotnet(id);
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

        // Steps 4 & 5: EI and .NET
        await runEiAndDotnet(id);
        if (id !== runId.current) return;

        // Step 6: Parse test — read current step state to decide whether to skip
        const freshSteps = await new Promise<Step[]>(resolve => {
            setSteps(prev => { resolve(prev); return prev; });
        });
        if (id !== runId.current) return;
        const freshLogFiles = freshSteps.find(s => s.id === 'log-files');
        const freshEi = freshSteps.find(s => s.id === 'ei');

        u('parse', { status: 'running' });
        await delay(300);

        if (freshLogFiles?.status !== 'pass' || freshEi?.status !== 'pass') {
            u('parse', { status: 'pending', detail: 'Skipped — requires logs and Elite Insights.' });
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
                    fix: 'Check that Elite Insights and .NET are both installed and working.',
                });
            }
        }

        if (id !== runId.current) return;
        setDone(true);
    };

    const runEiAndDotnet = async (id: number) => {
        const u = (stepId: string, patch: Partial<Step>) => update(stepId, patch, id);

        // EI
        u('ei', { status: 'running' });
        await delay(400);
        const eiStatus = await window.electronAPI?.eiGetStatus();
        if (id !== runId.current) return;
        if (!eiStatus?.installed) {
            u('ei', {
                status: 'fail',
                detail: 'Elite Insights is not installed.',
                fix: 'Go to Settings → Elite Insights and click Install.',
            });
        } else {
            u('ei', { status: 'pass', detail: eiStatus.version ? `v${eiStatus.version}` : 'Installed' });
        }

        // .NET
        u('dotnet', { status: 'running' });
        await delay(400);
        const dotnet = await window.electronAPI?.eiCheckDotnet().catch(() => null);
        if (id !== runId.current) return;
        if (!dotnet?.available) {
            u('dotnet', {
                status: 'fail',
                detail: '.NET 8 runtime not found.',
                fix: 'Go to Settings → Elite Insights and click "Setup .NET".',
            });
        } else {
            u('dotnet', { status: 'pass', detail: dotnet.version ? `v${dotnet.version}` : 'Available' });
        }
    };


    useEffect(() => { run(); }, []);

    const hasFailures = steps.some(s => s.status === 'fail');
    const hasWarnings = steps.some(s => s.status === 'warn');

    const summary = !done ? null
        : hasFailures ? { label: 'Issues found', color: 'var(--status-error)' }
        : hasWarnings ? { label: 'Warnings', color: 'var(--status-warning)' }
        : { label: 'All checks passed', color: 'var(--status-success)' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-0.5 h-4 rounded-full" style={{ background: 'var(--brand-primary)' }} />
                        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                            Troubleshoot
                        </span>
                    </div>
                    <button onClick={onClose} className="transition-opacity hover:opacity-60" style={{ color: 'var(--text-muted)' }}>
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
                                        <span className="text-xs flex-shrink-0" style={{ color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                            {step.label}
                                        </span>
                                        {step.detail && (
                                            <span className="text-[11px] truncate min-w-0 text-right" style={{
                                                color: step.status === 'pass' ? 'var(--status-success)'
                                                    : step.status === 'fail' ? 'var(--status-error)'
                                                    : step.status === 'warn' ? 'var(--status-warning)'
                                                    : 'var(--text-muted)',
                                            }}>
                                                {step.detail}
                                            </span>
                                        )}
                                    </div>
                                    {step.fix && (step.status === 'fail' || step.status === 'warn') && (
                                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] rounded px-2 py-1.5" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                                            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />
                                            <span>{step.fix}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* separator */}
                            <div style={{ height: '1px', background: 'var(--border-subtle)', marginLeft: '28px' }} />
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
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded transition-opacity hover:opacity-80"
                                style={{ background: 'var(--accent-bg)', color: 'var(--brand-primary)', border: '1px solid var(--accent-border)' }}
                            >
                                Run Again
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-[11px] rounded transition-opacity hover:opacity-80"
                            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
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
