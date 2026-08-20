# Signal tolerances — findings and current bands

Generated 2026-08-17 by sampling `makePose()` fixtures around each signal's
correctly-performed arm angles and running the app's real `evaluate()`
(`src/signals/evaluator.ts`) against the result — not by reading the numbers
off `specs.ts` and reasoning about them by eye. Companion visualization (stick
figures + accepted-zone clouds) was published as an artifact in the
conversation that produced this file; the numbers here are the same data in
reference-table form.

Method: for each signal, ~12,000 poses (36,000 for the two-armed three) were
generated with the arm's upper/forearm elevation and azimuth jittered ±75°
around the fixture's correct value (two-armed signals: a shared base jitter
plus an independent ±10° wobble per arm), then graded with the real
`evaluate()`. Only passing samples were kept. This measures what the code
*currently accepts*, not what's comfortable for a real body — see finding 3.

## Findings

1. **Fixed: Simultaneous and Nothing's height bands overlapped.** Simultaneous's
   wrist-height floor was `0.28` torso; Nothing's wrist-height ceiling was
   `0.30` torso. A 400,000-pose brute-force search through the live evaluator
   found poses that passed both signals at once — e.g. wrist height ≈0.29 torso,
   forward reach 0.6–0.8 torso, elbow ≈150–165°, hands open. This directly
   contradicted the `specs.ts` module comment, which claims "the three bands do
   not touch, and nothing between them belongs to anyone." In practice,
   whichever signal a referee was told they made in this narrow band depended
   on score tie-breaking in `evaluateAll`/`bestMatch`, not on what they
   actually did.

   **Fix applied:** `SIMULTANEOUS`'s wrist-height floor raised to `0.33`;
   `NOTHING`'s wrist-height ceiling lowered to `0.25` — tightening both edges
   away from the seam (per finding 4), rather than just closing the gap to
   zero, so a real `0.08` torso-length no-man's-land now separates them. A
   discriminator test (`leaves a gap between Simultaneous and Nothing instead
   of overlapping`) was added next to the existing double-hit-to-simultaneous
   one in `specs.test.ts`, interpolating across the old seam and asserting
   neither signal passes.

2. **The 148°–180° "straight arm" elbow band (`STRAIGHT_ARM`) is the
   narrowest angular tolerance in the whole set — 32° wide — and it's reused
   by six of the ten signals**: Halt, Point in line, Hit against, Not valid,
   Double hit, Nothing. It's also the one band already known to have failed a
   real arm: the module comment in `specs.ts` records a fully-extended arm
   failing at 97% on this constraint alone until the floor came down from
   180° to 148°. If "too rigid" reports keep clustering on any of these six
   signals, this is the first number to test loosening. Cheap way to check
   the floor: drop it a few more degrees and rerun `specs.test.ts` — it will
   fail loudly the moment `STRAIGHT_ARM`'s floor laps `ATTACK`'s 145° ceiling
   (`BENT_ARM_MAX`).

3. **Nine of the ten signals are still tuned only against the synthetic
   mannequin fixture (`src/test/poseFixtures.ts`), never checked against a
   real body.** The `specs.ts` module comment says this outright and names
   the fix: perform each signal in front of `/calibrate`, read the true
   min/median/max off the record button, and move the bands to match. Only
   `STRAIGHT_ARM` and `BENT_ARM_MAX` have had this done. This is a bigger
   lever than any single band edit above.

4. **Don't fix finding 1 by widening either band further into the seam.**
   The gap between the two-armed three (Double hit / Simultaneous / Nothing)
   is deliberate — a hand at an ambiguous height should be told "unclear,"
   not resolved by a coin flip. Any fix should tighten the seam, not widen
   either band.

5. Some direct wrist-position bands have real headroom on one axis and are
   tight on another — e.g. Attack's height-vs-shoulder window is only `0.57`
   torso-lengths (roughly 30 cm on an adult). Worth an in-person check against
   `/calibrate` alongside finding 3, not just a mannequin-derived number.

## Required angles and positions, per signal

