/**
 * Generates the four FLOW keyframe screenshots from the live Visual Lab.
 *
 * Reliable, not a full E2E suite: it boots the dev server, opens the lab at a
 * fixed set of parameters, lets a few frames paint, and captures PNGs. Run with:
 *
 *   npm run screenshot:flow
 *
 * IMPLEMENTATION NOTE
 * -------------------
 * Playwright cannot run on this platform (Termux reports as `android`, and
 * Playwright's registry refuses to launch on it). Instead we drive the *system*
 * chromium directly via its built-in headless screenshot mode, which renders
 * the canvas, advances virtual time so requestAnimationFrame ticks fire, then
 * captures the window. Point CHROMIUM_PATH at a different binary if needed.
 *
 * Set BASE_URL to point at an already-running server instead of booting one.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/data/data/com.termux/files/usr/bin/chromium-headless-shell',
  '/data/data/com.termux/files/usr/bin/chromium',
  'chromium',
  'chromium-browser',
  'google-chrome',
];
const CHROMIUM = CANDIDATES.find((p) => {
  if (!p) return false;
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!CHROMIUM) {
  console.error('[screenshot:flow] no chromium binary found; set CHROMIUM_PATH.');
  process.exit(1);
}
console.log(`[screenshot:flow] using chromium: ${CHROMIUM}`);

// `clean=1` hides the control panel so the captures are bare posters.
const SHOTS = [
  { name: 'flow-desktop-keyframe.png', viewport: { width: 1440, height: 900 }, query: 'clean=1&paused=1&progress=0.52&time=6&seed=1204' },
  { name: 'flow-desktop-motion.png', viewport: { width: 1440, height: 900 }, query: 'clean=1&paused=0&progress=0.52&time=6&seed=1204' },
  { name: 'flow-mobile-keyframe.png', viewport: { width: 390, height: 844 }, query: 'clean=1&paused=1&progress=0.52&time=6&seed=1204' },
  { name: 'flow-debug-paths.png', viewport: { width: 1440, height: 900 }, query: 'clean=1&paused=1&progress=0.52&time=6&seed=1204&debug=1' },
];

const VIRTUAL_TIME_BUDGET = process.env.VTB || '3000';

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/Local:\s+(\S+)/);
      if (match) resolve({ server, url: match[1] });
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('error', reject);
    setTimeout(() => reject(new Error('dev server did not start in time')), 60000);
  });
}

function runChromium(url, shot) {
  const out = path.join(ARTIFACTS, shot.name);
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${shot.viewport.width},${shot.viewport.height}`,
      `--virtual-time-budget=${VIRTUAL_TIME_BUDGET}`,
      `--screenshot=${out}`,
      `${url}/?lab=flow&${shot.query}`,
    ];
    const child = spawn(CHROMIUM, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(out)) {
        resolve(out);
      } else {
        reject(new Error(`chromium exited ${code} for ${shot.name}\n${stderr.slice(-500)}`));
      }
    });
  });
}

async function main() {
  const baseUrl = process.env.BASE_URL;
  let server = null;
  let url = baseUrl;

  if (!url) {
    const started = await startServer();
    server = started.server;
    url = started.url;
  }
  console.log(`[screenshot:flow] using ${url}`);

  try {
    for (const shot of SHOTS) {
      const out = await runChromium(url, shot);
      console.log(`[screenshot:flow] wrote ${out}`);
    }
  } finally {
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error('[screenshot:flow] failed:', error.message || error);
  process.exit(1);
});
