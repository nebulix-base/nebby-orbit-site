import "./styles.css";

const app = document.querySelector("#app");
app.innerHTML = `
  <canvas id="scene"></canvas>

  <div class="hud">
    <div class="hud-title">Nebby Orbit</div>

    <div class="hud-row">
      <div class="hud-label">Epoch</div>
      <div id="epoch" class="hud-value">—</div>
    </div>

    <div class="hud-row">
      <div class="hud-label">Sector</div>
      <div id="sector" class="hud-value">—</div>
    </div>

    <div class="hud-row">
      <div class="hud-label">Warp</div>
      <div id="warp" class="hud-value">—</div>
    </div>

    <div class="hud-row">
      <div class="hud-label">Next</div>
      <div id="nextEvent" class="hud-value">—</div>
    </div>

    <div class="hud-row">
      <div class="hud-label">T-minus</div>
      <div id="countdown" class="hud-value">—</div>
    </div>

    <div class="bar">
      <div id="barFill" class="bar-fill"></div>
    </div>

    <div class="hud-sub" id="sub">Stage 0 • Visual simulation</div>
  </div>
`;

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const epochEl = document.getElementById("epoch");
const sectorEl = document.getElementById("sector");
const warpEl = document.getElementById("warp");
const nextEventEl = document.getElementById("nextEvent");
const countdownEl = document.getElementById("countdown");
const barFill = document.getElementById("barFill");
const subEl = document.getElementById("sub");

// ======= CORE TIME PARAMETERS (KEEP REAL) =======
const EPOCH_SECONDS = 24 * 60 * 60; // real-time day epoch
const SECTORS = 90;                // micro cadence within each epoch/day
const ORBIT_EPOCHS = 90;           // macro cadence: 90 epochs = one “orbit”
// ==============================================

// Orbit spin
const ORBIT_SPIN_BASE = 0.07;
const ORBIT_SPIN_WOBBLE = 0.015;
const ORBIT_SPIN_WOBBLE_RATE = 0.2;

// Starfield center decoupled from orbit
const STAR_CENTER_X = 0.44;
const STAR_CENTER_Y = 0.62;
const STAR_CENTER_WOBBLE_PX = 48;
const STAR_CENTER_WOBBLE_RATE_X = 0.18;
const STAR_CENTER_WOBBLE_RATE_Y = 0.14;

// Much slower spiral + forward drift
const STAR_SWIRL = 0.000045;
const STAR_DRIFT = 0.0065;

// Trails strength
const TRAIL_BASE = 0.08;
const TRAIL_NEAR_BOOST = 0.22;

// Checkpoint HUD behavior
const CHECKPOINT_TRIGGER_DIST_FRAC = 0.038;
const CHECKPOINT_HOLD_WHILE_NEAR = true;
const CHECKPOINT_COOLDOWN_SEC = 0.5;
const CHECKPOINT_FADE_OUT_SEC = 1.4;
const CHECKPOINT_PULSE_RATE = 1.4;

// ===== VISUAL SECTOR + CLAIM TUNES =====
const TICK_MAJOR_EVERY = 10;
const TICK_MINOR_LEN = 7;
const TICK_MAJOR_LEN = 14;

const ACTIVE_ARC_HALF_WINDOW_SECTORS = 1.5;
const ACTIVE_ARC_STEPS = 42;

// Gates (sector anchored)
const GATES = [
  { sector: 0, name: "☉ Sun Gate" },
  { sector: 30, name: "☾ Moon Gate" },
  { sector: 60, name: "⟡ Apex Gate" }, // neutral third anchor
];

// Claim window (visual only)
const CLAIM_SECTOR_WINDOW = 1;

// ===== CADENCE: MAJOR EVENTS ON EPOCH-IN-ORBIT =====
const MAJOR_EPOCHS = [15, 30, 45, 60, 75, 90];
const MAJOR_LABELS = {
  15: "🌙 Moon Pass",
  30: "🔴 Apex Pass",
  45: "🟣 Deep Space",
  60: "🟡 Jupiter Pass",
  75: "☀ Solar Flare",
  90: "⟲ Perihelion Reset",
};

// ===== EVENT FX SETTINGS =====
const WARP_PULSE_SEC = 2.8;
const WARP_PULSE_MAX_R = 0.22; // fraction of min(w,h)
const WARP_PULSE_THICK = 3.5;

