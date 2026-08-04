/**
 * Vendors the MediaPipe runtime into `public/` so the app works offline and does
 * not break when Google reorganises its buckets.
 *
 * Two kinds of asset, from two sources:
 *
 * - the `.task` model files, downloaded from Google's model bucket;
 * - the vision WASM runtime, *copied out of node_modules*. The usual pattern is
 *   to point `FilesetResolver` at a CDN, but that reintroduces the network
 *   dependency the vendoring exists to remove — and a CDN copy can drift from
 *   the installed `@mediapipe/tasks-vision`, which must match its WASM exactly.
 *
 * Both outputs are gitignored: they are large binaries, reproducible from here.
 *
 * Idempotent — existing files of the right size are left alone, so this is cheap
 * to run from `postinstall`. It never fails the install: with no network you
 * simply get a warning, and the app's model-load error path explains the fix.
 */

import { createWriteStream } from 'node:fs';
import { access, cp, mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Model files. `bytes` is the known size — it doubles as a corruption check. */
const MODELS = [
  {
    file: 'public/models/pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    bytes: 5777746,
  },
  {
    file: 'public/models/hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    bytes: 7819105,
  },
];

const WASM_SOURCE = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DEST = 'public/mediapipe/wasm';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** True once the file is present at its expected size — a partial download is not. */
async function isComplete(path, bytes) {
  try {
    return (await stat(path)).size === bytes;
  } catch {
    return false;
  }
}

async function download({ file, url, bytes }) {
  const dest = join(ROOT, file);
  if (await isComplete(dest, bytes)) {
    console.log(`  ok       ${file}`);
    return;
  }

  await mkdir(dirname(dest), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  // Stream to disk: these are multi-megabyte files, and streaming means an
  // interrupted run leaves a short file that the size check above rejects
  // rather than a plausible-looking truncated one.
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  } catch (error) {
    await unlink(dest).catch(() => {});
    throw error;
  }

  const size = (await stat(dest)).size;
  if (size !== bytes) {
    await unlink(dest).catch(() => {});
    throw new Error(`${file}: expected ${bytes} bytes, got ${size}`);
  }
  console.log(`  fetched  ${file} (${(size / 1e6).toFixed(1)} MB)`);
}

async function copyWasm() {
  const source = join(ROOT, WASM_SOURCE);
  if (!(await exists(source))) {
    throw new Error(`${WASM_SOURCE} is missing — run \`npm install\` first`);
  }
  // Always re-copied: it must track the installed package version, and an
  // upgrade would otherwise leave a mismatched runtime in place.
  await cp(source, join(ROOT, WASM_DEST), { recursive: true });
  console.log(`  copied   ${WASM_DEST}/ from ${WASM_SOURCE}`);
}

async function main() {
  console.log('Vendoring MediaPipe assets into public/');
  await copyWasm();
  for (const model of MODELS) await download(model);
  console.log('Done.');
}

main().catch((error) => {
  console.warn(`\n! Could not vendor MediaPipe assets: ${error.message}`);
  console.warn('  The camera pages will not work until this succeeds.');
  console.warn('  Re-run with: npm run fetch-assets\n');
  // Deliberately exit 0: a failed asset fetch must not fail `npm install`.
});
