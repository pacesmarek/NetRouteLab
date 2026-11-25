import { EyeOff } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

export interface PreviewInfo {
  deviceId: string;
  kind: 'camera' | 'webserver';
  name: string;
  /** veřejná adresa ve tvaru IP:port */
  addr: string;
}

/** Náhled po úspěšném testu z internetu; zobrazuje ho panel zařízení pod tlačítkem testu. */
export const PreviewContext = createContext<{ info: PreviewInfo | null; hide: () => void }>({ info: null, hide: () => {} });

/** „Co by klient uviděl“ – falešná webovka nebo záběr z kamery. */
export default function InboundPreviewCard({ deviceId }: { deviceId: string }) {
  const { info, hide } = useContext(PreviewContext);
  const ref = useRef<HTMLDivElement>(null);
  const shown = info?.deviceId === deviceId ? info : null;
  useEffect(() => {
    if (shown) ref.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [shown]);
  if (!shown) return null;
  return (
    <div ref={ref} className="space-y-2 animate-drop">
      {shown.kind === 'camera' ? <CameraFeed name={shown.name} addr={shown.addr} /> : <FakeWebsite name={shown.name} addr={shown.addr} />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink-2 leading-snug">
          Takhle by zařízení viděl klient z internetu na <span className="font-mono font-semibold text-ink">{shown.addr}</span>. Vaše pravidla PAT fungují. 🎉
        </p>
        <button type="button" onClick={hide} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-3 transition">
          <EyeOff className="w-3.5 h-3.5" /> Skrýt
        </button>
      </div>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Falešný záběr: noční parkoviště s projíždějícím autem a chodcem. */
function CameraFeed({ name, addr }: { name: string; addr: string }) {
  const now = useClock();
  const stamp = now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ');
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-slate-700 bg-black aspect-video select-none">
      <svg viewBox="0 0 320 180" className="absolute inset-0 w-full h-full cam-flicker" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="cf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1530" /><stop offset="1" stopColor="#1d2b4a" /></linearGradient>
          <linearGradient id="cf-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#222a38" /><stop offset="1" stopColor="#10141c" /></linearGradient>
          <radialGradient id="cf-lamp" cx="0.5" cy="0" r="0.8"><stop offset="0" stopColor="#fde68a" stopOpacity="0.55" /><stop offset="1" stopColor="#fde68a" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="320" height="180" fill="url(#cf-sky)" />
        {/* budova na pozadí */}
        <rect x="0" y="52" width="130" height="50" fill="#141c30" />
        {[10, 34, 58, 82, 106].map((x) => <rect key={x} x={x} y="62" width="12" height="9" fill={x % 48 === 10 ? '#fcd34d' : '#2a3654'} opacity="0.9" />)}
        <rect x="200" y="64" width="120" height="38" fill="#18213a" />
        {/* strom */}
        <g className="cam-sway" style={{ transformOrigin: '176px 100px' }}>
          <rect x="174" y="78" width="4" height="26" fill="#3b2f26" />
          <circle cx="176" cy="70" r="16" fill="#143324" />
          <circle cx="168" cy="76" r="11" fill="#1a4430" />
        </g>
        {/* silnice */}
        <rect x="0" y="100" width="320" height="80" fill="url(#cf-road)" />
        <g stroke="#cbd5e1" strokeWidth="2" strokeDasharray="14 12" opacity="0.5"><line x1="0" y1="138" x2="320" y2="138" /></g>
        {/* lampa */}
        <rect x="250" y="40" width="3" height="64" fill="#475569" />
        <rect x="236" y="38" width="18" height="3" fill="#475569" />
        <ellipse cx="240" cy="104" rx="52" ry="14" fill="url(#cf-lamp)" />
        <circle cx="240" cy="42" r="3.2" fill="#fde68a" />
        {/* auto */}
        <g className="cam-car">
          <rect x="0" y="118" width="46" height="13" rx="4" fill="#ef4444" />
          <path d="M9 118 l7-9 h18 l7 9z" fill="#b91c1c" />
          <rect x="17" y="111" width="7" height="6" fill="#bfdbfe" opacity="0.8" /><rect x="26" y="111" width="7" height="6" fill="#bfdbfe" opacity="0.8" />
          <circle cx="11" cy="132" r="4.5" fill="#0f172a" /><circle cx="36" cy="132" r="4.5" fill="#0f172a" />
          <ellipse cx="50" cy="125" rx="9" ry="3" fill="#fde68a" opacity="0.7" />
        </g>
        {/* chodec */}
        <g className="cam-walker">
          <circle cx="0" cy="146" r="4" fill="#e2e8f0" />
          <rect x="-3.5" y="150" width="7" height="14" rx="3" fill="#38bdf8" />
          <g className="cam-legs"><rect x="-3" y="163" width="2.6" height="9" fill="#1e293b" /><rect x="0.6" y="163" width="2.6" height="9" fill="#1e293b" /></g>
        </g>
      </svg>
      {/* scanlines + vinětace */}
      <div className="absolute inset-0 pointer-events-none cam-scan" />
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 70px 10px rgba(0,0,0,.65)' }} />
      {/* OSD */}
      <div className="absolute top-2 left-3 flex items-center gap-2 font-mono text-xs font-bold text-white drop-shadow">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 cam-rec" /> REC
      </div>
      <div className="absolute top-2 right-3 font-mono text-xs font-bold text-emerald-300 drop-shadow">{name.toUpperCase()}</div>
      <div className="absolute bottom-2 left-3 font-mono text-xs text-white/90 drop-shadow">{stamp}</div>
      <div className="absolute bottom-2 right-3 font-mono text-xs text-white/70 drop-shadow">{addr}</div>
    </div>
  );
}

/** Falešná webovka v „okně prohlížeče“. Barvy jsou pevné (světlá stránka v tmavém i světlém režimu). */
function FakeWebsite({ name, addr }: { name: string; addr: string }) {
  const now = useClock();
  return (
    <div className="rounded-xl overflow-hidden border border-slate-400 shadow-lg bg-white text-slate-800">
      {/* okno prohlížeče */}
      <div className="bg-slate-200 px-3 pt-2 pb-2 flex items-center gap-3">
        <div className="flex gap-1.5"><i className="w-3 h-3 rounded-full bg-red-400" /><i className="w-3 h-3 rounded-full bg-amber-400" /><i className="w-3 h-3 rounded-full bg-emerald-400" /></div>
        <div className="flex-1 min-w-0 bg-white rounded-md px-3 py-1 text-xs font-mono text-slate-600 truncate">http://{addr}/</div>
      </div>
      {/* stránka */}
      <div className="text-sm">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white">
          <strong className="tracking-wide">🌐 {name}</strong>
          <nav className="flex gap-3 text-slate-300 text-xs"><span>Domů</span><span>Aktuality</span><span>Kontakt</span></nav>
        </div>
        <div className="px-5 py-7 text-center bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white">
          <div className="text-3xl mb-1 web-bounce inline-block">🎉</div>
          <h3 className="text-2xl font-extrabold">It works!</h3>
          <p className="text-blue-100 mt-1">Tenhle web běží za dvěma routery a je vidět z internetu.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50">
          {[
            ['🔀', 'Dvojitý NAT', 'Požadavek prošel Routerem 1 i Routerem 2.'],
            ['🚪', 'PAT pravidla', 'Port se přeložil přesně tam, kam měl.'],
            ['✅', 'Skvělá práce', 'Síť je správně nastavená.'],
          ].map(([ico, t, d]) => (
            <div key={t} className="rounded-lg bg-white border border-slate-200 p-2 shadow-sm">
              <div className="text-xl">{ico}</div>
              <div className="font-bold text-xs mt-1">{t}</div>
              <div className="text-[11px] leading-tight text-slate-500 mt-0.5">{d}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
          <span>Počet návštěv: <strong className="font-mono">1</strong> (vy)</span>
          <span className="font-mono">{now.toLocaleTimeString('cs-CZ')}</span>
        </div>
      </div>
    </div>
  );
}
