# Fencing Referee Trainer — Staged Implementation Plan

> **This is the canonical plan.** It is executed across 16 separate clean sessions, one stage each.
>
> **To resume:** run `git log --oneline`, find the last `stage-NN:` commit, and execute **only** the next stage. Do not run ahead — each stage ends at a commit on purpose.
>
> Nothing has been built yet. The repo is not yet initialised — **start at Stage 1**.

---

## Context

`/home/lucas/VSCode_Projects/FencingAIRef` is empty and **not yet a git repo**. This is greenfield.

**The need:** there is no good way to practice fencing refereeing. The two skills are separable — (a) making the official hand signals correctly, and (b) reading a phrase and issuing the right *sequence* of calls — and both are currently only learnable by standing next to an experienced referee. A webcam and a browser can drill both.

**Outcome:** a static web app with three things: a link-out to the current FIE rules, a signal-practice drill graded live by pose estimation, and a scenario drill where you referee a real clip and get graded against an authored answer key, per weapon.

---

## Domain research (already done — do not re-derive)

The signal vocabulary is fixed by **FIE Technical Rules, August 2026, Article t.63 / Figure 3**, pages 21–24 of the PDF. Those pages are *illustrations only* — no machine-readable text — so the geometry in this plan was read off the figures. All 20 official signals:

| Group | Signals |
|---|---|
| Preparatory | On guard, Ready?, Play, Halt |
| Phrase analysis | Point in line, Attack/Stop-hit/Counter-attack/Remise, Parry/Counter-time, Incorrect, No |
| Awarding | Hit scored, Hit against, Not valid, Double hit, Hit for each, Simultaneous, Nothing |
| Administrative | Technical touch, Changing decision, Card (Y/R/B), Winner |

Three notes from t.63 that are **direct grading requirements**:

1. *"Each signal must last 1–2 seconds, be expressive and correctly made."* → hold-duration is an official criterion, not an invention.
2. Signals are **directional** — they denote the fencer on the referee's **right** or **left**, i.e. which arm is used.
3. *Riposte, Counter-riposte, Remise, Reprise, Redouble* have **no gesture** — spoken only. The "Attack" gesture is reused for them. → a phrase cannot be *fully* refereed by gesture alone; this is why speech grading is planned for v2.0.

## Decisions taken

- **Classifier:** rule-based joint geometry, not a learned model. No training data, works immediately, explainable feedback.
- **Speech:** **deferred to v2.0.** The scenario schema carries a `say` field from day one and the UI *displays* the expected words, but nothing listens. No migration cost later.
- **Video:** placeholder/local clips in `public/scenarios/`. Real clips dropped in later; no rights question blocks the build.
- **Scope:** core 10 signals — Halt, Attack, Parry, Point in line, Hit scored, Hit against, Not valid, Double hit, Simultaneous, Nothing. The other 10 are pure data additions afterwards.

---

## Architecture reference

Shared detail the stages refer back to. Read the relevant part when you reach the stage that needs it.

### Stack

Vite + React + TypeScript + Tailwind, `@mediapipe/tasks-vision@1.0.1`, Vitest. No backend — all inference is on-device, nothing leaves the browser (state this in the UI; it matters for a page that opens a camera). Deploys as static files anywhere.

Model assets — **verified reachable, vendor them into `public/models/`** rather than hot-linking, so the app works offline and does not break when Google reorganizes buckets:

- `pose_landmarker_lite.task` (~5 MB) — `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
- `hand_landmarker.task` (~7 MB) — `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`

### Target layout

```
docs/PLAN.md           # this plan, copied in stage 1
src/
  cv/
    landmarker.ts      # MediaPipe init + per-frame detect
    geometry.ts        # torso frame, joint angles, hand shape   <- unit-tested
    types.ts
  signals/
    specs.ts           # the 10 SignalSpecs (data)
    evaluator.ts       # constraints -> pass/score/reasons       <- unit-tested
    holdMachine.ts     # t.63 1-2s hold state machine            <- unit-tested
  scenario/
    schema.ts          # Scenario / Step / Expectation types
    engine.ts          # playback -> call phase -> grading       <- unit-tested
    grading.ts         # ordered sequence match
  data/
    rules.ts           # FIE links + weaponRules
    scenarios/         # authored answer keys (JSON)
  pages/
    Home.tsx  Reference.tsx  PracticeSignals.tsx
    Scenarios.tsx  Calibrate.tsx
  components/
    CameraStage.tsx    # video + skeleton overlay + mirror
    SignalCard.tsx  Feedback.tsx
