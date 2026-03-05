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
const barFill = document.getElementById("barFill");
const subEl = document.getElementById("sub");

// ======= PARAMETERS YOU CAN TUNE =======
const EPOCH_SECONDS = 24 * 60 * 60; // keep NORMAL (real-time)
const SECTORS = 90;

// Orbit spin: you said it's fine (leave as-is)
const ORBIT_SPIN_BASE = 0.07;
const ORBIT_SPIN_WOBBLE = 0.015;
const ORBIT_SPIN_WOBBLE_RATE = 0.2;

// Starfield: make it feel LESS attached to the orbit + MUCH slower
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

// ===== NEW: VISUAL SECTOR + CLAIM TUNES =====
const TICK_RING_SCALE = 1.35;            // put ticks on the outer ring
const TICK_MINOR_LEN = 7;
const TICK_MAJOR_LEN = 14;
const TICK_MAJOR_EVERY = 10;             // major tick every N sectors
const ACTIVE_ARC_HALF_WINDOW_SECTORS = 1.5; // arc covers +/- this many sectors around "current"
const ACTIVE_ARC_STEPS = 42;             // smoothness of arc on ellipse

// Marker / gate sectors (fixed sector numbers)
const GATES = [
  { sector: 0, name: "☉ Sun Gate" },
  { sector: 30, name: "☾ Moon Gate" },
  { sector: 60, name: "♂ Mars Gate" },
];

// Optional “claim ready” rule (purely visual now):
// claimReady when you're near a gate AND sector is within +/- CLAIM_SECTOR_WINDOW
const CLAIM_SECTOR_WINDOW = 1;
// =======================================

let w = 0,
  h = 0,
  dpr = Math.min(2, window.devicePixelRatio || 1);
let prevW = 0;
let prevH = 0;

// ---------------- STARFIELD ----------------

// Far layer (slow drift)
const farStars = Array.from({ length: 220 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: 0.25 + Math.random() * 0.5,
  a: 0.12 + Math.random() * 0.28,
}));

// Near layer (faster drift)
const nearStars = Array.from({ length: 120 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: 0.8 + Math.random() * 1.6,
  a: 0.25 + Math.random() * 0.55,
}));

// Mid spiral layer (with trails)
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

function drawOrbit(cx, cy, rx, ry) {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = "rgba(180,120,255,0.18)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220,210,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawComet(x, y, vx, vy) {
  ctx.save();

  const tailLen = 26;
  const mag = Math.max(0.001, Math.hypot(vx, vy));
  const tx = (vx / mag) * -tailLen;
  const ty = (vy / mag) * -tailLen;

  const lg = ctx.createLinearGradient(x, y, x + tx, y + ty);
  lg.addColorStop(0, "rgba(255,180,255,0.85)");
  lg.addColorStop(1, "rgba(120,160,255,0)");

  ctx.strokeStyle = lg;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tx, y + ty);
  ctx.stroke();

  ctx.shadowColor = "rgba(170,120,255,0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(245,235,255,0.95)";
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ---------------- NEW: SECTOR VISUALS ----------------
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function wrapSectorDelta(a, b) {
  // smallest delta between sectors a and b on a ring
  const d = a - b;
  const m = ((d % SECTORS) + SECTORS) % SECTORS;
  return m > SECTORS / 2 ? m - SECTORS : m;
}

function ellipsePoint(cx, cy, rx, ry, angleRad) {
  return {
    x: cx + Math.cos(angleRad) * rx,
    y: cy + Math.sin(angleRad) * ry,
  };
}

