import { describe, it, expect, vi, afterEach } from 'vitest';
import { readToken } from '../../src/renderer/themes/readToken';

const stubComputed = (values: Record<string, string>) => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: (n: string) => values[n] ?? '',
    }));
};

afterEach(() => vi.unstubAllGlobals());

describe('readToken', () => {
    it('returns the computed value, trimmed', () => {
        stubComputed({ '--axi-accent': '  #34d399 ' });
        expect(readToken('--axi-accent')).toBe('#34d399');
    });

    // Review Focus 3: getPropertyValue returns '' for an undefined
    // property, and '' handed to a recharts `fill` renders black.
    it('returns the fallback for a token that does not exist', () => {
        stubComputed({});
        expect(readToken('--axi-typo', '#ff00ff')).toBe('#ff00ff');
    });

    it('returns currentColor when no fallback is given', () => {
        stubComputed({});
        expect(readToken('--axi-typo')).toBe('currentColor');
    });
});
