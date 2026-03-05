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

let epochEl = document.getElementById("epoch");
let sectorEl = document.getElementById("sector");
let barFill = document.getElementById("barFill");
const subEl = document.getElementById("sub");

// ======= PARAMETERS (tune later) =======
const EPOCH_SECONDS = 24 * 60 * 60; // 24h
const SECTORS = 90;                // 90 sectors
const SPEED_MULT = 1;              // 1 = real-time
// ======================================

let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
let prevW = 0;
let prevH = 0;


// --- Starfield ---
const z = Math.random(); // depth
// --- Starfield (spiral + subtle warp + fade-in) ---
const stars = Array.from({ length: 520 }, () => {
  const z = Math.random();              // 0..1 depth (0 far, 1 near)
  const speed = 0.25 + z * 1.25;        // near stars move faster

  return {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 0.35 + z * 1.6,
    a: 0.15 + z * 0.85,
    z,
    speed,
    phase: Math.random() * Math.PI * 2,
    life: Math.random(),                // fade-in progress
    grow: 0.008 + Math.random() * 0.014  // fade-in rate (slow enough not to pop)
  };
});

function respawnStar(s, cx, cy) {
  // spawn near the center, not on a far ring
  const ang = Math.random() * Math.PI * 2;
  const rad = 4 + Math.random() * 25; // tight spawn radius

  s.x = cx + Math.cos(ang) * rad;
  s.y = cy + Math.sin(ang) * rad;

  s.life = 0;               // fade in (prevents pop)
  s.phase = Math.random() * Math.PI * 2;
  // (optional) tiny randomness so it doesn't look too uniform
  // s.z = Math.random(); // only if you want depth to re-roll too
}

