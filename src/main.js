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
const stars = Array.from({ length: 240 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: Math.random() * 1.6 + 0.2,
  a: Math.random() * 0.8 + 0.2,
  vx: (Math.random() - 0.5) * 0.06,
  vy: (Math.random() - 0.5) * 0.06,
}));


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
  const g = ctx.createRadialGradient(w * 0.55, h * 0.45, 0, w * 0.55, h * 0.45, Math.max(w, h));
  g.addColorStop(0, "rgba(32, 12, 55, 1)");
  g.addColorStop(0.45, "rgba(10, 8, 24, 1)");
  g.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (const s of stars) {
    s.x += s.vx;
    s.y += s.vy;

    if (s.x < -20) s.x = w + 20;
    if (s.x > w + 20) s.x = -20;
    if (s.y < -20) s.y = h + 20;
    if (s.y > h + 20) s.y = -20;

    ctx.beginPath();
    ctx.fillStyle = `rgba(220, 210, 255, ${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // soft nebula haze
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

// --- Planet checkpoint triggers ---
for (const m of markers) {
  const mp = orbitPoint(m.t);

  const dxm = p.x - mp.x;
  const dym = p.y - mp.y;
  const d = Math.hypot(dxm, dym);

  const triggerDist = Math.min(w, h) * 0.035;

  if (d < triggerDist && checkpointCooldown === 0) {
    checkpointCooldown = 2.0;
    checkpointFlash = 1.0;

    if (subEl) subEl.textContent = `CHECKPOINT ✦ ${m.name}`;
  }
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
