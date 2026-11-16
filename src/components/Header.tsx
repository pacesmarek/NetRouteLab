import { CheckCircle2, Compass, Download, FileUp, Image as ImageIcon, LayoutTemplate, Link2, ListChecks, Moon, Redo2, Settings, Share2, Shuffle, Sun, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Toggle from './Toggle';

export type FontKey = 'normal' | 'large' | 'board';
export type ThemeKey = 'light' | 'dark' | 'system';
export type SpeedKey = 'fast' | 'normal' | 'slow';
export const FONT_PX: Record<FontKey, number> = { normal: 16, large: 18, board: 22 };
export const SPEED_MULT: Record<SpeedKey, number> = { fast: 0.5, normal: 1, slow: 2 };
const FONT_LABEL: Record<FontKey, string> = { normal: 'Normální', large: 'Větší', board: 'Tabule' };
const SPEED_LABEL: Record<SpeedKey, string> = { fast: 'Rychle', normal: 'Normální', slow: 'Pomalu (výklad)' };

interface Props {
  /** volné plátno: bez Průvodce a vzorového řešení */
  free: boolean;
  onFree: () => void;
  showCalc: boolean;
  onToggleCalc: () => void;
  onWizard: () => void;
  onTasks: () => void;
  onRandom: () => void;
  onSample: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onShare: (withSolution: boolean) => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onExportPng: () => void;
  cidr: boolean;
  onCidr: (v: boolean) => void;
  font: FontKey;
  onFont: (f: FontKey) => void;
  theme: ThemeKey;
  onTheme: (t: ThemeKey) => void;
  snap: boolean;
  onSnap: (v: boolean) => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  speed: SpeedKey;
  onSpeed: (s: SpeedKey) => void;
  onResetLayout: () => void;
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none';
const neutral = `${btn} border-line-strong bg-surface text-ink hover:bg-surface-2 disabled:hover:bg-white`;

/** Zavře popover při kliknutí mimo / Esc. */
function usePopover() {
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
  return { open, setOpen, ref };
}

export default function Header(p: Props) {
  return (
    <header className="bg-surface border-b border-line relative z-40 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center">
          <h1 className="sr-only">NetRoute Lab – výukový simulátor směrování, podsítí, Double NAT a PAT</h1>
          <img src="/logo-tf.png" alt="ČZU – Technická fakulta" title="NetRoute Lab · Laboratoř výpočetních aplikací, Technická fakulta ČZU" className="h-11 w-auto dark:brightness-0 dark:invert" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={p.onUndo} disabled={!p.canUndo} className={neutral} title="Zpět (Ctrl+Z)" aria-label="Zpět"><Undo2 className="w-4 h-4" /></button>
          <button onClick={p.onRedo} disabled={!p.canRedo} className={neutral} title="Znovu (Ctrl+Shift+Z)" aria-label="Znovu"><Redo2 className="w-4 h-4" /></button>
          {!p.free && (
            <button onClick={p.onWizard} className={`${btn} font-semibold border-indigo-300 bg-indigo-50 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/50`} title="Krok za krokem provede nastavením celé sítě">
              <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Průvodce
            </button>
          )}
          {!p.free && (
            <button onClick={p.onFree} className={`${btn} font-semibold border-teal-300 bg-teal-50 text-teal-900 dark:text-teal-100 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-900/50`} title="Prázdné plátno: jen ISP a hraniční router, zbytek si postavíte sami">
              <LayoutTemplate className="w-4 h-4 text-teal-600 dark:text-teal-400" /> Volné plátno
            </button>
          )}
          <div className="inline-flex">
            <button onClick={p.onTasks} className={`${btn} rounded-r-none font-semibold border-blue-300 bg-blue-50 text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/50`} title="Seznam všech úloh – vyberte a spusťte libovolné zadání">
              <ListChecks className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Úlohy
            </button>
            <button onClick={p.onRandom} aria-label="Náhodná úloha" className={`${btn} rounded-l-none -ml-px px-2.5 border-blue-300 bg-blue-50 text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/50`} title="Náhodně vybere jednu z úloh">
              <Shuffle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>
          </div>
          {!p.free && (
            <button onClick={p.onSample} title="Vyplní vzorové správné řešení" aria-label="Vzorové řešení" className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/50`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> <span className="hidden 2xl:inline">Vzorové řešení</span>
            </button>
          )}
          <button onClick={p.onClear} title="Vymazat všechna vyplněná pole" aria-label="Vymazat vše" className={`${btn} border-line-strong bg-surface text-ink-2 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/50 dark:hover:text-rose-300 dark:hover:border-rose-800`}>
            <Trash2 className="w-4 h-4" /> <span className="hidden 2xl:inline">Vymazat vše</span>
          </button>
          <ShareMenu {...p} />
          <button
            onClick={() => p.onTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
            className={neutral}
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

function MenuItem({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-surface-3 transition">
      <span className="mt-0.5 text-blue-600 dark:text-blue-400">{icon}</span>
      <span><span className="block font-semibold text-ink text-sm">{label}</span>{hint && <span className="block text-xs text-ink-3">{hint}</span>}</span>
    </button>
  );
}

function ShareMenu(p: Props) {
  const m = usePopover();
  const file = useRef<HTMLInputElement>(null);
  const run = (fn: () => void) => () => { m.setOpen(false); fn(); };
  return (
    <div className="relative" ref={m.ref}>
      <button onClick={() => m.setOpen((o) => !o)} aria-haspopup="true" aria-expanded={m.open} className={neutral} title="Sdílet a exportovat" aria-label="Sdílet a exportovat">
        <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400" /> <span className="hidden 2xl:inline">Sdílet</span>
      </button>
      {m.open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-surface border border-line rounded-xl shadow-xl p-2 z-50">
          <MenuItem icon={<Link2 className="w-5 h-5" />} label="Odkaz na zadání" hint="Úloha, zařízení a rozmístění – bez vyplněných hodnot" onClick={run(() => p.onShare(false))} />
          <MenuItem icon={<Link2 className="w-5 h-5" />} label="Odkaz s mým řešením" hint="Včetně všech vyplněných hodnot" onClick={run(() => p.onShare(true))} />
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<Download className="w-5 h-5" />} label="Stáhnout soubor (JSON)" hint="Zálohu lze později načíst zpět" onClick={run(p.onExportJson)} />
          <MenuItem icon={<FileUp className="w-5 h-5" />} label="Načíst ze souboru…" onClick={() => file.current?.click()} />
          <MenuItem icon={<ImageIcon className="w-5 h-5" />} label="Uložit schéma jako obrázek (PNG)" onClick={run(p.onExportPng)} />
          <input ref={file} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { m.setOpen(false); p.onImportFile(f); } }} />
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-2 py-2 rounded-lg border text-sm font-semibold transition ${value === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface border-line-strong text-ink hover:bg-surface-2'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, title, children }: { checked: boolean; onChange: (v: boolean) => void; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Toggle checked={checked} onChange={onChange} label={title} onColor="bg-blue-600" />
      <span className="text-sm text-ink leading-snug"><strong className="block text-ink">{title}</strong>{children}</span>
    </div>
  );
}

function SettingsMenu(p: Props) {
  const m = usePopover();
  const section = 'text-xs font-bold uppercase tracking-wider text-ink-3 mb-2';
  return (
    <div className="relative" ref={m.ref}>
      <button onClick={() => m.setOpen((o) => !o)} aria-haspopup="true" aria-expanded={m.open} className={neutral} title="Nastavení">
        <Settings className="w-4 h-4 text-ink-2" /> <span className="hidden md:inline">Nastavení</span>
      </button>
      {m.open && (
        <div className="absolute right-0 mt-2 w-[24rem] max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto bg-surface border border-line rounded-xl shadow-xl p-4 z-50 space-y-4">
          <div>
            <div className={section}>Vzhled</div>
            <Segmented value={p.theme} onChange={p.onTheme} options={[['light', 'Světlý'], ['dark', 'Tmavý'], ['system', 'Systém']]} />
          </div>
          <div className="border-t border-line pt-3">
            <div className={section}>Velikost písma</div>
            <Segmented value={p.font} onChange={p.onFont} options={(Object.keys(FONT_LABEL) as FontKey[]).map((k) => [k, FONT_LABEL[k]])} />
          </div>
          <div className="border-t border-line pt-3">
            <div className={section}>Animace paketu</div>
            <Segmented value={p.speed} onChange={p.onSpeed} options={(Object.keys(SPEED_LABEL) as SpeedKey[]).map((k) => [k, SPEED_LABEL[k]])} />
          </div>
          <div className="border-t border-line pt-3 space-y-3">
            <div className={section}>Chování</div>
            <Check checked={p.sound} onChange={p.onSound} title="Zvuk">Krátký signál při úspěchu, chybě a na hopech traceroute.</Check>
            <Check checked={p.snap} onChange={p.onSnap} title="Přichytávání k mřížce">Při přetahování se zařízení zarovnají a ukážou se vodítka.</Check>
            <Check checked={p.showCalc} onChange={(v) => { if (v !== p.showCalc) p.onToggleCalc(); }} title="Kalkulačka sítí">
              Pod adresou a maskou v nastavení zařízení ukáže <strong>síť</strong> a <strong>broadcast</strong>. Po vypnutí je musí student spočítat sám. Na výsledek testu to nemá vliv.
            </Check>
          </div>
          <div className="border-t border-line pt-3">
            <div className={section}>Pokročilé funkce</div>
            <Check checked={p.cidr} onChange={p.onCidr} title="Lomený zápis masek (CIDR)">
              Masky se zobrazují jako <span className="font-mono">/24</span> a lze je tak i zadávat. Standardně se používá <span className="font-mono">255.255.255.0</span>.
            </Check>
          </div>
          <div className="border-t border-line pt-3">
            <button onClick={() => { p.onResetLayout(); m.setOpen(false); }} className="w-full px-3 py-2 rounded-lg border border-line-strong text-sm font-semibold text-ink hover:bg-surface-2 transition">
              Obnovit rozmístění zařízení
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

