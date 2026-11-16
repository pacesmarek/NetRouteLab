import { Check, ChevronRight, Globe, Minus, TriangleAlert, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

export const CARD_W = 15; // rem
export const CARD_H = 15.5; // rem

export type Status = 'idle' | 'ok' | 'error';

interface Props {
  nodeId: string;
  name: string;
  sub: string;
  art: ReactNode;
  tint: string; // třída pozadí ilustrace
  idleIcon: 'globe' | 'minus';
  idleClass: string; // barva kolečka ve stavu "idle"
  summary: ReactNode;
  status: Status;
  hasError: boolean;
  open: boolean;
  x: number; // rem
  y: number; // rem
  rootPx: number;
  onMove: (x: number, y: number) => void;
  onToggle: () => void;
}

/** Karta zařízení: klik = rozbalí nastavení, tažení = přesun po plátně (myš, dotyk i pero). */
export default function DeviceCard(p: Props) {
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  const border =
    p.status === 'ok' ? 'border-emerald-500 ring-4 ring-emerald-500/20'
    : p.status === 'error' ? 'border-rose-500 ring-4 ring-rose-500/20'
    : 'border-slate-300';

  return (
    <button
      type="button"
      id={`node-${p.nodeId}`}
      data-node-card={p.nodeId}
      aria-expanded={p.open}
      aria-controls={`panel-${p.nodeId}`}
      title="Klik = nastavení zařízení · tažení = přesun"
      style={{ width: `${CARD_W}rem`, height: `${CARD_H}rem`, touchAction: 'none' }}
      className={`relative flex flex-col text-left bg-white border-[3px] rounded-2xl overflow-hidden select-none
        ${border} ${p.open ? 'outline-[3px] outline-blue-400/50 outline-offset-2' : ''}
        ${dragging ? 'shadow-2xl scale-[1.02] cursor-grabbing' : 'shadow-sm hover:shadow-md cursor-grab'}
        transition-[box-shadow,transform,border-color]`}
      onClick={() => {
        if (suppressClick.current) return;
        p.onToggle();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, ox: p.x, oy: p.y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.px;
        const dy = e.clientY - d.py;
        if (!d.moved && Math.hypot(dx, dy) < 6) return;
        if (!d.moved) { d.moved = true; setDragging(true); }
        p.onMove(d.ox + dx / p.rootPx, d.oy + dy / p.rootPx);
      }}
      onPointerUp={() => {
        if (drag.current?.moved) {
          suppressClick.current = true;
          setTimeout(() => { suppressClick.current = false; }, 0);
        }
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
    >
      <span className="absolute top-2 right-2 z-10" title={p.status === 'idle' ? '' : p.status === 'ok' ? 'V pořádku' : 'Chyba'}>
        <StatusDot status={p.status} idleIcon={p.idleIcon} idleClass={p.idleClass} />
      </span>
      {p.hasError && p.status !== 'error' && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5 shadow">
          <TriangleAlert className="w-3.5 h-3.5" /> Chyba
        </span>
      )}
      <span className={`${p.tint} flex items-center justify-center h-[6.4rem] shrink-0 border-b border-slate-200`}>{p.art}</span>
      <span className="flex flex-col flex-1 px-3.5 py-2.5 min-h-0">
        <span className="block font-bold text-base leading-tight text-slate-900">{p.name}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{p.sub}</span>
        <span className="block font-mono text-xs text-slate-600 mt-1.5 space-y-0.5 flex-1">{p.summary}</span>
        <span className="flex items-center justify-between text-sm font-semibold text-blue-700">
          <span>Nastavení zařízení</span>
          <ChevronRight className={`w-5 h-5 transition-transform ${p.open ? 'rotate-180' : ''}`} />
        </span>
      </span>
    </button>
  );
}

function StatusDot({ status, idleIcon, idleClass }: { status: Status; idleIcon: 'globe' | 'minus'; idleClass: string }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center shadow-sm';
  if (status === 'ok') return <span className={`${base} bg-emerald-500 text-white`}><Check className="w-4 h-4" strokeWidth={3} /></span>;
  if (status === 'error') return <span className={`${base} bg-rose-600 text-white`}><X className="w-4 h-4" strokeWidth={3} /></span>;
  return (
    <span className={`${base} ${idleClass}`}>
      {idleIcon === 'globe' ? <Globe className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
    </span>
  );
}