All angles in degrees, all positions in torso-lengths (hip-to-shoulder = 1)
unless marked otherwise. `.R` / `.L` = referee's anatomical right/left arm.
Directional signals (`attack`, `parry`, `point_in_line`, `hit_scored`,
`hit_against`, `not_valid`) are authored for the right arm; the evaluator
mirrors the same numbers onto the left. Every one-armed signal additionally
requires the off arm (`wrist.height` on the unused side) to stay at or below
`0.4` torso — omitted from prose below where obvious, kept in the tables.

<!-- BEGIN GENERATED TABLES -->
### Halt (`halt`)

One arm raised straight overhead with the palm open: stop fencing. The other arm stays down.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Straighten your raised arm fully |
| `upper.abduction.R` (Upper arm abduction) | 150° to 180° (30° wide) | Take your arm straight up overhead |
| `wrist.vsNose.R` (Height vs. nose) | ≥ 0.15 torso | Raise your hand above your head |
| `hand.R` | shape = **open_palm** | Open your raised hand fully, palm forward |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Attack (`attack`)

The signalling arm out to the side with the elbow bent, forearm pointing at the fencer who attacked. The same gesture serves for stop-hit, counter-attack and remise, which are named aloud.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 95° to 145° (50° wide) | Bend your elbow — a straight arm is a different signal |
| `upper.abduction.R` (Upper arm abduction) | 55° to 110° (55° wide) | Bring your upper arm out to shoulder height |
| `forearm.azimuth.R` (Forearm azimuth) | 45° to 135° (90° wide) | Point your forearm out to the side, at the fencer who attacked |
| `wrist.vsShoulder.R` (Height vs. shoulder) | -0.35 torso to 0.22 torso (0.57 torso wide) | Hold your hand level with your shoulder |
| `wrist.lateral.R` (Out from midline) | ≥ 0.7 torso | Take the signal out to the side, not forward |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Parry (`parry`)

The forearm raised near-vertical beside the head with the elbow low, mimicking a parry: the fencer on that side parried. Counter-time uses the same gesture.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 50° to 118° (68° wide) | Bend your elbow to about a right angle |
| `forearm.elevation.R` (Forearm elevation) | 55° to 105° (50° wide) | Bring your forearm up towards vertical, as if parrying |
| `upper.abduction.R` (Upper arm abduction) | 25° to 78° (53° wide) | Keep your elbow low — only the forearm comes up |
| `wrist.vsShoulder.R` (Height vs. shoulder) | ≥ 0.1 torso | Raise your hand above your shoulder |
| `wrist.lateral.R` (Out from midline) | ≤ 0.62 torso | Keep your hand beside your head, not out to the side |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Point in line (`point_in_line`)

The arm extended straight out to the side with the index finger pointed at the fencer who established the point in line.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Extend your arm fully |
| `upper.abduction.R` (Upper arm abduction) | 65° to 115° (50° wide) | Hold your arm out at shoulder height |
| `wrist.vsShoulder.R` (Height vs. shoulder) | -0.3 torso to 0.3 torso (0.60 torso wide) | Hold your hand level with your shoulder |
| `wrist.lateral.R` (Out from midline) | ≥ 0.85 torso | Point straight out to the side |
| `hand.R` | shape = **index_point** | Point with your index finger — an open hand is "hit against" |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Hit scored (`hit_scored`)

The arm raised out and up on the side of the fencer who scored, elbow at about a right angle: the hit is theirs.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 55° to 125° (70° wide) | Bend your elbow to about a right angle |
| `upper.abduction.R` (Upper arm abduction) | 78° to 145° (67° wide) | Raise your whole arm out to the scorer's side |
| `wrist.vsShoulder.R` (Height vs. shoulder) | ≥ 0.32 torso | Raise your hand well above your shoulder |
| `wrist.lateral.R` (Out from midline) | ≥ 0.7 torso | Raise the arm out on the scorer's side, not in front of your head |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Hit against (`hit_against`)

The arm extended straight out to the side with a flat hand, on the side of the fencer against whom the hit was scored.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Extend your arm fully |
| `upper.abduction.R` (Upper arm abduction) | 70° to 110° (40° wide) | Hold your arm out at shoulder height |
| `wrist.vsShoulder.R` (Height vs. shoulder) | -0.3 torso to 0.3 torso (0.60 torso wide) | Hold your hand level with your shoulder |
| `wrist.lateral.R` (Out from midline) | ≥ 0.85 torso | Take your arm straight out to the side |
| `hand.R` | shape = **open_palm** | Show a flat, open hand — a pointed finger is "point in line" |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Not valid (`not_valid`)

