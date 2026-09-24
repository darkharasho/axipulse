import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

    // A colour literal hidden in a custom property and consumed through var()
    // is invisible to the check above, which only scans the values of real
    // colour-carrying properties. That indirection is exactly the shape of the
    // legacy :root block this app layer replaced (--brand-gradient,
    // --accent-bg), so it is the way a forbidden concept would come back.
    it('hides no colour literal inside a custom property', () => {
        const bad = declarations(CSS())
            .filter((d) => /^--[\w-]+\s*:/.test(d.text) && COLOUR_LITERAL.test(valueOf(d.text)))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('declares no font-family and imports no webfont', () => {
        const clean = stripComments(CSS());
        expect(clean).not.toMatch(/font-family\s*:/i);
        expect(clean).not.toMatch(/@import\s+url\(/i);
    });

    it('no longer carries the legacy shim', () => {
        expect(CSS()).not.toMatch(/LEGACY SHIM/);
    });
});

// stripComments above only removes /* */. TSX uses // freely, and a comment
// that mentions a hex or the word "rounded" while explaining a decision must
// not read as a violation.
const stripLineComments = (text: string) =>
    text.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const clean = (file: string) => stripLineComments(stripComments(readFileSync(file, 'utf8')));

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });

const RENDERER = resolve('src/renderer');
const SERIES = resolve('src/renderer/themes/series.css');

const sourceFiles = () =>
    walk(RENDERER).filter((p) => /\.(tsx?|css)$/.test(p) && p !== SERIES);

describe('the whole renderer obeys the axi-design contract', () => {
    it('names no colour literal outside series.css', () => {
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                // accents.json supplies the swatch colours in SettingsView:
                // a colour picker must show the colour it selects, which no
                // token can express. That value is read from the package's
                // own JSON, never spelled here.
                if (/a\.hex/.test(line)) return;
                if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\s*\(/i.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('uses no rounded utility and declares no border-radius', () => {
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                if (/\brounded(-[a-z0-9[\]]+)?\b|border-radius\s*:/.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('uses no Tailwind palette colour utility', () => {
        const PALETTE =
            /\b(text|bg|border|from|to|via|ring|divide|fill|stroke|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-[0-9]{2,3})?\b/;
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                if (PALETTE.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('declares no font-family and imports no webfont anywhere', () => {
        for (const file of sourceFiles()) {
            const text = clean(file);
            expect(text, file).not.toMatch(/fontFamily\s*:|font-family\s*:/);
            expect(text, file).not.toMatch(/@import\s+url\(/);
        }
    });
});

// Why this test exists, and what breaks if it fails:
//
// readToken() reads getComputedStyle(), so it only returns a real value once
// a stylesheet has been applied. ES modules evaluate in IMPORT-DECLARATION
// ORDER, and the renderer's whole component tree is statically imported
// (App -> AppLayout -> PulseView -> BoonsSubview -> BoonPerformanceChart,
// with no lazy() anywhere), so every one of those module bodies runs the
// instant `import App from './App.tsx'` is evaluated.
//
// If that App import is ever moved back ABOVE the four CSS imports, those
// module bodies run before any stylesheet exists and every readToken call
// reachable from them silently resolves to its 'currentColor' fallback -
// chart series, profession colours, timeline inks, all flattened to one ink.
//
// The failure is invisible to every other check in this repo: `npm run
// build` stays green, because Vite emits the stylesheet <link> ahead of the
// module <script> in the built index.html, so production applies CSS first
// regardless of import order. Only `npm run dev` is broken, and only a human
// looking at the screen would notice. This test is the only automated guard.
describe('main.tsx loads its stylesheets before the app', () => {
    it('imports all four stylesheets ahead of App', () => {
        const main = readFileSync(resolve('src/renderer/main.tsx'), 'utf8');
        const lines = stripLineComments(stripComments(main)).split('\n');

        const lineOf = (needle: RegExp) => {
            const i = lines.findIndex((l) => /^\s*import\b/.test(l) && needle.test(l));
            expect(i, `no import line matching ${needle}`).toBeGreaterThanOrEqual(0);
            return i;
        };

        const app = lineOf(/from\s+['"]\.\/App(\.tsx)?['"]/);

        for (const sheet of [/axi-design\/axi\.css/, /axi-design\/accents\.css/,
            /['"]\.\/index\.css['"]/, /['"]\.\/themes\/series\.css['"]/]) {
            expect(lineOf(sheet), `${sheet} must be imported before App`).toBeLessThan(app);
        }
    });
});
