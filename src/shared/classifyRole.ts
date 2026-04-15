import type { EiPlayer } from './types';
import { getHealingOutput } from './combatMetrics';
import { getDps, getDamage, getCleanses, getDownContribution } from './dashboardMetrics';

export interface RoleClassification {
    role: 'support' | 'damage';
    supportScore: number;
    confidenceScore: number;
}

const WEIGHTS = {
    healing: 1.8,
    cleanses: 1.6,
    totalBoonOutput: 1.8,
    dps: -0.8,
    damage: -1.5,
    downContrib: -2.5,
} as const;

const THRESHOLD_MULTIPLIER = 1.25;
const OUTLIER_RATIO = 2.0;

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeRatio(value: number, median: number): number {
    if (median > 0) return value / median;
    if (value > 0) return OUTLIER_RATIO;
    return 0;
}

function getOutgoingHealing(player: EiPlayer): number {
    const total = getHealingOutput(player);
    if (!player.extHealingStats?.outgoingHealingAllies) return 0;
    let selfHealing = 0;
    const selfPhase = player.extHealingStats.outgoingHealingAllies[0];
    if (selfPhase) {
        for (const phase of selfPhase) {
            selfHealing += phase.healing;
        }
    }
    return Math.max(total - selfHealing, 0);
}

function getTotalBoonOutput(player: EiPlayer): number {
    let total = 0;
    for (const buff of player.squadBuffs ?? []) {
        total += buff.buffData[0]?.generation ?? 0;
    }
    return total;
}

export function classifySquadRoles(players: EiPlayer[]): Map<string, RoleClassification> {
    const result = new Map<string, RoleClassification>();
    if (players.length === 0) return result;

    const metricDefs = [
        { weight: WEIGHTS.healing, getValue: getOutgoingHealing },
        { weight: WEIGHTS.cleanses, getValue: getCleanses },
        { weight: WEIGHTS.totalBoonOutput, getValue: getTotalBoonOutput },
        { weight: WEIGHTS.dps, getValue: getDps },
        { weight: WEIGHTS.damage, getValue: getDamage },
        { weight: WEIGHTS.downContrib, getValue: getDownContribution },
    ];

    const medians = metricDefs.map(def => {
        const values = players.map(p => def.getValue(p)).filter(v => v > 0);
        return computeMedian(values);
    });

    const scores = players.map(p => {
        let supportScore = 0;
        for (let i = 0; i < metricDefs.length; i++) {
            const value = metricDefs[i].getValue(p);
            const ratio = computeRatio(value, medians[i]);
            supportScore += ratio * metricDefs[i].weight;
        }
        return { account: p.account, supportScore };
    });

    const allScores = scores.map(s => s.supportScore);
    const medianScore = computeMedian(allScores);
    const threshold = medianScore + Math.abs(medianScore) * (THRESHOLD_MULTIPLIER - 1);

    const maxScore = Math.max(...allScores);
    const minScore = Math.min(...allScores);
    const supportSpan = Math.abs(maxScore - threshold) || 1;
    const damageSpan = Math.abs(threshold - minScore) || 1;

    for (const { account, supportScore } of scores) {
        const role: 'support' | 'damage' = supportScore > threshold ? 'support' : 'damage';
        const span = role === 'support' ? supportSpan : damageSpan;
        const confidenceScore = Math.min(Math.abs(supportScore - threshold) / span, 1);
        result.set(account, { role, supportScore, confidenceScore });
    }

    return result;
}
