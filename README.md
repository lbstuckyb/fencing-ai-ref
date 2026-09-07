# Fencing AI Ref

A browser-based trainer for FIE referee hand signals and phrase-calling.
Practice the official t.63 signals in front of your webcam and get graded on
shape and hold duration, or referee full scenario clips — watch a phrase,
call it live, and get a step-by-step verdict against the correct sequence.

**Live: https://lbstuckyb.github.io/fencing-ai-ref/**

## What it does

- **Practice** — drill any of the ten gradeable t.63 signals, scored live
  against your pose.
- **Scenarios** — referee épée, foil, and sabre clips in real time: call the
  phrase as it happens, then see what was right, wrong, or missed.
- **Calibration** — record your own body's geometry so grading fits you
  instead of an authored average.
- **Reference** — the full twenty-signal t.63 library, described and
  illustrated.

## Why it's private

Pose and hand tracking run entirely on-device via MediaPipe. No video,
image, or landmark ever leaves the browser — there is no backend.

## Built with

React, TypeScript, Vite, Tailwind, and MediaPipe Tasks Vision.
