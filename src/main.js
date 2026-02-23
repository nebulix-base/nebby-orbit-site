import "./styles.css";

const canvas = document.getElementById("fxCanvas");
const svg = document.getElementById("orbitSvg");
const ctx = canvas.getContext("2d");

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener("resize", resize);
resize();

let angle = 0;

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.35;

  ctx.fillStyle = "rgba(5,5,16,0.2)";
  ctx.fillRect(0, 0, W, H);

  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;

  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  angle += 0.01;
  requestAnimationFrame(draw);
}

draw();
