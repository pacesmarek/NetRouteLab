import { Globe, Monitor, Network, Plus, Router, Video, Wifi } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DeviceKind } from '../lib/model';

interface Item {
  kind: DeviceKind;
  title: string;
  sub: string;
  icon: ReactNode;
  tile: string; // barevnost dlaždice (vč. hoveru)
  badge: string;
}

const ITEMS: Item[] = [
  {
    kind: 'router', title: 'Router', sub: 'WAN + LAN, NAT, DHCP, PAT', icon: <Router className="w-6 h-6" />,
    tile: 'border-indigo-300 dark:border-indigo-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50',
    badge: 'bg-indigo-600 text-white',
  },
  {
    kind: 'pc', title: 'PC', sub: 'Koncová stanice, ping do internetu', icon: <Monitor className="w-6 h-6" />,
    tile: 'border-line-strong dark:border-slate-600 hover:border-slate-500 hover:bg-surface-3 dark:hover:bg-slate-700/60',
    badge: 'bg-slate-700 text-white dark:bg-slate-600',
  },
  {
    kind: 'camera', title: 'Kamera', sub: 'RTSP · port 554', icon: <Video className="w-6 h-6" />,
    tile: 'border-violet-300 dark:border-violet-700 dark:border-violet-800 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/50',
    badge: 'bg-violet-600 text-white',
  },
  {
    kind: 'webserver', title: 'Web server', sub: 'HTTP · port 80', icon: <Globe className="w-6 h-6" />,
    tile: 'border-violet-300 dark:border-violet-700 dark:border-violet-800 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/50',
    badge: 'bg-violet-600 text-white',
  },
  {
    kind: 'switch', title: 'Switch', sub: 'Vrstva 2, bez IP – připojí další zařízení', icon: <Network className="w-6 h-6" />,
    tile: 'border-teal-300 dark:border-teal-700 dark:border-teal-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/50',
    badge: 'bg-teal-600 text-white',
  },
  {
    kind: 'ap', title: 'Wi-Fi AP', sub: 'Bezdrátové připojení zařízení', icon: <Wifi className="w-6 h-6" />,
    tile: 'border-cyan-300 dark:border-cyan-700 dark:border-cyan-800 hover:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-950/50',
    badge: 'bg-cyan-600 text-white',
  },
];

interface PaletteProps {
  /** klik: zařízení se přidá na výchozí místo */
  onAdd: (kind: DeviceKind) => void;
  /** přetažení na plochu: zařízení se přidá na místo puštění */
  onDrop: (kind: DeviceKind, clientX: number, clientY: number) => void;
  layout: 'column' | 'row';
  /** volné plátno: navíc dlaždice Router a jiný popis připojování */
  free?: boolean;
}

/** Dlaždice pro přidání zařízení do plochy: klik nebo přetažení myší / prstem přímo na plochu. */
export default function DevicePalette({ onAdd, onDrop, layout, free = false }: PaletteProps) {
  const items = free ? ITEMS : ITEMS.filter((it) => it.kind !== 'router');
  const [drag, setDrag] = useState<{ item: Item; x: number; y: number; over: boolean } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppress = useRef(false);

  const overCanvas = (x: number, y: number): boolean => {
    const el = document.querySelector('[data-canvas]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const markCanvas = (on: boolean) => {
    document.querySelector('[data-canvas]')?.classList.toggle('drop-target', on);
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-3 shadow-sm" aria-label="Přidat zařízení do plochy">
      <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
        <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Přidat do plochy
      </h2>
      <p className="text-xs text-ink-3 mt-0.5 mb-2">
        {free
          ? <>Klikněte (připojí se k otevřenému zařízení, jinak k hraničnímu routeru), nebo <strong>přetáhněte</strong> na plochu – puštění na zařízení ho tam rovnou zapojí, do prázdna zůstane nezapojené.</>
          : <>Klikněte, nebo zařízení <strong>přetáhněte</strong> na plochu. Puštění na switch či AP ho k němu rovnou připojí.</>}
      </p>
      <div className={layout === 'column' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2'}>
        {items.map((it) => (
          <button
            key={it.kind}
            type="button"
            style={{ touchAction: 'none' }}
            onClick={() => {
              if (suppress.current) return;
              onAdd(it.kind);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 || !e.isPrimary) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = { x: e.clientX, y: e.clientY, moved: false };
            }}
            onPointerMove={(e) => {
              const s = start.current;
              if (!s) return;
              if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
              s.moved = true;
              const over = overCanvas(e.clientX, e.clientY);
              markCanvas(over);
              setDrag({ item: it, x: e.clientX, y: e.clientY, over });
            }}
            onPointerUp={(e) => {
              const s = start.current;
              start.current = null;
              if (s?.moved) {
                suppress.current = true;
                setTimeout(() => { suppress.current = false; }, 0);
                if (overCanvas(e.clientX, e.clientY)) onDrop(it.kind, e.clientX, e.clientY);
              }
              markCanvas(false);
              setDrag(null);
            }}
            onPointerCancel={() => { start.current = null; markCanvas(false); setDrag(null); }}
            className={`group flex items-center gap-2 text-left p-2 rounded-xl border-2 bg-surface shadow-sm cursor-grab select-none
              transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:cursor-grabbing
              focus-visible:outline-3 focus-visible:outline-blue-400 ${it.tile}`}
            title={`${it.sub} · klik = přidat, tažení = přidat na vybrané místo plochy`}
          >
            <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center shadow-sm ${it.badge}`}>{it.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-sm text-ink leading-tight">{it.title}</span>
              <span className="block text-[0.7rem] text-ink-3 leading-tight truncate">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* „duch“ zařízení, který se táhne za kurzorem */}
      {drag && createPortal(
        <div
          className={`fixed z-[90] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 shadow-2xl bg-surface
            ${drag.over ? 'border-blue-500 ring-4 ring-blue-400/40 scale-105' : 'border-line-strong opacity-80'} transition-[transform,box-shadow]`}
          style={{ left: drag.x, top: drag.y }}
        >
          <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${drag.item.badge}`}>{drag.item.icon}</span>
          <span className="font-bold text-ink">{drag.item.title}</span>
          <span className={`text-xs font-semibold ${drag.over ? 'text-blue-600 dark:text-blue-400' : 'text-ink-4'}`}>{drag.over ? 'pusťte zde' : 'přetáhněte na plochu'}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
