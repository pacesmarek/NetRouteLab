import { Camera, ListChecks, Network, Play, Wifi } from 'lucide-react';
import { ipMask } from '../lib/format';
import { KIND_INFO, SCENARIOS, type DeviceKind, type Scenario } from '../lib/model';
import { analyzeInterface } from '../lib/net';
import Modal from './Modal';

interface Props {
  cidr: boolean;
  /** title aktuálně spuštěné úlohy (null = základní zadání) */
  current: string | null;
  onStart: (scenario: Scenario | null) => void;
  onClose: () => void;
}

const deviceSummary = (s: Scenario): string => {
  const counts: Partial<Record<DeviceKind, number>> = {};
  (s.devices ?? []).forEach((d) => { counts[d.kind] = (counts[d.kind] ?? 0) + 1; });
  return Object.entries(counts).map(([k, n]) => `${n}× ${KIND_INFO[k as DeviceKind].label}`).join(', ');
};

export default function TaskPicker({ cidr, current, onStart, onClose }: Props) {
  const chip = 'px-2.5 py-1 rounded-lg bg-surface border text-sm font-mono text-ink';
  return (
    <Modal title="Seznam úloh" icon={<ListChecks className="w-5 h-5 text-blue-600 dark:text-blue-400" />} onClose={onClose} wide>
      <p className="text-sm text-ink-3 mb-4">Vyberte zadání a spusťte ho. Aktuální práce se nahradí – lze ji vrátit krokem Zpět (Ctrl+Z).</p>
      <div className="grid gap-3 md:grid-cols-2">
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

function TaskCard({ title, summary, chips, active, onStart }: { title: string; summary: string; chips: React.ReactNode; active: boolean; onStart: () => void }) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border-2 p-4 ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 dark:bg-blue-950/40' : 'border-line bg-surface-2'}`}>
      <div>
        <h3 className="font-bold text-base text-ink leading-snug flex items-start gap-2">
          <span className="flex-1">{title}</span>
          {active && <span className="shrink-0 text-xs font-bold uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full">spuštěno</span>}
        </h3>
        <p className="text-sm text-ink-2 mt-1">{summary}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">{chips}</div>
      <button onClick={onStart} className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-base transition">
        <Play className="w-4 h-4 fill-current" /> {active ? 'Spustit znovu' : 'Spustit úlohu'}
      </button>
    </div>
  );
}