The arm extended straight down and out towards the floor on that fencer's side: their hit landed off-target and does not count.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Keep the arm straight |
| `upper.elevation.R` (Upper arm elevation) | -72° to -28° (44° wide) | Angle the arm down towards the floor, about halfway to your side |
| `wrist.vsShoulder.R` (Height vs. shoulder) | ≤ -0.45 torso | Hold your hand well below your shoulder |
| `wrist.lateral.R` (Out from midline) | ≥ 0.75 torso | Take the arm out away from your body, not straight down in front |
| `wrist.height.L` (Height) | ≤ 0.4 torso | Keep your other arm down at your side |

### Double hit (`double_hit`)

Both arms extended sideways at shoulder height: both fencers scored — a double hit, which counts for both in épée.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Straighten both arms fully out to the sides |
| `elbow.L` (Elbow) | 148° to 180° (32° wide) | Straighten both arms fully out to the sides |
| `wrist.height.R` (Height) | 0.78 torso to 1.3 torso (0.52 torso wide) | Raise both hands to shoulder height |
| `wrist.height.L` (Height) | 0.78 torso to 1.3 torso (0.52 torso wide) | Raise both hands to shoulder height |
| `wrist.lateral.R` (Out from midline) | ≥ 0.8 torso | Take both arms out to the sides, not forward |
| `wrist.lateral.L` (Out from midline) | ≥ 0.8 torso | Take both arms out to the sides, not forward |
| symmetry(`wrist.height`) | ≤ 0.18 torso apart, L vs R | Hold both arms level with each other |

### Simultaneous (`simultaneous`)

Both arms brought forward with the hands converging in front of the chest: the two attacks were simultaneous, so no hit is awarded.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 140° to 180° (40° wide) | Extend both arms forward |
| `elbow.L` (Elbow) | 140° to 180° (40° wide) | Extend both arms forward |
| `wrist.height.R` (Height) | 0.33 torso to 0.74 torso (0.41 torso wide) | Hold both hands at chest height |
| `wrist.height.L` (Height) | 0.33 torso to 0.74 torso (0.41 torso wide) | Hold both hands at chest height |
| `wrist.forward.R` (Forward of chest) | ≥ 0.4 torso | Bring both arms out in front of you |
| `wrist.forward.L` (Forward of chest) | ≥ 0.4 torso | Bring both arms out in front of you |
| `wrists.gap` (Wrist separation) | ≤ 0.85× shoulder width | Bring your hands together in front of you |
| symmetry(`wrist.height`) | ≤ 0.18 torso apart, L vs R | Hold both arms level with each other |

### Nothing (`nothing`)

Both arms extended low and forward with the palms turned down: no hit is awarded — the phrase produced nothing.

| Measure | Band | Feedback if failed |
|---|---|---|
| `elbow.R` (Elbow) | 148° to 180° (32° wide) | Straighten both arms |
| `elbow.L` (Elbow) | 148° to 180° (32° wide) | Straighten both arms |
| `wrist.height.R` (Height) | ≤ 0.25 torso | Lower both hands below your waist |
| `wrist.height.L` (Height) | ≤ 0.25 torso | Lower both hands below your waist |
| `wrist.forward.R` (Forward of chest) | ≥ 0.35 torso | Reach both arms forward, not down at your sides |
| `wrist.forward.L` (Forward of chest) | ≥ 0.35 torso | Reach both arms forward, not down at your sides |
| `hand.R` | shape = **open_palm** | Open both hands, palms turned down |
| `hand.L` | shape = **open_palm** | Open both hands, palms turned down |
| symmetry(`wrist.height`) | ≤ 0.18 torso apart, L vs R | Hold both arms level with each other |
<!-- END GENERATED TABLES -->

## Source of truth

These tables are a snapshot of `src/signals/specs.ts` as of this writing. If
the bands change, this file goes stale — the tables and the module comments
in `specs.ts` should be read together, not this file alone treated as
authoritative.
