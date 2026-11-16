/** Ilustrace zařízení (inline SVG). */
const cls = 'w-32 h-[5.2rem]';

export function CloudArt() {
  return (
    <svg viewBox="0 0 120 80" className={cls} aria-hidden="true">
      <path d="M32 64a18 18 0 0 1-1-35.9A24 24 0 0 1 77 24a20 20 0 0 1 12 40z" fill="#bae6fd" stroke="#0369a1" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="60" cy="43" r="14" fill="#f0f9ff" stroke="#0369a1" strokeWidth="2.5" />
      <ellipse cx="60" cy="43" rx="6" ry="14" fill="none" stroke="#0369a1" strokeWidth="2" />
      <path d="M46 43h28M49 36h22M49 50h22" stroke="#0369a1" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function RouterArt({ tone }: { tone: 'blue' | 'indigo' }) {
  const c = tone === 'blue'
    ? { dark: '#1e3a8a', mid: '#3b82f6', light: '#bfdbfe' }
    : { dark: '#312e81', mid: '#6366f1', light: '#c7d2fe' };
  return (
    <svg viewBox="0 0 120 80" className={cls} aria-hidden="true">
      {tone === 'blue' ? (
        <>
          <path d="M26 44V14M94 44V14" stroke={c.dark} strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="26" cy="13" r="4" fill={c.mid} />
          <circle cx="94" cy="13" r="4" fill={c.mid} />
        </>
      ) : (
        <>
          <path d="M94 44V14" stroke={c.dark} strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="94" cy="13" r="4" fill={c.mid} />
          <path d="M80 6a20 20 0 0 1 28 0M85 11a13 13 0 0 1 18 0" fill="none" stroke={c.mid} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      <rect x="10" y="42" width="100" height="28" rx="7" fill={c.dark} />
      <rect x="10" y="42" width="100" height="9" rx="5" fill={c.mid} opacity=".55" />
      <circle cx="24" cy="60" r="3" fill="#34d399" />
      <circle cx="34" cy="60" r="3" fill="#fbbf24" />
      <circle cx="44" cy="60" r="3" fill={c.light} />
      <rect x="64" y="55" width="9" height="9" rx="1.5" fill={c.light} />
      <rect x="76" y="55" width="9" height="9" rx="1.5" fill={c.light} />
      <rect x="88" y="55" width="9" height="9" rx="1.5" fill={c.light} />
    </svg>
  );
}

export function PcArt() {
  return (
    <svg viewBox="0 0 120 80" className={cls} aria-hidden="true">
      <rect x="26" y="6" width="68" height="46" rx="5" fill="#1e293b" />
      <rect x="31" y="11" width="58" height="36" rx="2" fill="#d1fae5" />
      <path d="M37 19h28M37 26h40M37 33h22" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="55" y="52" width="10" height="9" fill="#475569" />
      <rect x="40" y="61" width="40" height="6" rx="3" fill="#334155" />
    </svg>
  );
}