function resize() {
  prevW = w || window.innerWidth;
  prevH = h || window.innerHeight;

  w = window.innerWidth;
  h = window.innerHeight;

  // scale star positions so they keep their relative place
  const sx = prevW ? (w / prevW) : 1;
  const sy = prevH ? (h / prevH) : 1;
  if (Number.isFinite(sx) && Number.isFinite(sy) && sx > 0 && sy > 0) {
    for (const s of stars) {
      s.x *= sx;
      s.y *= sy;
    }
  }

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function drawBackground() {
  const g = ctx.createRadialGradient(
    w * 0.55, h * 0.45, 0,
    w * 0.55, h * 0.45, Math.max(w, h)
  );
  g.addColorStop(0, "rgba(32, 12, 55, 1)");
  g.addColorStop(0.45, "rgba(10, 8, 24, 1)");
  g.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // --- Spiral / forward motion feel ---
  const cx = w * 0.52;
  const cy = h * 0.52;

  const swirl = 0.0001;   // rotation strength
  const drift = 0.02;     // forward travel strength

  for (const s of stars) {
    // fade in instead of popping
    s.life = Math.min(1, s.life + s.grow);

    const dx = s.x - cx;
    const dy = s.y - cy;

    const dist = Math.max(60, Math.hypot(dx, dy));
    const inv = 1 / dist;

    // tangential + radial directions
    const tx = -dy * inv;
    const ty =  dx * inv;
    const rx =  dx * inv;
    const ry =  dy * inv;

    const k = s.speed;

    // motion
    s.x += (tx * swirl * k * 900) + (rx * drift * k);
    s.y += (ty * swirl * k * 900) + (ry * drift * k);

    // respawn offscreen and fade in again
   if (s.x < -140 || s.x > w + 140 || s.y < -140 || s.y > h + 140) {
  respawnStar(s, cx, cy);
}

// ALSO: if a star has drifted *too far* from the center, recycle it
// (prevents "empty patches" after long spirals)
const dCenter = Math.hypot(s.x - cx, s.y - cy);
if (dCenter > Math.max(w, h) * 0.85) {
  respawnStar(s, cx, cy);
}

    const tw = 0.8 + 0.2 * Math.sin(animT * 1.2 + s.phase);
    const alpha = s.a * tw * (0.15 + 0.85 * s.life);

    // Near stars: subtle short streaks (not straws)
    if (s.z > 0.93) {
      const len = 2 + s.z * 6; // short streaks

      ctx.beginPath();
      ctx.strokeStyle = `rgba(220,210,255,${alpha * 0.75})`;
      ctx.lineWidth = 0.5 + s.z * 0.6;
      ctx.lineCap = "round";

      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - rx * len, s.y - ry * len);
      ctx.stroke();

      ctx.shadowBlur = 0;
    } else {
      // Optional glow on mid-near stars
      if (s.z > 0.78) {
        ctx.shadowColor = "rgba(220,210,255,0.5)";
        ctx.shadowBlur = 8;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(220,210,255,${alpha})`;
      ctx.arc(s.x, s.y, s.r * (0.35 + 0.65 * s.life), 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
    }
  } // <-- IMPORTANT: closes the for-loop

  // soft nebula haze (IMPORTANT: outside the loop)
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "rgba(145, 70, 255, 1)";
  ctx.beginPath();
  ctx.arc(w * 0.25, h * 0.35, Math.min(w, h) * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(60, 160, 255, 1)";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.62, Math.min(w, h) * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function orbitPoint(t) {
  const cx = w * 0.52;
  const cy = h * 0.52;
  const rx = Math.min(w, h) * 0.28;
  const ry = Math.min(w, h) * 0.18;

  const wobble = Math.sin(t * 2 * Math.PI) * 0.02;
  const angle = t * 2 * Math.PI;

  const x = cx + Math.cos(angle) * rx;
  const y = cy + Math.sin(angle + wobble) * ry;

  return { x, y, cx, cy, rx, ry };
}

function drawOrbit(cx, cy, rx, ry) {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = "rgba(180, 120, 255, 0.18)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220, 210, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220, 210, 255, 0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i < SECTORS; i += 3) {
    const a = (i / SECTORS) * Math.PI * 2;
    const x1 = Math.cos(a) * (rx - 2);
    const y1 = Math.sin(a) * (ry - 2);
    const x2 = Math.cos(a) * (rx + 6);
    const y2 = Math.sin(a) * (ry + 6);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawComet(x, y, vx, vy) {
  ctx.save();

  const tailLen = 26;
  const mag = Math.max(0.001, Math.hypot(vx, vy));
  const tx = (vx / mag) * -tailLen;
  const ty = (vy / mag) * -tailLen;

  const lg = ctx.createLinearGradient(x, y, x + tx, y + ty);
  lg.addColorStop(0, "rgba(255, 180, 255, 0.85)");
  lg.addColorStop(1, "rgba(120, 160, 255, 0)");

  ctx.strokeStyle = lg;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tx, y + ty);
  ctx.stroke();

  ctx.shadowColor = "rgba(170, 120, 255, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(245, 235, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function nowSec() {
  return Date.now() / 1000;
}

let last = nowSec();


// --- Orbit markers (planet checkpoints) ---
const markers = [
  { t: 0.12, name: "☉ Sun Gate" },
  { t: 0.38, name: "☾ Moon Gate" },
  { t: 0.67, name: "♂ Mars Gate" }
];
let checkpointCooldown = 0; // seconds
let checkpointFlash = 0;    // 0..1
let animT = 0;
let orbitRotation = 0;

let checkpointHold = 0;                 // seconds to keep text visible
const wasNearMarker = markers.map(() => false);

function tick() {

  if (!epochEl || !sectorEl || !barFill) {
  epochEl = document.getElementById("epoch");
  sectorEl = document.getElementById("sector");
  barFill = document.getElementById("barFill");
}
  
  const tNow = nowSec();
  const dt = (tNow - last) * SPEED_MULT;
  last = tNow;
  
  animT += dt;
  orbitRotation += dt * 0.05;
  
const epochProgress = (tNow % EPOCH_SECONDS) / EPOCH_SECONDS;
const sector = Math.min(SECTORS - 1, Math.floor(epochProgress * SECTORS));

epochEl.textContent = String(Math.floor(tNow / EPOCH_SECONDS));  
sectorEl.textContent = `${sector + 1} / ${SECTORS}`;
barFill.style.width = `${epochProgress * 100}%`;

  ctx.clearRect(0, 0, w, h);
  drawBackground();

  
  const p = orbitPoint(epochProgress);

  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(orbitRotation);
  ctx.translate(-p.cx, -p.cy);
// inner orbit
  drawOrbit(p.cx, p.cy, p.rx * 0.75, p.ry * 0.75);
// main orbit
  drawOrbit(p.cx, p.cy, p.rx, p.ry);
// outer orbit
  drawOrbit(p.cx, p.cy, p.rx * 1.35, p.ry * 1.35);

  const p2 = orbitPoint((epochProgress + 0.002) % 1);
  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  
  // draw orbit markers

for (let i = 0; i < markers.length; i++) {
  const m = markers[i];
  const mp = orbitPoint(m.t);

  const dxm = p.x - mp.x;
  const dym = p.y - mp.y;
  const d = Math.hypot(dxm, dym);

  const triggerDist = Math.min(w, h) * 0.035;
  const near = d < triggerDist;

  if (near && !wasNearMarker[i] && checkpointCooldown === 0) {
    checkpointCooldown = 1.0;
    checkpointHold = 1.6;     // readable
    checkpointFlash = 1.0;
    if (subEl) subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
  }

  wasNearMarker[i] = near;
}

// --- draw orbit marker dots (visual) ---
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
  
  // --- celestial geometry lines (astrolabe look) ---
if (markers.length >= 3) {
  const pts = markers.map(m => orbitPoint(m.t));
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


// comet (still on rotated orbit)
  drawComet(p.x, p.y, vx, vy);

  ctx.restore();


// --- marker checkpoint triggers (edge-trigger) ---
for (let i = 0; i < markers.length; i++) {
  const m = markers[i];
  const mp = orbitPoint(m.t);

  const dxm = p.x - mp.x;
  const dym = p.y - mp.y;
  const d = Math.hypot(dxm, dym);

  const triggerDist = Math.min(w, h) * 0.035;
  const near = d < triggerDist;

  if (near && !wasNearMarker[i] && checkpointCooldown === 0) {
    checkpointCooldown = 1.0;
    checkpointHold = 1.6;
    checkpointFlash = 1.0;
    if (subEl) subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
  }

  wasNearMarker[i] = near;
}
  

  

// decrease timers
checkpointCooldown = Math.max(0, checkpointCooldown - dt);
checkpointHold = Math.max(0, checkpointHold - dt);
if (checkpointHold > 0) {
  checkpointFlash = 1.0;
} else {
  checkpointFlash = Math.max(0, checkpointFlash - dt * 0.8);
}

// apply flash styling to HUD while active
if (subEl) {
  if (checkpointFlash > 0) {
    // subtle pulse effect
    const a = 0.55 + 0.45 * checkpointFlash;
    subEl.style.color = `rgba(255, 140, 140, ${a})`;
    subEl.style.textShadow = `0 0 18px rgba(255, 90, 90, ${a})`;
  } else {
    // restore default look
    subEl.style.color = "";
    subEl.style.textShadow = "";
    // optional: revert message after flash ends
    if (subEl.textContent.startsWith("CHECKPOINT")) {
      subEl.textContent = "Stage 0 • Visual simulation";
    }
  }
}

  requestAnimationFrame(tick);
}

tick();
