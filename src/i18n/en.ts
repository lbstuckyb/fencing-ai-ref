/**
 * English — the source dictionary. Every other language is typed against this
 * shape, so a key added here and forgotten elsewhere fails `tsc`.
 *
 * `{name}` marks a value filled in at the call site. Ids that contain dots in
 * the code (measurement ids such as `wrist.vsNose`) use underscores here, since
 * a dot is the key separator.
 */
const en = {
  lang: {
    names: { en: 'English', es: 'Español', fr: 'Français' },
    selector: 'Language',
  },

  common: {
    moreInfo: 'More info',
    home: '‹ Home',
    tryAgain: 'Try again',
    cancel: 'Cancel',
    why: 'Why',
    startsIn: 'Starts in {n}…',
    recordingFor: 'Recording… {s} s',
    recordSeconds: 'Record {s} s',
    eitherArm: 'either arm',
  },

  /** Side phrases, whole — Spanish and French agree "left" with arm or hand. */
  side: {
    arm: { left: 'left arm', right: 'right arm' },
    yourArm: { left: 'your left arm', right: 'your right arm' },
    yourHand: { left: 'your left hand', right: 'your right hand' },
    yourSide: { left: 'your left', right: 'your right' },
  },

  nav: {
    brand: 'Fencing Referee Trainer',
    brandShort: 'Referee',
    skip: 'Skip to content',
    main: 'Main',
    tuning: 'Tuning',
    about: 'About',
    learn: 'Learn',
    practice: 'Practice',
    referee: 'Referee',
    yourSignals: 'Your signals',
    readouts: 'Readouts',
  },

  home: {
    title1: 'Make',
    title2: 'the call.',
    enter: 'Enter ›',
    signals: 'Signals',
    hold: 'Hold',
    weapons: 'Weapons',
  },

  about: {
    title: 'About',
    p1: 'This project aims to let everyone around the world practice and improve their fencing refereeing.',
    p2: 'Learn the signals, practice them in front of your camera, then referee real scenarios. Everything is graded against the FIE Technical Rules, Article {article}.',
    p3: 'Everything runs on your device: no video ever leaves your browser.',
  },

  notFound: {
    title: 'Page not found',
  },

  reference: {
    title: 'Learn',
    selected: 'Selected signal',
    namesFencer: 'Names a fencer',
    namesFencerHint:
      'The arm you use says which fencer: left arm for the fencer on your left (red), right arm for the one on your right (green).',
    eitherArm: 'Either arm',
    notGraded: 'Not graded',
    readsHand: 'Reads your hand',
    drill: 'Drill {signal} ›',
    drillAll: 'Drill all ›',
    rulebook: 'Rulebook ↗',
    filter: 'Filter by group',
    all: 'All',
  },

  practice: {
    title: 'Drill',
    streak: 'Streak',
    best: 'Best',
    score: 'Score',
    signals: '‹ Signals',
    hintRandom:
      'Random order. Lower your arms after each signal to get the next. Pick one to stay on it.',
    hintPinned: 'Staying on {signal}. Next signal goes back to random.',
    next: 'Next signal ›',
    referee: 'Referee ›',
    pickOne: 'Drill one signal',
    close: 'Close',
    namesFencer: 'names a fencer',
  },

  feedbackUi: {
    held: '{signal} — held {s} s',
    quick: '{signal} — too quick',
    wrongArm: '{signal} — wrong arm',
    wrongArmUse: 'Wrong arm — use your',
    holding: 'Held',
    holdIt: 'Hold it',
    shape: 'shape {n}%',
  },

  scenarios: {
    title: 'Referee',
    difficulty: 'Difficulty {n}',
    about: 'About {weapon}',
    neverCalled: 'Never called: {signals}.',
    rightOfWay: 'Right of way',
    noRightOfWay: 'No right of way',
    phrases: '‹ Phrases',
    hint: 'Frame yourself, then play the phrase. You get five seconds to set. Every signal you hold is captured until you submit, replays included.',
    noSignal: 'No signal yet',
    noCalls: 'No calls yet',
    callsSoFar: 'Calls so far',
    quick: 'quick',
    undo: 'Undo last call',
    submit: 'Submit call',
  },

  player: {
    unavailable: 'Clip unavailable',
    unavailableHint1: 'Placeholder clips are generated, not committed. Run',
    unavailableHint2: '(needs ffmpeg), or drop a clip at',
    unavailableHint3: '. You can still make and grade the call.',
    pause: 'Pause',
    play: 'Play',
    replay: 'Replay',
    stepBack: 'Step back one frame',
    stepForward: 'Step forward one frame',
    slowMotion: 'Slow motion',
    slow: 'Slow',
    ended: 'Clip ended · still capturing',
    getReady: 'Get ready to call',
    playPhrase: 'Play the phrase',
    waiting: 'Waiting for camera',
  },

  grade: {
    correct: 'Correct',
    out_of_order: 'Out of order',
    wrong_side: 'Wrong arm',
    wrong_signal: 'Wrong signal',
    missing: 'Missing',
    spoken: 'Spoken',
    extra: 'Extra',
    correctCount: '{correct}/{total} correct',
    extraCalls: 'Extra calls',
    whatHappened: 'What happened',
    tryAgain: 'Try again',
    allPhrases: 'All phrases',
    nextPhrase: 'Next phrase ›',
    sideNote: ' with {arm}',
    msgCorrect: '{signal}{sideNote} — correct.',
    msgOutOfOrder: '{signal}{sideNote} was made correctly, but out of order.',
    msgWrongSide:
      '{signal} was right, but made with {callArm} — this one names the fencer on {side}.',
    msgWrongSignal: 'Expected {signal}{sideNote}, but you called {call} here instead.',
    msgMissing: '{signal}{sideNote} was never called.',
    msgExtra: 'You also called {call}{sideNote}, which was not part of this phrase.',
  },

  camera: {
    start: 'Start camera',
    stop: 'Stop camera',
    starting: 'Starting camera…',
    about: 'About the camera',
    aboutHint: 'Every frame is processed in this tab. Nothing is uploaded or recorded.',
    noPose: 'no pose in frame',
    landmarks: '{n} landmarks @ {rate}/s',
    hand: '{n} hand',
    hands: '{n} hands',
    handsUnavailable: 'Hand detail is unavailable',
    handsUnavailableHint: 'The hand model did not load. Arm geometry still grades. Run',
    failures: {
      insecure_context: {
        title: 'The browser will not share a camera on this page',
        detail:
          'Camera access needs a secure context. Open the app over https, or on localhost during development.',
      },
      permission_denied: {
        title: 'Camera permission was denied',
        detail:
          'Grant camera access for this site — usually the camera icon in the address bar — then start again. Nothing you record is uploaded; the video is processed in this tab and discarded.',
      },
      no_camera: {
        title: 'No camera found',
        detail: 'Connect a webcam and start again. The drills need a live view of your upper body.',
      },
      camera_busy: {
        title: 'The camera is in use',
        detail:
          'Another application or browser tab is holding the camera. Close it, then start again.',
      },
      camera_lost: {
        title: 'The camera stopped',
        detail:
          'The video track ended — the device may have been unplugged or its permission revoked.',
      },
      model_assets: {
        title: 'The pose model is missing',
        detail:
          'The MediaPipe model and runtime are vendored into public/ rather than fetched from a CDN. Run `npm run fetch-assets`, then start again.',
      },
      model_runtime: {
        title: 'Pose detection failed to start',
        detail:
          'The pose landmarker could not initialise in this browser. A recent Chrome, Edge, Firefox or Safari is required.',
      },
      unknown: {
        title: 'The camera could not be started',
        detail: 'Something unexpected went wrong. The browser console has the details.',
      },
    },
  },

  calibrate: {
    title: 'Calibrate',
    hint: 'Live readouts of every quantity the signal specs use. Perform a signal, record the hold, and write the measured numbers into the spec.',
    measurement: 'Measurement',
    noSamples: 'no samples',
    classified: 'Classified shape — {shapes}',
    clear: 'Clear recording',
    recorded: 'Recorded {frames} frames over {s} s',
    recordedHint:
      'The smaller line in each cell is min · median · max across the hold. Take the median as the centre of a band and the spread as the tolerance it needs.',
  },

  calibrateSignals: {
    title: 'Expert calibration',
    hint: 'Record yourself making each signal correctly. Drills then grade against your recording instead of the default. A new take replaces the old one; reset brings the default back.',
    arm: 'Arm',
    rightArm: 'Right arm',
    leftArm: 'Left arm',
    bothArms: 'Both arms',
    recording: 'Recording',
    recordedWith: 'Recorded with {arm}',
    save: 'Save',
    retake: 'Retake',
    coreTen: 'The core ten',
    coreTenHint:
      'Pick a signal to record it. Export saves every recording on this device to a file; import loads one back in, on top of what is already saved.',
    export: 'Export recordings',
    import: 'Import recordings',
    usingYours: 'Using your recording',
    usingDefault: 'Using default band',
    reset: 'Reset to default',
    measurement: 'Measurement',
    youRecorded: 'You recorded',
    defaultBand: 'Default band',
    newBand: 'New band',
    skippedOne:
      '{n} more constraint — hand shape or arm symmetry — not shown here: neither is a band a recording can widen.',
    skippedMany:
      '{n} more constraints — hand shape or arm symmetry — not shown here: neither is a band a recording can widen.',
  },

  /** The rule-checking text the drill and the evaluator build at runtime. */
  coaching: {
    tooQuick:
      'Held for {held} s — too quick: a signal must last {min}–{max} seconds and be expressive.',
    wrongSide:
      'That is a correct {signal}, but made with {arm}. The signal names the fencer on that side, so this one has to be {prompted}.',
    sideWord: ' ({arm})',
    unmeasured:
      '{label}{side} could not be measured — make sure your whole upper body is in frame.',
    outOfRange: '{label}{side}: {value} — expected {band}.',
    handMissing: '{hand} was not detected — hold it where the camera can see it.',
    wrongShape: '{hand} reads as {shape} — this signal needs {expected}.',
    symmetryUnmeasured: '{label} could not be measured on both arms — make sure both are in frame.',
    asymmetric: 'Your arms differ by {delta} in {label} — this signal needs them level.',
    atLeast: 'at least {n}',
    atMost: 'at most {n}',
    anyValue: 'any value',
  },

  shapes: {
    open_palm: 'open palm',
    fist: 'fist',
    index_point: 'index point',
    unknown: 'unknown',
    none: 'not detected',
  },

  /** Signal names (all twenty t.63 signals) and how each is made. */
  signals: {
    halt: {
      label: 'Halt',
      description:
        'One arm raised straight overhead with the palm open: stop fencing. The other arm stays down.',
    },
    attack: {
      label: 'Attack',
      description:
        'The signalling arm out to the side with the elbow bent, forearm pointing at the fencer who attacked. The same gesture serves for stop-hit, counter-attack and remise, which are named aloud.',
    },
    parry: {
      label: 'Parry',
      description:
        'The forearm raised near-vertical beside the head with the elbow low, mimicking a parry: the fencer on that side parried. Counter-time uses the same gesture.',
    },
    point_in_line: {
      label: 'Point in line',
      description:
        'The arm extended straight out to the side with the index finger pointed at the fencer who established the point in line.',
    },
    hit_scored: {
      label: 'Hit scored',
      description:
        'The arm raised out and up on the side of the fencer who scored, elbow at about a right angle: the hit is theirs.',
    },
    hit_against: {
      label: 'Hit against',
      description:
        'The arm extended straight out to the side with a flat hand, on the side of the fencer against whom the hit was scored.',
    },
    not_valid: {
      label: 'Not valid',
      description:
        'The arm extended straight down and out towards the floor on that fencer’s side: their hit landed off-target and does not count.',
    },
    double_hit: {
      label: 'Double hit',
      description:
        'Both arms extended sideways at shoulder height: both fencers scored — a double hit, which counts for both in épée.',
    },
    simultaneous: {
      label: 'Simultaneous',
      description:
        'Both arms brought forward with the hands converging in front of the chest: the two attacks were simultaneous, so no hit is awarded.',
    },
    nothing: {
      label: 'Nothing',
      description:
        'Both arms extended low and forward with the palms turned down: no hit is awarded — the phrase produced nothing.',
    },
    on_guard: {
      label: 'On guard',
      description: 'Signals the fencers to take the on-guard position before the phrase begins.',
    },
    ready: {
      label: 'Ready?',
      description: 'Asks both fencers whether they are ready to fence.',
    },
    play: {
      label: 'Play',
      description: 'Starts the phrase: the fencers may now fence.',
    },
    incorrect: {
      label: 'Incorrect',
      description:
        "Marks that a fencer's action was incorrectly performed, without awarding a touch.",
    },
    no: {
      label: 'No',
      description:
        "Rejects a fencer's request — for example, an appeal to stop the phrase or claim a touch.",
    },
    hit_for_each: {
      label: 'Hit for each',
      description:
        'Awards the touch to both fencers, distinct from the priority-resolved Double hit call.',
    },
    technical_touch: {
      label: 'Technical touch',
      description:
        'Awards a touch caused by a material or apparatus fault rather than a fencing action.',
    },
    changing_decision: {
      label: 'Changing decision',
      description:
        'Reverses a previous call, typically after consulting the jury or reviewing video.',
    },
    card: {
      label: 'Card',
      description:
        'Shows a yellow, red or black card: a warning, a penalty touch, or exclusion from the competition.',
    },
    winner: {
      label: 'Winner',
      description: 'Declares the winner of the bout.',
    },
  },

  groups: {
    preparatory: 'Preparatory',
    phrase_analysis: 'Phrase analysis',
    awarding: 'Awarding',
    administrative: 'Administrative',
  },

  /** One line of coaching per failed constraint, named in `signals/specs.ts`. */
  feedback: {
    offArmDown: 'Keep your other arm down at your side',
    haltStraighten: 'Straighten your raised arm fully',
    haltOverhead: 'Take your arm straight up overhead',
    haltAboveHead: 'Raise your hand above your head',
    haltOpenHand: 'Open your raised hand fully, palm forward',
    attackBend: 'Bend your elbow — a straight arm is a different signal',
    attackShoulderHeight: 'Bring your upper arm out to shoulder height',
    attackForearm: 'Point your forearm out to the side, at the fencer who attacked',
    handLevelShoulder: 'Hold your hand level with your shoulder',
    attackOutToSide: 'Take the signal out to the side, not forward',
    bendRightAngle: 'Bend your elbow to about a right angle',
    parryForearm: 'Bring your forearm up towards vertical, as if parrying',
    parryElbowLow: 'Keep your elbow low — only the forearm comes up',
    parryAboveShoulder: 'Raise your hand above your shoulder',
    parryBesideHead: 'Keep your hand beside your head, not out to the side',
    extendFully: 'Extend your arm fully',
    armShoulderHeight: 'Hold your arm out at shoulder height',
    pointOutToSide: 'Point straight out to the side',
    pointIndex: 'Point with your index finger — an open hand is “hit against”',
    hitRaiseArm: 'Raise your whole arm out to the scorer’s side',
    hitHandHigh: 'Raise your hand well above your shoulder',
    hitScorerSide: 'Raise the arm out on the scorer’s side, not in front of your head',
    againstOutToSide: 'Take your arm straight out to the side',
    againstFlatHand: 'Show a flat, open hand — a pointed finger is “point in line”',
    keepStraight: 'Keep the arm straight',
    notValidAngle: 'Angle the arm down towards the floor, about halfway to your side',
    notValidBelowShoulder: 'Hold your hand well below your shoulder',
    notValidAway: 'Take the arm out away from your body, not straight down in front',
    doubleStraighten: 'Straighten both arms fully out to the sides',
    doubleShoulderHeight: 'Raise both hands to shoulder height',
    doubleOutToSides: 'Take both arms out to the sides, not forward',
    bothLevel: 'Hold both arms level with each other',
    simultaneousExtend: 'Extend both arms forward',
    simultaneousChest: 'Hold both hands at chest height',
    simultaneousInFront: 'Bring both arms out in front of you',
    simultaneousTogether: 'Bring your hands together in front of you',
    nothingStraighten: 'Straighten both arms',
    nothingLow: 'Lower both hands below your waist',
    nothingForward: 'Reach both arms forward, not down at your sides',
    nothingOpen: 'Open both hands, palms turned down',
  },

  rules: {
    index: {
      title: 'FIE rules & documents',
      description: 'The official index — always points at the edition currently in force.',
    },
    technical: {
      title: 'Technical rules',
      description: 'Conduct of the bout, right of way, and the referee signals in Article t.63.',
    },
    organisation: {
      title: 'Organisation rules',
      description: 'Competition formats, seeding, and the conduct of events.',
    },
    material: {
      title: 'Material rules',
      description: 'Weapons, clothing, and scoring apparatus specifications.',
    },
    edition: 'August 2026',
  },

  weapons: {
    epee: {
      label: 'Épée',
      target: 'The whole body, mask to feet.',
      summary:
        'No priority: whoever lands first scores, and two lights inside the lockout give a hit to each. The referee calls the outcome, never the phrase.',
      excluded: {
        attack: 'Épée has no right of way, so the phrase is never analysed for priority.',
        parry: 'Parry is a priority call, and épée does not use priority.',
        point_in_line: 'A line only matters because it takes priority — which épée does not award.',
        not_valid: 'The whole body is target, so no hit can land off-target.',
        simultaneous:
          'Simultaneous is a priority call. In épée, two lights inside the lockout are a hit for each.',
      },
    },
    foil: {
      label: 'Foil',
      target: 'The trunk, front and back, plus the lower part of the mask bib.',
      summary:
        'Full priority set. Both lights resolve to one fencer, to no touch when the actions are genuinely simultaneous, or to an off-target hit that stops the bout without scoring.',
      excluded: {
        double_hit:
          'Priority resolves both lights to one fencer or to no touch — foil never awards a hit to each.',
      },
    },
    sabre: {
      label: 'Sabre',
      target: 'Everything above the waist except the hands — mask, arms and trunk.',
      summary:
        'Full priority set, and no off-target: a blow outside the target area simply does not register, so there is nothing to signal.',
      excluded: {
        double_hit:
          'Priority resolves both lights to one fencer or to no touch — sabre never awards a hit to each.',
        not_valid: 'Sabre has no off-target hit, so there is no invalid hit to signal.',
      },
    },
  },

  /** Calls the referee says aloud, keyed by their English wording. */
  spoken: {
    riposte: 'riposte',
  },

  measure: {
    groups: {
      arm: {
        label: 'Arm angles',
        note: 'Measured in the torso frame, so they do not change when you turn away from the camera — watch “off square” below while you check that.',
      },
      wrist: {
        label: 'Wrist position',
        note: 'In torso lengths rather than meters, so one threshold fits a 1.6 m and a 2 m referee. Height is the primary discriminator for the two-armed signals.',
      },
      body: {
        label: 'Both arms, and the body',
        note: 'The two-armed signals separate on these. “Off square” is the invariance check: turn on the spot and every angle above should hold still while this number climbs.',
      },
      hand: {
        label: 'Hand shape',
        note: 'Only Halt, Point in line and Nothing read fingers. Each number is tip-to-wrist over knuckle-to-wrist: above 1.15 counts as extended, below 0.95 as curled, and the gap between is deliberately “unknown”.',
      },
    },
    rows: {
      elbow: { label: 'Elbow', hint: '180 straight, 90 square, 0 folded shut' },
      upper_elevation: {
        label: 'Upper arm elevation',
        hint: '−90 hanging down, 0 level, +90 overhead',
      },
      upper_abduction: {
        label: 'Upper arm abduction',
        hint: 'elevation + 90 — the form the t.63 readings use',
      },
      upper_azimuth: {
        label: 'Upper arm azimuth',
        hint: '0 straight ahead, +90 out to that arm’s own side',
      },
      forearm_elevation: {
        label: 'Forearm elevation',
        hint: 'near +90 is the vertical forearm of Parry',
      },
      forearm_azimuth: {
        label: 'Forearm azimuth',
        hint: 'near +90 is the lateral forearm of Attack',
      },
      wrist_height: { label: 'Height', hint: '0 at the hips, 1 at the shoulders' },
      wrist_vsShoulder: { label: 'Height vs. shoulder', hint: '0 is level with that shoulder' },
      wrist_vsNose: {
        label: 'Height vs. nose',
        hint: 'positive is above the nose, as Halt requires',
      },
      wrist_lateral: {
        label: 'Out from midline',
        hint: 'positive is away from the body’s centre line',
      },
      wrist_forward: { label: 'Forward of chest', hint: 'positive is in front of the chest' },
      wrists_gap: {
        label: 'Wrist separation',
        hint: '× shoulder width; under 1 is hands converged',
      },
      wrists_heightDelta: {
        label: 'Wrist height difference',
        hint: '0 is level — the symmetry Double hit wants',
      },
      body_turn: { label: 'Off square to camera', hint: '0 is facing the camera squarely' },
      body_lean: { label: 'Lean from vertical', hint: '0 is standing upright' },
      body_torso: {
        label: 'Torso length',
        hint: 'hips to shoulders — the scale every height is divided by',
      },
      body_shoulderWidth: { label: 'Shoulder width', hint: 'the reference for wrist separation' },
      hand_index: { label: 'Index finger', hint: '' },
      hand_middle: { label: 'Middle finger', hint: '' },
      hand_ring: { label: 'Ring finger', hint: '' },
      hand_pinky: { label: 'Pinky finger', hint: '' },
      hand_thumb: { label: 'Thumb', hint: 'reported only — no shape is classified on it' },
    },
  },
};

export default en;
