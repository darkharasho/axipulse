// Capture marketing-site screenshots from a real AxiPulse run.
//
// Usage:  npm run build && node scripts/take-marketing-screenshots.mjs
//
// Mirrors scripts/take-screenshots.mjs (which feeds the README) but walks
// every view AxiPulse exposes and writes into marketing/assets/screenshots/.

import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT_DIR = path.join(ROOT, 'marketing', 'assets', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MAIN_ENTRY = path.join(ROOT, 'dist-electron', 'main', 'index.js');
if (!fs.existsSync(MAIN_ENTRY)) {
  console.error(`Build output missing: ${MAIN_ENTRY}\nRun: npm run build`);
  process.exit(1);
}

const HOME = process.env.HOME || process.env.USERPROFILE;
const APP_NAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).name;
const realConfigDir = path.join(HOME, '.config', APP_NAME);
const realConfigPath = path.join(realConfigDir, 'config.json');

let logDirectory = '';
if (fs.existsSync(realConfigPath)) {
  const config = JSON.parse(fs.readFileSync(realConfigPath, 'utf-8'));
  logDirectory = config.logDirectory || '';
}
if (!logDirectory) {
  console.error('No log directory found in app config at', realConfigPath);
  console.error('Run AxiPulse normally and configure your log directory first.');
  process.exit(1);
}

// Playwright launches Electron with app name "Electron" → ~/.config/Electron/.
// Symlink the Elite Insights install from the real profile so the parser is
// available without a fresh download.
const playwrightConfigDir = path.join(HOME, '.config', 'Electron');
fs.mkdirSync(playwrightConfigDir, { recursive: true });
const realEiDir = path.join(realConfigDir, 'elite-insights');
const pwEiDir = path.join(playwrightConfigDir, 'elite-insights');
if (fs.existsSync(realEiDir) && !fs.existsSync(pwEiDir)) {
  fs.symlinkSync(realEiDir, pwEiDir);
  console.log('[shots] symlinked Elite Insights install');
}

const env = { ...process.env, NODE_ENV: 'development' };
delete env.VITE_DEV_SERVER_URL;
delete env.ELECTRON_RUN_AS_NODE;

console.log('[shots] launching AxiPulse');
const app = await electron.launch({ args: [MAIN_ENTRY], env });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2500);

// Force the window into the canonical 900x700 layout used by the README and
// match-saved bounds, so marketing shots are consistent across runs.
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return;
  w.unmaximize();
  w.setSize(1100, 760);
  w.center();
});
await win.waitForTimeout(500);

// Configure log directory in the Playwright profile.
await win.evaluate((dir) => {
  window.electronAPI.saveSettings({ logDirectory: dir });
}, logDirectory);
await win.waitForTimeout(800);

console.log('[shots] triggering demo data parse');
const result = await win.evaluate(() => window.electronAPI.devParseRandom());
if (result?.error) {
  console.error('Parse failed:', result.error);
  await app.close();
  process.exit(1);
}

// Wait for a fight badge to appear (matches existing take-screenshots.mjs).
console.log('[shots] waiting for fight data (up to 2.5 min)');
let loaded = false;
for (let i = 0; i < 30; i++) {
  await win.waitForTimeout(5000);
  const ready = await win.evaluate(() => {
    const els = document.querySelectorAll('span');
    for (const el of els) {
      if (/^F\d+$/.test(el.textContent?.trim() ?? '')) return true;
    }
    return false;
  });
  console.log(`  check ${i + 1}/30: loaded=${ready}`);
  if (ready) { loaded = true; break; }
}
if (!loaded) console.warn('[shots] data may not have loaded; capturing anyway');
await win.waitForTimeout(1500);

async function shot(name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await win.screenshot({ path: file });
  console.log(`[shots]   wrote ${name}.png`);
}

async function gotoView(label) {
  const clicked = await win.evaluate((text) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === text);
    if (btn) { btn.click(); return true; }
    return false;
  }, label);
  if (!clicked) console.warn(`[shots] couldn't click ${label}`);
  await win.waitForTimeout(1600);
}

// 1. Pulse — also serves as hero-app.png.
console.log('[shots] capturing Pulse');
await gotoView('Pulse');
await shot('pulse');
fs.copyFileSync(path.join(OUT_DIR, 'pulse.png'), path.join(OUT_DIR, 'hero-app.png'));

// 2. Timeline.
console.log('[shots] capturing Timeline');
await gotoView('Timeline');
await shot('timeline');

// 3. Map.
console.log('[shots] capturing Map');
await gotoView('Map');
// Map view might do an extra render pass — give it a beat longer.
await win.waitForTimeout(1500);
await shot('map');

// 4. History.
console.log('[shots] capturing History');
await gotoView('History');
await shot('history');

// 5. Settings.
console.log('[shots] capturing Settings');
await gotoView('Settings');
await shot('settings');

await app.close();
console.log(`[shots] done — ${OUT_DIR}`);
