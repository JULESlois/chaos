/**
 * Captures the rain, the forms it makes, and the television reveal.
 *
 *   npm run screenshot:rain
 *
 * Every frame here comes out of a lab that is running the real engine, so
 * these are photographs of the piece rather than illustrations of it. The labs
 * take their parameters from the query string and hold the field in a ref, so
 * `paused=1&time=N&seed=N` is reproducible: the same URL gives the same
 * picture on every run, which is the only reason a still of a thing that never
 * stops moving is worth keeping.
 *
 * The sequences are captured as numbered stills and then muxed with ffmpeg,
 * because there is no video capture on this platform. That is an advantage: a
 * WebM assembled from deterministic frames is itself deterministic, and a
 * dropped frame shows up as a missing file rather than as a stutter nobody
 * notices.
 *
 * IMPLEMENTATION NOTE
 * -------------------
 * Playwright will not run under Termux, so this drives the system chromium's
 * built-in headless screenshot mode directly, exactly as `screenshot-flow.mjs`
 * does. `--virtual-time-budget` advances requestAnimationFrame without waiting
 * in real time.
 *
 * Set BASE_URL to use an already-running dev server. Set CHROMIUM_PATH to
 * choose a different browser binary. Set SHOTS to a comma-separated list of
 * names to capture a subset.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
const FRAMES = path.join(ARTIFACTS, 'frames');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Held constant everywhere so every still is the same weather. */
const SEED = 2407;

/**
 * The stills.
 *
 * `clean=1` hides the lab's control panel, so what is captured is the field
 * and nothing else. `paused=1` freezes it at a named time rather than at
 * whenever the virtual clock happened to stop.
 */
const SHOTS = [
  {
    name: 'rain-current.png',
    lab: 'rain',
    viewport: DESKTOP,
    query: `clean=1&paused=1&time=9&progress=0.18&form=0&seed=${SEED}`,
  },
  {
    name: 'rain-face.png',
    lab: 'form',
    viewport: DESKTOP,
    query: `clean=1&paused=1&manual=1&time=11&face=1&figure=0&hand=0&seed=${SEED}`,
  },
  {
    name: 'rain-figure.png',
    lab: 'form',
    viewport: DESKTOP,
    query: `clean=1&paused=1&manual=1&time=11&face=0&figure=1&hand=0&seed=${SEED}`,
  },
  {
    name: 'rain-hand.png',
    lab: 'form',
    viewport: DESKTOP,
    query: `clean=1&paused=1&manual=1&time=11&face=0&figure=0&hand=1&seed=${SEED}`,
  },
  {
    // The one shot that keeps the panel: the mask channel inspector lives in
    // it, and the whole argument that these are behaviours rather than
    // drawings is only legible with the raw channel next to the field.
    name: 'rain-form-masks.png',
    lab: 'form',
    viewport: DESKTOP,
    query: `paused=1&manual=1&time=11&face=1&figure=0.6&hand=0.3&seed=${SEED}`,
  },
  {
    name: 'rain-chaos.png',
    lab: 'rain',
    viewport: DESKTOP,
    query: `clean=1&paused=1&time=14&progress=0.62&form=0.3&intensity=0.85&phaseError=0.7&maskDrift=0.6&directionInversion=0.5&repeat=0.4&collapse=0.2&seed=${SEED}`,
  },
  {
    name: 'rain-mobile.png',
    lab: 'rain',
    viewport: MOBILE,
    query: `clean=1&paused=1&time=9&progress=0.34&form=0.55&seed=${SEED}`,
  },
  {
    name: 'tv-reveal-00.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `clean=1&instant=1&progress=0&form=0.4&seed=${SEED}`,
  },
  {
    name: 'tv-reveal-35.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `clean=1&instant=1&progress=0.35&form=0.4&seed=${SEED}`,
  },
  {
    name: 'tv-reveal-70.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `clean=1&instant=1&progress=0.7&form=0.4&seed=${SEED}`,
  },
  {
    name: 'tv-reveal-100.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `clean=1&instant=1&progress=1&form=0.4&seed=${SEED}`,
  },
  {
    // Cropped to the cabinet afterwards — the controls are a small part of a
    // wide frame, and the point of this still is that they are physical
    // objects with light on them, which needs the pixels.
    name: 'tv-buttons.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `clean=1&instant=1&progress=1&form=0.4&seed=${SEED}`,
    crop: '620x300+410+520',
  },
  {
    // Panel on, edge grid on: this is the seam invariant photographed rather
    // than asserted. `covers viewport: yes` is printed in the readout.
    name: 'tv-reveal-seam.png',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    query: `instant=1&progress=0&grid=1&form=0.4&seed=${SEED}`,
  },
];

