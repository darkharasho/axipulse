import { describe, it, expect } from 'vitest';
import { loadNativeFixture } from './oracle';

/**
 * The drift guard. This app requests explicit parse flags rather than
 * `everything: true`, so it must fail loudly if axilog ever moves a
 * surface it reads behind a new gate.
 */
const BLOCKS_THIS_APP_READS = [
    'damage', 'defenses', 'cc', 'boons', 'support',
    'contribution', 'healing', 'rotation', 'replay', 'series',
] as const;

describe('parse-option coverage', () => {
    it.each(BLOCKS_THIS_APP_READS)('computes the %s block', (block) => {
        expect(loadNativeFixture().coverage[block]).toBe('present');
    });
});
