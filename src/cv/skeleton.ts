/**
 * Skeleton overlay drawing.
 *
 * This module is the one place that is allowed to use the **normalized**
 * landmarks. They are image-space and depend on where the referee is standing,
 * which is exactly what a drawing wants and exactly what the geometry must never
 * see (see `types.ts`).
 *
 * Registration is the whole problem here. The video is rendered with
 * `object-cover` inside a fixed 16:9 box, so a 4:3 webcam is scaled up and
 * cropped; normalized coordinates are relative to the *source* frame, not the
 * box. Drawing straight into the box would leave a skeleton that drifts away
 * from the body the further a joint is from centre. `coverTransform` reproduces
 * the CSS crop so the two stay locked together at any camera aspect ratio.
 *
 * Everything except `syncCanvasSize` is pure, so the mapping is unit-tested
 * rather than eyeballed.
 */

import type { ScreenPoint } from './types';

export interface Size {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* Connections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * BlazePose's 35 bones, as index pairs. This is MediaPipe's own connection set —
 * face chain, arms with the little hand triangle, torso box, legs and feet.
 */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  // Left arm and hand
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Right arm and hand
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
] as const;

/** Anatomical side of a landmark, or `center` for the nose. */
export type LandmarkSide = 'left' | 'right' | 'center';

/**
 * BlazePose numbers the body in pairs from the nose outwards: odd indices are
 * the subject's left, even indices their right. Index 0 is the nose and belongs
 * to neither.
 *
 * These are **anatomical** sides, from the referee's own perspective — the same
 * convention as `Side` in `types.ts`. The overlay is drawn mirrored, so the arm
 * coloured as `right` appears on the *screen's* left. That is correct and it is
 * worth seeing: the legend under the video is the cheapest possible check that
 * the app and the referee agree on which arm is which.
 */
export function landmarkSide(index: number): LandmarkSide {
  if (index === 0) return 'center';
  return index % 2 === 1 ? 'left' : 'right';
}