/**
 * The sequences.
 *
 * `rain-form-sequence` walks the FORM schedule so the face arrives, the figure
 * takes over and the hand reaches in — the point being that the rain is still
 * falling in every single frame. `tv-reveal` walks the camera out of the
 * picture.
 */
const SEQUENCES = [
  {
    name: 'rain-form-sequence.webm',
    lab: 'form',
    viewport: DESKTOP,
    frames: 36,
    fps: 12,
    query: (t) => `clean=1&paused=1&time=${(6 + t * 12).toFixed(3)}&progress=${t.toFixed(4)}&seed=${SEED}`,
  },
  {
    name: 'tv-reveal.webm',
    lab: 'tv-reveal',
    viewport: DESKTOP,
    frames: 36,
    fps: 12,
    query: (t) => `clean=1&instant=1&paused=1&time=${(6 + t * 12).toFixed(3)}&progress=${t.toFixed(4)}&form=0.4&seed=${SEED}`,
  },
];

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/data/data/com.termux/files/usr/bin/chromium-headless-shell',
  '/data/data/com.termux/files/usr/bin/chromium',
  'chromium',
  'chromium-browser',
  'google-chrome',
];
const CHROMIUM = CANDIDATES.find((candidate) => {
  if (!candidate) return false;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!CHROMIUM) {
  console.error('[screenshot:rain] no chromium binary found; set CHROMIUM_PATH.');
  process.exit(1);
}

const VIRTUAL_TIME_BUDGET = process.env.VTB || '3500';
/**
 * WebGL contexts are lost more or less at random in headless chromium here.
 * A lost context is a black frame, and a black frame in the middle of a
 * sequence is worse than a slow capture, so anything that comes out too dark
 * to be a picture is taken again.
 */
const ATTEMPTS = Number(process.env.ATTEMPTS || 3);
/** Below this standard deviation the frame has no picture in it. */
const MIN_VARIANCE = Number(process.env.MIN_VARIANCE || 3);
/** A capture takes ~15s here. Anything past this is a wedged renderer. */
const CAPTURE_TIMEOUT = Number(process.env.CAPTURE_TIMEOUT || 60000);

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (chunk) => {
      const match = chunk.toString().match(/Local:\s+(\S+)/);
      if (match) resolve({ server, url: match[1] });
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('error', reject);
    setTimeout(() => reject(new Error('dev server did not start in time')), 60000);
  });
}

/**
 * Runs a child and, optionally, gives up on it.
 *
 * The timeout is not defensive padding. A headless chromium that loses its
 * WebGL context here sometimes does not exit — it sits in a busy loop with the
 * screenshot never written, and without a deadline a 72-frame sequence stops
 * dead on frame 7 and stays there. Killing it and retrying costs seconds;
 * waiting costs the whole run.
 */
function run(binary, args, timeoutMs = 0) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timer = null;
    let timedOut = false;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }

    const done = (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', (error) => {
      stderr += String(error);
      done(-1);
    });
    child.on('close', (code) => done(timedOut ? -1 : code));
  });
}

/** Standard deviation of luminance. Zero means a flat frame — no picture. */
async function variance(file) {
  const result = await run('magick', [
    file,
    '-colorspace',
    'Gray',
    '-format',
    '%[fx:standard_deviation*255]',
    'info:',
  ]);
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : Infinity;
}

