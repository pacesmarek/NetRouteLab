/** Konfety přes celou stránku jako oslava úspěchu (bez závislostí, canvas nad vším, kliky propouští). */

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15'];

interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; life: number; }

let running = false;

export function fireConfetti(): void {
  if (running) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  running = true;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); running = false; return; }
  ctx.scale(dpr, dpr);

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const color = () => COLORS[Math.floor(Math.random() * COLORS.length)];
  const pieces: Piece[] = [];
  // dva výstřely zespodu z rohů (šikmo nahoru a ke středu); gravitace je pak stáhne zpátky dolů
  for (const side of [0, 1]) {
    for (let i = 0; i < 90; i++) {
      const base = rnd(Math.PI * 0.2, Math.PI * 0.42); // elevace nad vodorovnou
      const ang = side ? -(Math.PI - base) : -base;      // pravý roh zrcadlově
      const sp = rnd(10, 22);
      pieces.push({ x: side ? W - 10 : 10, y: H - 10, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: rnd(6, 11), h: rnd(4, 7), rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), color: color(), life: rnd(120, 180) });
    }
  }

  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of pieces) {
      if (frame > p.life) continue;
      alive++;
      p.vy += 0.28;      // gravitace
      p.vx *= 0.985;     // odpor vzduchu
      p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.life - frame) / 40);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2); // „převracení“ papírku
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive > 0) requestAnimationFrame(tick);
    else { canvas.remove(); running = false; }
  };
  requestAnimationFrame(tick);
}
