/**
 * Generates the stub scenario clips into `public/scenarios/` with `ffmpeg`.
 *
 * The plan's decision on video is placeholder/local clips now, real footage
 * dropped in later — "no rights question blocks the build". These clips are
 * gitignored for exactly the reason the vendored MediaPipe models are (see
 * `fetch-assets.mjs`): they are reproducible from here, so there is no reason
 * to carry the bytes in the repo. Each is a few seconds of a solid colour with
 * the scenario's id and phrase burned in as text — not footage, just enough
 * for the watch → call → grade flow to have something to play.
 *
 * Needs `ffmpeg` on `PATH`. Unlike `fetch-assets.mjs` this is not wired into
 * `postinstall`: a system binary is a heavier ask than an HTTP fetch, and
 * `/scenarios` degrades to a clear "clip not found" message without these
 * rather than to a broken page, so nothing is blocked by skipping it. Run it
 * by hand — `npm run make-scenarios` — the first time you want the clips
 * playable locally.
 */

import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** One entry per `Scenario.video` in `src/data/scenarios/` — keep the two in step. */
const CLIPS = [
  {
    file: 'public/scenarios/foil-001.mp4',
    bg: '0x1e293b',
    line1: 'FOIL - placeholder clip',
    line2: 'Attack right / Parry left / Riposte / Hit left',
  },
  {
    file: 'public/scenarios/epee-001.mp4',
    bg: '0x312e81',
    line1: 'EPEE - placeholder clip',
    line2: 'Both lights land together',
  },
  {
    file: 'public/scenarios/sabre-001.mp4',
    bg: '0x7c2d12',
    line1: 'SABRE - placeholder clip',
    line2: 'Attack right, unopposed',
  },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function drawTextFilter({ line1, line2 }) {
  return [
    `drawtext=text='${line1}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2-24`,
    `drawtext=text='${line2}':fontcolor=0xcbd5e1:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+20`,
    // A running clock, mostly so a frame-step control has something visibly
    // changing to step through even though the background is static.
    `drawtext=text='%{pts\\:hms}':fontcolor=0x64748b:fontsize=16:x=16:y=h-32`,
  ].join(',');
}

async function generate(clip) {
  const dest = join(ROOT, clip.file);
  if (await exists(dest)) {
    console.log(`  ok         ${clip.file}`);
    return;
  }

  await mkdir(dirname(dest), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${clip.bg}:s=640x360:d=4:r=25`,
    '-vf',
    drawTextFilter(clip),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-y',
    dest,
  ]);
  console.log(`  generated  ${clip.file}`);
}

async function main() {
  console.log('Generating placeholder scenario clips into public/scenarios/');
  for (const clip of CLIPS) await generate(clip);
  console.log('Done.');
}

main().catch((error) => {
  console.warn(`\n! Could not generate placeholder scenario clips: ${error.message}`);
  console.warn('  This needs ffmpeg on PATH. Install it, then re-run: npm run make-scenarios');
  console.warn('  /scenarios still loads without them — a missing clip shows a clear message.\n');
});
