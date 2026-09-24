import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = () => readFileSync(resolve('src/renderer/index.css'), 'utf8');

// Comments routinely name a hex while explaining why it was chosen, and a
// naive scan would read that as a violation - a false failure that teaches
// people to stop writing the comments. Replace each comment with the
// newlines it spanned so offenders are still reported at their true line.
const stripComments = (css: string) =>
    css.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));

// CSS is not line-oriented: `border:\n  7px solid ...` is the same
// declaration as its one-line form and must be judged identically. Split on
// the only three characters that end a declaration or selector.
const declarations = (css: string): Array<{ text: string; line: number }> => {
    const clean = stripComments(css);
    const out: Array<{ text: string; line: number }> = [];
    let start = 0;
    let line = 1;
    for (let i = 0; i <= clean.length; i++) {
        const ch = clean[i];
        if (i === clean.length || ch === ';' || ch === '{' || ch === '}') {
            const raw = clean.slice(start, i);
            const lead = raw.match(/^\s*/)![0];
            const text = raw.slice(lead.length);
            if (text.trim()) out.push({ text, line: line + (lead.match(/\n/g) || []).length });
            start = i + 1;
            line += (raw.match(/\n/g) || []).length;
        }
    }
    return out;
};

const valueOf = (text: string) => {
    const i = text.indexOf(':');
    return i === -1 ? '' : text.slice(i + 1);
};

// Only the VALUES of colour-carrying properties are scanned. Scanning whole
// lines would false-positive on `#root`.
const COLOUR_PROPERTY =
    /^(color|background(-image|-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|outline-color|box-shadow|text-shadow|filter|fill|stroke|caret-color|column-rule-color|text-decoration-color|accent-color|scrollbar-color)\s*:/i;

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|color-mix|oklch|lab)\s*\(/i;

// A border/outline WEIGHT property: the shorthand, -width, or any
// longhand side - but not -radius, -color, -style, -collapse, -spacing,
// or outline-offset (a position knob, not a weight).
const WEIGHT_PROPERTY =
    /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|outline(-width)?)\s*:/i;

const LITERAL_WEIGHT = /(^|[\s(])\d*\.?\d+(px|rem|em|pt)\b/i;

// Form tokens are theme surface, defined once in the package. A local
// redeclaration would mint an arbitrary third form step - and a blur, via a
// redefined offset - while every other check below stayed green, because
// they read the var() name a declaration spells, never what it is worth.
const FORM_TOKEN_DECLARATION = /^(--axi-(border|offset|radius)[a-z0-9-]*)\s*:/i;

const OFFSET_TOKENS = [
    '--axi-offset-control',
    '--axi-offset-control-hover',
    '--axi-offset-panel',
    '--axi-offset-panel-hover',
];

describe('src/renderer/index.css obeys the axi-design contract', () => {
    it('carries no colour literal in any colour-carrying value', () => {
        const bad = declarations(CSS())
            .filter((d) => COLOUR_PROPERTY.test(d.text) && COLOUR_LITERAL.test(valueOf(d.text)))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('has no border-radius', () => {
        const bad = declarations(CSS())
            .filter((d) => /^border-radius\s*:/i.test(d.text))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('draws every box-shadow offset from the four offset tokens, with no blur', () => {
        const bad: string[] = [];
        for (const d of declarations(CSS())) {
            if (!/^box-shadow\s*:/i.test(d.text)) continue;
            const value = valueOf(d.text);
            if (/^\s*(none|inherit|initial|unset)\s*$/i.test(value)) continue;
            const tokens = [...value.matchAll(/var\(\s*(--axi-offset-[a-z-]+)/g)].map((m) => m[1]);
            const ok = tokens.length > 0 && tokens.every((t) => OFFSET_TOKENS.includes(t));
            // Any bare length that is not `0` is either a rogue offset or a
            // blur radius; both are the thing this check exists to catch.
            const bareLength = /(^|[\s(])\d*\.?\d+(px|rem|em)\b/i.test(
                value.replace(/var\([^)]*\)/g, '').replace(/calc\([^)]*\)/g, ''),
            );
            if (!ok || bareLength) bad.push(`${d.line}: ${d.text.trim()}`);
        }
        expect(bad).toEqual([]);
    });

    it('never uses drop-shadow or text-shadow', () => {
        expect(stripComments(CSS())).not.toMatch(/drop-shadow\s*\(/i);
        expect(stripComments(CSS())).not.toMatch(/(^|[\s;{])text-shadow\s*:/i);
    });

    it('takes every border and outline weight from a token', () => {
        const bad = declarations(CSS())
            .filter((d) => WEIGHT_PROPERTY.test(d.text) && LITERAL_WEIGHT.test(valueOf(d.text)))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('never redeclares a Form-layer token locally', () => {
        const bad = declarations(CSS())
            .filter((d) => FORM_TOKEN_DECLARATION.test(d.text))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('declares no font-family and imports no webfont', () => {
        const clean = stripComments(CSS());
        expect(clean).not.toMatch(/font-family\s*:/i);
        expect(clean).not.toMatch(/@import\s+url\(/i);
    });

    // Un-skip this in the final task, when the last shim row is gone.
    it.skip('no longer carries the legacy shim', () => {
        expect(CSS()).not.toMatch(/LEGACY SHIM/);
    });
});
