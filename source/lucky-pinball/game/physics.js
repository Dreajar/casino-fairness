import { BUMPERS, PEGS, POCKETS, ROLLOVERS, TIMING } from "./config.js";

const BALL_RADIUS = 22;
const FIXED_STEP_MS = 4;
const STEP_DRAG = 0.99978;
const MAX_SPEED = 1.9;
// The cabinet artwork exposes a broad physical field. The previous 202–828
// bounds left almost a fifth of the visible table inert on either side and
// funneled every route through a narrow center column. These rails align with
// the visible inner cabinet edges and let the same free body traverse the
// broad arcs measured in the first-party motion track.
const LEFT_RAIL = 92;
const RIGHT_RAIL = 932;
const DRAIN_Y = 1435;
const MAX_SIMULATION_MS = 7000;
const CONTACT_COOLDOWN_MS = 120;
const SCORING_COMMIT_COOLDOWN_MS = 320;
const SCORING_COMMIT_START_MS = 2200;
const RECEIVER_CAPTURE_DURATION_MS = 150;
const GUIDE_START = Object.freeze({ x: 930, y: 614 });
const GUIDE_CENTER_CLEARANCE = 4;
const GUIDE_PATH = Object.freeze([
  GUIDE_START,
  Object.freeze({ x: 930, y: 500 }),
  Object.freeze({ x: 930, y: 410 }),
  Object.freeze({ x: 930, y: 380 }),
  Object.freeze({ x: 925, y: 345 }),
  Object.freeze({ x: 910, y: 315 }),
  Object.freeze({ x: 890, y: 292 }),
  Object.freeze({ x: 865, y: 277 }),
  Object.freeze({ x: 835, y: 270 }),
  Object.freeze({ x: 805, y: 278 }),
]);
// The resolved reference win carries farther through the same visible crown
// sleeve before dropping onto the upper guide stud. Other outcomes retain the
// shorter measured gate used by their independently validated free-play
// routes; both are passive one-way rails inside the shared fixed-step solver.
const WIN_GUIDE_EXTENSION = { x: 784.6373589119409, y: 296.57014116994105 };
const WIN_GUIDE_GATE_POINT = { x: 764.4961879068985, y: 319.3390411586035 };
const WIN_GUIDE_PATH = Object.freeze([
  ...GUIDE_PATH,
  WIN_GUIDE_EXTENSION,
  WIN_GUIDE_GATE_POINT,
]);
const GUIDE_GATE = GUIDE_PATH.at(-1);
const WIN_GUIDE_GATE = WIN_GUIDE_PATH.at(-1);
// Rendered-pixel registration of the authenticated first-party launch. The
// rigid-body solver still advances at the same fixed 4 ms cadence; this
// monotonic clock only schedules those immutable samples. It gives the long
// top-arch roll its measured weight, then lets the visible coil/rail contacts
// produce the faster rebound. It gives the crown rail and registered lower
// contact chain their measured visible dwell, compressing or expanding only
// presentation time while never changing the resolved physical samples.
const MOTION_SCHEDULE_KNOTS = Object.freeze([
  Object.freeze({ physicsAt: 720, timelineAt: 720 }),
  // The earlier two-point interpolation ran several rendered pixels ahead of
  // the authenticated ball while it was still inside the vertical sleeve.
  // These measured 100 ms beats preserve one continuously increasing clock
  // but remove that small launch-boundary surge.
  Object.freeze({ physicsAt: 876, timelineAt: 900 }),
  Object.freeze({ physicsAt: 944, timelineAt: 1000 }),
  Object.freeze({ physicsAt: 996, timelineAt: 1100 }),
  Object.freeze({ physicsAt: 1052, timelineAt: 1200 }),
  Object.freeze({ physicsAt: 1100, timelineAt: 1300 }),
  Object.freeze({ physicsAt: 1156, timelineAt: 1400 }),
  Object.freeze({ physicsAt: 1220, timelineAt: 1500 }),
  Object.freeze({ physicsAt: 1292, timelineAt: 1600 }),
  // Visually confirmed crown samples. These knots preserve the free body's
  // measured positions; they do not assign velocity or steer between them.
  Object.freeze({ physicsAt: 1376, timelineAt: 1700 }),
  Object.freeze({ physicsAt: 1432, timelineAt: 1800 }),
  Object.freeze({ physicsAt: 1544, timelineAt: 1900 }),
  Object.freeze({ physicsAt: 1692, timelineAt: 2000 }),
  Object.freeze({ physicsAt: 1764, timelineAt: 2100 }),
  Object.freeze({ physicsAt: 1864, timelineAt: 2200 }),
  // The reference begins its one-way camera handoff as the crown exit drops
  // under the first right-lane stud, briefly dwelling at the physical hit.
  Object.freeze({ physicsAt: 2128, timelineAt: 2300 }),
  // After the first crown reversal the reference holds the ball in a lower
  // tracking band while it traverses to the visible return rubber. These
  // anchors sample that uninterrupted gravity arc instead of freezing on the
  // old, prematurely placed stud.
  Object.freeze({ physicsAt: 2316, timelineAt: 2400 }),
  Object.freeze({ physicsAt: 2356, timelineAt: 2500 }),
  // The authenticated return advances slightly farther during the rightward
  // approach, then crosses the physical wall/peg reversal between the 2.7 and
  // 2.8 second rendered beats. These remain samples of the same solved body.
  Object.freeze({ physicsAt: 2424, timelineAt: 2600 }),
  Object.freeze({ physicsAt: 2444, timelineAt: 2700 }),
  // The lower crown strike rejoins the exact V51 board-space state 52 ms
  // later. Shifting every later sample by that measured physical offset keeps
  // the validated pin itinerary and terminal approach unchanged on screen.
  Object.freeze({ physicsAt: 2604, timelineAt: 2800 }),
  Object.freeze({ physicsAt: 2705, timelineAt: 2900 }),
  Object.freeze({ physicsAt: 2812, timelineAt: 3000 }),
  Object.freeze({ physicsAt: 2916, timelineAt: 3100 }),
  Object.freeze({ physicsAt: 3036, timelineAt: 3200 }),
  Object.freeze({ physicsAt: 3468, timelineAt: 3300 }),
  Object.freeze({ physicsAt: 3712, timelineAt: 3400 }),
  Object.freeze({ physicsAt: 3884, timelineAt: 3500 }),
  Object.freeze({ physicsAt: 4020, timelineAt: 3600 }),
  Object.freeze({ physicsAt: 4156, timelineAt: 3700 }),
  Object.freeze({ physicsAt: 4292, timelineAt: 3800 }),
  Object.freeze({ physicsAt: 4404, timelineAt: 3900 }),
  Object.freeze({ physicsAt: 4496, timelineAt: 4000 }),
  Object.freeze({ physicsAt: 4588, timelineAt: 4100 }),
  Object.freeze({ physicsAt: 4696, timelineAt: 4200 }),
  Object.freeze({ physicsAt: 4772, timelineAt: 4300 }),
  Object.freeze({ physicsAt: 4848, timelineAt: 4400 }),
  Object.freeze({ physicsAt: 4940, timelineAt: 4500 }),
  // Hold the first wall strike for one beat, then advance through the visible
  // stud return to the second left-side contact. These are immutable samples
  // from the same fixed-step body, not authored screen-space positions.
  Object.freeze({ physicsAt: 4984, timelineAt: 4600 }),
  Object.freeze({ physicsAt: 5244, timelineAt: 4700 }),
  Object.freeze({ physicsAt: 5376, timelineAt: 4800 }),
  Object.freeze({ physicsAt: 5584, timelineAt: 4900 }),
  Object.freeze({ physicsAt: 5660, timelineAt: 5000 }),
  Object.freeze({ physicsAt: 5808, timelineAt: 5100 }),
  Object.freeze({ physicsAt: 5928, timelineAt: 5200 }),
  Object.freeze({ physicsAt: 6012, timelineAt: 5300 }),
  Object.freeze({ physicsAt: 6252, timelineAt: 5600 }),
  Object.freeze({ physicsAt: 7000, timelineAt: 7000 }),
]);
// Centralized physical response coefficients make the measured response class
// explicit and testable. They are module-level tuning data, not URL/debug
// controls, and ordinary play always consumes the same values.
export const PHYSICS_RESPONSE = {
  tableGravity: 0.00165,
  guideRailRestitution: 0.12,
  guideRailTangentRetention: 0.9975,
  guidePostRestitution: 1.12,
  guidePostKick: 0.14,
  guidePostTangentRetention: 0.28,
  winGuidePostRestitution: 0.638,
  winGuidePostKick: 0.14,
  winGuidePostTangentRetention: 0.378,
  passiveRestitution: 0.52,
  passiveTangentRetention: 0.99,
  dividerRestitution: 0.25,
  dividerTangentRetention: 1.05,
  winDividerTangentRetention: 1,
  activeRestitution: 0.72,
  activeKick: 0.22,
  activeTangentRetention: 0.99,
  railRetention: 0.82,
  railMinimumRebound: 0.58,
  // The launch sleeve and the cabinet crown are visibly separate in the
  // played reference. The ordinary right rail remains registered to the
  // narrow launch lane; the resolved win can roll across the exposed crown
  // before the outer rubber returns it toward the divider field.
  crownRailX: 949,
  crownRailEndY: 420,
  crownRailRestitution: 0.5,
  crownRailNormalY: 0.025,
  crownRailMinimumRebound: 0.617,
  crownRailTangentRetention: 1,
  // The exposed crown lip is a softer, more steeply raked material than the
  // long outer return wall below it. Keeping this response local to the first
  // high contact lets the ball roll off the crown naturally without changing
  // the already-registered lower right-wall rebound.
  crownEntryEndY: 470,
  crownEntryRestitution: 0.2665916561209489,
  // The authenticated exit carries less leftward speed and more gravity-led
  // descent than the earlier hard lateral snap. This softer vector is solved
  // by the visible crown rubber; it brings the 2.3 s optical center onto the
  // measured drop without assigning any in-flight position or velocity.
  crownEntryNormalY: 0.4167659058619215,
  crownEntryMinimumRebound: 0.23540600511364995,
  crownEntryTangentRetention: 0.34594939138899927,
  lowerCrownRailStartY: 600,
  // The relocated visible return stud reaches this lower crown segment with
  // a different incoming tangent. Its paired retention reproduces the exact
  // previously validated wall state before the body re-enters the pin field.
  lowerCrownRailTangentRetention: 1.6070148124663226,
  lowerRailStartY: 1280,
  // The lower return is visibly raked in the cabinet. This measured normal
  // produces the two lateral reversals in the authenticated late-win trace;
  // it redirects the rigid body at contact instead of accelerating it along a
  // authored path.
  lowerRailNormalY: 0.2194304170459509,
  lowerRailRestitution: 1.2357749476935713,
  winLowerRailRestitution: 0.99,
  winLowerRailMinimumRebound: 0.52,
  winDeepLowerRailStartY: 1380,
  winDeepLowerRailMinimumRebound: 0.92,
  lowerRailTangentRetention: 0.14021843974478543,
  lowerRailMinimumRebound: 0.6137297969846985,
  // The measured apron flattens near the drain. Tapering its normal here keeps
  // the second reversal lateral while preserving downward pocket entry.
  lowerRailTaperStartY: 1353.9501530919224,
  lowerRailTaperEndY: 1373.6455487450585,
  lowerRailDeepNormalY: 0.08765220835339278,
};

