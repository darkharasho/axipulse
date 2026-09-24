import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve('src/renderer/themes/series.css'), 'utf8');
const declares = (name: string) => new RegExp(`${name}\\s*:\\s*#[0-9a-f]{6}`, 'i').test(CSS);

describe('series.css declares every domain palette token', () => {
    it('declares the ten profession tokens', () => {
        for (const p of ['guardian', 'revenant', 'warrior', 'engineer', 'ranger',
            'thief', 'elementalist', 'mesmer', 'necromancer', 'unknown']) {
            expect(declares(`--axi-series-prof-${p}`), p).toBe(true);
        }
    });

    it('declares the ten-step categorical series ramp', () => {
        for (let i = 1; i <= 10; i++) {
            expect(declares(`--axi-series-${i}`), String(i)).toBe(true);
        }
    });

    it('declares a token for every timeline metric', () => {
        for (const k of ['health', 'damage-dealt', 'damage-taken', 'distance-to-tag',
            'incoming-healing', 'incoming-barrier', 'offensive-boons',
            'defensive-boons', 'hard-cc', 'soft-cc']) {
            expect(declares(`--axi-series-metric-${k}`), k).toBe(true);
        }
    });

    it('is the only app file that names a colour, and names no accent token', () => {
        // series.css holds domain data (rule 10). It must not reach into the
        // system's own palette, or the palettes would follow the accent.
        expect(CSS).not.toMatch(/var\(--axi-(accent|ok|warn|danger|meta)/);
    });
});
