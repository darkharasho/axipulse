// src/renderer/store.ts
import { create } from 'zustand';
import type { PlayerFightData, FightHistoryEntry } from '../shared/types';

export type View = 'pulse' | 'timeline' | 'map' | 'history' | 'settings';
export type PulseSubview = 'overview' | 'damage' | 'support' | 'defense' | 'boons';
export type MapSubview = 'overview' | 'movement';
export type TimelinePreset = 'why-died' | 'my-damage' | 'support' | 'show-all' | 'custom';

export interface TimelineLayerToggles {
    health: boolean;
    damageDealt: boolean;
    damageTaken: boolean;
    distanceToTag: boolean;
    incomingHealing: boolean;
    incomingBarrier: boolean;
    offensiveBoons: boolean;
    defensiveBoons: boolean;
    hardCC: boolean;
    softCC: boolean;
}

const PRESET_TOGGLES: Record<Exclude<TimelinePreset, 'custom' | 'show-all'>, TimelineLayerToggles> = {
    'why-died': {
        health: true, damageDealt: false, damageTaken: true,
        distanceToTag: true, incomingHealing: false, incomingBarrier: false,
        offensiveBoons: false, defensiveBoons: true, hardCC: true, softCC: true,
    },
    'my-damage': {
        health: true, damageDealt: true, damageTaken: false,
        distanceToTag: false, incomingHealing: false, incomingBarrier: false,
        offensiveBoons: true, defensiveBoons: false, hardCC: false, softCC: false,
    },
    'support': {
        health: false, damageDealt: false, damageTaken: false,
        distanceToTag: false, incomingHealing: true, incomingBarrier: true,
        offensiveBoons: true, defensiveBoons: true, hardCC: false, softCC: false,
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
    mapSubview: MapSubview;
    setMapSubview: (subview: MapSubview) => void;
    timelinePreset: TimelinePreset;
    setTimelinePreset: (preset: TimelinePreset) => void;
    timelineToggles: TimelineLayerToggles;
    setTimelineToggle: (layer: keyof TimelineLayerToggles, enabled: boolean) => void;
    applyPreset: (preset: Exclude<TimelinePreset, 'custom'>) => void;
    bucketSizeMs: number;
    setBucketSizeMs: (ms: number) => void;
    timelineSelection: { startMs: number; endMs: number } | null;
    setTimelineSelection: (selection: { startMs: number; endMs: number } | null) => void;

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

    whatsNewRequest: { version: string; markdown: string | null } | null;
    requestWhatsNew: (req: { version: string; markdown: string | null }) => void;
    clearWhatsNew: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentFight: null,
    setCurrentFight: (fight) => set({ currentFight: fight, activeFightNumber: fight.fightNumber }),

    sessionHistory: [],
    pushToHistory: (entry) => set((state) => ({
        sessionHistory: [entry, ...state.sessionHistory.filter(e => e.fightNumber !== entry.fightNumber)],
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
    mapSubview: 'overview',
    setMapSubview: (subview) => set({ mapSubview: subview }),
    timelinePreset: 'show-all',
    setTimelinePreset: (preset) => set({ timelinePreset: preset }),

    timelineToggles: {
        health: true, damageDealt: true, damageTaken: true,
        distanceToTag: true, incomingHealing: true, incomingBarrier: true,
        offensiveBoons: true, defensiveBoons: true, hardCC: true, softCC: true,
    },
    setTimelineToggle: (layer, enabled) => set((state) => ({
        timelineToggles: { ...state.timelineToggles, [layer]: enabled },
        timelinePreset: 'custom',
    })),
    applyPreset: (preset) => {
        if (preset === 'show-all') {
            const all: TimelineLayerToggles = {
                health: true, damageDealt: true, damageTaken: true,
                distanceToTag: true, incomingHealing: true, incomingBarrier: true,
                offensiveBoons: true, defensiveBoons: true, hardCC: true, softCC: true,
            };
            set({ timelineToggles: all, timelinePreset: preset });
        } else {
            set({ timelineToggles: { ...PRESET_TOGGLES[preset] }, timelinePreset: preset });
        }
    },
    bucketSizeMs: 1000,
    setBucketSizeMs: (ms) => set({ bucketSizeMs: ms }),
    timelineSelection: null,
    setTimelineSelection: (selection) => set({ timelineSelection: selection }),

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

    whatsNewRequest: null,
    requestWhatsNew: (req) => set({ whatsNewRequest: req }),
    clearWhatsNew: () => set({ whatsNewRequest: null }),
}));