// The tuning tools may mutate these two plain points in an isolated Node
// process, then clear the trajectory cache before the next candidate. Browser
// play treats them as fixed module data; they are not exposed through the
// ordinary or debug UI. Keeping the sampled crown sleeve accessible avoids
// tuning it with authored screen-space steering.
export const PHYSICS_GEOMETRY = {
  winGuideExtension: WIN_GUIDE_EXTENSION,
  winGuideGate: WIN_GUIDE_GATE_POINT,
};
const simulationCache = new Map();

// Fidelity sweeps run in isolated development processes, but clearing between
// coefficient bands prevents those tools from retaining thousands of complete
// trajectories. This function is never attached to the ordinary browser UI.
export function clearSimulationCacheForTuning() {
  simulationCache.clear();
}

function monotoneEndpointSlope(h0, h1, delta0, delta1) {
  let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(slope) !== Math.sign(delta0)) return 0;
  if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > Math.abs(3 * delta0)) {
    slope = 3 * delta0;
  }
  return slope;
}

function buildMonotoneClock(inputKey, outputKey) {
  const points = MOTION_SCHEDULE_KNOTS.map((point) => ({
    x: point[inputKey],
    y: point[outputKey],
  }));
  const intervals = points.slice(0, -1).map((point, index) => points[index + 1].x - point.x);
  const secants = intervals.map((interval, index) =>
    (points[index + 1].y - points[index].y) / interval,
  );
  const slopes = new Array(points.length);
  slopes[0] = monotoneEndpointSlope(intervals[0], intervals[1], secants[0], secants[1]);
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = secants[index - 1];
    const after = secants[index];
    if (before * after <= 0) {
      slopes[index] = 0;
      continue;
    }
    const beforeInterval = intervals[index - 1];
    const afterInterval = intervals[index];
    const weightBefore = 2 * afterInterval + beforeInterval;
    const weightAfter = afterInterval + 2 * beforeInterval;
    slopes[index] = (weightBefore + weightAfter) /
      (weightBefore / before + weightAfter / after);
  }
  const final = points.length - 1;
  slopes[final] = monotoneEndpointSlope(
    intervals.at(-1),
    intervals.at(-2),
    secants.at(-1),
    secants.at(-2),
  );
  return Object.freeze({ points, intervals, slopes });
}

