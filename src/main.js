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

// ======= PARAMETERS (tune later) =======
const EPOCH_SECONDS = 24 * 60 * 60; // 24h
const SECTORS = 90;                // 90 sectors
const SPEED_MULT = 1;              // 1 = real-time
// ======================================

let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

function resize() {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --- Starfield ---
const stars = Array.from({ length: 180 }, () => ({
  x: Math.random() * w,
  y: Math.random() * h,
  r: Math.random() * 1.6 + 0.2,
  a: Math.random() * 0.8 + 0.2,
  vx: (Math.random() - 0.5) * 0.06,
  vy: (Math.random() - 0.5) * 0.06,
}));

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

  ctx.strokeStyle = "rgba(180, 120, 255, 0.35)";
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

function tick() {
  const tNow = nowSec();
  last = tNow;

  const epochProgress = ((tNow % EPOCH_SECONDS) / EPOCH_SECONDS);
  const sector = Math.floor(epochProgress * SECTORS);

  epochEl.textContent = String(Math.floor(tNow / EPOCH_SECONDS));
  sectorEl.textContent = `${sector + 1} / ${SECTORS}`;
  barFill.style.width = `${Math.max(0, Math.min(100, epochProgress * 100))}%`;

  ctx.clearRect(0, 0, w, h);
  drawBackground();

  const p = orbitPoint(epochProgress);
  drawOrbit(p.cx, p.cy, p.rx, p.ry);

  const p2 = orbitPoint((epochProgress + 0.002) % 1);
  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  drawComet(p.x, p.y, vx, vy);

  requestAnimationFrame(tick);
}

tick();