async function capture(url, { lab, viewport, query }, out) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    fs.rmSync(out, { force: true });
    const result = await run(
      CHROMIUM,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${viewport.width},${viewport.height}`,
        `--virtual-time-budget=${VIRTUAL_TIME_BUDGET}`,
        `--screenshot=${out}`,
        `${url}/?lab=${lab}&${query}`,
      ],
      CAPTURE_TIMEOUT,
    );

    if (result.timedOut) {
      console.log(`[screenshot:rain]   retry ${attempt}: chromium hung, killed`);
    }

    if (result.code !== 0 || !fs.existsSync(out)) {
      if (attempt === ATTEMPTS) {
        throw new Error(`chromium exited ${result.code}\n${result.stderr.slice(-400)}`);
      }
      continue;
    }

    const sd = await variance(out);
    if (sd >= MIN_VARIANCE || attempt === ATTEMPTS) return sd;
    console.log(`[screenshot:rain]   retry ${attempt}: frame was flat (sd ${sd.toFixed(1)})`);
  }
  return 0;
}

async function captureSequence(url, sequence) {
  const dir = path.join(FRAMES, sequence.name.replace(/\.webm$/, ''));
  fs.mkdirSync(dir, { recursive: true });

  for (let i = 0; i < sequence.frames; i += 1) {
    const t = sequence.frames === 1 ? 0 : i / (sequence.frames - 1);
    const out = path.join(dir, `${String(i).padStart(4, '0')}.png`);
    // Frames are deterministic, so one already on disk is the one this pass
    // would produce. A run that dies at frame 30 of 36 resumes at 30.
    if (!process.env.REDRAW && fs.existsSync(out)) continue;
    await capture(url, { ...sequence, query: sequence.query(t) }, out);
    if ((i + 1) % 6 === 0) console.log(`[screenshot:rain]   ${i + 1}/${sequence.frames}`);
  }

  const out = path.join(ARTIFACTS, sequence.name);
  fs.rmSync(out, { force: true });
  const encoded = await run('ffmpeg', [
    '-y',
    '-framerate',
    String(sequence.fps),
    '-i',
    path.join(dir, '%04d.png'),
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '34',
    '-pix_fmt',
    'yuv420p',
    out,
  ]);

  if (encoded.code !== 0 || !fs.existsSync(out)) {
    throw new Error(`ffmpeg failed for ${sequence.name}\n${encoded.stderr.slice(-400)}`);
  }
  return out;
}

async function main() {
  const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;
  const wanted = (name) => !only || only.has(name);

  let server = null;
  let url = process.env.BASE_URL;
  if (!url) {
    const started = await startServer();
    server = started.server;
    url = started.url;
  }
  console.log(`[screenshot:rain] using ${url}`);

  try {
    for (const shot of SHOTS) {
      if (!wanted(shot.name)) continue;
      const out = path.join(ARTIFACTS, shot.name);
      const sd = await capture(url, shot, out);
      if (shot.crop) {
        const cropped = await run('magick', [out, '-crop', shot.crop, '+repage', out]);
        if (cropped.code !== 0) throw new Error(`crop failed for ${shot.name}`);
      }
      const size = (fs.statSync(out).size / 1024).toFixed(0);
      console.log(`[screenshot:rain] ${shot.name}  ${size}kB  sd ${sd.toFixed(1)}`);
    }

    if (process.env.SKIP_VIDEO) return;
    for (const sequence of SEQUENCES) {
      if (!wanted(sequence.name)) continue;
      console.log(`[screenshot:rain] ${sequence.name}: ${sequence.frames} frames…`);
      const out = await captureSequence(url, sequence);
      const size = (fs.statSync(out).size / 1024).toFixed(0);
      console.log(`[screenshot:rain] ${sequence.name}  ${size}kB`);
    }
  } finally {
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error('[screenshot:rain] failed:', error.message || error);
  process.exit(1);
});
