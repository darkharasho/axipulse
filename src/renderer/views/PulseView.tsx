// src/renderer/views/PulseView.tsx
import { useAppStore } from '../store';
import { OverviewSubview } from './pulse/OverviewSubview';
import { DamageSubview } from './pulse/DamageSubview';
import { SupportSubview } from './pulse/SupportSubview';
import { DefenseSubview } from './pulse/DefenseSubview';
import { BoonsSubview } from './pulse/BoonsSubview';
import { Activity } from 'lucide-react';

export function PulseView() {
    const currentFight = useAppStore(s => s.currentFight);
    const subview = useAppStore(s => s.pulseSubview);

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

    switch (subview) {
        case 'overview': return <OverviewSubview data={currentFight} />;
        case 'damage': return <DamageSubview data={currentFight} />;
        case 'support': return <SupportSubview data={currentFight} />;
        case 'defense': return <DefenseSubview data={currentFight} />;
        case 'boons': return <BoonsSubview data={currentFight} />;
    }
}