public/
  models/              # vendored .task files
  scenarios/           # clips dropped in later
```

### Two correctness traps

Both cause subtle, hard-to-debug wrongness if missed:

- **Use `worldLandmarks` for all angle math**, never the normalized `landmarks`. World landmarks are metric and hip-origin, so they are already translation- and scale-invariant — no hand-rolled shoulder-width normalization needed. Use the normalized set *only* to draw the on-screen skeleton.
- **Mirroring vs. anatomy.** Display the webcam mirrored (users expect it), but never infer side from screen position. MediaPipe labels landmarks from the *subject's* perspective, so `RIGHT_WRIST` is the referee's actual right hand regardless of CSS transforms. "The fencer on the referee's right" therefore maps directly onto the anatomical-right indices. Getting this backwards silently inverts every directional signal.

### Signal spec format

```jsonc
{
  "id": "halt",
  "label": "Halt",
  "rule": "t.63",
  "description": "To stop the fencing before a hit is scored...",
  "holdMs": [1000, 2000],
  "needsHands": true,
  "directional": false,
  "constraints": [
    { "joint": "elbow.R",    "angle": [155, 180] },
    { "joint": "shoulder.R", "abduction": [150, 180] },
    { "rel": "wrist.R.y", "above": "nose.y" },
    { "joint": "elbow.L",    "angle": [0, 60] },
    { "hand": "R", "shape": "open_palm" }
  ],
  "feedback": {
    "elbow.R": "Straighten your raised arm",
    "hand":    "Open your hand fully"
  }
}
```

Constraint kinds: `angle`, `abduction`, `elevation`, `azimuth`, `rel` (landmark above/below/lateral-of another), `hand` (shape), `symmetry` (both arms mirrored within tolerance).

### The 10 signals

Geometry read off the t.63 figures. **Every threshold below is a starting estimate to be tuned against calibration readouts (stage 8).**

| Signal | Discriminating geometry |
|---|---|
| **Halt** | One arm vertical, elbow >155°, wrist above nose, open palm; other arm down |
| **Attack** / Stop-hit / Counter-attack / Remise | Signalling arm out to the side, abduction 60–100°, elbow 90–150°, forearm lateral, wrist ≈ shoulder height |
| **Parry** / Counter-time | Elbow 60–110°, forearm near-vertical, wrist above shoulder and beside the head — mimics a parry |
| **Point in line** | Arm fully extended laterally, elbow >160°, wrist ≈ shoulder height, hand shape `index_point` |
| **Hit scored** | Arm raised on the scorer's side, elbow ≈ 90°, hand above shoulder |
| **Hit against** | Arm extended laterally, elbow >155°, abduction ≈ 90°, wrist ≈ shoulder height, flat hand |
| **Not valid** | Arm extended down-and-out, elbow >150°, elevation −30° to −70° |
| **Double hit** | **Both** arms extended laterally, both elbows >155°, both wrists ≈ shoulder height, symmetric |
| **Simultaneous** | Both arms extended but **forward-converging**, elbows >140°, wrists below shoulder, hands closer than shoulder width |
| **Nothing** | Both arms low and forward, wrists **below waist**, elbows >150°, palms down |

**Disambiguation — the hard trio.** Double hit / Simultaneous / Nothing are all two-armed and are the only real collision risk in this set. They separate almost entirely on **wrist height in the torso frame** (shoulder / chest / below-waist) and secondarily on **azimuth** (lateral vs. forward-converging). Encode that height band as the primary discriminator. Tune these three first — if they are clean, the rest of the set is trivially separable. This is why they get their own stage before the other seven.

### Mode 2 flow — a design point worth stating plainly

t.63 requires each signal to be held **1–2 seconds**, but a fencing phrase resolves in well under a second. You therefore *cannot* signal in real time against a playing clip — there is no room. This is not a limitation to work around; it is how real refereeing works: watch the phrase, then call it.

The loop is **watch → call → grade**:

1. Clip plays start-to-finish (replayable, frame-step, slow-motion — all free with `<video>`).
2. Video ends → **call phase**: the referee gives the full sequence of signals, each held properly. Camera live, hold machine running, detected signals stream into an ordered list the user can see building.
3. Submit → graded against the answer key.

An optional `cueAt` on a step supports a mid-clip pause for advanced drills, but pause-then-call is the default and the faithful one.

### Scenario schema

```jsonc
{
  "id": "foil-001",
  "weapon": "foil",
  "video": "/scenarios/foil-001.mp4",
  "title": "Attack right, parry-riposte left",
  "difficulty": 2,
  "expect": [
    { "signal": "attack",     "side": "right", "say": ["attack"] },
    { "signal": "parry",      "side": "left",  "say": ["parry"] },
    { "signal": null,                          "say": ["riposte"] },
    { "signal": "hit_scored", "side": "left",  "say": ["touch left", "hit left"] }
  ],
  "explanation": "Attack from the right is parried; the riposte lands. Touch left."
}
```

`say` is **displayed but not graded** — v2.0. `"signal": null` steps are the gesture-less spoken actions (Riposte, Remise, …); render them in the expected-sequence review so the user learns the full call, and skip them when grading gestures.

### Weapon differences (épée / foil / sabre)

Weapon is not just a filter tag — it changes the **legal call vocabulary**, and the UI should reject or flag calls that cannot occur:

- **Épée** — no right of way. No Attack / Parry-priority / Point-in-line calls. Whole body is target, so no Not valid. Outcomes: hit one side, double hit, nothing.
- **Foil** — full priority set, plus Not valid for off-target.
- **Sabre** — full priority set; no off-target, so no Not valid.

### FIE rules links

`data/rules.ts` links the **index page as primary**: `https://fie.org/fie/documents/rules` — this always resolves to the current edition. Dated deep links as secondary, currently:

