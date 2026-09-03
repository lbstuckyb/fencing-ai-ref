# Fencing AI Ref

Practice fencing refereeing entirely in the browser: FIE hand-signal drills graded
by on-device pose estimation, plus scenario refereeing per weapon. Nothing leaves
the machine — pose and hand tracking run locally via MediaPipe, and there is no
backend.

## Running it

```
npm install       # also vendors the MediaPipe models/WASM into public/ (postinstall)
npm run dev
```

Open the printed local URL over `https://` or `localhost` — camera access requires
a secure context. A camera and a browser that supports `getUserMedia` are all you
need; nothing is uploaded anywhere.

Other scripts:

```
npm test              # vitest run — the whole suite
npm run test:watch    # vitest, watch mode
npm run lint           # eslint
npm run format          # prettier --write
npm run build            # tsc -b && vite build
npm run make-scenarios     # generates placeholder /scenarios clips (needs ffmpeg on PATH)
```

`npm run make-scenarios` is optional: without it, `/scenarios` still works but
shows a "clip isn't available locally" message in place of the video for each
scenario instead of a broken page.

## What's here

- `/practice` — drill one signal at a time (or all ten at random); each attempt is
  graded live against the held pose.
- `/scenarios` — **watch → call → grade**: watch a short clip of a phrase, then
  call the full sequence of signals from memory against the camera, and get a
  step-by-step verdict against an authored answer key.
- `/calibrate` and `/calibrate-signals` — record your own body's geometry for a
  signal so grading is centred on you rather than on the authored default band.
- `/reference` — all twenty t.63 signals, ten of them gradeable here today.

## How grading works, in one paragraph

A `SignalSpec` (`src/signals/specs.ts`) is a list of constraints — joint angles,
wrist position relative to the torso, hand shape — each with a tolerance band.
`src/signals/evaluator.ts` scores a single frame's measurements against every
spec and picks the best match. `src/signals/holdMachine.ts` adds the missing
axis, time: t.63 requires a signal to be _held_ 1–2 seconds, so a stream of
per-frame matches only becomes a completed signal once it has been held long
enough (with a grace window for a dropped tracking frame, and a "too quick"
warning short of that). Scenario grading (`src/scenario/grading.ts`) then aligns
the ordered list of signals a referee called against a scenario's expected
sequence and reports, per step: correct, out of order, wrong side, wrong signal,
or missing — plus any extra calls with no matching step.

## Adding a scenario

Scenarios live in `src/data/scenarios/`, one file per scenario, collected in
`index.ts`. Copy an existing one (`epee-001.ts` is the shortest) as a template:

```ts
export const EPEE_002: Scenario = {
  id: 'epee-002',
  weapon: 'epee',
  video: '/scenarios/epee-002.mp4',
  title: 'A short, descriptive title',
  difficulty: 1,
  expect: [
    { signal: 'attack', side: 'right', say: ['attack'] },
    // `signal: null` steps are spoken-only (Riposte, Remise, …) — displayed
    // in the sequence but skipped when the call phase is graded.
    { signal: null, side: null, say: ['riposte'] },
  ],
  explanation: 'What happened and why, shown after grading.',
};
```

Add it to `SCENARIOS` in `src/data/scenarios/index.ts`, and add
`{ id: 'epee-002', ... }` to `CLIPS` in
`scripts/make-placeholder-scenarios.mjs` if you want a local placeholder clip to
watch. `src/scenario/schema.ts`'s `validateScenario` catches the usual authoring
mistakes — a signal not legal for the weapon, a directional signal with no side,
an empty phrase — and `scenario/schema.test.ts` runs it over the whole bank, so a
broken scenario fails the test suite rather than failing silently at runtime.

## Adding a signal

The core ten signals are the ones with a gesture graded today; the other ten
(`src/data/rules.ts`'s `REFERENCE_SIGNALS`) are reference-only. To add a gesture
for one of those:

1. Move it from `REFERENCE_SIGNALS` to `CORE_SIGNALS` in `src/data/rules.ts`.
2. Author a `SignalSpec` for it in `src/signals/specs.ts` — see that file's
   module comment for how the existing ten separate from each other and from
   each other's near misses.
3. Add it to `SIGNAL_SPECS`. `specs.test.ts` will tell you immediately if the new
   band overlaps an existing signal's.
4. If the weapon table excludes it for any weapon, add the exclusion (with its
   reason) to that weapon's `excluded` map in `src/data/rules.ts`.

## What's deferred to v2.0

- **Speech grading.** Every scenario step already carries a `say` field and the
  UI displays it, but nothing listens — five of t.63's signals (Riposte,
  Counter-riposte, Remise, Reprise, Redouble) have no gesture of their own and
  can only be graded once speech is.
- The other ten t.63 signals (reference-only today).
- A learned classifier, in place of the authored constraint bands.
- Accounts or persistence beyond `localStorage` (calibration is the only thing
  saved, and only on the device that recorded it).
- Real competition footage in place of the placeholder scenario clips.