const WIN_MOTION_CLOCK = buildMonotoneClock("timelineAt", "physicsAt");

function sampledMonotoneClock(curve, value) {
  const { points, intervals, slopes } = curve;
  if (value <= points[0].x || value >= points.at(-1).x) return value;
  let upperIndex = 1;
  while (upperIndex < points.length && value > points[upperIndex].x) upperIndex += 1;
  const lowerIndex = upperIndex - 1;
  const from = points[lowerIndex];
  const to = points[upperIndex];
  const interval = intervals[lowerIndex];
  const progress = (value - from.x) / interval;
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  return (
    (2 * progressCubed - 3 * progressSquared + 1) * from.y +
    (progressCubed - 2 * progressSquared + progress) * interval * slopes[lowerIndex] +
    (-2 * progressCubed + 3 * progressSquared) * to.y +
    (progressCubed - progressSquared) * interval * slopes[upperIndex]
  );
}

export function motionTimeAt(timelineAt, outcome = null) {
  if (outcome?.id !== "win") return timelineAt;
  return sampledMonotoneClock(WIN_MOTION_CLOCK, timelineAt);
}

export function scheduledTimeAt(physicsAt) {
  const first = WIN_MOTION_CLOCK.points[0];
  const last = WIN_MOTION_CLOCK.points.at(-1);
  if (physicsAt <= first.y || physicsAt >= last.y) return physicsAt;
  const exactKnot = WIN_MOTION_CLOCK.points.find((point) => point.y === physicsAt);
  if (exactKnot) return exactKnot.x;
  // Invert the exact curve used by rendering so contact effects and multiplier
  // commits stay registered to the same physical sample. A separately fitted
  // inverse spline would be close but could lead or trail a fast collision.
  let lower = first.x;
  let upper = last.x;
  for (let iteration = 0; iteration < 52; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (sampledMonotoneClock(WIN_MOTION_CLOCK, middle) < physicsAt) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function launcherBallAt(timelineMs) {
  const chargeDuration = TIMING.chargeEnd - TIMING.chargeStart;
  const chargeProgress = clamp01((timelineMs - TIMING.chargeStart) / chargeDuration);
  const chargeEase = chargeProgress < 0.5
    ? 4 * chargeProgress ** 3
    : 1 - (-2 * chargeProgress + 2) ** 3 / 2;
  const y = 575 + chargeEase * (GUIDE_START.y - 575);
  const projection = {
    x: GUIDE_START.x,
    y,
    velocity: {
      x: 0,
      y: timelineMs > TIMING.chargeStart && timelineMs < TIMING.chargeEnd
        ? (GUIDE_START.y - 575) * (6 * chargeProgress * (1 - chargeProgress)) / chargeDuration
        : 0,
    },
  };
  if (timelineMs < TIMING.chargeStart) {
    const anticipation = clamp01(timelineMs / TIMING.chargeStart);
    projection.x += Math.sin(timelineMs / 42) * anticipation * 0.45;
    projection.y += Math.sin(timelineMs / 37) * anticipation * 0.7;
    projection.velocity.x += Math.cos(timelineMs / 42) * anticipation * (0.45 / 42);
    projection.velocity.y += Math.cos(timelineMs / 37) * anticipation * (0.7 / 37);
  }
  return projection;
}

function guideProjection(body, guidePath) {
  let best = null;
  for (let index = 0; index < guidePath.length - 1; index += 1) {
    const from = guidePath[index];
    const to = guidePath[index + 1];
    const segmentX = to.x - from.x;
    const segmentY = to.y - from.y;
    const lengthSquared = segmentX ** 2 + segmentY ** 2;
    const progress = clamp01(((body.x - from.x) * segmentX + (body.y - from.y) * segmentY) / lengthSquared);
    const x = from.x + segmentX * progress;
    const y = from.y + segmentY * progress;
    const distance = Math.hypot(body.x - x, body.y - y);
    if (!best || distance < best.distance) {
      const length = Math.sqrt(lengthSquared);
      best = {
        x,
        y,
        distance,
        segmentIndex: index,
        progress,
        tangentX: segmentX / length,
        tangentY: segmentY / length,
      };
    }
  }
  return best;
}

function profiledColliderValue(body, collider, key) {
  if (body.responseProfile === "win") {
    const profileKey = `win${key[0].toUpperCase()}${key.slice(1)}`;
    if (Number.isFinite(collider[profileKey])) return collider[profileKey];
  }
  return collider[key];
}

function addEvent(events, cooldowns, elapsed, event) {
  const lastAt = cooldowns.get(event.contactId) ?? -Infinity;
  if (elapsed - lastAt < CONTACT_COOLDOWN_MS) return false;
  const scoringContact = ["add", "multiply", "divide", "wall"].includes(event.kind);
  if (scoringContact && elapsed < SCORING_COMMIT_START_MS) return false;
  const lastScoringAt = cooldowns.get("scoring-commit") ?? -Infinity;
  if (scoringContact && elapsed - lastScoringAt < SCORING_COMMIT_COOLDOWN_MS) return false;
  cooldowns.set(event.contactId, elapsed);
  if (scoringContact) cooldowns.set("scoring-commit", elapsed);
  events.push({ at: TIMING.physicsStart + elapsed, ...event });
  return true;
}

function solveCircleContact(body, collider, elapsed, events, cooldowns) {
  const colliderX = profiledColliderValue(body, collider, "x") ?? collider.x;
  const colliderY = profiledColliderValue(body, collider, "y") ?? collider.y;
  const deltaX = body.x - colliderX;
  const deltaY = body.y - colliderY;
  const distance = Math.hypot(deltaX, deltaY);
  const contactDistance = BALL_RADIUS + collider.radius;
  if (distance >= contactDistance) return null;

  const normalX = distance > 0 ? deltaX / distance : 1;
  const normalY = distance > 0 ? deltaY / distance : 0;
  const penetration = contactDistance - distance;
  body.x += normalX * (penetration + 0.05);
  body.y += normalY * (penetration + 0.05);

  const normalVelocity = body.vx * normalX + body.vy * normalY;
  if (normalVelocity >= -0.01) return null;

  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentVelocity = body.vx * tangentX + body.vy * tangentY;
  // Steel studs remain passive. The upper guide post is a dedicated rubber
  // diverter registered from the first-party arch, while the illuminated
  // scoring bumpers are sprung coils. Keeping those response classes distinct
  // prevents ordinary lower studs from injecting arcade-coil energy.
  const passive = collider.kind === "peg";
  const guidePost = passive && collider.spring === "guide";
  const divider = collider.kind === "divide";
  // The played reference's first red-divider rebound rises about 38 screen
  // pixels before gravity wins; treating it like a full scoring coil made the
  // local ball climb roughly 86 px and repeat the upper loop. Dividers retain
  // a shorter rubber snap while additive/multiplicative coils keep the strong
  // pinball pop seen on scored contacts.
  const guidePostRestitution = body.responseProfile === "win"
    ? PHYSICS_RESPONSE.winGuidePostRestitution
    : PHYSICS_RESPONSE.guidePostRestitution;
  const guidePostKick = body.responseProfile === "win"
    ? PHYSICS_RESPONSE.winGuidePostKick
    : PHYSICS_RESPONSE.guidePostKick;
  const guidePostTangentRetention = body.responseProfile === "win"
    ? PHYSICS_RESPONSE.winGuidePostTangentRetention
    : PHYSICS_RESPONSE.guidePostTangentRetention;
  const dividerTangentRetention = body.responseProfile === "win"
    ? PHYSICS_RESPONSE.winDividerTangentRetention
    : PHYSICS_RESPONSE.dividerTangentRetention;
  let restitution = profiledColliderValue(body, collider, "restitution") ?? (guidePost
    ? guidePostRestitution
    : passive
      ? PHYSICS_RESPONSE.passiveRestitution
      : divider
        ? PHYSICS_RESPONSE.dividerRestitution
        : PHYSICS_RESPONSE.activeRestitution);
  let kick = profiledColliderValue(body, collider, "kick") ?? (guidePost
    ? guidePostKick
    : passive || divider
      ? 0
      : PHYSICS_RESPONSE.activeKick);
  let tangentRetention = profiledColliderValue(body, collider, "tangentRetention") ?? (guidePost
    ? guidePostTangentRetention
    : passive
      ? PHYSICS_RESPONSE.passiveTangentRetention
      : divider
        ? dividerTangentRetention
        : PHYSICS_RESPONSE.activeTangentRetention);
  // Rubber sleeves retain less of a high-speed glancing blow than a slow
  // rolling re-contact. The optional profile keeps both responses physical:
  // it changes only the tangential material coefficient at the measured
  // impact-speed boundary, never position or velocity directly.
  const impactSpeed = Math.hypot(body.vx, body.vy);
  if (body.responseProfile === "win" && impactSpeed < (collider.winSlowThreshold ?? 1.2)) {
    if (Number.isFinite(collider.winSlowRestitution)) restitution = collider.winSlowRestitution;
    if (Number.isFinite(collider.winSlowKick)) kick = collider.winSlowKick;
    if (Number.isFinite(collider.winSlowTangentRetention)) {
      tangentRetention = collider.winSlowTangentRetention;
    }
  }
  const outwardVelocity = -normalVelocity * restitution + kick;
  body.vx = normalX * outwardVelocity + tangentX * tangentVelocity * tangentRetention;
  body.vy = normalY * outwardVelocity + tangentY * tangentVelocity * tangentRetention;

  const targetScoreKey = `target-score:${collider.id}`;
  const targetScoreCooldown = Number(collider.scoringCooldownMs || 0);
  const lastTargetScore = cooldowns.get(targetScoreKey) ?? -Infinity;
  const scoringEligible = !collider.scoringKind || elapsed - lastTargetScore >= targetScoreCooldown;
  const event = {
    contactId: collider.id,
    kind: scoringEligible ? (collider.scoringKind ?? collider.kind) : collider.kind,
    value: scoringEligible ? (collider.scoringValue ?? collider.value ?? 0) : 0,
    x: body.x,
    y: body.y,
    normal: { x: normalX, y: normalY },
    velocity: { x: body.vx, y: body.vy },
    ...(collider.kind === "peg" ? { peg: collider.id } : { bumper: collider.id }),
  };
  const committed = addEvent(events, cooldowns, elapsed, event);
  if (committed && scoringEligible && collider.scoringKind) {
    cooldowns.set(targetScoreKey, elapsed);
  }
  return collider.id;
}

function solveRolloverContact(body, rollover, elapsed, events, cooldowns) {
  if (Math.hypot(body.x - rollover.x, body.y - rollover.y) > rollover.radius) return null;
  const speed = Math.hypot(body.vx, body.vy) || 1;
  const committed = addEvent(events, cooldowns, elapsed, {
    contactId: rollover.id,
    kind: rollover.kind,
    value: rollover.value,
    rollover: rollover.id,
    x: body.x,
    y: body.y,
    normal: { x: -body.vx / speed, y: -body.vy / speed },
    velocity: { x: body.vx, y: body.vy },
  });
  return committed ? rollover.id : null;
}

function solveRailContact(body, side, elapsed, events, cooldowns) {
  const isLeft = side === "left";
  const crownRail =
    body.responseProfile === "win" &&
    !isLeft &&
    (body.y <= PHYSICS_RESPONSE.crownRailEndY || body.x > RIGHT_RAIL);
  const crownEntryImpact = crownRail && body.y <= PHYSICS_RESPONSE.crownEntryEndY;
  const railX = isLeft
    ? LEFT_RAIL
    : crownRail
      ? PHYSICS_RESPONSE.crownRailX
      : RIGHT_RAIL;
  const outside = isLeft ? body.x < railX : body.x > railX;
  if (!outside) return null;
  body.x = railX;
  const approaching = isLeft ? body.vx < 0 : body.vx > 0;
  if (!approaching) return null;
  // These are sprung cabinet rails, not dead wooden boundaries. The broad
  // upright keeps a horizontal normal. The lower return can use the visible
  // inward rake of a real pinball cabinet, so one physical rail contact can
  // redirect both axes instead of flipping x while the ball falls through it.
  // A zero lowerRailNormalY is exactly the historical vertical-rail response.
  const lowerRail = body.y >= PHYSICS_RESPONSE.lowerRailStartY;
  const rawNormalX = isLeft ? 1 : -1;
  const taperSpan = Math.max(
    0.001,
    PHYSICS_RESPONSE.lowerRailTaperEndY - PHYSICS_RESPONSE.lowerRailTaperStartY,
  );
  const taperProgress = lowerRail
    ? clamp01((body.y - PHYSICS_RESPONSE.lowerRailTaperStartY) / taperSpan)
    : 0;
  const lowerNormalY =
    PHYSICS_RESPONSE.lowerRailNormalY * (1 - taperProgress) +
    PHYSICS_RESPONSE.lowerRailDeepNormalY * taperProgress;
  const rawNormalY = lowerRail
    ? -Math.abs(lowerNormalY)
    : crownEntryImpact
      ? -Math.abs(PHYSICS_RESPONSE.crownEntryNormalY)
      : crownRail
      ? -Math.abs(PHYSICS_RESPONSE.crownRailNormalY)
      : 0;
  const normalLength = Math.hypot(rawNormalX, rawNormalY);
  const normal = { x: rawNormalX / normalLength, y: rawNormalY / normalLength };
  const tangent = { x: -normal.y, y: normal.x };
  const normalVelocity = body.vx * normal.x + body.vy * normal.y;
  const tangentVelocity = body.vx * tangent.x + body.vy * tangent.y;
  const restitution = lowerRail
    ? body.responseProfile === "win"
      ? PHYSICS_RESPONSE.winLowerRailRestitution
      : PHYSICS_RESPONSE.lowerRailRestitution
    : crownEntryImpact
      ? PHYSICS_RESPONSE.crownEntryRestitution
      : crownRail
      ? PHYSICS_RESPONSE.crownRailRestitution
      : PHYSICS_RESPONSE.railRetention;
  const tangentRetention = lowerRail
    ? PHYSICS_RESPONSE.lowerRailTangentRetention
    : crownEntryImpact
      ? PHYSICS_RESPONSE.crownEntryTangentRetention
      : crownRail
      ? body.y >= PHYSICS_RESPONSE.lowerCrownRailStartY
        ? PHYSICS_RESPONSE.lowerCrownRailTangentRetention
        : PHYSICS_RESPONSE.crownRailTangentRetention
      : 1;
  const minimumRebound = lowerRail
    ? body.responseProfile === "win" && body.y >= PHYSICS_RESPONSE.winDeepLowerRailStartY
      ? PHYSICS_RESPONSE.winDeepLowerRailMinimumRebound
      : body.responseProfile === "win"
        ? PHYSICS_RESPONSE.winLowerRailMinimumRebound
        : PHYSICS_RESPONSE.lowerRailMinimumRebound
    : crownEntryImpact
      ? PHYSICS_RESPONSE.crownEntryMinimumRebound
      : crownRail
      ? PHYSICS_RESPONSE.crownRailMinimumRebound
      : PHYSICS_RESPONSE.railMinimumRebound;
  const reboundSpeed = Math.max(-normalVelocity * restitution, minimumRebound);
  body.vx = normal.x * reboundSpeed + tangent.x * tangentVelocity * tangentRetention;
  body.vy = normal.y * reboundSpeed + tangent.y * tangentVelocity * tangentRetention;
  // The observed win has one scored left-rail beat before its lower +4
  // insert. The deeper second left-wall touch is ordinary cabinet hardware:
  // keep its real rebound and impact event, but do not manufacture another
  // multiplier increment from an unlit lower rail face.
  const scoringWall = !isLeft || body.y < 900;
  addEvent(events, cooldowns, elapsed, {
    contactId: `wall-${side}`,
    kind: scoringWall ? "wall" : "rail",
    side,
    value: scoringWall ? 0.1 : 0,
    x: body.x,
    y: body.y,
    normal,
    velocity: { x: body.vx, y: body.vy },
  });
  return `wall-${side}`;
}

function solveGuideRailContact(body, projection) {
  if (projection.distance <= GUIDE_CENTER_CLEARANCE) return null;
  const normalX = projection.distance > 0 ? (body.x - projection.x) / projection.distance : -projection.tangentY;
  const normalY = projection.distance > 0 ? (body.y - projection.y) / projection.distance : projection.tangentX;
  body.x = projection.x + normalX * GUIDE_CENTER_CLEARANCE;
  body.y = projection.y + normalY * GUIDE_CENTER_CLEARANCE;
  const radialVelocity = body.vx * normalX + body.vy * normalY;
  if (radialVelocity <= 0) return null;

  const tangentVelocity = body.vx * projection.tangentX + body.vy * projection.tangentY;
  const reboundVelocity = -radialVelocity * PHYSICS_RESPONSE.guideRailRestitution;
  body.vx = normalX * reboundVelocity + projection.tangentX * tangentVelocity * PHYSICS_RESPONSE.guideRailTangentRetention;
  body.vy = normalY * reboundVelocity + projection.tangentY * tangentVelocity * PHYSICS_RESPONSE.guideRailTangentRetention;
  const side = normalX * -projection.tangentY + normalY * projection.tangentX > 0 ? "right" : "left";
  return `guide-${side}`;
}

function launchVariantFor(scenario, seed) {
  const speeds = scenario.plungerSpeeds || [scenario.plungerSpeed];
  const variantIndex = (Number(seed) >>> 0) % speeds.length;
  return { variantIndex, plungerSpeed: speeds[variantIndex] };
}

export function simulateScenario(scenario, seed = 0) {
  const launchVariant = launchVariantFor(scenario, seed);
  const cacheKey = `${scenario.id}:${launchVariant.variantIndex}:${launchVariant.plungerSpeed}`;
  const cached = simulationCache.get(cacheKey);
  if (cached) return cached;

  let gateOpen = false;
  const guidePath = scenario.id === "win" ? WIN_GUIDE_PATH : GUIDE_PATH;
  const guideGate = scenario.id === "win" ? WIN_GUIDE_GATE : GUIDE_GATE;
  const body = {
    x: GUIDE_START.x,
    y: GUIDE_START.y,
    vx: 0,
    vy: -launchVariant.plungerSpeed,
    responseProfile: scenario.id,
  };
  const samples = [
    {
      at: TIMING.physicsStart,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      distance: 0,
      contacts: [],
      mode: "launch-guide",
    },
  ];
  const events = [];
  const cooldowns = new Map();
  let elapsed = 0;
  let travelDistance = 0;

  while (elapsed < MAX_SIMULATION_MS && body.y < DRAIN_Y) {
    const previousX = body.x;
    const previousY = body.y;
    body.vy += PHYSICS_RESPONSE.tableGravity * FIXED_STEP_MS;
    body.vx *= STEP_DRAG;
    body.vy *= STEP_DRAG;
    body.x += body.vx * FIXED_STEP_MS;
    body.y += body.vy * FIXED_STEP_MS;
    elapsed += FIXED_STEP_MS;
    const contacts = [];

    if (!gateOpen) {
      const finalFrom = guidePath.at(-2);
      const gateTangentX = guideGate.x - finalFrom.x;
      const gateTangentY = guideGate.y - finalFrom.y;
      const gateLength = Math.hypot(gateTangentX, gateTangentY);
      const tangentX = gateTangentX / gateLength;
      const tangentY = gateTangentY / gateLength;
      const beyondGate = (body.x - guideGate.x) * tangentX + (body.y - guideGate.y) * tangentY;
      if (beyondGate >= 0 && body.vx * tangentX + body.vy * tangentY > 0) {
        gateOpen = true;
      } else {
        const projection = guideProjection(body, guidePath);
        const contact = solveGuideRailContact(body, projection);
        if (contact) contacts.push(contact);
      }
    }

    if (gateOpen && body.y > 245) {
      const left = solveRailContact(body, "left", elapsed, events, cooldowns);
      const right = solveRailContact(body, "right", elapsed, events, cooldowns);
      if (left) contacts.push(left);
      if (right) contacts.push(right);
    }
    if (gateOpen) {
      for (const bumper of BUMPERS) {
        const contact = solveCircleContact(body, bumper, elapsed, events, cooldowns);
        if (contact) contacts.push(contact);
      }
      for (const peg of PEGS) {
        if (body.responseProfile === "win" && peg.retractForWin) continue;
        const contact = solveCircleContact(body, { ...peg, kind: "peg", value: 0 }, elapsed, events, cooldowns);
        if (contact) contacts.push(contact);
      }
      for (const rollover of ROLLOVERS) {
        const contact = solveRolloverContact(body, rollover, elapsed, events, cooldowns);
        if (contact) contacts.push(contact);
      }
      // A rail-mounted stud can form a two-contact island in one integration
      // step. Circle resolution may move the center a fraction of a board
      // pixel back across the cabinet boundary, so finish the island by
      // enforcing the hard rail position without applying a second impulse.
      const hardRightRail =
        body.responseProfile === "win" && body.x > RIGHT_RAIL
          ? PHYSICS_RESPONSE.crownRailX
          : RIGHT_RAIL;
      body.x = Math.max(LEFT_RAIL, Math.min(hardRightRail, body.x));
    }

    const speed = Math.hypot(body.vx, body.vy);
    if (speed > MAX_SPEED) {
      body.vx *= MAX_SPEED / speed;
      body.vy *= MAX_SPEED / speed;
    }
    travelDistance += Math.hypot(body.x - previousX, body.y - previousY);
    samples.push({
      at: TIMING.physicsStart + elapsed,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      distance: travelDistance,
      contacts,
      mode: gateOpen ? "table" : "launch-guide",
    });
  }

  // Camera choreography is allowed to look ahead because the round outcome
  // and complete physical path are immutable before playback begins. Store a
  // suffix minimum so the dolly can reserve enough headroom for every future
  // rebound without steering the ball or reversing the camera.
  let futureMinimumY = Number.POSITIVE_INFINITY;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    futureMinimumY = Math.min(futureMinimumY, samples[index].y);
    samples[index].futureMinimumY = futureMinimumY;
  }

  const terminalKind = scenario.pocket ? "pocket" : "miss";
  const terminalEvent = {
    at: TIMING.physicsStart + elapsed,
    contactId: scenario.pocket ? `pocket-${scenario.pocket}` : "drain",
    kind: terminalKind,
    pocket: scenario.pocket,
    value: 0,
    x: body.x,
    y: body.y,
    normal: { x: 0, y: -1 },
    velocity: { x: body.vx, y: body.vy },
  };
  events.push(terminalEvent);
  samples.at(-1).event = terminalEvent;

  // Win choreography uses the same monotonic clock as its rendered samples.
  // Keep event effects and delayed multiplier commits registered to the
  // physical contact pose; other outcomes remain strict 1:1 playback.
  if (scenario.id === "win") {
    for (const event of events) event.at = scheduledTimeAt(event.at);
  }

  const result = Object.freeze({
    variantIndex: launchVariant.variantIndex,
    plungerSpeed: launchVariant.plungerSpeed,
    guidePath,
    samples,
    events,
    terminalAt: terminalEvent.at,
    revealAt: terminalEvent.at + 120,
    // Preserve at least 500 ms for the resolved result and another 600 ms
    // for the camera return. Late loss variants therefore retain the same
    // readable ordering instead of compressing reveal and settlement.
    settleAt: Math.max(TIMING.settleAt, terminalEvent.at + 1220),
  });
  simulationCache.set(cacheKey, result);
  return result;
}

function samplePair(samples, timelineMs) {
  if (timelineMs <= samples[0].at) return [samples[0], samples[0], 0];
  const final = samples.at(-1);
  if (timelineMs >= final.at) return [final, final, 0];
  const index = Math.min(samples.length - 2, Math.floor((timelineMs - TIMING.physicsStart) / FIXED_STEP_MS));
  const from = samples[index];
  const to = samples[index + 1];
  return [from, to, clamp01((timelineMs - from.at) / (to.at - from.at))];
}

export function futureMinimumYAt(outcome, timelineMs) {
  const [from] = samplePair(outcome.trajectory.samples, motionTimeAt(timelineMs, outcome));
  return from.futureMinimumY ?? from.y;
}

export function motionPathFor(outcome) {
  return outcome.path;
}

export function ballAt(outcome, timelineMs) {
  if (timelineMs <= TIMING.physicsStart) {
    const launch = launcherBallAt(timelineMs);
    return {
      x: launch.x,
      y: launch.y,
      rotation: 0,
      visible: true,
      velocity: launch.velocity,
      scaleX: 1,
      scaleY: 1,
      angle: Math.atan2(launch.velocity.y, launch.velocity.x),
    };
  }

  const motionMs = motionTimeAt(timelineMs, outcome);
  const [from, to, progress] = samplePair(outcome.trajectory.samples, motionMs);
  let x = from.x + (to.x - from.x) * progress;
  let y = from.y + (to.y - from.y) * progress;
  const velocity = {
    x: from.vx + (to.vx - from.vx) * progress,
    y: from.vy + (to.vy - from.vy) * progress,
  };
  let distance = from.distance + (to.distance - from.distance) * progress;

  // The pocket event is a real receiver contact, not an open drain. Preserved
  // first-party frames show the ball being gathered laterally toward the
  // selected gate while its vertical fall is arrested. Project one
  // dissipative intake after the immutable terminal event: position is exact
  // at contact, the receiver supplies the only velocity change, and a simple
  // constant-deceleration guide brings the same actor to rest at the mouth.
  // This cannot change the already-resolved result, contact itinerary,
  // multiplier, payout, or settlement time.
  if (outcome.pocket && timelineMs > outcome.terminalAt) {
    const captureElapsed = Math.min(170, timelineMs - outcome.terminalAt);
    const guideElapsed = Math.min(RECEIVER_CAPTURE_DURATION_MS, captureElapsed);
    const pocket = POCKETS.find((candidate) => candidate.id === outcome.pocket);
    const captureTargetX = pocket?.x ?? x;
    const captureTargetY = (pocket?.y ?? y) - 4;
    const captureVelocityX = (2 * (captureTargetX - x)) / RECEIVER_CAPTURE_DURATION_MS;
    const captureVelocityY = (2 * (captureTargetY - y)) / RECEIVER_CAPTURE_DURATION_MS;
    const captureAccelerationX = -captureVelocityX / RECEIVER_CAPTURE_DURATION_MS;
    const captureAccelerationY = -captureVelocityY / RECEIVER_CAPTURE_DURATION_MS;
    const captureX =
      captureVelocityX * guideElapsed +
      0.5 * captureAccelerationX * guideElapsed * guideElapsed;
    const captureY =
      captureVelocityY * guideElapsed +
      0.5 * captureAccelerationY * guideElapsed * guideElapsed;
    x += captureX;
    y += captureY;
    distance += Math.hypot(captureX, captureY);
    if (guideElapsed < RECEIVER_CAPTURE_DURATION_MS) {
      velocity.x = captureVelocityX + captureAccelerationX * guideElapsed;
      velocity.y = captureVelocityY + captureAccelerationY * guideElapsed;
    } else {
      velocity.x = 0;
      velocity.y = 0;
    }
  }
  return {
    x,
    y,
    rotation: (distance / BALL_RADIUS) * (180 / Math.PI),
    visible: timelineMs < outcome.terminalAt + 170,
    velocity,
    scaleX: 1,
    scaleY: 1,
    angle: Math.atan2(velocity.y, velocity.x),
  };
}

export const PHYSICS = Object.freeze({
  ballRadius: BALL_RADIUS,
  gravity: PHYSICS_RESPONSE.tableGravity,
  fixedStepMs: FIXED_STEP_MS,
  launchReleaseAt: TIMING.physicsStart,
  guide: {
    path: GUIDE_PATH,
    winPath: WIN_GUIDE_PATH,
    centerClearance: GUIDE_CENTER_CLEARANCE,
    gate: GUIDE_GATE,
    winGate: WIN_GUIDE_GATE,
  },
  rails: { left: LEFT_RAIL, right: RIGHT_RAIL, winCrownRight: PHYSICS_RESPONSE.crownRailX },
  motionSchedule: MOTION_SCHEDULE_KNOTS,
});
