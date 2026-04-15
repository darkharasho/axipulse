import type { TimelineLayerToggles } from '../../store';

export interface TimelineLayer {
    key: keyof TimelineLayerToggles;
    label: string;
    color: string;
    type: 'area' | 'bars';
}

export const TIMELINE_LANES: TimelineLayer[] = [
    { key: 'health', label: 'Health', color: '#10b981', type: 'area' },
    { key: 'damageDealt', label: 'Dmg Dealt', color: '#ef4444', type: 'area' },
    { key: 'damageTaken', label: 'Dmg Taken', color: '#f87171', type: 'area' },
    { key: 'distanceToTag', label: 'Dist to Tag', color: '#f59e0b', type: 'area' },
    { key: 'incomingHealing', label: 'Healing', color: '#4ade80', type: 'area' },
    { key: 'incomingBarrier', label: 'Barrier', color: '#a78bfa', type: 'area' },
    { key: 'offensiveBoons', label: 'Off Boons', color: '#60a5fa', type: 'bars' },
    { key: 'defensiveBoons', label: 'Def Boons', color: '#38bdf8', type: 'bars' },
    { key: 'hardCC', label: 'Hard CC', color: '#f43f5e', type: 'bars' },
    { key: 'softCC', label: 'Soft CC', color: '#c084fc', type: 'bars' },
];

export const PRESET_LABELS: { key: string; label: string }[] = [
    { key: 'why-died', label: 'Why did I die?' },
    { key: 'my-damage', label: 'My Damage' },
    { key: 'support', label: 'Am I Getting Support?' },
    { key: 'show-all', label: 'Show All' },
];
