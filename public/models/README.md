# Vendored MediaPipe models

The `.task` files that belong here are **not committed** — they are ~14 MB of
binary that `scripts/fetch-assets.mjs` reproduces exactly:

```sh
npm run fetch-assets   # also runs automatically on npm install
```

| File                        | Task                       | Source                                                                                                                       |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pose_landmarker_lite.task` | Pose landmarks (stage 4)   | `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/` |
| `hand_landmarker.task`      | Hand landmarks (stage 7)   | `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/`      |

The same script copies the vision WASM runtime out of
`node_modules/@mediapipe/tasks-vision/wasm` into `public/mediapipe/wasm/`.

They are vendored rather than hot-linked for two reasons: the app then works
offline and cannot break when Google reorganises its buckets, and the WASM
runtime must match the installed `@mediapipe/tasks-vision` version exactly — a
CDN copy is free to drift from it.
