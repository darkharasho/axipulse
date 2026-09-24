// Resolve a CSS custom property to a literal colour string.
//
// Needed only where a colour cannot be spelled as var(): SVG presentation
// ATTRIBUTES do not parse var() (`<svg fill="var(--x)">` renders black), and
// recharts forwards its `fill`/`stroke`/`tick` props straight to those
// attributes. Everywhere else - every style={{}} object, every CSS rule -
// use var() directly.
//
// Series tokens are accent-independent and may be read once at module scope.
// Chrome tokens (--axi-accent, --axi-text-faint, ...) change with the
// accent, so a component reading one must re-read when the accent changes.
export function readToken(name: string, fallback = 'currentColor'): string {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return value || fallback;
}