const MAJOR_OVERLAY_SEC = 3.6;
const MAJOR_OVERLAY_FADE_IN = 0.22;
const MAJOR_OVERLAY_FADE_OUT = 0.55;
// ===============================================

let w = 0,
  h = 0,
  dpr = Math.min(2, window.devicePixelRatio || 1);
let prevW = 0;
let prevH = 0;

// ---------------- DEV TIME OFFSET (FOR TESTING) ----------------
// This does NOT change real-time logic; it just offsets the clock used by visuals/HUD.
let devTimeOffsetSec = 0;

window.addEventListener("keydown", (e) => {
  const k = (e.key || "").toLowerCase();

  if (k === "n") {
    // simulate next epoch flip: move clock forward to just after next epoch boundary
    const realNow = Date.now() / 1000 + devTimeOffsetSec;
    const nextEpochStart = (Math.floor(realNow / EPOCH_SECONDS) + 1) * EPOCH_SECONDS;
    devTimeOffsetSec += (nextEpochStart - realNow) + 0.25;
  }

  if (k === "m") {
    // jump to next major epoch-in-orbit (fast test)
    const realNow = Date.now() / 1000 + devTimeOffsetSec;
    const epochIndex = Math.floor(realNow / EPOCH_SECONDS);
    const epochInOrbit = (epochIndex % ORBIT_EPOCHS) + 1;

    let target = null;
    for (const eMajor of MAJOR_EPOCHS) {
      if (epochInOrbit < eMajor) {
        target = eMajor;
        break;
      }
    }
    if (target === null) target = 90;

    let deltaEpochs = target - epochInOrbit;
    if (deltaEpochs <= 0) deltaEpochs += ORBIT_EPOCHS;

    // move to start of that epoch (plus a small epsilon)
    devTimeOffsetSec += deltaEpochs * EPOCH_SECONDS;
    // align close to boundary trigger by moving to just after the boundary
    const now2 = Date.now() / 1000 + devTimeOffsetSec;
    const nextEpochStart = (Math.floor(now2 / EPOCH_SECONDS)) * EPOCH_SECONDS;
    devTimeOffsetSec += (nextEpochStart - now2) + 0.25;
  }

  if (k === "r") {
    devTimeOffsetSec = 0;
  }
});
// --------------------------------------------------------------

