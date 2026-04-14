// src/renderer/store.ts
import { create } from 'zustand';
import type { PlayerFightData, FightHistoryEntry } from '../shared/types';

export type View = 'pulse' | 'timeline' | 'map' | 'history' | 'settings';
export type PulseSubview = 'overview' | 'damage' | 'support' | 'defense' | 'boons';
export type TimelinePreset = 'why-died' | 'my-damage' | 'support' | 'positioning' | 'custom';

export interface TimelineLayerToggles {
    distanceToTag: boolean;
    damageDealt: boolean;
    damageTaken: boolean;
    incomingHealing: boolean;
    incomingBarrier: boolean;
    boonUptime: boolean;
    boonGeneration: boolean;
    ccDealtReceived: boolean;
}

const PRESET_TOGGLES: Record<Exclude<TimelinePreset, 'custom'>, TimelineLayerToggles> = {
    'why-died': {
        distanceToTag: true, damageDealt: false, damageTaken: true,
        incomingHealing: true, incomingBarrier: true, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'my-damage': {
        distanceToTag: false, damageDealt: true, damageTaken: false,
        incomingHealing: false, incomingBarrier: false, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'support': {
        distanceToTag: false, damageDealt: false, damageTaken: false,
        incomingHealing: true, incomingBarrier: true, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'positioning': {
        distanceToTag: true, damageDealt: true, damageTaken: false,
        incomingHealing: false, incomingBarrier: false, boonUptime: false,
        boonGeneration: false, ccDealtReceived: false,
    },
};

interface AppState {
    currentFight: PlayerFightData | null;
    setCurrentFight: (fight: PlayerFightData) => void;

    sessionHistory: FightHistoryEntry[];
    pushToHistory: (entry: FightHistoryEntry) => void;
    loadFromHistory: (fightNumber: number) => void;
    activeFightNumber: number | null;

    view: View;
    setView: (view: View) => void;
    pulseSubview: PulseSubview;
    setPulseSubview: (subview: PulseSubview) => void;
    timelinePreset: TimelinePreset;
    setTimelinePreset: (preset: TimelinePreset) => void;
    pillBarExpanded: boolean;
    setPillBarExpanded: (expanded: boolean) => void;
    togglePillBar: () => void;

    timelineToggles: TimelineLayerToggles;
    setTimelineToggle: (layer: keyof TimelineLayerToggles, enabled: boolean) => void;
    applyPreset: (preset: Exclude<TimelinePreset, 'custom'>) => void;
    bucketSizeMs: number;
    setBucketSizeMs: (ms: number) => void;

    toasts: { id: string; message: string; fightLabel: string }[];
    addToast: (message: string, fightLabel: string) => void;
    removeToast: (id: string) => void;

    isParsing: boolean;
    setIsParsing: (parsing: boolean) => void;

    logDirectory: string;
    setLogDirectory: (dir: string) => void;
    eiStatus: { installed: boolean; version: string | null; installing: boolean; error: string | null };
    setEiStatus: (status: AppState['eiStatus']) => void;

    fightCounter: number;
    incrementFightCounter: () => number;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentFight: null,
    setCurrentFight: (fight) => set({ currentFight: fight, activeFightNumber: fight.fightNumber }),

    sessionHistory: [],
    pushToHistory: (entry) => set((state) => ({
        sessionHistory: [entry, ...state.sessionHistory],
    })),
    loadFromHistory: (fightNumber) => {
        const entry = get().sessionHistory.find(e => e.fightNumber === fightNumber);
        if (entry) {
            set({ currentFight: entry.data, activeFightNumber: fightNumber });
        }
    },
    activeFightNumber: null,

    view: 'pulse',
    setView: (view) => set({ view }),
    pulseSubview: 'overview',
    setPulseSubview: (subview) => set({ pulseSubview: subview }),
    timelinePreset: 'custom',
    setTimelinePreset: (preset) => set({ timelinePreset: preset }),
    pillBarExpanded: false,
    setPillBarExpanded: (expanded) => set({ pillBarExpanded: expanded }),
    togglePillBar: () => set((state) => ({ pillBarExpanded: !state.pillBarExpanded })),

    timelineToggles: {
        distanceToTag: true, damageDealt: true, damageTaken: true,
        incomingHealing: true, incomingBarrier: true, boonUptime: true,
        boonGeneration: true, ccDealtReceived: true,
    },
    setTimelineToggle: (layer, enabled) => set((state) => ({
        timelineToggles: { ...state.timelineToggles, [layer]: enabled },
        timelinePreset: 'custom',
    })),
    applyPreset: (preset) => set({
        timelineToggles: { ...PRESET_TOGGLES[preset] },
        timelinePreset: preset,
    }),
    bucketSizeMs: 1000,
    setBucketSizeMs: (ms) => set({ bucketSizeMs: ms }),

    toasts: [],
    addToast: (message, fightLabel) => {
        const id = `${Date.now()}-${Math.random()}`;
        set((state) => ({ toasts: [...state.toasts, { id, message, fightLabel }] }));
        setTimeout(() => get().removeToast(id), 4000);
    },
    removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id),
    })),

    isParsing: false,
    setIsParsing: (parsing) => set({ isParsing: parsing }),

    logDirectory: '',
    setLogDirectory: (dir) => set({ logDirectory: dir }),
    eiStatus: { installed: false, version: null, installing: false, error: null },
    setEiStatus: (status) => set({ eiStatus: status }),

    fightCounter: 0,
    incrementFightCounter: () => {
        const next = get().fightCounter + 1;
        set({ fightCounter: next });
        return next;
    },
}));
