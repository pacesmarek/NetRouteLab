import { AlertCircle, CheckCircle2, Info, Terminal } from 'lucide-react';
import type { LogItem } from '../lib/model';

export type Tone = 'neutral' | 'success' | 'error';

export default function Diagnostics({ logs, badge, tone, className = '' }: { logs: LogItem[]; badge: string; tone: Tone; className?: string }) {
  const badgeCls =
    tone === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
    : tone === 'error' ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
    : 'bg-slate-100 text-slate-600 font-semibold';
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-slate-700 shrink-0" /> Diagnostika směrování
        </h2>
        <span className={`text-xs px-3 py-1 rounded-full shrink-0 ${badgeCls}`}>{badge}</span>
      </div>
      <div className="space-y-2">
        {logs.map((l, idx) => {
          const t = {
            success: { box: 'bg-emerald-50/80 border-emerald-200', title: 'text-emerald-900', text: 'text-emerald-800', icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> },
            error: { box: 'bg-rose-50 border-rose-200 shadow-sm', title: 'text-rose-900', text: 'text-rose-800', icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" /> },
            info: { box: 'bg-slate-50 border-slate-200', title: 'text-slate-900', text: 'text-slate-600', icon: <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" /> },
          }[l.type];
          return (
            <div key={idx} className={`p-3.5 rounded-xl border flex items-start gap-3 ${t.box}`}>
              {t.icon}
              <div>
                <div className={`font-bold text-base ${t.title}`}>{l.title}</div>
                <div className={`text-sm mt-0.5 ${t.text}`}>{l.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
