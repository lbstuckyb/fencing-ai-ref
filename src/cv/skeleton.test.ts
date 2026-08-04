import { describe, expect, it } from 'vitest';
import {
  connectionSide,
  coverTransform,
  createProjector,
  drawSkeleton,
  landmarkSide,
  POSE_CONNECTIONS,
  SKELETON_COLORS,
  syncCanvasSize,
} from './skeleton';
import type { Point2D } from './skeleton';
import { POSE, POSE_LANDMARK_COUNT } from './types';
import type { ScreenPoint } from './types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** A full pose with every landmark visible at the centre, then overridden. */
function pose(overrides: Record<number, Partial<ScreenPoint>> = {}): ScreenPoint[] {
  return Array.from({ length: POSE_LANDMARK_COUNT }, (_, index) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
    ...overrides[index],
  }));
}

interface StrokeRecord {
  style: string;
  width: number;
}

function stubContext() {
  const lineTo: Point2D[] = [];
  const moveTo: Point2D[] = [];
  const arcs: Point2D[] = [];
  const strokes: StrokeRecord[] = [];
  const fills: string[] = [];

  const ctx = {
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    strokeStyle: '' as string,
    fillStyle: '' as string,
    save() {},
    restore() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      moveTo.push({ x, y });
    },
    lineTo(x: number, y: number) {
      lineTo.push({ x, y });
    },
    arc(x: number, y: number) {
      arcs.push({ x, y });
    },
    stroke() {
      strokes.push({ style: ctx.strokeStyle, width: ctx.lineWidth });
    },
    fill() {
      fills.push(ctx.fillStyle);
    },
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, lineTo, moveTo, arcs, strokes, fills };
}

/* -------------------------------------------------------------------------- */
/* Connections                                                                */
/* -------------------------------------------------------------------------- */

describe('POSE_CONNECTIONS', () => {
  it('references only real landmark indices', () => {
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(POSE_LANDMARK_COUNT);
    }
  });

  it('lists each bone once', () => {
    const keys = POSE_CONNECTIONS.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
    expect(new Set(keys).size).toBe(POSE_CONNECTIONS.length);
  });
});

describe('landmarkSide', () => {
  // The mirror trap: sides are anatomical, so these must match the real limbs
  // regardless of how the video is transformed for display.
  it('reads anatomical sides off the landmark indices', () => {
    expect(landmarkSide(POSE.RIGHT_WRIST)).toBe('right');
    expect(landmarkSide(POSE.LEFT_WRIST)).toBe('left');
    expect(landmarkSide(POSE.RIGHT_SHOULDER)).toBe('right');
    expect(landmarkSide(POSE.LEFT_HIP)).toBe('left');
    expect(landmarkSide(POSE.NOSE)).toBe('center');
  });

  it('treats a bone spanning the body as central', () => {
    expect(connectionSide(POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER)).toBe('center');
    expect(connectionSide(POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW)).toBe('left');
    expect(connectionSide(POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST)).toBe('right');
  });
});

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

