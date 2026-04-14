// src/renderer/views/timeline/TimelinePresets.ts
import type { TimelineLayerToggles } from '../../store';

export interface TimelineLayer {
    key: keyof TimelineLayerToggles;
    label: string;
    color: string;
    chartType: 'line' | 'area' | 'band' | 'marker';
}

export const TIMELINE_LAYERS: TimelineLayer[] = [
    { key: 'distanceToTag', label: 'Distance to Tag', color: '#f59e0b', chartType: 'line' },
    { key: 'damageDealt', label: 'Damage Dealt', color: '#ef4444', chartType: 'area' },
    { key: 'damageTaken', label: 'Damage Taken', color: '#f87171', chartType: 'area' },
    { key: 'incomingHealing', label: 'Incoming Healing', color: '#4ade80', chartType: 'area' },
    { key: 'incomingBarrier', label: 'Incoming Barrier', color: '#a78bfa', chartType: 'area' },
    { key: 'boonUptime', label: 'Boon Uptime', color: '#38bdf8', chartType: 'band' },
    { key: 'boonGeneration', label: 'Boon Generation', color: '#818cf8', chartType: 'band' },
    { key: 'ccDealtReceived', label: 'CC Dealt/Received', color: '#fb923c', chartType: 'marker' },
];