- Technical rules (Aug 2026) — `https://static.fie.org/uploads/40/204138-Technical%20rules%20August%202026%20ang.pdf`
- Organisation rules (Aug 2026) — `https://static.fie.org/uploads/40/204123-Organisation%20rules%20August%202026%20ang.pdf`
- Material rules (Aug 2026) — `https://static.fie.org/uploads/40/204157-book%20material%20August%202026%20ang.pdf`

Those PDF URLs are **version-stamped and will rot** on the next revision — the index link is the durable one. Label each with its edition date in the UI so staleness is visible.

---

# Stages

Each stage is one clean session. Finish it, run the checks, commit with the given message, **stop**.

---

### Stage 1 — Repo, toolchain, plan doc

**Goal:** an empty app that builds, tests, and lints.

- `git init` (repo does not exist yet); `.gitignore` for `node_modules`, `dist`.
- Vite + React + TypeScript scaffold; add Tailwind, Vitest, Prettier, ESLint.
- Copy this plan to `docs/PLAN.md` — every later session reads that copy.
- One trivial passing test to prove the runner works.

**Done when:** `npm run dev` serves a blank page, `npm test` passes, `npm run build` succeeds.
**Commit:** `stage-01: scaffold vite+react+ts, tailwind, vitest, plan doc`

---

### Stage 2 — App shell

**Goal:** navigable skeleton, no logic.

- Router with the five routes: `/`, `/reference`, `/practice`, `/scenarios`, `/calibrate`.
- Shared layout: header, nav, footer. Dark/light handling.
- Placeholder page components.

**Done when:** all five routes render and nav moves between them.
**Commit:** `stage-02: app shell, routing, layout`

---

### Stage 3 — Rules data and Home page

**Goal:** the reference/link-out half of the product, complete.

- `src/data/rules.ts` — FIE links (index primary, dated deep links secondary with edition labels) and the `weaponRules` table from the architecture section.
- Home page: what the app is, **the on-device/privacy line**, rules links, three mode cards.

**Done when:** Home is presentable and every FIE link resolves.
**Commit:** `stage-03: FIE rules data, weapon rules table, home page`

---

### Stage 4 — Camera + MediaPipe init

**Goal:** a live camera with pose detection running, no drawing yet.

- Download both `.task` files into `public/models/`.
- `src/cv/types.ts`, `src/cv/landmarker.ts` — lazy singleton, `PoseLandmarker` (lite, GPU delegate, `runningMode: "VIDEO"`, 1 pose). Expose `detect(video, tsMs)`.
- `components/CameraStage.tsx` — `getUserMedia`, mirrored display, and real handling for **no camera / permission denied / model load failure**. These are the first thing a user hits; do not leave them as thrown errors.

