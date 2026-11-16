/** Přepínač zapnuto / vypnuto (místo malého checkboxu): stav je vidět z barvy, polohy jezdce i popisku ZAP / VYP. */
export default function Toggle({ checked, onChange, label, onColor = 'bg-teal-600' }: { checked: boolean; onChange: (v: boolean) => void; label: string; onColor?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-[3.5rem] shrink-0 items-center rounded-full border-2 transition-colors duration-200 cursor-pointer
        focus-visible:outline-3 focus-visible:outline-blue-400 focus-visible:outline-offset-2
        ${checked ? `${onColor} border-transparent` : 'bg-line-strong border-slate-400 dark:bg-slate-600 dark:border-slate-500'}`}
    >
      <span className={`absolute text-[0.55rem] font-extrabold tracking-wide transition-opacity ${checked ? 'left-2 text-white opacity-100' : 'opacity-0'}`}>ZAP</span>
      <span className={`absolute text-[0.55rem] font-extrabold tracking-wide transition-opacity ${checked ? 'opacity-0' : 'right-2 text-ink-2 dark:text-slate-200 opacity-100'}`}>VYP</span>
      <span className={`absolute left-0.5 top-0.5 h-[1.2rem] w-[1.2rem] rounded-full bg-surface shadow-md transition-transform duration-200 ${checked ? 'translate-x-[1.75rem]' : 'translate-x-0'}`} />
    </button>
  );
}
