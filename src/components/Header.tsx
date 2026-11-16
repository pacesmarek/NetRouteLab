import { Calculator, CheckCircle2, Compass, Network, Settings, Shuffle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type FontKey = 'normal' | 'large' | 'board';
export const FONT_PX: Record<FontKey, number> = { normal: 16, large: 18, board: 22 };
const FONT_LABEL: Record<FontKey, string> = { normal: 'Normální', large: 'Větší', board: 'Tabule' };

interface Props {
  showCalc: boolean;
  onToggleCalc: () => void;
  onWizard: () => void;
  onRandom: () => void;
  onSample: () => void;
  onClear: () => void;
  cidr: boolean;
  onCidr: (v: boolean) => void;
  font: FontKey;
  onFont: (f: FontKey) => void;
  onResetLayout: () => void;
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition shadow-sm';

export default function Header(p: Props) {
  return (
    <header className="bg-white border-b border-slate-200 relative z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-sm"><Network className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              NetRoute Lab
              <span className="text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Výukový simulátor</span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">Kaskádové směrování (Double NAT) a adresace IPv4 podsítí</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={p.onWizard} className={`${btn} font-semibold border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100`} title="Krok za krokem provede nastavením celé sítě">
            <Compass className="w-4 h-4 text-indigo-600" /> Průvodce
          </button>
          <button onClick={p.onToggleCalc} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`} title="Zobrazí nebo skryje výpočet adresy sítě a broadcastu">
            <Calculator className="w-4 h-4 text-indigo-600" /> {p.showCalc ? 'Skrýt kalkulačku sítí' : 'Zobrazit kalkulačku sítí'}
          </button>
          <button onClick={p.onRandom} className={`${btn} border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}>
            <Shuffle className="w-4 h-4 text-amber-600" /> Nové zadání
          </button>
          <button onClick={p.onSample} className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Vzorové řešení
          </button>
          <button onClick={p.onClear} className={`${btn} border-slate-300 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200`}>
            <Trash2 className="w-4 h-4" /> <span className="hidden md:inline">Vymazat vše</span>
          </button>
          <SettingsMenu {...p} />
        </div>
      </div>
    </header>
  );
}

function SettingsMenu({ cidr, onCidr, font, onFont, onResetLayout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`} title="Nastavení">
        <Settings className="w-4 h-4 text-slate-600" /> <span className="hidden md:inline">Nastavení</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 space-y-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Velikost písma</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(FONT_LABEL) as FontKey[]).map((k) => (
                <button key={k} onClick={() => onFont(k)}
                  className={`px-2 py-2 rounded-lg border text-sm font-semibold transition ${font === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {FONT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Pokročilé funkce</div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={cidr} onChange={(e) => onCidr(e.target.checked)} className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 leading-snug">
                <strong className="block text-slate-900">Lomený zápis masek (CIDR)</strong>
                Masky se zobrazují jako <span className="font-mono">/24</span> a lze je tak i zadávat. Standardně se používá <span className="font-mono">255.255.255.0</span>.
              </span>
            </label>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <button onClick={() => { onResetLayout(); setOpen(false); }} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              Obnovit rozmístění zařízení
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
