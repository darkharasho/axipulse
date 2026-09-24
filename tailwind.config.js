/** @type {import('tailwindcss').Config} */
// This file stays CommonJS (`module.exports`) because package.json declares no
// `"type": "module"`, so a `.js` file here is loaded as CJS.
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        // Every colour in this app comes from an --axi-* token, so Tailwind
        // ships no colour palette. `transparent` and `currentColor` stay
        // because they are not colours, they are pass-throughs.
        colors: { transparent: 'transparent', current: 'currentColor' },
        borderRadius: { none: '0' },
        extend: {},
    },
    plugins: [],
}