function ellipseOutNormal(rx, ry, angleRad) {
  // outward normal for ellipse x=rx cos(a), y=ry sin(a) is proportional to (cos(a)/rx, sin(a)/ry)
  const nx = Math.cos(angleRad) / Math.max(1e-6, rx);
  const ny = Math.sin(angleRad) / Math.max(1e-6, ry);
  const mag = Math.max(1e-6, Math.hypot(nx, ny));
  return { nx: nx / mag, ny: ny / mag };
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

function drawEllipseArc(cx, cy, rx, ry, a0, a1, steps) {
  // Draw arc by sampling points (Canvas ellipse arc is awkward when rotated/approximated)
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

// ---------------- CHECKPOINTS / GATES ----------------
// Convert fixed sector markers into orbit fractions (t in [0,1))
const markers = GATES.map((g) => ({
  sector: ((g.sector % SECTORS) + SECTORS) % SECTORS,
  t: (((g.sector % SECTORS) + SECTORS) % SECTORS) / SECTORS,
  name: g.name,
}));

let checkpointCooldown = 0;
let checkpointHold = 0;
let checkpointFlash = 0;
const wasNearMarker = markers.map(() => false);

// ---------------- MAIN LOOP ----------------
let lastMs = 0;
let animT = 0;
let orbitRotation = 0;

function tick(ms) {
  if (!lastMs) lastMs = ms;
  const dt = (ms - lastMs) / 1000;
  lastMs = ms;

  animT += dt;

  // ✅ KEEP NORMAL REAL TIME
  const realNow = Date.now() / 1000;
  const epochProgress = (realNow % EPOCH_SECONDS) / EPOCH_SECONDS;

  // sector index (0..SECTORS-1)
  const sector = Math.min(SECTORS - 1, Math.floor(epochProgress * SECTORS));
  const sectorWithin = epochProgress * SECTORS - sector; // 0..1 within sector

  // HUD
  epochEl.textContent = String(Math.floor(realNow / EPOCH_SECONDS));
  sectorEl.textContent = `${sector + 1} / ${SECTORS}`;
  barFill.style.width = `${epochProgress * 100}%`;

  // draw background + stars
  ctx.clearRect(0, 0, w, h);
  drawBackground(animT, dt);

  // orbit point for comet
  const p = orbitPoint(epochProgress);

  // orbit rotation (you said it’s fine)
  orbitRotation +=
    dt *
    (ORBIT_SPIN_BASE +
      Math.sin(animT * ORBIT_SPIN_WOBBLE_RATE) * ORBIT_SPIN_WOBBLE);

  // rotate orbit group
  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(orbitRotation);
  ctx.translate(-p.cx, -p.cy);

  // Rings
  const rxInner = p.rx * 0.75;
  const ryInner = p.ry * 0.75;
  const rxMid = p.rx;
  const ryMid = p.ry;
  const rxOuter = p.rx * 1.35;
  const ryOuter = p.ry * 1.35;

  drawOrbit(p.cx, p.cy, rxInner, ryInner);
  drawOrbit(p.cx, p.cy, rxMid, ryMid);
  drawOrbit(p.cx, p.cy, rxOuter, ryOuter);

  // NEW: sector ticks on outer ring
  drawSectorTicks(p.cx, p.cy, rxOuter * 1.0, ryOuter * 1.0, SECTORS);

  // NEW: active sector “claim window” arc (smoothly tracks within-sector progress)
  const currentAngle = ((sector + sectorWithin) / SECTORS) * Math.PI * 2;
  const halfWindow = (ACTIVE_ARC_HALF_WINDOW_SECTORS / SECTORS) * Math.PI * 2;

  ctx.save();
  ctx.shadowColor = "rgba(255,170,200,0.65)";
  ctx.shadowBlur = 16;
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = "rgba(255,170,200,0.22)";
  drawEllipseArc(
    p.cx,
    p.cy,
    rxOuter * 1.02,
    ryOuter * 1.02,
    currentAngle - halfWindow,
    currentAngle + halfWindow,
    ACTIVE_ARC_STEPS
  );
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.lineWidth = 2.0;
  ctx.strokeStyle = "rgba(255,230,240,0.28)";
  drawEllipseArc(
    p.cx,
    p.cy,
    rxOuter * 1.02,
    ryOuter * 1.02,
    currentAngle - halfWindow,
    currentAngle + halfWindow,
    ACTIVE_ARC_STEPS
  );
  ctx.stroke();
  ctx.restore();

  // comet velocity
  const p2 = orbitPoint((epochProgress + 0.002) % 1);
  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  // ---- checkpoint/claim trigger logic ----
  let claimReadyName = null;

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const mp = orbitPoint(m.t);

    const d = Math.hypot(p.x - mp.x, p.y - mp.y);
    const triggerDist = Math.min(w, h) * CHECKPOINT_TRIGGER_DIST_FRAC;
    const near = d < triggerDist;

    // Optional: claim-ready if sector matches window around marker sector
    const sd = Math.abs(wrapSectorDelta(sector, m.sector));
    const claimReady = near && sd <= CLAIM_SECTOR_WINDOW;
    if (claimReady) claimReadyName = m.name;

    // edge-trigger entering near zone
    if (near && !wasNearMarker[i] && checkpointCooldown <= 0) {
      checkpointCooldown = CHECKPOINT_COOLDOWN_SEC;
      checkpointHold = 2.6;
      checkpointFlash = 1.0;
      subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
    }

    // keep message while near
    if (CHECKPOINT_HOLD_WHILE_NEAR && near) {
      checkpointHold = Math.max(checkpointHold, 0.25);
      checkpointFlash = Math.max(checkpointFlash, 0.45);
      if (!subEl.textContent.startsWith("CHECKPOINT") && !subEl.textContent.startsWith("CLAIM")) {
        subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
      }
    }

    wasNearMarker[i] = near;
  }

  // If claim-ready (purely visual for now), override HUD message
  if (claimReadyName) {
    subEl.textContent = `CLAIM READY ✦ ${claimReadyName}`;
  }

  // ---- marker triangle lines ----
  if (markers.length >= 3) {
    const pts = markers.map((m) => orbitPoint(m.t));
    ctx.shadowColor = "rgba(255,200,150,0.6)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255,210,150,0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---- draw gate marker dots + labels ----
  for (const m of markers) {
    const mp = orbitPoint(m.t);

    // label fades in as Nebby approaches
    const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
    const revealStart = Math.min(w, h) * 0.22;
    const revealEnd = Math.min(w, h) * 0.07;
    const aLabel = clamp01((revealStart - dist) / Math.max(1e-6, (revealStart - revealEnd)));

    // dot
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,210,120,0.92)";
    ctx.shadowColor = "rgba(255,210,120,0.9)";
    ctx.shadowBlur = 14;
    ctx.arc(mp.x, mp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // label
    if (aLabel > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * aLabel;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,235,245,0.9)";
      ctx.shadowColor = "rgba(255,190,230,0.65)";
      ctx.shadowBlur = 10;

      // small outward offset from marker
      const ang = m.t * Math.PI * 2;
      const n = ellipseOutNormal(p.rx, p.ry, ang);
      const ox = n.nx * 18;
      const oy = n.ny * 18;

      ctx.fillText(m.name, mp.x + ox, mp.y + oy);
      ctx.restore();
    }
  }

  // comet
  drawComet(p.x, p.y, vx, vy);

  ctx.restore();

  // ---- checkpoint HUD timers + slower flicker ----
  checkpointCooldown = Math.max(0, checkpointCooldown - dt);
  checkpointHold = Math.max(0, checkpointHold - dt);

  if (checkpointHold > 0) {
    checkpointFlash = 1.0;
  } else {
    checkpointFlash = Math.max(0, checkpointFlash - dt / CHECKPOINT_FADE_OUT_SEC);
  }

  // HUD styling: claim vs checkpoint vs idle
  if (subEl.textContent.startsWith("CLAIM READY")) {
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
      subEl.textContent.startsWith("CLAIM READY")
    ) {
      subEl.textContent = "Stage 0 • Visual simulation";
    }
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