describe('coverTransform', () => {
  it('scales without offset when the aspect ratios match', () => {
    const t = coverTransform({ width: 640, height: 360 }, { width: 1280, height: 720 });
    expect(t).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('crops top and bottom for a 4:3 camera in a 16:9 box', () => {
    const t = coverTransform({ width: 640, height: 480 }, { width: 1280, height: 720 });
    expect(t?.scale).toBe(2);
    expect(t?.offsetX).toBe(0);
    // 960 px of scaled video in a 720 px box: 120 px lost off each end.
    expect(t?.offsetY).toBe(-120);
  });

  it('crops left and right for an ultrawide camera', () => {
    const t = coverTransform({ width: 1000, height: 250 }, { width: 500, height: 250 });
    expect(t?.scale).toBe(1);
    expect(t?.offsetX).toBe(-250);
    expect(t?.offsetY).toBe(0);
  });

  it('returns null for the 0x0 a video reports before metadata loads', () => {
    expect(coverTransform({ width: 0, height: 0 }, { width: 640, height: 360 })).toBeNull();
    expect(coverTransform({ width: 640, height: 360 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('createProjector', () => {
  const dest = { width: 1280, height: 720 };

  it('keeps the body centred whatever the camera aspect ratio', () => {
    // This is the registration property that matters: a joint at the centre of
    // the source frame must land at the centre of the box, cropped or not.
    for (const source of [
      { width: 640, height: 360 },
      { width: 640, height: 480 },
      { width: 480, height: 640 },
    ]) {
      const project = createProjector(source, dest);
      expect(project?.({ x: 0.5, y: 0.5 })).toEqual({ x: 640, y: 360 });
    }
  });

  it('maps the source corners through the cover crop', () => {
    const project = createProjector({ width: 640, height: 480 }, dest, false);
    expect(project?.({ x: 0, y: 0 })).toEqual({ x: 0, y: -120 });
    expect(project?.({ x: 1, y: 1 })).toEqual({ x: 1280, y: 840 });
  });

  it('mirrors x only, matching the flipped video', () => {
    const source = { width: 640, height: 360 };
    const plain = createProjector(source, dest, false);
    const mirrored = createProjector(source, dest, true);
    const point = { x: 0.25, y: 0.75 };

    const a = plain?.({ x: point.x, y: point.y });
    const b = mirrored?.({ x: point.x, y: point.y });
    expect(b?.x).toBe(dest.width - (a?.x ?? 0));
    expect(b?.y).toBe(a?.y);
  });

  it('returns null for a degenerate size rather than dividing by zero', () => {
    expect(createProjector({ width: 0, height: 0 }, dest)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

describe('drawSkeleton', () => {
  const source = { width: 640, height: 360 };
  const dest = { width: 640, height: 360 };

  it('draws every bone and joint of a fully visible pose', () => {
    const { ctx, lineTo, arcs } = stubContext();

    expect(drawSkeleton(ctx, pose(), { source, dest })).toBe(true);
    // Each bone is traced twice: once for the dark underlay, once in colour.
    expect(lineTo).toHaveLength(POSE_CONNECTIONS.length * 2);
    expect(arcs).toHaveLength(POSE_LANDMARK_COUNT);
  });

  it('drops the bones of an occluded joint', () => {
    const { ctx, lineTo, arcs } = stubContext();
    // A hidden left wrist takes the forearm and the three hand bones with it.
    const occluded = pose({ [POSE.LEFT_WRIST]: { visibility: 0.1 } });

    drawSkeleton(ctx, occluded, { source, dest });
    expect(lineTo).toHaveLength((POSE_CONNECTIONS.length - 4) * 2);
    expect(arcs).toHaveLength(POSE_LANDMARK_COUNT - 1);
  });

  it('colours the limbs by anatomical side', () => {
    const { ctx, strokes } = stubContext();
    drawSkeleton(ctx, pose(), { source, dest });

    const styles = strokes.map((stroke) => stroke.style);
    expect(styles).toContain(SKELETON_COLORS.left);
    expect(styles).toContain(SKELETON_COLORS.right);
    expect(styles).toContain(SKELETON_COLORS.center);
    // The underlay must be stroked first and wider than the colour on top.
    expect(strokes[0].width).toBeGreaterThan(strokes[1].width);
  });

  it('mirrors the drawing to sit over the mirrored video', () => {
    const { ctx: plainCtx, arcs: plainArcs } = stubContext();
    const { ctx: mirroredCtx, arcs: mirroredArcs } = stubContext();
    const subject = pose({ [POSE.RIGHT_WRIST]: { x: 0.2, y: 0.3 } });

    drawSkeleton(plainCtx, subject, { source, dest, mirror: false });
    drawSkeleton(mirroredCtx, subject, { source, dest, mirror: true });

    // The referee's right wrist, held out to their right, is drawn towards the
    // left of the screen — which is where the mirrored video shows it.
    expect(plainArcs[POSE.RIGHT_WRIST].x).toBeCloseTo(128);
    expect(mirroredArcs[POSE.RIGHT_WRIST].x).toBeCloseTo(dest.width - 128);
    expect(mirroredArcs[POSE.RIGHT_WRIST].y).toBeCloseTo(plainArcs[POSE.RIGHT_WRIST].y);
  });

  it('treats a landmark with no visibility score as visible', () => {
    const { ctx, arcs } = stubContext();
    const unscored = pose().map(({ x, y, z }) => ({ x, y, z }) as ScreenPoint);

    expect(drawSkeleton(ctx, unscored, { source, dest })).toBe(true);
    expect(arcs).toHaveLength(POSE_LANDMARK_COUNT);
  });

  it('draws nothing when there is no pose or no room to draw it', () => {
    const { ctx, lineTo } = stubContext();
    expect(drawSkeleton(ctx, [], { source, dest })).toBe(false);
    expect(drawSkeleton(ctx, pose(), { source, dest: { width: 0, height: 0 } })).toBe(false);
    expect(drawSkeleton(ctx, pose({}), { source: { width: 0, height: 0 }, dest })).toBe(false);
    expect(lineTo).toHaveLength(0);
  });

  it('draws nothing when the whole pose is below the visibility floor', () => {
    const { ctx } = stubContext();
    const ghost = pose().map((point) => ({ ...point, visibility: 0.2 }));
    expect(drawSkeleton(ctx, ghost, { source, dest })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Canvas sizing                                                              */
/* -------------------------------------------------------------------------- */

describe('syncCanvasSize', () => {
  function canvasOf(width: number, height: number): HTMLCanvasElement {
    // jsdom does no layout, so the CSS box has to be declared.
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: width });
    Object.defineProperty(canvas, 'clientHeight', { value: height });
    return canvas;
  }

  it('sizes the backing store by the device pixel ratio', () => {
    const canvas = canvasOf(640, 360);
    expect(syncCanvasSize(canvas, 2)).toEqual({ width: 640, height: 360 });
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });

  it('caps the ratio so a 3x display does not triple the fill cost', () => {
    const canvas = canvasOf(640, 360);
    syncCanvasSize(canvas, 3);
    expect(canvas.width).toBe(1280);
  });

  it('leaves an already-correct canvas untouched, since resizing clears it', () => {
    const canvas = canvasOf(640, 360);
    syncCanvasSize(canvas, 1);
    const spy = { count: 0 };
    Object.defineProperty(canvas, 'width', {
      get: () => 640,
      set: () => {
        spy.count += 1;
      },
    });
    syncCanvasSize(canvas, 1);
    expect(spy.count).toBe(0);
  });

  it('returns null for an unlaid-out canvas', () => {
    expect(syncCanvasSize(canvasOf(0, 0), 1)).toBeNull();
  });
});
