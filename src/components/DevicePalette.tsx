import { Globe, Monitor, Plus, Video } from 'lucide-react';
import type { ReactNode } from 'react';
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
    kind: 'pc', title: 'PC', sub: 'Koncová stanice, ping do internetu', icon: <Monitor className="w-6 h-6" />,
    tile: 'border-line-strong dark:border-slate-600 hover:border-slate-500 hover:bg-surface-3 dark:hover:bg-slate-700/60',
    badge: 'bg-slate-700 text-white dark:bg-slate-600',
  },
  {
    kind: 'camera', title: 'Kamera', sub: 'RTSP · port 554', icon: <Video className="w-6 h-6" />,
    tile: 'border-rose-300 dark:border-rose-700 dark:border-rose-800 hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50',
    badge: 'bg-rose-600 text-white',
  },
  {
    kind: 'webserver', title: 'Web server', sub: 'HTTP · port 80', icon: <Globe className="w-6 h-6" />,
    tile: 'border-amber-300 dark:border-amber-700 dark:border-amber-800 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50',
    badge: 'bg-amber-600 text-white',
  },
];

/** Dlaždice pro přidání zařízení do plochy (zařízení se připojí k LAN 2 za Routerem 2). */
export default function DevicePalette({ onAdd, layout }: { onAdd: (kind: DeviceKind) => void; layout: 'column' | 'row' }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 shadow-sm" aria-label="Přidat zařízení do plochy">
      <h2 className="text-lg font-bold text-ink flex items-center gap-2">
        <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Přidat do plochy
      </h2>
      <p className="text-sm text-ink-3 mt-0.5 mb-3">Nové zařízení se připojí k síti LAN 2 za Routerem 2.</p>
      <div className={layout === 'column' ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-1 sm:grid-cols-3 gap-2.5'}>
        {ITEMS.map((it) => (
          <button
            key={it.kind}
            type="button"
            onClick={() => onAdd(it.kind)}
            className={`group flex items-center gap-3 text-left p-3 rounded-xl border-2 bg-surface shadow-sm cursor-pointer
              transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]
              focus-visible:outline-3 focus-visible:outline-blue-400 ${it.tile}`}
          >
            <span className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center shadow-sm ${it.badge}`}>{it.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-base text-ink leading-tight">{it.title}</span>
              <span className="block text-sm text-ink-3 leading-snug">{it.sub}</span>
            </span>
            <span className="shrink-0 w-8 h-8 rounded-full border-2 border-current text-blue-600 dark:text-blue-400 flex items-center justify-center transition-colors group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600">
              <Plus className="w-4 h-4" strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
