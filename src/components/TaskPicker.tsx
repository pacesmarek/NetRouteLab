import { Camera, LayoutTemplate, ListChecks, Network, Play, Wifi } from 'lucide-react';
import { ipMask } from '../lib/format';
import { KIND_INFO, SCENARIOS, type DeviceKind, type Scenario } from '../lib/model';
import { analyzeInterface } from '../lib/net';
import Modal from './Modal';

interface Props {
  cidr: boolean;
  /** title aktuálně spuštěné úlohy (null = základní zadání) */
  current: string | null;
  onStart: (scenario: Scenario | null) => void;
  /** prázdné volné plátno */
  onFree: () => void;
  onClose: () => void;
}

const deviceSummary = (s: Scenario): string => {
  const counts: Partial<Record<DeviceKind, number>> = {};
  (s.devices ?? []).forEach((d) => { counts[d.kind] = (counts[d.kind] ?? 0) + 1; });
  return Object.entries(counts).map(([k, n]) => `${n}× ${KIND_INFO[k as DeviceKind].label}`).join(', ');
};

export default function TaskPicker({ cidr, current, onStart, onFree, onClose }: Props) {
  const chip = 'px-2.5 py-1 rounded-lg bg-surface border text-sm font-mono text-ink';
  return (
    <Modal title="Seznam úloh" icon={<ListChecks className="w-5 h-5 text-blue-600 dark:text-blue-400" />} onClose={onClose} wide>
      <p className="text-sm text-ink-3 mb-4">Vyberte zadání a spusťte ho. Aktuální práce se nahradí – lze ji vrátit krokem Zpět (Ctrl+Z).</p>
      <div className="grid gap-3 md:grid-cols-2">
        <TaskCard
          active={current === '·free'}
          tone="teal"
          title="Volné plátno"
          summary="Bez zadání: jen ISP a hraniční router. Routery, switche, Wi-Fi AP i koncová zařízení si přidáváte a zapojujete sami."
          chips={<span className={`${chip} border-teal-200 dark:border-teal-800 inline-flex items-center gap-1.5`}><LayoutTemplate className="w-3.5 h-3.5" /> vlastní síť</span>}
          onStart={() => { onFree(); onClose(); }}
        />
        <TaskCard
          active={current === null}
          title="Základní zadání"
          summary="Kaskádové propojení dvou routerů: tři oddělené podsítě a ping do internetu. Bez omezení adresních rozsahů."
          chips={<span className={`${chip} border-blue-200 dark:border-blue-800`}>ISP 85.160.10.1</span>}
          onStart={() => { onStart(null); onClose(); }}
        />
        {SCENARIOS.map((s) => {
          const i = analyzeInterface(s.ispGw, s.ispMask, true);
          const pre = i.valid ? i.prefix : 24;
          const extra = deviceSummary(s);
          return (
            <TaskCard
              key={s.title}
              active={current === s.title}
              title={s.title}
              summary={s.summary ?? 'Připojení k ISP a dvě vnitřní sítě s předepsanými adresními rozsahy.'}
              chips={
                <>
                  <span className={`${chip} border-blue-200 dark:border-blue-800`}>ISP {ipMask(s.ispGw, pre, cidr)}</span>
                  <span className={`${chip} border-emerald-200 dark:border-emerald-800`}>LAN 1 {ipMask(s.lan1RequiredNet, s.lan1RequiredPrefix, cidr)}</span>
                  <span className={`${chip} border-indigo-200 dark:border-indigo-800`}>LAN 2 {ipMask(s.lan2RequiredNet, s.lan2RequiredPrefix, cidr)}</span>
                  {extra && <span className={`${chip} border-violet-200 dark:border-violet-800 inline-flex items-center gap-1`}>{s.devices?.some((d) => d.kind === 'switch') ? <Network className="w-3.5 h-3.5" /> : s.devices?.some((d) => d.kind === 'ap') ? <Wifi className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}{extra}</span>}
                </>
              }
              onStart={() => { onStart(s); onClose(); }}
            />
          );
        })}
      </div>
    </Modal>
  );
}

const CARD_TONES = {
  blue: {
    on: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40', off: 'border-line bg-surface-2',
    badge: 'bg-blue-600', btn: 'bg-blue-600 hover:bg-blue-700',
  },
  teal: {
    on: 'border-teal-500 bg-teal-50 dark:bg-teal-950/40', off: 'border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/30',
    badge: 'bg-teal-600', btn: 'bg-teal-600 hover:bg-teal-700',
  },
} as const;

function TaskCard({ title, summary, chips, active, onStart, tone = 'blue' }: { title: string; summary: string; chips: React.ReactNode; active: boolean; onStart: () => void; tone?: keyof typeof CARD_TONES }) {
  const t = CARD_TONES[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-xl border-2 p-4 ${active ? t.on : t.off}`}>
      <div>
        <h3 className="font-bold text-base text-ink leading-snug flex items-start gap-2">
          <span className="flex-1">{title}</span>
          {active && <span className={`shrink-0 text-xs font-bold uppercase tracking-wider ${t.badge} text-white px-2 py-0.5 rounded-full`}>spuštěno</span>}
        </h3>
        <p className="text-sm text-ink-2 mt-1">{summary}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">{chips}</div>
      <button onClick={onStart} className={`mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg ${t.btn} active:scale-[0.98] text-white font-bold text-base transition`}>
        <Play className="w-4 h-4 fill-current" /> {active ? (tone === 'teal' ? 'Vyčistit plátno' : 'Spustit znovu') : (tone === 'teal' ? 'Otevřít volné plátno' : 'Spustit úlohu')}
      </button>
    </div>
  );
}
