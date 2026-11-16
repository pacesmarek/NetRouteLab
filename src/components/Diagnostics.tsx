import { AlertCircle, CheckCircle2, Info, Terminal } from 'lucide-react';
import type { LogItem } from '../lib/model';

export type Tone = 'neutral' | 'success' | 'error';

export default function Diagnostics({ logs, badge, tone, className = '' }: { logs: LogItem[]; badge: string; tone: Tone; className?: string }) {
  const badgeCls =
    tone === 'success' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 font-bold'
    : tone === 'error' ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 font-bold'
    : 'bg-surface-3 text-ink-2 font-semibold';
  return (
    <section className={`bg-surface border border-line rounded-2xl p-3 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2">
        <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
          <Terminal className="w-4 h-4 text-ink shrink-0" /> Diagnostika směrování
        </h2>
        <span className={`text-xs px-2.5 py-0.5 rounded-full max-w-full ${badgeCls}`}>{badge}</span>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {logs.map((l, idx) => {
          const t = {
            success: { box: 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800', title: 'text-emerald-900 dark:text-emerald-100', text: 'text-emerald-800 dark:text-emerald-200', icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" /> },
            error: { box: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 shadow-sm', title: 'text-rose-900 dark:text-rose-100', text: 'text-rose-800 dark:text-rose-200', icon: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" /> },
            info: { box: 'bg-surface-2 border-line', title: 'text-ink', text: 'text-ink-2', icon: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" /> },
          }[l.type];
          return (
            <div key={idx} className={`px-2.5 py-2 rounded-lg border flex items-start gap-2 ${t.box}`}>
              {t.icon}
              <div>
                <div className={`font-bold text-sm leading-snug ${t.title}`}>{l.title}</div>
                <div className={`text-xs leading-snug mt-0.5 ${t.text}`}>{l.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
