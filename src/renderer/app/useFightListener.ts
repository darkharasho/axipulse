// src/renderer/app/useFightListener.ts
import { useEffect } from 'react';
import { useAppStore } from '../store';
import { extractPlayerFightData } from '../../shared/extractPlayerData';
import type { EiJson, FightHistoryEntry } from '../../shared/types';

export function useFightListener() {
    const setCurrentFight = useAppStore(s => s.setCurrentFight);
    const pushToHistory = useAppStore(s => s.pushToHistory);
    const currentFight = useAppStore(s => s.currentFight);
    const incrementFightCounter = useAppStore(s => s.incrementFightCounter);
    const addToast = useAppStore(s => s.addToast);
    const bucketSizeMs = useAppStore(s => s.bucketSizeMs);

    useEffect(() => {
        const cleanup = window.electronAPI?.onParseComplete((data) => {
            const json = data.data as EiJson;
            const fightNumber = incrementFightCounter();
            const fightData = extractPlayerFightData(json, fightNumber, bucketSizeMs);

            // Push current fight to history before replacing
            if (currentFight) {
                const historyEntry: FightHistoryEntry = {
                    fightNumber: currentFight.fightNumber,
                    fightLabel: currentFight.fightLabel,
                    timestamp: currentFight.timestamp,
                    profession: currentFight.profession,
                    eliteSpec: currentFight.eliteSpec,
                    duration: currentFight.duration,
                    durationFormatted: currentFight.durationFormatted,
                    quickStats: {
                        damage: currentFight.damage.totalDamage,
                        deaths: currentFight.defense.deaths,
                        strips: currentFight.support.boonStrips,
                        dps: currentFight.damage.dps,
                    },
                    data: currentFight,
                };
                pushToHistory(historyEntry);
            }

            setCurrentFight(fightData);
            addToast('Fight parsed successfully', fightData.fightLabel);
        });

        return cleanup;
    }, [currentFight, bucketSizeMs]);
}