/** A bone is sided only when both ends agree; anything spanning is `center`. */
export function connectionSide(a: number, b: number): LandmarkSide {
  const sideA = landmarkSide(a);
  return sideA === landmarkSide(b) ? sideA : 'center';
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

export interface CoverTransform {
  /** Uniform scale applied to the source frame. */
  scale: number;
  /** Left edge of the scaled frame within the box. Negative when cropped. */
  offsetX: number;
  /** Top edge of the scaled frame within the box. Negative when cropped. */
  offsetY: number;
}

/**
 * Reproduces CSS `object-fit: cover`: scale the source until it covers the
 * destination on both axes, then centre it and let the overflow crop.
 *
 * Returns `null` for a degenerate size — a video element reports 0×0 until its
 * metadata loads, and every frame in that window must be skipped rather than
 * divided by.
 */
export function coverTransform(source: Size, dest: Size): CoverTransform | null {
  if (!(source.width > 0 && source.height > 0 && dest.width > 0 && dest.height > 0)) {
    return null;
  }
  const scale = Math.max(dest.width / source.width, dest.height / source.height);
  return {
    scale,
    offsetX: (dest.width - source.width * scale) / 2,
    offsetY: (dest.height - source.height * scale) / 2,
  };
}

/**
 * Builds the normalized-landmark → canvas-pixel mapping for one frame size.
 *
 * `mirror` flips x *after* the crop, matching the `-scale-x-100` on the video.
 * Flipping here rather than with a canvas transform keeps the drawing space
 * un-mirrored, so any text or glyph added to this layer later reads the right
 * way round.
 */
export function createProjector(
  source: Size,
  dest: Size,
  mirror = false
): ((point: Point2D) => Point2D) | null {
  const transform = coverTransform(source, dest);
  if (!transform) return null;

  const { scale, offsetX, offsetY } = transform;
  return (point) => {
    const x = offsetX + point.x * source.width * scale;
    return {
      x: mirror ? dest.width - x : x,
      y: offsetY + point.y * source.height * scale,
    };
  };
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

export interface SkeletonColors {
  left: string;
  right: string;
  center: string;
}

/** Warm for left, cool for right, neutral for the spine and face. */
export const SKELETON_COLORS: SkeletonColors = {
  left: '#fbbf24',
  right: '#38bdf8',
  center: '#e2e8f0',
};

/**
 * Below this, MediaPipe is guessing at an occluded joint. Drawing those produces
 * limbs that flail around behind the torso and make tracking look broken when it
 * is not.
 */
export const MIN_VISIBILITY = 0.5;

export interface DrawSkeletonOptions {
  /** Intrinsic video size — `videoWidth` × `videoHeight`. */
  source: Size;
  /** Canvas size in CSS pixels. */
  dest: Size;
  /** Match the mirrored video. Defaults to true, as every drill view mirrors. */
  mirror?: boolean;
  minVisibility?: number;
  colors?: SkeletonColors;
}

/** The 2D context surface this module needs — narrowed so tests can stub it. */
type DrawingContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
>;

function isVisible(point: ScreenPoint | undefined, min: number): point is ScreenPoint {
  // `visibility` is optional in the type and absent in hand-built fixtures;
  // treat a missing score as present rather than silently drawing nothing.
  return point !== undefined && (point.visibility ?? 1) >= min;
}

/**
 * Draws bones and joints for one pose. The caller owns clearing and the
 * device-pixel-ratio transform, so this works in CSS pixels throughout.
 *
 * Returns false when nothing could be drawn — degenerate sizes, or a pose whose
 * every landmark is below the visibility floor.
 */
export function drawSkeleton(
  ctx: DrawingContext,
  landmarks: readonly ScreenPoint[],
  options: DrawSkeletonOptions
): boolean {
  const { source, dest, mirror = true, minVisibility = MIN_VISIBILITY } = options;
  const colors = options.colors ?? SKELETON_COLORS;

  const project = createProjector(source, dest, mirror);
  if (!project || landmarks.length === 0) return false;

  // Bones are grouped by colour so the whole skeleton costs three strokes
  // rather than one per bone.
  const bones: Record<LandmarkSide, [Point2D, Point2D][]> = { left: [], right: [], center: [] };
  for (const [a, b] of POSE_CONNECTIONS) {
    const from = landmarks[a];
    const to = landmarks[b];
    if (!isVisible(from, minVisibility) || !isVisible(to, minVisibility)) continue;
    bones[connectionSide(a, b)].push([project(from), project(to)]);
  }

  const joints = landmarks.filter((point) => isVisible(point, minVisibility)).map(project);
  if (joints.length === 0) return false;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trace = () => {
    ctx.beginPath();
    for (const side of ['center', 'left', 'right'] as const) {
      for (const [from, to] of bones[side]) {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
    }
  };

  // A dark underlay first: over a bright shirt or a window behind the referee,
  // an unoutlined skeleton disappears exactly when it is being checked.
  trace();
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.stroke();

  for (const side of ['center', 'left', 'right'] as const) {
    if (bones[side].length === 0) continue;
    ctx.beginPath();
    for (const [from, to] of bones[side]) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = colors[side];
    ctx.stroke();
  }

  ctx.beginPath();
  for (const joint of joints) {
    ctx.moveTo(joint.x + 3, joint.y);
    ctx.arc(joint.x, joint.y, 3, 0, Math.PI * 2);
  }
  ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.fill();

  ctx.restore();
  return true;
}

/* -------------------------------------------------------------------------- */
/* Canvas sizing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Matches the canvas backing store to its CSS box at the current device pixel
 * ratio and returns the CSS size to draw in.
 *
 * Resizing a canvas clears it and is not free, so the write is skipped when the
 * dimensions already agree — otherwise every frame would blank the layer.
 */
export function syncCanvasSize(canvas: HTMLCanvasElement, devicePixelRatio = 1): Size | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!(width > 0 && height > 0)) return null;

  // Capped: a 3× ratio on a large display quadruples fill cost for a skeleton
  // nobody is inspecting at that resolution.
  const ratio = Math.min(Math.max(devicePixelRatio, 1), 2);
  const backingWidth = Math.round(width * ratio);
  const backingHeight = Math.round(height * ratio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  return { width, height };
}
