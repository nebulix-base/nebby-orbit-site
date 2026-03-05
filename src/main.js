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
const EPOCH_SECONDS = 24 * 60 * 60; // "a day" in your HUD logic
const SECTORS = 90;

// ✅ Make checkpoints happen often (this is the big fix)
// 1 = real-time. Try 60, 120, 300 for faster.
const TIME_SCALE = 120;

// ✅ Orbit spin speed (smaller = slower)
const ORBIT_SPIN = 0.035; // try 0.02 .. 0.06

// ✅ Starfield spiral is now DECOUPLED from orbit rotation
// (different center + its own gentle drift so it doesn't feel "attached")
const STAR_CENTER_X = 0.50; // 0..1
const STAR_CENTER_Y = 0.54; // 0..1
const STAR_CENTER_WOBBLE = 0.018; // 0..0.05

// Star motion feel
const STAR_SWIRL = 0.00012; // lower = slower spiral
const STAR_DRIFT = 0.018;   // higher = more "forward travel"

// =======================================

let w = 0,
  h = 0,
  dpr = Math.min(2, window.devicePixelRatio || 1);
let prevW = 0;
let prevH = 0;

// ---------------- STARFIELD ----------------

// Mid layer (spiral + trails)
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
  // background gradient
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

  // normalize dt to ~60fps so movement is consistent
  const step = Math.min(2, dt * 60);

  // ✅ Starfield center is NOT exactly the orbit center anymore
  const cxBase = w * STAR_CENTER_X;
  const cyBase = h * STAR_CENTER_Y;

  // gentle wobble so it feels like you're drifting through space, not "stuck to orbit"
  const cx = cxBase + Math.sin(t * 0.27) * (Math.min(w, h) * STAR_CENTER_WOBBLE);
  const cy = cyBase + Math.cos(t * 0.23) * (Math.min(w, h) * STAR_CENTER_WOBBLE);

  // FAR STAR LAYER
  for (const s of farStars) {
    s.x += 0.03 * step;
    if (s.x > w + 2) s.x = -2;

    ctx.beginPath();
    ctx.fillStyle = `rgba(200,210,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // MID STAR LAYER (spiral + trails)
  for (const s of stars) {
    s.life = Math.min(1, s.life + s.grow * step);

    s.px = s.x;
    s.py = s.y;

    const dx = s.x - cx;
    const dy = s.y - cy;

    const dist = Math.max(60, Math.hypot(dx, dy));
    const inv = 1 / dist;

    // lens near center
    const lensRadius = Math.min(w, h) * 0.22;
    const lensStrength = 0.35;
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

    s.x += ((tx * STAR_SWIRL * k * 900) + (rx * STAR_DRIFT * k) + (rx * lens * 40)) * step;
    s.y += ((ty * STAR_SWIRL * k * 900) + (ry * STAR_DRIFT * k) + (ry * lens * 40)) * step;

    if (s.x < -140 || s.x > w + 140 || s.y < -140 || s.y > h + 140) {
      respawnStar(s, cx, cy);
      continue;
    }
    if (Math.hypot(s.x - cx, s.y - cy) > Math.max(w, h) * 0.9) {
      respawnStar(s, cx, cy);
      continue;
    }

    const tw = 0.85 + 0.15 * Math.sin(t * 1.4 + s.phase);
    const alpha = s.a * tw * (0.25 + 0.75 * s.life);

    // trails
    const trailStrength = 0.10 + 0.30 * s.z;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(220,210,255,${alpha * trailStrength})`;
    ctx.lineWidth = 0.35 + s.z * 0.9;
    ctx.lineCap = "round";
    ctx.moveTo(s.px, s.py);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    // dot
    ctx.shadowBlur = s.z > 0.78 ? 8 : 0;
    ctx.shadowColor = "rgba(220,210,255,0.6)";
    ctx.beginPath();
    ctx.fillStyle = `rgba(220,210,255,${alpha})`;
    ctx.arc(s.x, s.y, s.r * (0.6 + 0.4 * s.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // NEAR STAR LAYER
  for (const s of nearStars) {
    s.x += 0.25 * step;
    if (s.x > w + 2) s.x = -2;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,240,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // glow
  ctx.globalAlpha = 0.08;
  const lg = ctx.createRadialGradient(
    cx,
    cy,
    0,
    cx,
    cy,
    Math.min(w, h) * 0.25
  );
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

// ---------------- CHECKPOINTS ----------------
const markers = [
  { t: 0.12, name: "☉ Sun Gate" },
  { t: 0.38, name: "☾ Moon Gate" },
  { t: 0.67, name: "♂ Mars Gate" },
];

let checkpointCooldown = 0;
let checkpointHold = 0;
let checkpointFlash = 0;
const wasNearMarker = markers.map(() => false);

// ---------------- MAIN LOOP ----------------
let lastMs = 0;
let animT = 0;
let orbitRotation = 0;

// used to make the epoch progress move fast (but still "acts like" a day)
const simStartReal = Date.now() / 1000;

function tick(ms) {
  if (!lastMs) lastMs = ms;
  const dt = (ms - lastMs) / 1000;
  lastMs = ms;

  animT += dt;

  // ✅ simulate time so checkpoints trigger often
  const simNow = simStartReal + animT * TIME_SCALE;
  const epochProgress = (simNow % EPOCH_SECONDS) / EPOCH_SECONDS;
  const sector = Math.min(SECTORS - 1, Math.floor(epochProgress * SECTORS));

  // HUD
  epochEl.textContent = String(Math.floor(simNow / EPOCH_SECONDS));
  sectorEl.textContent = `${sector + 1} / ${SECTORS}`;
  barFill.style.width = `${epochProgress * 100}%`;

  // draw bg + stars
  ctx.clearRect(0, 0, w, h);
  drawBackground(animT, dt);

  // orbit point for comet
  const p = orbitPoint(epochProgress);

  // orbit rotation (slower, less “soap spin”)
  orbitRotation += dt * ORBIT_SPIN;

  // rotate orbit group
  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(orbitRotation);
  ctx.translate(-p.cx, -p.cy);

  drawOrbit(p.cx, p.cy, p.rx * 0.75, p.ry * 0.75);
  drawOrbit(p.cx, p.cy, p.rx, p.ry);
  drawOrbit(p.cx, p.cy, p.rx * 1.35, p.ry * 1.35);

  // comet velocity
  const p2 = orbitPoint((epochProgress + 0.002) % 1);
  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  // checkpoint trigger (edge trigger)
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const mp = orbitPoint(m.t);

    const d = Math.hypot(p.x - mp.x, p.y - mp.y);
    const triggerDist = Math.min(w, h) * 0.035;
    const near = d < triggerDist;

    if (near && !wasNearMarker[i] && checkpointCooldown === 0) {
      // ✅ stays visible longer + flashes slower
      checkpointCooldown = 0.35;
      checkpointHold = 3.6;  // was 1.6
      checkpointFlash = 1.0;
      subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
    }

    wasNearMarker[i] = near;
  }

  // triangle lines
  if (markers.length >= 3) {
    const pts = markers.map((m) => orbitPoint(m.t));
    ctx.shadowColor = "rgba(255,200,150,0.6)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255,210,150,0.25)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // marker dots
  for (const m of markers) {
    const mp = orbitPoint(m.t);
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,210,120,0.9)";
    ctx.shadowColor = "rgba(255,210,120,0.9)";
    ctx.shadowBlur = 14;
    ctx.arc(mp.x, mp.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // comet
  drawComet(p.x, p.y, vx, vy);

  ctx.restore();

  // HUD timers
  checkpointCooldown = Math.max(0, checkpointCooldown - dt);

  checkpointHold = Math.max(0, checkpointHold - dt);
  if (checkpointHold > 0) checkpointFlash = 1.0;
  else checkpointFlash = Math.max(0, checkpointFlash - dt * 0.25); // ✅ slower fade

  // HUD visual pulse (slower)
  if (checkpointFlash > 0) {
    const pulse = 0.55 + 0.45 * Math.sin(animT * 2.2); // ✅ slower pulse
    const a = (0.45 + 0.55 * pulse) * checkpointFlash;
    subEl.style.color = `rgba(255, 140, 140, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(255, 90, 90, ${a})`;
  } else {
    subEl.style.color = "";
    subEl.style.textShadow = "";
    if (subEl.textContent.startsWith("CHECKPOINT")) {
      subEl.textContent = "Stage 0 • Visual simulation";
    }
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
