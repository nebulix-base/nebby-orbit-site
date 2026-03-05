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

const EPOCH_SECONDS = 24 * 60 * 60;
const SECTORS = 90;
const SPEED_MULT = 1;

let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
let prevW = 0;
let prevH = 0;

const stars = Array.from({ length: 420 }, () => {
  const z = Math.random();
  return {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 0.4 + z * 1.6,
    a: 0.2 + z * 0.8,
    z,
    speed: 0.3 + z * 1.4,
    phase: Math.random() * Math.PI * 2
  };
});

function respawnStar(s, cx, cy) {
  const arms = 3;
  const arm = Math.floor(Math.random() * arms);
  const armOffset = (Math.PI * 2 / arms) * arm;

  const ang = armOffset + (Math.random() - 0.5) * 0.6;
  const rad = 4 + Math.random() * 28;

  const twist = rad * 0.015;
  const finalAngle = ang + twist;

  s.x = cx + Math.cos(finalAngle) * rad;
  s.y = cy + Math.sin(finalAngle) * rad;
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
    w * 0.55, h * 0.45, 0,
    w * 0.55, h * 0.45, Math.max(w, h)
  );

  g.addColorStop(0, "rgba(32,12,55,1)");
  g.addColorStop(0.45, "rgba(10,8,24,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.52;
  const cy = h * 0.52;

  const swirl = 0.00011;
  const drift = 0.018;

  const step = Math.min(2, dt * 60);

  for (const s of stars) {

    const dx = s.x - cx;
    const dy = s.y - cy;

    const dist = Math.max(60, Math.hypot(dx, dy));
    const inv = 1 / dist;

    const tx = -dy * inv;
    const ty = dx * inv;

    const rx = dx * inv;
    const ry = dy * inv;

    const k = s.speed;

    s.x += ((tx * swirl * k * 900) + (rx * drift * k)) * step;
    s.y += ((ty * swirl * k * 900) + (ry * drift * k)) * step;

    if (s.x < -120 || s.x > w + 120 || s.y < -120 || s.y > h + 120) {
      respawnStar(s, cx, cy);
    }

    const tw = 0.85 + 0.15 * Math.sin(t * 1.4 + s.phase);
    const alpha = s.a * tw;

    ctx.beginPath();
    ctx.fillStyle = `rgba(220,210,255,${alpha})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

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
  ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220,210,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
  ctx.stroke();

  ctx.restore();
}

function drawComet(x, y, vx, vy) {

  ctx.save();

  const tailLen = 26;

  const mag = Math.max(0.001, Math.hypot(vx,vy));

  const tx = (vx/mag) * -tailLen;
  const ty = (vy/mag) * -tailLen;

  const lg = ctx.createLinearGradient(x,y,x+tx,y+ty);
  lg.addColorStop(0,"rgba(255,180,255,0.85)");
  lg.addColorStop(1,"rgba(120,160,255,0)");

  ctx.strokeStyle = lg;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x+tx,y+ty);
  ctx.stroke();

  ctx.shadowColor = "rgba(170,120,255,0.9)";
  ctx.shadowBlur = 18;

  ctx.fillStyle = "rgba(245,235,255,0.95)";
  ctx.beginPath();
  ctx.arc(x,y,4.2,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
}

let lastMs = 0;
let animT = 0;
let orbitRotation = 0;

function tick(ms){

  if(!lastMs) lastMs = ms;

  const dt = (ms - lastMs)/1000;
  lastMs = ms;

  animT += dt;
  orbitRotation += dt * 0.2;

  const realNow = Date.now()/1000;

  const epochProgress = (realNow % EPOCH_SECONDS) / EPOCH_SECONDS;

  const sector = Math.floor(epochProgress * SECTORS);

  epochEl.textContent = Math.floor(realNow / EPOCH_SECONDS);
  sectorEl.textContent = `${sector+1} / ${SECTORS}`;

  barFill.style.width = `${epochProgress*100}%`;

  ctx.clearRect(0,0,w,h);

  drawBackground(animT,dt);

  const p = orbitPoint(epochProgress);

  ctx.save();

  ctx.translate(p.cx,p.cy);
  ctx.rotate(orbitRotation);
  ctx.translate(-p.cx,-p.cy);

  drawOrbit(p.cx,p.cy,p.rx*0.75,p.ry*0.75);
  drawOrbit(p.cx,p.cy,p.rx,p.ry);
  drawOrbit(p.cx,p.cy,p.rx*1.35,p.ry*1.35);

  const p2 = orbitPoint((epochProgress+0.002)%1);

  const vx = p2.x - p.x;
  const vy = p2.y - p.y;

  drawComet(p.x,p.y,vx,vy);

  ctx.restore();

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
