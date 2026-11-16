import { Cloud, Monitor, Router, Server, Wand2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Config, FieldId, IspConfig, NodeId } from '../lib/model';
import { analyzeInterface, parseSubnetMask } from '../lib/net';

interface Common {
  cfg: Config;
  onField: (id: FieldId, value: string) => void;
  errorFields: Set<FieldId>;
  cidr: boolean;
  showCalc: boolean;
}

export const PANEL_WIDTH_REM: Record<NodeId, number> = { isp: 21, r1: 34, r2: 34, pc: 21 };

const HEAD: Record<NodeId, { bg: string; icon: ReactNode; title: string }> = {
  isp: { bg: 'bg-sky-900', icon: <Cloud className="w-5 h-5 text-sky-300" />, title: 'Internet / ISP – pevné parametry' },
  r1: { bg: 'bg-blue-900', icon: <Server className="w-5 h-5 text-blue-300" />, title: 'Nastavení – Router 1 (Hraniční)' },
  r2: { bg: 'bg-indigo-900', icon: <Router className="w-5 h-5 text-indigo-300" />, title: 'Nastavení – Router 2 (Vnitřní)' },
  pc: { bg: 'bg-slate-800', icon: <Monitor className="w-5 h-5 text-emerald-400" />, title: 'Nastavení – Klientské PC' },
};

interface PanelProps extends Common {
  node: NodeId;
  isp: IspConfig;
  onClose: () => void;
  onAutoFillPc: () => void;
}

export default function SetupPanel(p: PanelProps) {
  const head = HEAD[p.node];
  return (
    <div id={`panel-${p.node}`} className="@container bg-white border-2 border-slate-200 rounded-2xl shadow-xl overflow-hidden">
      <div className={`${head.bg} text-white px-4 py-3 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{head.icon}</span>
          <h3 className="font-bold text-base leading-tight truncate">{head.title}</h3>
        </div>
        <button type="button" onClick={p.onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition" aria-label="Zavřít nastavení" title="Zavřít">
          <X className="w-5 h-5" />
        </button>
      </div>
      {p.node === 'isp' && <IspBody isp={p.isp} cidr={p.cidr} />}
      {(p.node === 'r1' || p.node === 'r2') && (
        <div className="grid grid-cols-1 @lg:grid-cols-2 divide-y @lg:divide-y-0 @lg:divide-x divide-slate-200">
          <Port {...p} kind="wan" prefix={p.node} title="WAN (Vnější)" side={p.node === 'r1' ? '← k ISP' : '← k R1'} full />
          <Port {...p} kind="lan" prefix={p.node} title={p.node === 'r1' ? 'LAN 1 (Vnitřní)' : 'LAN 2 (Vnitřní)'} side={p.node === 'r1' ? 'k R2 →' : 'k PC →'} />
        </div>
      )}
      {p.node === 'pc' && (
        <Port {...p} kind="lan" prefix="pc" title="Ethernet (LAN)" side="" pc onAutoFillPc={p.onAutoFillPc} full />
      )}
    </div>
  );
}

function IspBody({ isp, cidr }: { isp: IspConfig; cidr: boolean }) {
  const m = parseSubnetMask(isp.gwMask, true);
  const maskText = m ? (cidr ? `/${m.prefix} (${m.maskStr})` : m.maskStr) : isp.gwMask;
  return (
    <div className="p-4 space-y-3 bg-sky-50/40">
      <Readonly label="IP brány ISP (Gateway)" value={isp.gwIp} />
      <Readonly label="Maska podsítě ISP" value={maskText} />
      <Readonly label="Veřejný DNS / cíl Ping" value={isp.dnsIp} tone="emerald" />
      <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5 leading-snug">
        <strong>WAN port Routeru 1</strong> musí mít adresu ze stejné podsítě jako brána ISP.
      </p>
    </div>
  );
}

function Readonly({ label, value, tone = 'sky' }: { label: string; value: string; tone?: 'sky' | 'emerald' }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-base font-bold rounded-lg px-3 py-1.5 mt-1 border ${tone === 'emerald' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-sky-950 bg-white border-sky-200'}`}>{value}</div>
    </div>
  );
}

