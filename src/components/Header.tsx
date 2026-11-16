import { Calculator, CheckCircle2, Compass, Monitor, Moon, Settings, Shuffle, Sun, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type FontKey = 'normal' | 'large' | 'board';
export type ThemeKey = 'light' | 'dark' | 'system';
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
  theme: ThemeKey;
  onTheme: (t: ThemeKey) => void;
  onResetLayout: () => void;
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition shadow-sm';

export default function Header(p: Props) {
  return (
    <header className="bg-surface border-b border-line relative z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <img src="/logo-tf.png" alt="ČZU – Technická fakulta" className="h-11 w-auto dark:brightness-0 dark:invert" />
          <div className="border-l border-line pl-4">
            <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
              NetRoute Lab
              <span className="text-xs font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">Výukový simulátor</span>
            </h1>
            <p className="text-xs text-ink-3 hidden sm:block">Kaskádové směrování (Double NAT), adresace IPv4 podsítí a PAT</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={p.onWizard} className={`${btn} font-semibold border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900/50`} title="Krok za krokem provede nastavením celé sítě">
            <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Průvodce
          </button>
          <button onClick={p.onToggleCalc} className={`${btn} border-line-strong bg-surface text-ink hover:bg-surface-2`} title="Zobrazí nebo skryje výpočet adresy sítě a broadcastu">
            <Calculator className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> {p.showCalc ? 'Skrýt kalkulačku sítí' : 'Zobrazit kalkulačku sítí'}
          </button>
          <button onClick={p.onRandom} className={`${btn} border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50`}>
            <Shuffle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Nové zadání
          </button>
          <button onClick={p.onSample} className={`${btn} border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Vzorové řešení
          </button>
          <button onClick={p.onClear} className={`${btn} border-line-strong bg-surface text-ink-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800`}>
            <Trash2 className="w-4 h-4" /> <span className="hidden md:inline">Vymazat vše</span>
          </button>
          <button
            onClick={() => p.onTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
            className={`${btn} border-line-strong bg-surface text-ink hover:bg-surface-2`}
            title="Přepnout světlý / tmavý režim" aria-label="Přepnout světlý / tmavý režim"
          >
            <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:hidden" />
            <Sun className="w-4 h-4 text-amber-400 hidden dark:block" />
          </button>
          <SettingsMenu {...p} />
        </div>
      </div>
    </header>
  );
}

function SettingsMenu({ cidr, onCidr, font, onFont, theme, onTheme, onResetLayout }: Props) {
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
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} className={`${btn} border-line-strong bg-surface text-ink hover:bg-surface-2`} title="Nastavení">
        <Settings className="w-4 h-4 text-ink-2" /> <span className="hidden md:inline">Nastavení</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-surface border border-line rounded-xl shadow-xl p-4 z-50 space-y-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2">Vzhled</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([['light', 'Světlý', Sun], ['dark', 'Tmavý', Moon], ['system', 'Systém', Monitor]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => onTheme(k)}
                  className={`px-2 py-2 rounded-lg border text-sm font-semibold transition inline-flex items-center justify-center gap-1.5 ${theme === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface border-line-strong text-ink hover:bg-surface-2'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2">Velikost písma</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(FONT_LABEL) as FontKey[]).map((k) => (
                <button key={k} onClick={() => onFont(k)}
                  className={`px-2 py-2 rounded-lg border text-sm font-semibold transition ${font === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface border-line-strong text-ink hover:bg-surface-2'}`}>
                  {FONT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2">Pokročilé funkce</div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={cidr} onChange={(e) => onCidr(e.target.checked)} className="mt-1 w-5 h-5 rounded border-line-strong text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
              <span className="text-sm text-ink leading-snug">
                <strong className="block text-ink">Lomený zápis masek (CIDR)</strong>
                Masky se zobrazují jako <span className="font-mono">/24</span> a lze je tak i zadávat. Standardně se používá <span className="font-mono">255.255.255.0</span>.
              </span>
            </label>
          </div>
          <div className="border-t border-line pt-3">
            <button onClick={() => { onResetLayout(); setOpen(false); }} className="w-full px-3 py-2 rounded-lg border border-line-strong text-sm font-semibold text-ink hover:bg-surface-2 transition">
              Obnovit rozmístění zařízení
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