// ---------------- UTIL ----------------
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (d > 0) return `${d}d ${pad2(h)}h ${pad2(m)}m`;
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(ss)}s`;
  return `${m}m ${pad2(ss)}s`;
}
function roman(n) {
  const map = [
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1],
  ];
  let x = Math.max(0, Math.floor(n));
  let out = "";
  for (const [sym, val] of map) {
    while (x >= val) {
      out += sym;
      x -= val;
    }
  }
  return out || "—";
}

// Epoch/Orbit helpers
function getEpochIndex(nowSec) {
  return Math.floor(nowSec / EPOCH_SECONDS);
}
function getDayProgress(nowSec) {
  return (nowSec % EPOCH_SECONDS) / EPOCH_SECONDS; // 0..1
}
function getEpochInOrbit(epochIndex) {
  return (epochIndex % ORBIT_EPOCHS) + 1; // 1..90
}
function getWarpLevel(epochInOrbit) {
  return Math.floor((epochInOrbit - 1) / 5) + 1; // 1..18
}
function getNextMajor(epochInOrbit) {
  for (const e of MAJOR_EPOCHS) {
    if (epochInOrbit <= e) return e;
  }
  return 90;
}
function secondsUntilEpochInOrbit(epochInOrbit, targetEpochInOrbit, dayProgress) {
  let deltaEpochs = targetEpochInOrbit - epochInOrbit;
  if (deltaEpochs <= 0) deltaEpochs += ORBIT_EPOCHS;

  const remainingThisEpoch = (1 - dayProgress) * EPOCH_SECONDS;
  const fullEpochsAfter = Math.max(0, deltaEpochs - 1) * EPOCH_SECONDS;

  return remainingThisEpoch + fullEpochsAfter;
}

// Sector ring math
function wrapSectorDelta(a, b) {
  const d = a - b;
  const m = ((d % SECTORS) + SECTORS) % SECTORS;
  return m > SECTORS / 2 ? m - SECTORS : m;
}
function ellipsePoint(cx, cy, rx, ry, angleRad) {
  return { x: cx + Math.cos(angleRad) * rx, y: cy + Math.sin(angleRad) * ry };
}
function ellipseOutNormal(rx, ry, angleRad) {
  const nx = Math.cos(angleRad) / Math.max(1e-6, rx);
  const ny = Math.sin(angleRad) / Math.max(1e-6, ry);
  const mag = Math.max(1e-6, Math.hypot(nx, ny));
  return { nx: nx / mag, ny: ny / mag };
}
function drawEllipseArc(cx, cy, rx, ry, a0, a1, steps) {
  const dir = a1 >= a0 ? 1 : -1;
  const span = Math.abs(a1 - a0);
  const n = Math.max(8, steps);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = a0 + dir * span * t;
    const p = ellipsePoint(cx, cy, rx, ry, ang);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}
function drawSectorTicks(cx, cy, rx, ry, sectors) {
  ctx.save();
  ctx.lineCap = "round";

  for (let i = 0; i < sectors; i++) {
    const ang = (i / sectors) * Math.PI * 2;
    const p = ellipsePoint(cx, cy, rx, ry, ang);
    const n = ellipseOutNormal(rx, ry, ang);

    const isMajor = i % TICK_MAJOR_EVERY === 0;
    const len = isMajor ? TICK_MAJOR_LEN : TICK_MINOR_LEN;

    const x1 = p.x + n.nx * 2;
    const y1 = p.y + n.ny * 2;
    const x2 = p.x + n.nx * (2 + len);
    const y2 = p.y + n.ny * (2 + len);

    ctx.strokeStyle = isMajor
      ? "rgba(255,220,200,0.35)"
      : "rgba(220,200,255,0.16)";
    ctx.lineWidth = isMajor ? 2.0 : 1.0;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------- STARFIELD ----------------
const farStars = Array.from({ length: 220 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: 0.25 + Math.random() * 0.5,
  a: 0.12 + Math.random() * 0.28,
}));

const nearStars = Array.from({ length: 120 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: 0.8 + Math.random() * 1.6,
  a: 0.25 + Math.random() * 0.55,
}));

const stars = Array.from({ length: 520 }, () => {
  const z = Math.random();
  const x = Math.random() * window.innerWidth;
  const y = Math.random() * window.innerHeight;

  return {
    x,
    y,
    px: x,
    py: y,
    r: 0.4 + z * 1.6,
    a: 0.2 + z * 0.8,
    z,
    speed: 0.3 + z * 1.4,
    phase: Math.random() * Math.PI * 2,
    life: Math.random(),
    grow: 0.01 + Math.random() * 0.015,
  };
});

function respawnStar(s, cx, cy) {
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.pow(Math.random(), 0.6) * 40;

  s.x = cx + Math.cos(ang) * rad;
  s.y = cy + Math.sin(ang) * rad;
  s.px = s.x;
  s.py = s.y;

  s.life = 0;
  s.phase = Math.random() * Math.PI * 2;
}

function resize() {
  prevW = w || window.innerWidth;
  prevH = h || window.innerHeight;

  w = window.innerWidth;
  h = window.innerHeight;

  const sx = prevW ? w / prevW : 1;
  const sy = prevH ? h / prevH : 1;

  for (const s of stars) {
    s.x *= sx;
    s.y *= sy;
    s.px *= sx;
    s.py *= sy;
  }
  for (const s of farStars) {
    s.x *= sx;
    s.y *= sy;
  }
  for (const s of nearStars) {
    s.x *= sx;
    s.y *= sy;
  }

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);
resize();

function drawBackground(t, dt) {
  const g = ctx.createRadialGradient(
    w * 0.55,
    h * 0.45,
    0,
    w * 0.55,
    h * 0.45,
    Math.max(w, h)
  );
  g.addColorStop(0, "rgba(32,12,55,1)");
  g.addColorStop(0.45, "rgba(10,8,24,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const step = Math.min(2, dt * 60);

  const cx =
    w * STAR_CENTER_X +
    Math.sin(t * STAR_CENTER_WOBBLE_RATE_X) * STAR_CENTER_WOBBLE_PX +
    Math.sin(t * 0.07) * 12;

  const cy =
    h * STAR_CENTER_Y +
    Math.cos(t * STAR_CENTER_WOBBLE_RATE_Y) * STAR_CENTER_WOBBLE_PX +
    Math.cos(t * 0.06) * 10;

  for (const s of farStars) {
    s.x += 0.018 * step;
    if (s.x > w + 2) s.x = -2;

    ctx.beginPath();
    ctx.fillStyle = `rgba(200,210,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of stars) {
    s.life = Math.min(1, s.life + s.grow * step);

    s.px = s.x;
    s.py = s.y;

    const dx = s.x - cx;
    const dy = s.y - cy;

    const dist = Math.max(60, Math.hypot(dx, dy));
    const inv = 1 / dist;

    const lensRadius = Math.min(w, h) * 0.22;
    const lensStrength = 0.28;

    let lens = 0;
    if (dist < lensRadius) {
      const d = dist / lensRadius;
      lens = (1 - d) * lensStrength;
    }

    const tx = -dy * inv;
    const ty = dx * inv;

    const rx = dx * inv;
    const ry = dy * inv;

    const k = s.speed;

    s.x +=
      ((tx * STAR_SWIRL * k * 900) +
        (rx * STAR_DRIFT * k) +
        (rx * lens * 34)) *
      step;
    s.y +=
      ((ty * STAR_SWIRL * k * 900) +
        (ry * STAR_DRIFT * k) +
        (ry * lens * 34)) *
      step;

    if (s.x < -140 || s.x > w + 140 || s.y < -140 || s.y > h + 140) {
      respawnStar(s, cx, cy);
      continue;
    }
    if (Math.hypot(s.x - cx, s.y - cy) > Math.max(w, h) * 0.9) {
      respawnStar(s, cx, cy);
      continue;
    }

    const tw = 0.86 + 0.14 * Math.sin(t * 1.1 + s.phase);
    const alpha = s.a * tw * (0.25 + 0.75 * s.life);

    const trailStrength = TRAIL_BASE + TRAIL_NEAR_BOOST * s.z;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(220,210,255,${alpha * trailStrength})`;
    ctx.lineWidth = 0.35 + s.z * 0.9;
    ctx.lineCap = "round";
    ctx.moveTo(s.px, s.py);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    ctx.shadowBlur = s.z > 0.78 ? 8 : 0;
    ctx.shadowColor = "rgba(220,210,255,0.6)";
    ctx.beginPath();
    ctx.fillStyle = `rgba(220,210,255,${alpha})`;
    ctx.arc(s.x, s.y, s.r * (0.6 + 0.4 * s.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const s of nearStars) {
    s.x += 0.17 * step;
    if (s.x > w + 2) s.x = -2;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,240,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.08;
  const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.25);
  lg.addColorStop(0, "rgba(200,160,255,1)");
  lg.addColorStop(1, "rgba(200,160,255,0)");
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------- ORBIT + COMET ----------------
function orbitPoint(t) {
  const cx = w * 0.52;
  const cy = h * 0.52;
  const rx = Math.min(w, h) * 0.28;
  const ry = Math.min(w, h) * 0.18;

  const wobble = Math.sin(t * Math.PI * 2) * 0.02;
  const angle = t * Math.PI * 2;

  const x = cx + Math.cos(angle) * rx;
  const y = cy + Math.sin(angle + wobble) * ry;

  return { x, y, cx, cy, rx, ry };
}

function drawOrbit(cx, cy, rx, ry, boost = 0) {
  ctx.save();
  ctx.translate(cx, cy);

  const a1 = 0.18 + boost * 0.12;
  const a2 = 0.35 + boost * 0.18;

  ctx.strokeStyle = `rgba(180,120,255,${a1})`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(220,210,255,${a2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawComet(x, y, vx, vy, glowBoost = 0) {
  ctx.save();

  const tailLen = 26;
  const mag = Math.max(0.001, Math.hypot(vx, vy));
  const tx = (vx / mag) * -tailLen;
  const ty = (vy / mag) * -tailLen;

  const lg = ctx.createLinearGradient(x, y, x + tx, y + ty);
  lg.addColorStop(0, `rgba(255,180,255,${0.85 + glowBoost * 0.08})`);
  lg.addColorStop(1, "rgba(120,160,255,0)");

  ctx.strokeStyle = lg;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tx, y + ty);
  ctx.stroke();

  ctx.shadowColor = `rgba(170,120,255,${0.9 + glowBoost * 0.08})`;
  ctx.shadowBlur = 18 + glowBoost * 18;
  ctx.fillStyle = `rgba(245,235,255,${0.95 + glowBoost * 0.03})`;
  ctx.beginPath();
  ctx.arc(x, y, 4.2 + glowBoost * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ---------------- GATES (SECTOR-ANCHORED) ----------------
const markers = GATES.map((g) => ({
  sector: ((g.sector % SECTORS) + SECTORS) % SECTORS,
  t: (((g.sector % SECTORS) + SECTORS) % SECTORS) / SECTORS,
  name: g.name,
}));

let checkpointCooldown = 0;
let checkpointHold = 0;
let checkpointFlash = 0;
const wasNearMarker = markers.map(() => false);

// ---------------- EVENT FX STATE ----------------
let lastEpochIndex = null;

let warpPulseLeft = 0;
let warpPulseLabel = "";

let majorOverlayLeft = 0;
let majorOverlayLabel = "";

function triggerWarpPulse(epochInOrbit) {
  warpPulseLeft = WARP_PULSE_SEC;
  warpPulseLabel = `WARP EVENT ✦ Warp ${roman(getWarpLevel(epochInOrbit))}`;
  subEl.textContent = warpPulseLabel;
}

function triggerMajorOverlay(label) {
  majorOverlayLeft = MAJOR_OVERLAY_SEC;
  majorOverlayLabel = `PLANET PASS ✦ ${label}`;
  subEl.textContent = majorOverlayLabel;
}

function drawWarpPulse(cx, cy, tNorm) {
  const base = Math.min(w, h);
  const r = base * (0.03 + (WARP_PULSE_MAX_R - 0.03) * tNorm);
  const a = 0.26 * (1 - tNorm);

  ctx.save();
  ctx.shadowColor = "rgba(255,170,220,0.7)";
  ctx.shadowBlur = 20 * (1 - tNorm);

  ctx.strokeStyle = `rgba(255,180,230,${a})`;
  ctx.lineWidth = WARP_PULSE_THICK;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(210,190,255,${a * 0.75})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawMajorOverlay(label, tLeft) {
  const total = MAJOR_OVERLAY_SEC;
  const t = 1 - tLeft / total; // 0..1

  let a = 1;
  if (t < MAJOR_OVERLAY_FADE_IN) a = t / MAJOR_OVERLAY_FADE_IN;
  else if (t > 1 - MAJOR_OVERLAY_FADE_OUT) a = (1 - t) / MAJOR_OVERLAY_FADE_OUT;
  a = clamp01(a);

  const cx = w * 0.5;
  const cy = h * 0.18;

  ctx.save();
  ctx.globalAlpha = a;

  ctx.font = "700 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const text = label;
  const tw = ctx.measureText(text).width;

  ctx.fillStyle = "rgba(10,8,24,0.42)";
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2 - 18, cy - 22, tw + 36, 44, 12);
  ctx.fill();

  ctx.shadowColor = "rgba(255,190,230,0.8)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255,235,250,0.92)";
  ctx.fillText(text, cx - tw / 2, cy + 8);

  ctx.restore();
}

// ---------------- MAIN LOOP ----------------
let lastMs = 0;
let animT = 0;
let orbitRotation = 0;

function tick(ms) {
  if (!lastMs) lastMs = ms;
  const dt = (ms - lastMs) / 1000;
  lastMs = ms;

  animT += dt;

  // ===== CLOCKS (REAL TIME + DEV OFFSET) =====
  const now = Date.now() / 1000 + devTimeOffsetSec;

  const epochIndex = getEpochIndex(now);
  const dayProgress = getDayProgress(now);
  const epochInOrbit = getEpochInOrbit(epochIndex);
  const warpLevel = getWarpLevel(epochInOrbit);

  const sector = Math.min(SECTORS - 1, Math.floor(dayProgress * SECTORS));
  const sectorWithin = dayProgress * SECTORS - sector;

  const nextMajorEpoch = getNextMajor(epochInOrbit);
  const nextMajorLabel = MAJOR_LABELS[nextMajorEpoch] || `Epoch ${nextMajorEpoch}`;
  const secondsToNextMajor = secondsUntilEpochInOrbit(epochInOrbit, nextMajorEpoch, dayProgress);

  // ===== EPOCH BOUNDARY DETECTOR =====
  if (lastEpochIndex === null) lastEpochIndex = epochIndex;

  if (epochIndex !== lastEpochIndex) {
    const newEpochInOrbit = getEpochInOrbit(epochIndex);

    if (newEpochInOrbit % 5 === 0) triggerWarpPulse(newEpochInOrbit);
    if (MAJOR_LABELS[newEpochInOrbit]) triggerMajorOverlay(MAJOR_LABELS[newEpochInOrbit]);

    lastEpochIndex = epochIndex;
  }

  // decrement FX timers
  warpPulseLeft = Math.max(0, warpPulseLeft - dt);
  majorOverlayLeft = Math.max(0, majorOverlayLeft - dt);

  // ===== HUD =====
  epochEl.textContent = `${epochInOrbit} / ${ORBIT_EPOCHS}`;
  sectorEl.textContent = `${sector + 1} / ${SECTORS}`;
  warpEl.textContent = roman(warpLevel);
  nextEventEl.textContent = nextMajorLabel;
  countdownEl.textContent = formatCountdown(secondsToNextMajor);

  barFill.style.width = `${dayProgress * 100}%`;

  // draw background + stars
  ctx.clearRect(0, 0, w, h);
  drawBackground(animT, dt);

  const p = orbitPoint(dayProgress);

  orbitRotation += dt * (ORBIT_SPIN_BASE + Math.sin(animT * ORBIT_SPIN_WOBBLE_RATE) * ORBIT_SPIN_WOBBLE);

  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(orbitRotation);
  ctx.translate(-p.cx, -p.cy);

  const warpPulseT = warpPulseLeft > 0 ? 1 - warpPulseLeft / WARP_PULSE_SEC : 0;
  const warpBoost = warpPulseLeft > 0 ? (1 - warpPulseT) : 0;

  const majorBoost = majorOverlayLeft > 0 ? 0.7 : 0;
  const orbitBoost = Math.max(warpBoost * 0.9, majorBoost * 0.8);

  const rxInner = p.rx * 0.75;
  const ryInner = p.ry * 0.75;
  const rxMid = p.rx;
  const ryMid = p.ry;
  const rxOuter = p.rx * 1.35;
  const ryOuter = p.ry * 1.35;

  drawOrbit(p.cx, p.cy, rxInner, ryInner, orbitBoost);
  drawOrbit(p.cx, p.cy, rxMid, ryMid, orbitBoost);
  drawOrbit(p.cx, p.cy, rxOuter, ryOuter, orbitBoost);

  drawSectorTicks(p.cx, p.cy, rxOuter, ryOuter, SECTORS);

  const currentAngle = ((sector + sectorWithin) / SECTORS) * Math.PI * 2;
  const halfWindow = (ACTIVE_ARC_HALF_WINDOW_SECTORS / SECTORS) * Math.PI * 2;

  ctx.save();
  ctx.shadowColor = "rgba(255,170,200,0.65)";
  ctx.shadowBlur = 16;
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = `rgba(255,170,200,${0.22 + orbitBoost * 0.08})`;
  drawEllipseArc(p.cx, p.cy, rxOuter * 1.02, ryOuter * 1.02, currentAngle - halfWindow, currentAngle + halfWindow, ACTIVE_ARC_STEPS);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.lineWidth = 2.0;
  ctx.strokeStyle = `rgba(255,230,240,${0.28 + orbitBoost * 0.08})`;
  drawEllipseArc(p.cx, p.cy, rxOuter * 1.02, ryOuter * 1.02, currentAngle - halfWindow, currentAngle + halfWindow, ACTIVE_ARC_STEPS);
  ctx.stroke();
  ctx.restore();

  if (warpPulseLeft > 0) drawWarpPulse(p.cx, p.cy, warpPulseT);

  const p2 = orbitPoint((dayProgress + 0.002) % 1);
  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  let claimReadyName = null;

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const mp = orbitPoint(m.t);

    const d = Math.hypot(p.x - mp.x, p.y - mp.y);
    const triggerDist = Math.min(w, h) * CHECKPOINT_TRIGGER_DIST_FRAC;
    const near = d < triggerDist;

    const sd = Math.abs(wrapSectorDelta(sector, m.sector));
    const claimReady = near && sd <= CLAIM_SECTOR_WINDOW;
    if (claimReady) claimReadyName = m.name;

    if (near && !wasNearMarker[i] && checkpointCooldown <= 0) {
      checkpointCooldown = CHECKPOINT_COOLDOWN_SEC;
      checkpointHold = 2.6;
      checkpointFlash = 1.0;
      subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
    }

    if (CHECKPOINT_HOLD_WHILE_NEAR && near) {
      checkpointHold = Math.max(checkpointHold, 0.25);
      checkpointFlash = Math.max(checkpointFlash, 0.45);
      if (!subEl.textContent.startsWith("CHECKPOINT") && !subEl.textContent.startsWith("CLAIM")) {
        subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
      }
    }

    wasNearMarker[i] = near;
  }

  if (claimReadyName) subEl.textContent = `CLAIM READY ✦ ${claimReadyName}`;

  // Apex triangle (celestial mechanism)
if (markers.length >= 3) {
  const pts = markers.map((m) => orbitPoint(m.t));

  // slow breathing pulse
  const pulse = 0.55 + 0.45 * Math.sin(animT * 0.35);

  ctx.save();

  // soft outer glow
  ctx.shadowColor = "rgba(255,200,170,0.65)";
  ctx.shadowBlur = 14 * pulse;

  ctx.strokeStyle = `rgba(255,210,170,${0.18 + pulse * 0.12})`;
  ctx.lineWidth = 1.4;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.stroke();

  // inner energy filament
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,235,210,${0.28 + pulse * 0.22})`;
  ctx.lineWidth = 0.9;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

  for (const m of markers) {
    const mp = orbitPoint(m.t);

    const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
    const revealStart = Math.min(w, h) * 0.22;
    const revealEnd = Math.min(w, h) * 0.07;
    const aLabel = clamp01((revealStart - dist) / Math.max(1e-6, revealStart - revealEnd));

    ctx.beginPath();
    ctx.fillStyle = "rgba(255,210,120,0.92)";
    ctx.shadowColor = "rgba(255,210,120,0.9)";
    ctx.shadowBlur = 14;
    ctx.arc(mp.x, mp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (aLabel > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * aLabel;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,235,245,0.9)";
      ctx.shadowColor = "rgba(255,190,230,0.65)";
      ctx.shadowBlur = 10;

      const ang = m.t * Math.PI * 2;
      const n = ellipseOutNormal(p.rx, p.ry, ang);
      const ox = n.nx * 18;
      const oy = n.ny * 18;

      ctx.fillText(m.name, mp.x + ox, mp.y + oy);
      ctx.restore();
    }
  }

  drawComet(p.x, p.y, vx, vy, warpBoost);

  ctx.restore();

  if (majorOverlayLeft > 0) {
    drawMajorOverlay(majorOverlayLabel.replace("PLANET PASS ✦ ", ""), majorOverlayLeft);
  }

  checkpointCooldown = Math.max(0, checkpointCooldown - dt);
  checkpointHold = Math.max(0, checkpointHold - dt);

  if (checkpointHold > 0) checkpointFlash = 1.0;
  else checkpointFlash = Math.max(0, checkpointFlash - dt / CHECKPOINT_FADE_OUT_SEC);

  if (majorOverlayLeft > 0) {
    subEl.textContent = majorOverlayLabel;
    const pulse = 0.66 + 0.34 * Math.sin(animT * 0.95);
    const a = pulse * 0.98;
    subEl.style.color = `rgba(255, 230, 250, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(255, 170, 220, ${a})`;
  } else if (warpPulseLeft > 0) {
    subEl.textContent = warpPulseLabel;
    const pulse = 0.62 + 0.38 * Math.sin(animT * 1.05);
    const a = pulse * 0.95;
    subEl.style.color = `rgba(210, 200, 255, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(190, 160, 255, ${a})`;
  } else if (subEl.textContent.startsWith("CLAIM READY")) {
    const pulse = 0.68 + 0.32 * Math.sin(animT * 1.1);
    const a = pulse * 0.95;
    subEl.style.color = `rgba(160, 255, 190, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(120, 255, 170, ${a})`;
  } else if (checkpointFlash > 0 && subEl.textContent.startsWith("CHECKPOINT")) {
    const pulse = 0.62 + 0.38 * Math.sin(animT * CHECKPOINT_PULSE_RATE);
    const a = pulse * checkpointFlash;
    subEl.style.color = `rgba(255, 140, 140, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(255, 90, 90, ${a})`;
  } else {
    subEl.style.color = "";
    subEl.style.textShadow = "";
    if (
      subEl.textContent.startsWith("CHECKPOINT") ||
      subEl.textContent.startsWith("CLAIM READY") ||
      subEl.textContent.startsWith("WARP EVENT") ||
      subEl.textContent.startsWith("PLANET PASS")
    ) {
      subEl.textContent = "Stage 0 • Visual simulation";
    }
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