**Done when:** camera shows mirrored, and a console log confirms landmarks arriving each frame.
**Commit:** `stage-04: mediapipe models vendored, landmarker singleton, camera stage`

---

### Stage 5 — Detection loop and skeleton overlay

**Goal:** see the tracking.

- rAF loop throttled to ~20–24 fps.
- **Timestamp guard:** MediaPipe VIDEO mode requires monotonically increasing `tsMs` and throws on duplicate or regressing values. Guard explicitly.
- Canvas overlay drawing the skeleton from the **normalized** landmarks, aligned over the mirrored video.

**Done when:** skeleton tracks the body smoothly and stays registered with the mirrored image.
**Commit:** `stage-05: rAF detection loop, skeleton overlay`

---

### Stage 6 — Geometry primitives

**Goal:** the math everything else is built on, proven by tests.

`src/cv/geometry.ts`, operating on `worldLandmarks`:

- `torsoFrame(pose)` → orthonormal basis from shoulder and hip midpoints (`up`, `right`, `forward`). **Every angle is expressed in this frame, not camera space** — this is what makes the classifier tolerate the user standing off-axis, and it is the biggest robustness win available to a rule-based approach.
- `angleAt(a, b, c)` → 3D angle at joint `b`.
- `limbElevation(side)` / `limbAzimuth(side)` → upper-arm direction in the torso frame.

**Tests:** synthetic fixtures with known angles — straight arm ≈180°, right angle ≈90°. Critically: **a body rotated 30° off-axis must yield the same torso-frame angles as one facing square.** That test is what proves the normalization works; if it fails, nothing downstream will be reliable.

**Done when:** geometry tests pass, including the off-axis invariance test.
**Commit:** `stage-06: torso-frame geometry primitives + tests`

---

### Stage 7 — Hand shape detection

**Goal:** finger detail for the 3 signals that need it.

- Add `HandLandmarker` (2 hands) to the singleton, invoked **only when the active spec sets `needsHands`** — it roughly doubles per-frame cost and only Halt, Point in line and Nothing need it.
- `handShape(hand)` → `open_palm | fist | index_point | unknown`, via per-finger extension (tip-to-wrist vs. pip-to-wrist distance).

**Tests:** fixtures for each shape.
**Done when:** hand shape reports correctly live and tests pass.
**Commit:** `stage-07: hand landmarker, hand shape classification + tests`

---

### Stage 8 — Calibration page

**Goal:** turn spec authoring from guesswork into measurement. **This gates stages 11–12 — do not tune any threshold before it exists.**

`pages/Calibrate.tsx`: live skeleton plus a real-time numeric readout of every quantity the specs reference — both elbow angles, both abductions/elevations/azimuths, wrist heights relative to nose/shoulder/waist, hand shapes. Plus a record button capturing a few seconds and printing min/median/max.

The thresholds in this plan were inferred from drawings. The fastest path to a classifier that works is to stand in front of the camera, perform each signal correctly, read the true numbers, and write those in.

**Done when:** you can perform a signal and read stable, sensible numbers; left/right labels match your actual limbs (the mirror check).
**Commit:** `stage-08: calibration page with live joint readouts`

---

### Stage 9 — Spec types and evaluator

**Goal:** the grading core, no specs authored yet.

`src/signals/evaluator.ts`:

- Types for every constraint kind.
- Evaluate → `{ pass, score 0–1, failures: Reason[] }`.
- **Soft margins:** full credit inside the band, linear falloff across a tolerance zone outside it — so the drill is not knife-edge and the score can drive a progress bar rather than a binary.
- **Jitter rejection:** require 3 consecutive passing frames.
- **Directional mirroring:** specs are written once for the right arm; the evaluator mirrors to grade a left-arm performance and reports which side was signalled.

**Tests:** hand-built specs plus fixtures, including deliberate near-misses that must fail on the *expected* constraint.
**Done when:** evaluator tests pass, including mirroring.
**Commit:** `stage-09: signal spec types and constraint evaluator + tests`

---

### Stage 10 — Hold machine

**Goal:** enforce t.63 note 4.

`src/signals/holdMachine.ts`: `IDLE → FORMING → HELD → COMPLETE`. Pass at ≥900 ms. If the pose was correct but released under ~800 ms, pass-with-warning *"too quick — a signal must last 1–2 seconds and be expressive."* **Do not fail long holds** — the rule sets an expressiveness floor, not a ceiling.

