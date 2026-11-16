import { Check, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface TabView { id: string; name: string; active: boolean; /** prázdné plátno bez práce – zavře se bez ptaní */ pristine: boolean; free: boolean }

interface Props {
  tabs: TabView[];
  max: number;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

/** Záložky nad plátnem: každá má vlastní plátno a vlastní krok zpět. Dvojklik / tužka = přejmenovat. */
export default function TabBar({ tabs, max, onSelect, onAdd, onClose, onRename }: Props) {
  const [closing, setClosing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  useEffect(() => { if (closing && !tabs.some((t) => t.id === closing)) setClosing(null); }, [tabs, closing]);

  return (
    <nav aria-label="Záložky" className="flex items-end gap-1.5 overflow-x-auto -mb-1 pb-1">
      {tabs.map((t) => {
        const dot = t.free ? 'bg-teal-500' : 'bg-blue-500';
        return (
          <div key={t.id}
            className={`group shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-t-xl border border-b-0 text-sm font-semibold transition
              ${t.active ? 'bg-surface border-line-strong text-ink shadow-sm' : 'bg-surface-3 border-transparent text-ink-3 hover:text-ink hover:bg-surface-2 cursor-pointer'}`}
            onClick={() => !t.active && onSelect(t.id)}
            onDoubleClick={() => setEditing(t.id)}
            role="tab" aria-selected={t.active}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
            {editing === t.id ? (
              <input ref={input} defaultValue={t.name} maxLength={28} aria-label="Název záložky"
                className="w-36 px-1.5 py-0.5 text-sm font-semibold bg-surface text-ink border border-line-strong rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { onRename(t.id, e.target.value); setEditing(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            ) : (
              <span className="max-w-[12rem] truncate" title="Dvojklik = přejmenovat">{t.name}</span>
            )}
            {closing === t.id ? (
              <span className="flex items-center gap-1 pl-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300">Zavřít?</span>
                <button type="button" onClick={() => { setClosing(null); onClose(t.id); }} className="p-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white" aria-label="Ano, zavřít záložku" title="Ano, zavřít (práce v ní se ztratí)"><Check className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setClosing(null)} className="p-1 rounded-md border border-line-strong text-ink-2 hover:bg-surface-2" aria-label="Ne, ponechat" title="Ne"><X className="w-3.5 h-3.5" /></button>
              </span>
            ) : (
              <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                {t.active && editing !== t.id && (
                  <button type="button" onClick={() => setEditing(t.id)} className="p-1 rounded-md text-ink-4 hover:text-ink hover:bg-surface-3" aria-label="Přejmenovat záložku" title="Přejmenovat"><Pencil className="w-3.5 h-3.5" /></button>
                )}
                <button type="button" onClick={() => (t.pristine ? onClose(t.id) : setClosing(t.id))}
                  className="p-1 rounded-md text-ink-4 hover:text-white hover:bg-rose-500" aria-label={`Zavřít záložku ${t.name}`} title="Zavřít záložku"><X className="w-3.5 h-3.5" /></button>
              </span>
            )}
          </div>
        );
      })}
      <button type="button" onClick={onAdd} disabled={tabs.length >= max}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl text-sm font-semibold text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-teal-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        title={tabs.length >= max ? `Nejvýše ${max} záložek` : 'Nové volné plátno v nové záložce'} aria-label="Nová záložka">
        <Plus className="w-4 h-4" /> Nové plátno
      </button>
    </nav>
  );
}
