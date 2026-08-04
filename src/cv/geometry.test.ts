import { describe, expect, it } from 'vitest';
import {
  angleAt,
  angleBetween,
  cross,
  directionAngles,
  dot,
  elbowAngle,
  length,
  limbAngles,
  normalize,
  reject,
  shoulderWidth,
  subtract,
  toTorsoFrame,
  torsoFrame,
  torsoHeight,
} from './geometry';
import type { TorsoFrame } from './geometry';
import { POSE } from './types';
import type { WorldPoint } from './types';
import {
  ARM_DOWN,
  ARM_FORWARD,
  ARM_LATERAL,
  ARM_OVERHEAD,
  FIXTURE_TORSO_METERS,
  makePose,
} from '../test/poseFixtures';

/** Angles here are computed in closed form, so they should agree to the bit. */
const EXACT = 6;

function frameOf(pose: readonly WorldPoint[]): TorsoFrame {
  const frame = torsoFrame(pose);
  if (!frame) throw new Error('fixture produced no torso frame');
  return frame;
}

/* -------------------------------------------------------------------------- */
/* Vector primitives                                                          */
/* -------------------------------------------------------------------------- */

describe('vector primitives', () => {
  it('returns null rather than a NaN triple for a zero-length vector', () => {
    expect(normalize({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(normalize({ x: 3, y: 4, z: 0 })).toEqual({ x: 0.6, y: 0.8, z: 0 });
  });

  it('rejects a vector onto the plane perpendicular to an axis', () => {
    const rejected = reject({ x: 2, y: 5, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(rejected).toEqual({ x: 2, y: 0, z: 0 });
  });

  it('does not return NaN for parallel vectors', () => {
    // acos of a dot product that floating point nudged past 1.0 is NaN, and the
    // symptom would be a perfectly straight arm failing every constraint.
    //
    // The loose tolerance is inherent rather than sloppy: acos has a vertical
    // tangent at ±1, so a dot product accurate to machine epsilon still yields
    // an angle accurate only to its square root. A microdegree either side of
    // straight is nothing next to the tolerances t.63 implies.
    const a = { x: 0.1, y: 0.2, z: 0.3 };
    expect(angleBetween(a, a)).toBeCloseTo(0, 4);
    expect(angleBetween(a, { x: -0.1, y: -0.2, z: -0.3 })).toBeCloseTo(180, 4);
  });

  it('measures the angle at the middle joint', () => {
    const straight = angleAt({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const square = angleAt({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(straight).toBeCloseTo(180, EXACT);
    expect(square).toBeCloseTo(90, EXACT);
  });

  it('has no angle to report when a segment has no length', () => {
    const origin = { x: 0, y: 0, z: 0 };
    expect(angleAt(origin, origin, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Torso frame                                                                */
/* -------------------------------------------------------------------------- */

describe('torsoFrame', () => {
  it('produces an orthonormal basis', () => {
    const frame = frameOf(makePose());
    for (const axis of [frame.right, frame.up, frame.forward]) {
      expect(length(axis)).toBeCloseTo(1, EXACT);
    }
    expect(dot(frame.right, frame.up)).toBeCloseTo(0, EXACT);
    expect(dot(frame.up, frame.forward)).toBeCloseTo(0, EXACT);
    expect(dot(frame.forward, frame.right)).toBeCloseTo(0, EXACT);
    // Right-handed in the order (right, up, forward), so the basis never
    // silently flips orientation.
    const derived = cross(frame.up, frame.right);
    expect(dot(derived, frame.forward)).toBeCloseTo(1, EXACT);
  });

  it('measures the torso and takes the hips as its origin', () => {
    const frame = frameOf(makePose());
    expect(frame.scale).toBeCloseTo(FIXTURE_TORSO_METERS, EXACT);
    expect(length(frame.origin)).toBeCloseTo(0, EXACT);
  });

  it('points its axes along the anatomy, not the image', () => {
    const pose = makePose();
    const frame = frameOf(pose);

    // The right shoulder must be on the positive side of the right axis. This
    // is the mirroring trap in test form: MediaPipe's RIGHT_SHOULDER is the
    // referee's actual right shoulder, whatever the display transform does.
    expect(toTorsoFrame(frame, pose[POSE.RIGHT_SHOULDER]).x).toBeGreaterThan(0);
    expect(toTorsoFrame(frame, pose[POSE.LEFT_SHOULDER]).x).toBeLessThan(0);
    // The head is above the hips.
    expect(toTorsoFrame(frame, pose[POSE.NOSE]).y).toBeGreaterThan(0);
    // The nose is in front of the ears — the one anatomical fact that pins down
    // the sign of `forward` independently of the coordinate convention.
    const earMidZ =
      (toTorsoFrame(frame, pose[POSE.LEFT_EAR]).z + toTorsoFrame(frame, pose[POSE.RIGHT_EAR]).z) /
      2;
    expect(toTorsoFrame(frame, pose[POSE.NOSE]).z).toBeGreaterThan(earMidZ);
  });

  it('reports height in torso lengths, hips at 0 and shoulders at 1', () => {
    const pose = makePose({ arms: { right: ARM_LATERAL } });
    const frame = frameOf(pose);

    expect(torsoHeight(frame, pose[POSE.LEFT_HIP])).toBeCloseTo(0, EXACT);
    expect(torsoHeight(frame, pose[POSE.RIGHT_SHOULDER])).toBeCloseTo(1, EXACT);
    // A lateral arm holds the wrist at shoulder height.
    expect(torsoHeight(frame, pose[POSE.RIGHT_WRIST])).toBeCloseTo(1, EXACT);
    expect(torsoHeight(frame, pose[POSE.LEFT_WRIST])).toBeLessThan(0);
  });

  it('measures shoulder width for the converging-hands test', () => {
    expect(shoulderWidth(makePose())).toBeCloseTo(0.38, EXACT);
    expect(shoulderWidth([])).toBeNull();
  });

  it('refuses to build a frame from missing or collapsed landmarks', () => {
    expect(torsoFrame([])).toBeNull();

    const collapsed = makePose();
    // Shoulders on top of the hips: no spine, therefore no basis.
    collapsed[POSE.LEFT_SHOULDER] = { ...collapsed[POSE.LEFT_HIP] };
    collapsed[POSE.RIGHT_SHOULDER] = { ...collapsed[POSE.RIGHT_HIP] };
    expect(torsoFrame(collapsed)).toBeNull();

    const fused = makePose();
    // Both shoulders at one point: no lateral axis.
    fused[POSE.LEFT_SHOULDER] = { ...fused[POSE.RIGHT_SHOULDER] };
    expect(torsoFrame(fused)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Limb angles                                                                */
/* -------------------------------------------------------------------------- */

describe('limb angles', () => {
  it('reads the canonical arm positions off a square-on body', () => {
    const pose = makePose({
      arms: { right: ARM_LATERAL, left: ARM_DOWN },
    });
    const frame = frameOf(pose);

    const lateral = limbAngles(pose, frame, 'right');
    expect(lateral?.elevation).toBeCloseTo(0, EXACT);
    expect(lateral?.abduction).toBeCloseTo(90, EXACT);
    expect(lateral?.azimuth).toBeCloseTo(90, EXACT);

    const down = limbAngles(pose, frame, 'left');
    expect(down?.elevation).toBeCloseTo(-90, EXACT);
    expect(down?.abduction).toBeCloseTo(0, EXACT);
  });

  it('reads an overhead arm as full abduction', () => {
    const pose = makePose({ arms: { right: ARM_OVERHEAD } });
    const angles = limbAngles(pose, frameOf(pose), 'right');
    expect(angles?.elevation).toBeCloseTo(90, EXACT);
    expect(angles?.abduction).toBeCloseTo(180, EXACT);
  });

  it('separates a forward arm from a lateral one by azimuth alone', () => {
    // Simultaneous vs. Double hit hinges on exactly this distinction.
    const forward = makePose({ arms: { right: ARM_FORWARD } });
    const lateral = makePose({ arms: { right: ARM_LATERAL } });

    const forwardAngles = limbAngles(forward, frameOf(forward), 'right');
    const lateralAngles = limbAngles(lateral, frameOf(lateral), 'right');

    expect(forwardAngles?.elevation).toBeCloseTo(0, EXACT);
    expect(lateralAngles?.elevation).toBeCloseTo(0, EXACT);
    expect(forwardAngles?.azimuth).toBeCloseTo(0, EXACT);
    expect(lateralAngles?.azimuth).toBeCloseTo(90, EXACT);
  });

  it('reports an arm crossing the midline as negative azimuth', () => {
    const pose = makePose({ arms: { right: { upper: { elevation: 0, azimuth: -40 } } } });
    expect(limbAngles(pose, frameOf(pose), 'right')?.azimuth).toBeCloseTo(-40, EXACT);
  });

  it('gives both arms the same numbers for the mirrored gesture', () => {
    // Specs are authored once for the right arm and mirrored by the evaluator in
    // stage 9; that only works because azimuth is measured toward each limb's
    // own side.
    const pose = makePose({ arms: { right: ARM_LATERAL, left: ARM_LATERAL } });
    const frame = frameOf(pose);

    const right = limbAngles(pose, frame, 'right');
    const left = limbAngles(pose, frame, 'left');
    expect(left?.elevation).toBeCloseTo(right?.elevation ?? NaN, EXACT);
    expect(left?.abduction).toBeCloseTo(right?.abduction ?? NaN, EXACT);
    expect(left?.azimuth).toBeCloseTo(right?.azimuth ?? NaN, EXACT);

    // And they are genuinely on opposite sides of the body.
    expect(toTorsoFrame(frame, pose[POSE.RIGHT_WRIST]).x).toBeGreaterThan(0);
    expect(toTorsoFrame(frame, pose[POSE.LEFT_WRIST]).x).toBeLessThan(0);
  });

  it('measures the forearm separately from the upper arm', () => {
    // The Parry gesture: upper arm out, forearm vertical.
    const pose = makePose({
      arms: {
        right: { upper: { elevation: 0, azimuth: 60 }, forearm: { elevation: 90, azimuth: 0 } },
      },
    });
    const frame = frameOf(pose);

    expect(limbAngles(pose, frame, 'right', 'upper')?.elevation).toBeCloseTo(0, EXACT);
    expect(limbAngles(pose, frame, 'right', 'forearm')?.elevation).toBeCloseTo(90, EXACT);
  });

  it('has no angles to report without landmarks', () => {
    const frame = frameOf(makePose());
    expect(limbAngles([], frame, 'right')).toBeNull();
    expect(directionAngles(frame, { x: 0, y: 0, z: 0 }, 'right')).toBeNull();
  });
});

describe('elbowAngle', () => {
  it('reads a fully extended arm as 180 degrees', () => {
    const pose = makePose({ arms: { right: ARM_LATERAL } });
    expect(elbowAngle(pose, 'right')).toBeCloseTo(180, EXACT);
  });

  it('reads a square elbow as 90 degrees', () => {
    // Upper arm out to the side, forearm straight up — the Hit scored shape.
    const pose = makePose({
      arms: {
        right: { upper: { elevation: 0, azimuth: 90 }, forearm: { elevation: 90, azimuth: 0 } },
      },
    });
    expect(elbowAngle(pose, 'right')).toBeCloseTo(90, EXACT);
  });

  it('reads a folded arm as an acute angle', () => {
    // Upper arm out to the right, forearm folded back across the body and up.
    const pose = makePose({
      arms: {
        right: { upper: { elevation: 0, azimuth: 90 }, forearm: { elevation: 60, azimuth: -90 } },
      },
    });
    expect(elbowAngle(pose, 'right')).toBeCloseTo(60, EXACT);
  });

  it('has nothing to report without landmarks', () => {
    expect(elbowAngle([], 'right')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Invariance — the property the whole classifier rests on                    */
/* -------------------------------------------------------------------------- */

describe('torso-frame invariance', () => {
  /** The Attack signal, held identically by a body in various orientations. */
  const gesture = {
    right: { upper: { elevation: -10, azimuth: 75 }, forearm: { elevation: 25, azimuth: 40 } },
    left: ARM_DOWN,
  };

  function measure(options: Parameters<typeof makePose>[0]) {
    const pose = makePose({ arms: gesture, ...options });
    const frame = frameOf(pose);
    return {
      upper: limbAngles(pose, frame, 'right', 'upper'),
      forearm: limbAngles(pose, frame, 'right', 'forearm'),
      elbow: elbowAngle(pose, 'right'),
      wristHeight: torsoHeight(frame, pose[POSE.RIGHT_WRIST]),
    };
  }

  const square = measure({});

  it('is unchanged by a body rotated 30 degrees off-axis', () => {
    // The test the plan singles out: if this fails, nothing downstream is
    // reliable, because a referee never stands square to their webcam.
    const turned = measure({ yawDeg: 30 });
    expect(turned.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    expect(turned.upper?.azimuth).toBeCloseTo(square.upper?.azimuth ?? NaN, EXACT);
    expect(turned.forearm?.elevation).toBeCloseTo(square.forearm?.elevation ?? NaN, EXACT);
    expect(turned.forearm?.azimuth).toBeCloseTo(square.forearm?.azimuth ?? NaN, EXACT);
    expect(turned.elbow).toBeCloseTo(square.elbow ?? NaN, EXACT);
    expect(turned.wristHeight).toBeCloseTo(square.wristHeight, EXACT);
  });

  it('is unchanged by a referee leaning forward', () => {
    const leaning = measure({ pitchDeg: 20 });
    expect(leaning.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    expect(leaning.upper?.azimuth).toBeCloseTo(square.upper?.azimuth ?? NaN, EXACT);
    expect(leaning.wristHeight).toBeCloseTo(square.wristHeight, EXACT);
  });

  it('is unchanged by turning and leaning at once', () => {
    const both = measure({ yawDeg: -55, pitchDeg: 12 });
    expect(both.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    expect(both.upper?.azimuth).toBeCloseTo(square.upper?.azimuth ?? NaN, EXACT);
    expect(both.elbow).toBeCloseTo(square.elbow ?? NaN, EXACT);
  });

  it('is unchanged by the size of the referee', () => {
    const tall = measure({ scale: 1.3 });
    const small = measure({ scale: 0.75 });
    expect(tall.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    expect(small.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    // Heights are in torso lengths, so they survive it too.
    expect(tall.wristHeight).toBeCloseTo(square.wristHeight, EXACT);
    expect(small.wristHeight).toBeCloseTo(square.wristHeight, EXACT);
  });

  it('is unchanged by where the referee stands in the frame', () => {
    const moved = measure({ offset: { x: 0.9, y: -0.4, z: 1.7 } });
    expect(moved.upper?.elevation).toBeCloseTo(square.upper?.elevation ?? NaN, EXACT);
    expect(moved.upper?.azimuth).toBeCloseTo(square.upper?.azimuth ?? NaN, EXACT);
    expect(moved.wristHeight).toBeCloseTo(square.wristHeight, EXACT);
  });

  it('is measuring something a camera-space reading would get wrong', () => {
    // Guards against the invariance tests passing vacuously: the same rotation
    // that the torso frame absorbs must visibly move a naive camera-space angle.
    const cameraAzimuth = (yawDeg: number) => {
      const pose = makePose({ arms: gesture, yawDeg });
      const arm = subtract(pose[POSE.RIGHT_ELBOW], pose[POSE.RIGHT_SHOULDER]);
      // Straight out of the raw world axes, with no body basis involved.
      return (Math.atan2(arm.x, arm.z) * 180) / Math.PI;
    };

    const drift = Math.abs(cameraAzimuth(30) - cameraAzimuth(0));
    expect(drift).toBeGreaterThan(25);
  });
});

/* -------------------------------------------------------------------------- */
/* Documented degeneracy                                                      */
/* -------------------------------------------------------------------------- */

describe('azimuth near the vertical', () => {
  it('is unstable for a near-vertical limb, which is why specs bound elevation', () => {
    const frame = frameOf(makePose());
    // Two arms a degree either side of straight up, whose azimuths are a
    // half-turn apart. Nothing is wrong here — the horizontal projection of a
    // vertical limb has no direction — but a spec that reads azimuth without
    // bounding elevation would be reading noise.
    const nearlyUp = directionAngles(frame, { x: 0, y: -1, z: -0.01 }, 'right');
    const nearlyUpOther = directionAngles(frame, { x: 0, y: -1, z: 0.01 }, 'right');
    expect(nearlyUp?.elevation).toBeGreaterThan(89);
    expect(nearlyUpOther?.elevation).toBeGreaterThan(89);
    expect(Math.abs((nearlyUp?.azimuth ?? 0) - (nearlyUpOther?.azimuth ?? 0))).toBeCloseTo(180, 0);
  });
});
