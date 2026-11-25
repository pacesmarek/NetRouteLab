/** Plynulé posouvání stránky při spuštění testu (ping, traceroute, přístup z internetu). */

const behavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** Vyjede nahoru k plátnu (k prvnímu uzlu topologie), aby byla vidět animace paketu. */
export function scrollToCanvas(): void {
  const canvas = document.querySelector('[data-canvas]');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const vh = window.innerHeight;
  // už je vidět celé, nebo je jeho začátek těsně pod horním okrajem
  if (r.top >= 0 && (r.bottom <= vh || r.top <= 120)) return;
  window.scrollBy({ top: r.top - 12, behavior: behavior() });
}

/** Odscrolluje na první chybné pole shora (jinak na zařízení, kde simulace skončila). */
export function scrollToFirstError(fields: string[], stopNode: string): void {
  const vh = window.innerHeight;
  const els = fields
    .map((f) => document.getElementById(`box-${f}`) ?? document.getElementById(f))
    .filter((el): el is HTMLElement => !!el);
  let target: HTMLElement | null = null;
  let best = Infinity;
  for (const el of els) {
    const top = el.getBoundingClientRect().top;
    if (top < best) { best = top; target = el; }
  }
  target ??= document.querySelector<HTMLElement>(`[data-node-root="${stopNode}"]`);
  if (!target || target.closest('.fixed')) return; // spodní panel na mobilu se posouvá sám
  const r = target.getBoundingClientRect();
  if (r.top >= 72 && r.bottom <= vh - 24) return;
  window.scrollBy({ top: r.top - vh * 0.3, behavior: behavior() });
}
