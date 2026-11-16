import { History } from 'lucide-react';
import { APP_VERSION, CHANGELOG } from '../changelog';
import Modal from './Modal';

const SECTION_COLOR: Record<string, string> = {
  'Přidáno': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  'Změněno': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  'Opraveno': 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
};

export default function ChangelogDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Co je nového" icon={<History className="w-5 h-5 text-blue-600 dark:text-blue-400" />} onClose={onClose}>
      <div className="space-y-6">
        {CHANGELOG.map((v) => (
          <section key={v.version}>
            <div className="flex items-baseline gap-3 mb-2">
              <h3 className="text-lg font-bold text-ink">Verze {v.version}</h3>
              <span className="text-sm text-ink-3">{v.date}</span>
              {v.version === APP_VERSION && <span className="text-xs font-bold uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full">aktuální</span>}
            </div>
            {v.sections.map((s) => (
              <div key={s.title} className="mb-3">
                <span className={`inline-block text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1.5 ${SECTION_COLOR[s.title] ?? 'bg-surface-3 text-ink dark:bg-slate-800 dark:text-slate-200'}`}>{s.title}</span>
                <ul className="space-y-1 text-base text-ink list-disc pl-5 marker:text-ink-4">
                  {s.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
