export const BOARD = Object.freeze({ width: 1024, height: 1536 });
export const CAMERA_OVERSCAN = 136;

export const BET_STEPS = Object.freeze([
  0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 2.5, 3, 5, 10, 20, 30, 50, 100, 200, 350,
]);

export const SPEEDS = Object.freeze([
  { id: "turbo", label: "Lightning", glyph: "ϟ", factor: 2.4 },
  { id: "fast", label: "Hare", glyph: "➤", factor: 1.55 },
  { id: "normal", label: "Walk", glyph: "●", factor: 1 },
  { id: "slow", label: "Turtle", glyph: "◆", factor: 0.68 },
]);

export const PHASES = Object.freeze({
  LOADING: "loading",
  IDLE: "idle",
  REQUESTED: "requested",
  ANTICIPATION: "anticipation",
  ACTIVE: "active",
  DESCENT: "descent",
  REVEAL: "reveal",
  SETTLEMENT: "settlement",
});

export const BUMPERS = Object.freeze([
  // The upper two rows are registered from the authenticated 1408×629
  // reference capture. Their previous positions were 30–40 screen pixels too
  // high and pulled the first rebound into a repeated roof loop.
  { id: "divide-left", x: 249, y: 460, radius: 35, label: "÷2", kind: "divide", value: 2, asset: "red-divider" },
  { id: "plus-a", x: 457, y: 476, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  { id: "plus-b", x: 571, y: 476, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-radial" },
  {
    id: "divide-right",
    x: 774,
    y: 460,
    radius: 35,
    label: "÷2",
    kind: "divide",
    value: 2,
    asset: "red-radial",
  },
  { id: "plus-c", x: 355, y: 618, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-radial" },
  { id: "plus-d", x: 671, y: 618, radius: 36, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  { id: "plus-e", x: 315, y: 825, radius: 35, label: "+2", kind: "add", value: 2, asset: "blue-core" },
  { id: "plus-f", x: 512, y: 825, radius: 33, label: "+3", kind: "add", value: 3, asset: "green-swirl" },
  {
    id: "plus-g",
    x: 710,
    y: 825,
    radius: 35,
    label: "+3",
    kind: "add",
    value: 3,
    asset: "blue-swirl",
    winRestitution: 0.595,
    winTangentRetention: 1.074,
    winKick: 0.22,
  },
  { id: "multiply-two", x: 512, y: 1010, radius: 38, label: "×2", kind: "multiply", value: 2, asset: "amber-multiply" },
  { id: "plus-h", x: 300, y: 1175, radius: 35, label: "+4", kind: "add", value: 4, asset: "violet-star" },
  { id: "plus-i", x: 512, y: 1175, radius: 36, label: "+5", kind: "add", value: 5, asset: "amber-multiply" },
  { id: "plus-j", x: 725, y: 1175, radius: 35, label: "+4", kind: "add", value: 4, asset: "violet-star" },
]);

export const POCKETS = Object.freeze([
  // The authenticated lower-board frames show the side receivers spread much
  // farther from the center pedestal than the former compact button row. At
  // the matched 1408 px crop their measured screen centers are about
  // 459/706/952 px; 212/512/812 board px project to those centers. The side
  // capture mouths remain deliberately wide because the resolved rigid body
  // enters their inner edge before the selected receiver contact guides it to
  // the optical center behind the foreground gate.
  { id: "left", x: 212, y: 1470, multiplier: 1, label: "×1", captureHalfWidth: 108, housingWidth: 188, baseWidth: 220 },
  { id: "center", x: 512, y: 1470, multiplier: 7, label: "×7", captureHalfWidth: 98, housingWidth: 176, baseWidth: 204 },
  { id: "right", x: 812, y: 1470, multiplier: 1, label: "×1", captureHalfWidth: 108, housingWidth: 188, baseWidth: 220 },
]);

// These are the visible posts that participate in the simulation. The prior
// field had 41 posts; exhaustive safe/win/collision and sixteen-loss traces
// proved ten were never contacted, so they were removed from both rendering
// and collision data to match the reference's lower visual density without
// introducing invisible colliders. One source of truth still prevents the
// ball from ghosting through a post that looks solid on screen.
export const PEGS = Object.freeze([
  { id: "peg-u1", x: 145, y: 438, radius: 8.5 },
  { id: "peg-u2", x: 357, y: 474, radius: 8.5 },
  {
    id: "peg-u3",
    x: 662,
    y: 457,
    radius: 8.5,
    spring: "guide",
    // The resolved win uses the measured lower face of the same visible
    // crown rubber. Other outcomes retain the shared launch-field position.
    winX: 660.8053311757743,
    winY: 463.2346932247281,
    winRestitution: 0.6357584127045756,
    winTangentRetention: 0.4542580958202564,
    winKick: 0.12493801914906655,
  },
  // A retractable crown pin remains part of the safe/loss/collision field.
  // The resolved win visibly withdraws it before the ball reaches the crown,
  // exposing the played reference's rail-first return lane.
  {
    id: "peg-u4",
    x: 883,
    y: 416,
    radius: 8.5,
    retractForWin: true,
    winRestitution: 0.05,
    winTangentRetention: 0.8,
    winKick: 0,
  },
  { id: "peg-01", x: 145, y: 575, radius: 8.5 },
  { id: "peg-02", x: 260, y: 575, radius: 8.5 },
  { id: "peg-03", x: 405, y: 575, radius: 8.5 },
  // After the exposed outer crown lip performs the first reversal, this
  // visible rubber stud returns the same body into the validated right-wall
  // descent. The fitted response is passive and strictly outward: no hidden
  // accelerator or free-flight velocity assignment is used.
  {
    id: "peg-06",
    x: 824.0911689768545,
    y: 495.81272715702653,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.7874838033691047,
    tangentRetention: 1.0614810852799565,
    kick: 0.33517771870829166,
    winRestitution: 0.12719992116762815,
    winTangentRetention: 3.630478656527395,
    winKick: 0,
  },
  // A lower crown return rubber receives the gravity-led win exit after the
  // authenticated 2.4 s traverse. It is rendered as distinctive hardware,
  // not another scoring lamp, and remains a real collider in every mode.
  {
    id: "peg-return",
    x: 810.11,
    y: 609.53,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.52,
    tangentRetention: 0.99,
    kick: 0,
    winX: 811.4505951007834,
    winY: 609.6859717660851,
    winRestitution: 0.9541213275705049,
    winTangentRetention: 2.351046779781396,
    winKick: 0.015171117528475766,
  },
  // The upper-left return stud sits clear of the cabinet rail and turns the
  // first shallow rail rebound into the second measured left-side descent.
  // Its rendered center is the same center used by the rigid-body solver.
  { id: "peg-07", x: 190, y: 800, radius: 8.5 },
  { id: "peg-08", x: 250, y: 735, radius: 8.5 },
  { id: "peg-09", x: 380, y: 735, radius: 8.5 },
  {
    id: "peg-10",
    x: 512,
    y: 735,
    radius: 8.5,
    // The authenticated win visibly commits +3 at the first central return.
    // This is still the same solid rubber contact used by the fixed-step
    // trajectory; the scoring metadata only registers its already-physical
    // hit to the multiplier/effect timeline.
    scoringKind: "add",
    scoringValue: 3,
    scoringCooldownMs: 900,
    label: "+3",
    // The fast first strike keeps the established upper return. The slower
    // re-contact compresses the rubber more deeply and creates the long,
    // weighted leftward arc visible in the first-party sequence.
    winSlowThreshold: 0.6,
    winSlowRestitution: 1,
    winSlowTangentRetention: 1.52,
    winSlowKick: 0,
  },
  // The next visible stud absorbs the rail-return's excess lateral energy and
  // rejoins the broad measured descent without an invisible convergence step.
  {
    id: "peg-11",
    x: 575,
    y: 680,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.7008710579946638,
    tangentRetention: 0.21186247086152435,
    kick: 0.08786168112419546,
    winRestitution: 0.496,
    winTangentRetention: 0.27,
  },
  { id: "peg-12", x: 775, y: 735, radius: 8.5 },
  // Raised into the visible right-lane stud row so the descending ball can
  // glance outward once, then clear underneath it after the rail return.
  {
    id: "peg-13",
    x: 892,
    y: 720,
    radius: 8.5,
    winRestitution: 0.05,
    winTangentRetention: 1.1,
    winKick: 0,
  },
  // Keep the lower stud a full ball radius away from the cabinet wall. The
  // prior half-pixel overlap could resolve a wall and stud in one step.
  { id: "peg-14", x: 190, y: 950, radius: 8.5 },
  { id: "peg-15", x: 235, y: 910, radius: 8.5 },
  { id: "peg-16", x: 385, y: 910, radius: 8.5 },
  { id: "peg-18", x: 790, y: 910, radius: 8.5 },
  {
    id: "peg-19",
    x: 905,
    y: 910,
    radius: 8.5,
    winRestitution: 1.1,
    winTangentRetention: 0,
    winKick: 0.125,
    winSlowThreshold: 1.2,
    winSlowTangentRetention: 1,
  },
  {
    id: "peg-20",
    x: 112,
    y: 1070,
    radius: 8.5,
    winRestitution: 0.005,
    winTangentRetention: 1.015,
  },
  // Registered lower-left sleeve: its tangential carry produces the measured
  // lower return before the final cabinet-wall chain and left pocket.
  {
    id: "peg-21",
    x: 252.36062218993902,
    y: 1088.4131172555499,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.6582856208551675,
    tangentRetention: 0.17549020862206816,
    kick: 0.30064227181719616,
    winRestitution: 0.4,
    winTangentRetention: 0,
    winKick: 0.68,
  },
  { id: "peg-25", x: 775, y: 1070, radius: 8.5 },
  { id: "peg-26", x: 912, y: 1070, radius: 8.5 },
  // This post is kept well inside the cabinet rail so the 22 px ball cannot
  // overlap the wall and stud in one solver step. The spacing removes the
  // double-contact catapult while preserving a visible lower-field actor.
  { id: "peg-27", x: 300, y: 1260, radius: 8.5 },
  // The lower-left sleeve stores more of the incoming tangential motion than
  // a bare steel post. Together with the cabinet rake it creates a physical
  // left-rail return rather than the former straight fall.
  {
    id: "peg-28",
    x: 230,
    y: 1260,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.37285596850328145,
    tangentRetention: 3.237501077679917,
    kick: 0.1547829019278288,
  },
  { id: "peg-29", x: 365, y: 1260, radius: 8.5 },
  // Registered to the measured lower-board reversal. Its passive rubber face
  // turns the first cabinet return back toward the same damped rail while
  // retaining depth. The second rail contact exits rightward into the apron
  // camera track and settles at the left pocket center.
  {
    id: "peg-34",
    x: 180.289952440653,
    y: 1367,
    radius: 8.5,
    spring: "rubber",
    restitution: 0.2236686628893949,
    tangentRetention: 0.05869007967412472,
    kick: 0.22365331488894297,
    winRestitution: 0.208,
    winTangentRetention: 0.258,
  },
  { id: "peg-35", x: 390, y: 1350, radius: 8.5 },
  { id: "peg-36", x: 635, y: 1350, radius: 8.5 },
  { id: "peg-37", x: 846, y: 1350, radius: 8.5 },
]);

// A real pinball rollover scores when the ball crosses its illuminated insert
// without changing velocity. Keeping it separate from solid circle colliders
// preserves the measured late route while giving the +4 phase a physical,
// visible trigger instead of a timeline-only multiplier edit.
export const ROLLOVERS = Object.freeze([
  // The accepted win body crosses this lower insert at the measured final +4
  // beat. A rollover senses that crossing without applying an impulse, so the
  // settled route and receiver entry remain the same rigid-body solution.
  { id: "rollover-plus-four", x: 254, y: 1354, radius: 13, label: "+4", kind: "add", value: 4 },
]);

export const SCENARIOS = Object.freeze({
  safe: {
    id: "safe",
    label: "Right pocket win",
    pocket: "right",
    payout: "multiplier",
    plungerSpeed: 1.147,
  },
  win: {
    id: "win",
    label: "Bumper-chain left-pocket win",
    pocket: "left",
    payout: "multiplier",
    // This launch remains inside the shared rigid-body solver. Its contact
    // itinerary is the closest retained fit to the authenticated motion trace:
    // it traverses the broad field, reaches the registered left-pocket center,
    // and terminates in the measured 5.25–5.54 s reference window.
    plungerSpeed: 1.3792769868134485,
  },
  loss: {
    id: "loss",
    label: "Rail-chain miss",
    pocket: null,
    payout: "none",
    plungerSpeed: 1.13,
    // Every retained miss crosses the broad table. Physical contacts remain
    // continuous while rapid scoring contacts are committed as one readable
    // visual/audio beat by the shared simulation event layer. These energies
    // also drain through the visible gaps around the widened receiver mouths;
    // no loss body harmlessly overlaps a foreground gate.
    plungerSpeeds: Object.freeze([
      1.1308,
      1.1394,
      1.172,
      1.1894,
      1.192,
      1.193,
      1.2274,
      1.2822,
      1.2844,
      1.2888,
      1.292,
      1.2954,
      1.3112,
      1.3404,
      1.3432,
      1.35,
    ]),
  },
  collision: {
    id: "collision",
    label: "Divider collision win",
    pocket: "center",
    payout: "multiplier",
    plungerSpeed: 1.207,
  },
});

export const TIMING = Object.freeze({
  requestEnd: 140,
  chargeStart: 240,
  chargeEnd: 620,
  physicsStart: 720,
  plungerReleaseEnd: 960,
  anticipationEnd: 1020,
  activeEnd: 4200,
  descentEnd: 5600,
  revealEnd: 6500,
  // The preserved result sequence keeps the lower receiver camera fixed
  // through count-up and result dwell. The plaque fades first, then the
  // cabinet returns, and only the completed return unlocks controls.
  resultFadeStart: 6200,
  resultFadeEnd: 6800,
  cameraReturnStart: 6800,
  cameraReturnEnd: 7400,
  settleAt: 7400,
  cameraFollowStart: 2900,
  cameraLookAheadEnd: 3400,
  // The played reference presents the mechanical hit first, then commits the
  // multiplier on the following visual beat. Keeping that delay in the shared
  // timeline makes frozen debug playback and live playback agree exactly.
  multiplierCommitDelay: 92,
  effectDuration: 340,
});

export const ASSETS = Object.freeze({
  board: "assets/generated/kinetic-cabinet-v2.webp",
  arcCircuitBoard: "assets/generated/boards/arc-circuit-v2.webp",
  vintageVegasBoard: "assets/generated/boards/vintage-vegas.webp",
  ball: "assets/generated/effects/ball-steel-v2.webp",
  impactFlare: "assets/generated/effects/impact-flare-v2.webp",
  impactRing: "assets/generated/effects/impact-ring.webp",
  starburst: "assets/generated/effects/starburst.webp",
  sparks: "assets/generated/effects/sparks.webp",
  streak: "assets/generated/effects/streak.webp",
  glow: "assets/generated/effects/glow.webp",
  titlePlaque: "assets/generated/ui/title-plaque.webp",
  crown: "assets/generated/ui/crown.webp",
  playBezel: "assets/generated/ui/play-bezel.webp",
  autoplayBezel: "assets/generated/ui/autoplay-bezel.webp",
  receiverChassis: "assets/generated/ui/receiver-chassis-v1.webp",
  receiverChassisArc: "assets/generated/ui/receiver-chassis-arc-v1.webp",
  bumpers: Object.fromEntries(
    ["green-swirl", "green-radial", "blue-core", "blue-swirl", "red-divider", "red-radial", "amber-multiply", "violet-star"].map(
      (name) => [name, `assets/generated/bumpers/${name}.webp`],
    ),
  ),
});
