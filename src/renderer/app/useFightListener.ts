import { useEffect } from 'react';
import { useAppStore } from '../store';
import { extractPlayerFightData } from '../../shared/extractPlayerData';
import type { EiJson, FightHistoryEntry } from '../../shared/types';

export function useFightListener() {
    useEffect(() => {
        const cleanup = window.electronAPI?.onParseComplete((data) => {
            const state = useAppStore.getState();
            const json = data.data as EiJson;
            const fightNumber = state.incrementFightCounter();
            const fightData = extractPlayerFightData(json, fightNumber, state.bucketSizeMs);

            if (state.currentFight) {
                const prev = state.currentFight;
                const historyEntry: FightHistoryEntry = {
                    fightNumber: prev.fightNumber,
                    fightLabel: prev.fightLabel,
                    timestamp: prev.timestamp,
                    profession: prev.profession,
                    eliteSpec: prev.eliteSpec,
                    duration: prev.duration,
                    durationFormatted: prev.durationFormatted,
                    quickStats: {
                        damage: prev.damage.totalDamage,
                        deaths: prev.defense.deaths,
                        strips: prev.support.boonStrips,
                        dps: prev.damage.dps,
                    },
                    data: prev,
                };
                state.pushToHistory(historyEntry);
            }

            state.setCurrentFight(fightData);
            state.addToast('Fight parsed successfully', fightData.fightLabel);
        });

        return cleanup;
    }, []);
}