interface PortProps extends Common {
  kind: 'wan' | 'lan';
  prefix: 'r1' | 'r2' | 'pc';
  title: string;
  side: string;
  /** WAN/PC mají i bránu a DNS */
  full?: boolean;
  pc?: boolean;
  onAutoFillPc?: () => void;
}

function Port({ kind, prefix, title, side, full, pc, onAutoFillPc, cfg, onField, errorFields, cidr, showCalc }: PortProps) {
  const base = pc ? 'pc' : `${prefix}-${kind}`;
  const id = (suffix: string) => `${base}-${suffix}` as FieldId;
  const wan = kind === 'wan';
  const tone = wan
    ? { bg: 'bg-blue-50/50', line: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-600', side: 'text-blue-600', ring: 'focus:ring-blue-500' }
    : { bg: 'bg-emerald-50/50', line: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', side: 'text-emerald-700', ring: 'focus:ring-emerald-500' };
  const info = analyzeInterface(cfg[id('ip')], cfg[id('mask')], cidr);

  return (
    <div className={`p-4 space-y-3 ${tone.bg}`}>
      <div className={`flex items-center justify-between gap-2 border-b ${tone.line} pb-1.5`}>
        <span className={`text-sm font-bold uppercase tracking-wide ${tone.text} flex items-center gap-1.5`}>
          <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`} /> {title}
        </span>
        {pc ? (
          <button type="button" onClick={onAutoFillPc} title="Doplní IP, masku, bránu a DNS podle LAN portu Routeru 2"
            className="text-xs bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded-md font-semibold transition flex items-center gap-1">
            <Wand2 className="w-3.5 h-3.5" /> Dle R2
          </button>
        ) : (
          <span className={`text-xs font-medium ${tone.side}`}>{side}</span>
        )}
      </div>

      {(['ip', 'mask', ...(full ? ['gw', 'dns'] : [])] as const).map((s) => {
        const fid = id(s);
        const isMask = s === 'mask';
        const cidrWarn = isMask && !cidr && cfg[fid].trim().startsWith('/');
        return (
          <Field
            key={fid}
            id={fid}
            label={s === 'ip' ? (pc ? 'IPv4 adresa PC' : 'IPv4 adresa') : s === 'mask' ? 'Maska podsítě' : s === 'gw' ? 'Výchozí brána' : 'DNS server'}
            value={cfg[fid]}
            onChange={(v) => onField(fid, v)}
            error={errorFields.has(fid) || cidrWarn}
            placeholder={isMask ? (cidr ? '255.255.255.0 nebo /24' : '255.255.255.0') : undefined}
            title={cidrWarn ? 'Lomený zápis je vypnutý. Zadejte masku např. 255.255.255.0 (nebo ho zapněte v Nastavení).' : undefined}
            ring={tone.ring}
          />
        );
      })}

      {showCalc && (
        <div className="bg-white/90 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 space-y-0.5">
          <div className="flex justify-between"><span>Síť:</span><strong className="font-mono text-slate-800">{info.valid ? (cidr ? `${info.networkStr}/${info.prefix}` : info.networkStr) : '—'}</strong></div>
          <div className="flex justify-between"><span>Bcast:</span><strong className="font-mono text-slate-800">{info.valid ? info.broadcastStr : '—'}</strong></div>
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  id: FieldId;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: boolean;
  placeholder?: string;
  title?: string;
  ring: string;
}

function Field({ id, label, value, onChange, error, placeholder, title, ring }: FieldProps) {
  return (
    <div id={`box-${id}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          title={title}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={`font-mono w-full pl-3 pr-9 py-2 text-base border rounded-lg focus:outline-none focus:ring-2 placeholder:text-slate-300 ${ring}
            ${error ? 'border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-200' : 'bg-white border-slate-300'}`}
        />
        {value && (
          <button type="button" tabIndex={-1} title="Vymazat pole" onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-rose-500 text-slate-600 hover:text-white flex items-center justify-center text-sm font-bold leading-none transition">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