**Tests:** synthetic frame timeline — 400 ms warns, 1200 ms passes, jittery frames do not trip it.
**Done when:** hold machine tests pass.
**Commit:** `stage-10: t.63 hold-duration state machine + tests`

---

### Stage 11 — The hard trio

**Goal:** author and tune Double hit / Simultaneous / Nothing *first*, because they are the only real collision risk.

- Author the three specs against **live calibration readouts**, not the estimates in this plan.
- Primary discriminator is wrist height in the torso frame; azimuth secondary.
- **Discriminator test:** one fixture each, asserting each matches *only* its own spec.

**Done when:** all three pass reliably when performed, and none cross-triggers.
**Commit:** `stage-11: double hit / simultaneous / nothing specs, tuned + discriminator tests`

---

### Stage 12 — Remaining seven specs

**Goal:** complete the core 10.

Author Halt, Attack, Parry, Point in line, Hit scored, Hit against, Not valid — same process, tuned against calibration. Fixture test per signal plus near-miss cases.

**Done when:** all 10 pass when performed correctly and fail with the right reason when performed wrong.
**Commit:** `stage-12: remaining seven signal specs + tests`

---

### Stage 13 — Mode 1: practice page

**Goal:** the first shippable drill.

`pages/PracticeSignals.tsx`: prompts a signal (random or chosen), live camera + skeleton, hold progress ring, pass/fail showing the **specific failed constraint**, streak counter.

**Done when:** you can drill all 10 end-to-end; a deliberately fast signal triggers the 1–2 s warning; a directional signal on the wrong arm is caught.
**Commit:** `stage-13: mode 1 signal practice drill`

---

### Stage 14 — Reference page

**Goal:** the signal library — data already exists by now.

Every signal with its official t.63 description, the geometry in plain words, and a "practice this one" button into Mode 1. Include the 10 not-yet-implemented signals as reference-only entries, clearly marked, so the page matches the rulebook.

**Done when:** reference page is complete and links into practice.
**Commit:** `stage-14: signal reference library page`

---

### Stage 15 — Scenario schema and engine

**Goal:** Mode 2 playback and capture, no grading yet.

- `src/scenario/schema.ts` — types per the architecture section, `say` present but unused.
- `src/scenario/engine.ts` — the **watch → call → grade** state machine; optional `cueAt` mid-clip pause.
- 2–3 stub scenarios in `src/data/scenarios/` pointing at placeholder files in `public/scenarios/`, one per weapon.
- Player controls: replay, frame-step, slow-motion.

**Tests:** engine state transitions.
**Done when:** a stub clip plays, the call phase captures an ordered list of detected signals, and the sequence is visible as it builds.
**Commit:** `stage-15: scenario schema, playback/call engine, stub scenarios`

---

### Stage 16 — Grading, scenarios page, polish

**Goal:** ship it.

- `src/scenario/grading.ts` — ordered sequence match on signal, side and order. Distinct reason codes: *wrong signal* / *right signal, wrong side* / *out of order* / *missing* / *extra*.
- `pages/Scenarios.tsx` — weapon-filtered bank, run a scenario, per-step ✓/✗ with the specific miss, overall %, then the scenario's `explanation` so the drill teaches rather than just scores.
- Weapon filtering applied to both the bank and the allowed-signal palette during the call phase.
- `README.md`: how to run, how to add a scenario, how to add a signal, and what is deferred to v2.0.

**Tests:** wrong side, wrong order, missing and extra each produce the right reason code.
**Done when:** a full scenario runs end-to-end and grades correctly; épée scenarios do not offer priority signals.
**Commit:** `stage-16: scenario grading, scenarios page, readme`

---

## Final verification (after stage 16)

1. `npm test` — all green. `npm run build` — clean.
2. `/calibrate` — skeleton tracks, numbers sensible, left/right match actual limbs.
3. `/practice` — all 10 signals pass correctly and fail usefully; fast-signal warning fires; wrong-arm directional caught.
4. `/scenarios` — clip plays, call phase captures, wrong-side call flagged, explanation shown.
5. Épée scenarios offer no priority signals.
6. Camera denied → a clear message, not a crash.

## Out of scope (v2.0)

Speech grading (Web Speech API — schema already carries `say`), the remaining 10 signals, learned classifier, accounts/persistence beyond localStorage, real competition footage.
