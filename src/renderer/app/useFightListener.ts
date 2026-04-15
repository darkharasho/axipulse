import { useEffect } from 'react';
import { useAppStore } from '../store';
import { extractPlayerFightData } from '../../shared/extractPlayerData';
import type { EiJson, FightHistoryEntry } from '../../shared/types';

export function useFightListener() {
    useEffect(() => {
        const cleanupStarted = window.electronAPI?.onParseStarted(() => {
            useAppStore.getState().setIsParsing(true);
        });

        const cleanupComplete = window.electronAPI?.onParseComplete((data) => {
            const state = useAppStore.getState();
            state.setIsParsing(false);
            const json = data.data as EiJson;
            const fightNumber = state.incrementFightCounter();
            const fightData = extractPlayerFightData(json, fightNumber, state.bucketSizeMs);

            const toHistoryEntry = (fight: typeof fightData): FightHistoryEntry => ({
                fightNumber: fight.fightNumber,
                fightLabel: fight.fightLabel,
                timestamp: fight.timestamp,
                profession: fight.profession,
                eliteSpec: fight.eliteSpec,
                duration: fight.duration,
                durationFormatted: fight.durationFormatted,
                quickStats: {
                    damage: fight.damage.totalDamage,
                    deaths: fight.defense.deaths,
                    strips: fight.support.boonStrips,
                    dps: fight.damage.dps,
                },
                data: fight,
            });

            state.setCurrentFight(fightData);
            state.pushToHistory(toHistoryEntry(fightData));
            state.addToast('Fight parsed successfully', fightData.fightLabel);
        });

        const cleanupError = window.electronAPI?.onParseError((data) => {
            const state = useAppStore.getState();
            state.setIsParsing(false);
            state.addToast('Parse failed', data.error);
        });

        return () => {
            cleanupStarted?.();
            cleanupComplete?.();
            cleanupError?.();
        };
    }, []);
}
