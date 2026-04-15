import { useAppStore, type PulseSubview } from '../store';
import { SubviewCapsule } from '../app/SubviewCapsule';
import { OverviewSubview } from './pulse/OverviewSubview';
import { DamageSubview } from './pulse/DamageSubview';
import { SupportSubview } from './pulse/SupportSubview';
import { DefenseSubview } from './pulse/DefenseSubview';
import { BoonsSubview } from './pulse/BoonsSubview';
import { Activity } from 'lucide-react';

const PULSE_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'damage', label: 'Damage' },
    { id: 'support', label: 'Support' },
    { id: 'defense', label: 'Defense' },
    { id: 'boons', label: 'Boons' },
];

export function PulseView() {
    const currentFight = useAppStore(s => s.currentFight);
    const subview = useAppStore(s => s.pulseSubview);
    const setPulseSubview = useAppStore(s => s.setPulseSubview);

    if (!currentFight) {
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

    return (
        <>
            <div className="mb-3">
                <SubviewCapsule
                    pills={PULSE_PILLS}
                    activeId={subview}
                    onSelect={(id) => setPulseSubview(id as PulseSubview)}
                    layoutGroup="pulse"
                />
            </div>
            {subview === 'overview' && <OverviewSubview data={currentFight} />}
            {subview === 'damage' && <DamageSubview data={currentFight} />}
            {subview === 'support' && <SupportSubview data={currentFight} />}
            {subview === 'defense' && <DefenseSubview data={currentFight} />}
            {subview === 'boons' && <BoonsSubview data={currentFight} />}
        </>
    );
}
