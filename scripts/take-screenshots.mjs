import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

const ROOT = process.cwd();
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const MAIN_ENTRY = path.join(ROOT, 'dist-electron', 'main', 'index.js');
const HOME = process.env.HOME || process.env.USERPROFILE;

// Read the real app config to get the log directory
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
  console.error('Run the app normally and configure your log directory first.');
  process.exit(1);
}

// Playwright launches Electron with app name "Electron", so it uses
// ~/.config/Electron/ instead of ~/.config/<appname>/. We symlink the
// real config dir's contents into the Playwright profile so EI and
// settings are available.
const playwrightConfigDir = path.join(HOME, '.config', 'Electron');
fs.mkdirSync(playwrightConfigDir, { recursive: true });

// Symlink elite-insights directory if it exists
const realEiDir = path.join(realConfigDir, 'elite-insights');
const pwEiDir = path.join(playwrightConfigDir, 'elite-insights');
if (fs.existsSync(realEiDir) && !fs.existsSync(pwEiDir)) {
  fs.symlinkSync(realEiDir, pwEiDir);
  console.log('Symlinked EI installation to Playwright profile');
}

console.log('Using log directory:', logDirectory);
console.log('Launching app...');

const app = await electron.launch({
  args: [MAIN_ENTRY],
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
});

const window = await app.firstWindow();
await window.waitForLoadState('domcontentloaded');
await window.waitForTimeout(3000);

// Configure log directory in the Playwright profile's store
await window.evaluate((dir) => {
  window.electronAPI.saveSettings({ logDirectory: dir });
}, logDirectory);
await window.waitForTimeout(1000);

console.log('Triggering demo data parse...');
const result = await window.evaluate(() => window.electronAPI.devParseRandom());
console.log('Parse result:', JSON.stringify(result));

if (result?.error) {
  console.error('Parse failed:', result.error);
  await app.close();
  process.exit(1);
}

console.log('Waiting for fight data to load (up to 2.5 min)...');
let dataLoaded = false;
for (let i = 0; i < 30; i++) {
  await window.waitForTimeout(5000);
  const fightBadge = await window.evaluate(() => {
    const els = document.querySelectorAll('span');
    for (const el of els) {
      if (/^F\d+$/.test(el.textContent?.trim() ?? '')) return true;
    }
    return false;
  });
  const parsing = await window.$('text=Parsing combat log...');
  console.log(`  Check ${i + 1}/30: parsing=${!!parsing}, fightLoaded=${fightBadge}`);
  if (fightBadge) {
    dataLoaded = true;
    console.log('Fight data loaded!');
    break;
  }
}

if (!dataLoaded) {
  console.log('Warning: fight data may not have loaded, capturing anyway...');
}

await window.waitForTimeout(1500);

console.log('Capturing Pulse view...');
await window.screenshot({ path: path.join(SCREENSHOT_DIR, 'pulse-overview.png') });

console.log('Navigating to Timeline...');
const timelineBtn = await window.$('button:has-text("Timeline")');
if (timelineBtn) {
  await timelineBtn.click();
  await window.waitForTimeout(2000);
}

console.log('Capturing Timeline view...');
await window.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline-view.png') });

await app.close();
console.log(`Done — screenshots saved to ${SCREENSHOT_DIR}`);
