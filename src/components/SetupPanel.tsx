import { ArrowDown, Cloud, Globe, Monitor, Plus, Router, Server, Trash2, Video, Wand2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Config, Device, FieldId, IspConfig, NodeId, RouterId, Rules } from '../lib/model';
import { KIND_INFO, ruleField } from '../lib/model';
import { analyzeInterface, parseSubnetMask } from '../lib/net';

export const PANEL_WIDTH_REM = { isp: 22, router: 30, device: 30 } as const;
export const panelWidthRem = (node: NodeId, isDevice: boolean) =>
  node === 'isp' ? PANEL_WIDTH_REM.isp : node === 'r1' || node === 'r2' ? PANEL_WIDTH_REM.router : isDevice ? PANEL_WIDTH_REM.device : PANEL_WIDTH_REM.device;

interface Common {
  cfg: Config;
  onField: (id: FieldId, value: string) => void;
  errorFields: Set<FieldId>;
  cidr: boolean;
  showCalc: boolean;
}

export interface PanelProps extends Common {
  node: NodeId;
  device?: Device;
  isp: IspConfig;
  rules: Rules;
  onAddRule: (router: RouterId) => void;
  onRemoveRule: (router: RouterId, id: string) => void;
  onClose: () => void;
  onAutoFill: (nodeId: NodeId) => void;
  onRemoveDevice: (id: NodeId) => void;
  onRename: (id: NodeId, name: string) => void;
  onTestPing: (id: NodeId) => void;
  onTestInbound: (id: NodeId) => void;
}

const FIXED_HEAD: Record<string, { bg: string; icon: ReactNode; title: string }> = {
  isp: { bg: 'bg-sky-900', icon: <Cloud className="w-5 h-5 text-sky-300" />, title: 'Internet / ISP – pevné parametry' },
  r1: { bg: 'bg-blue-900', icon: <Server className="w-5 h-5 text-blue-300" />, title: 'Nastavení – Router 1 (Hraniční)' },
  r2: { bg: 'bg-indigo-900', icon: <Router className="w-5 h-5 text-indigo-300" />, title: 'Nastavení – Router 2 (Vnitřní)' },
  pc: { bg: 'bg-slate-800 dark:bg-slate-700', icon: <Monitor className="w-5 h-5 text-emerald-400" />, title: 'Nastavení – Klientské PC' },
};

export default function SetupPanel(p: PanelProps) {
  const dev = p.device;
  const head = dev
    ? {
        bg: dev.kind === 'camera' ? 'bg-rose-900' : dev.kind === 'webserver' ? 'bg-amber-900' : 'bg-slate-800 dark:bg-slate-700',
        icon: dev.kind === 'camera' ? <Video className="w-5 h-5 text-rose-300" /> : dev.kind === 'webserver' ? <Globe className="w-5 h-5 text-amber-300" /> : <Monitor className="w-5 h-5 text-emerald-400" />,
        title: `Nastavení – ${dev.name}`,
      }
    : FIXED_HEAD[p.node];

  return (
    <div id={`panel-${p.node}`} className="@container bg-surface border-2 border-line rounded-2xl shadow-xl overflow-hidden">
      <div className={`${head.bg} text-white px-4 py-3 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{head.icon}</span>
          <h3 className="font-bold text-base leading-tight truncate">{head.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {dev && (
            <button type="button" onClick={() => p.onRemoveDevice(dev.id)} className="p-1.5 rounded-lg hover:bg-white/15 transition" aria-label="Odebrat zařízení" title="Odebrat zařízení z plochy">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button type="button" onClick={p.onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition" aria-label="Zavřít nastavení" title="Zavřít">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {p.node === 'isp' && <IspBody isp={p.isp} cidr={p.cidr} />}

      {(p.node === 'r1' || p.node === 'r2') && <RouterBody {...p} router={p.node} />}

      {!dev && p.node === 'pc' && (
        <ClientBody {...p} prefix="pc" title="Ethernet (LAN)" />
      )}

      {dev && (
        <>
          <div className="px-4 pt-4 bg-surface-2/50">
            <label htmlFor={`${dev.id}-name`} className="block text-sm font-semibold text-ink mb-1">Název zařízení</label>
            <input id={`${dev.id}-name`} value={dev.name} onChange={(e) => p.onRename(dev.id, e.target.value)} maxLength={28}
              className="w-full px-3 py-2 text-base border border-line-strong bg-surface rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <ClientBody {...p} prefix={dev.id} title={`Ethernet (LAN 2) – ${KIND_INFO[dev.kind].label}`} />
          {dev.kind === 'pc' ? (
            <div className="px-4 pb-4 bg-emerald-50/50 dark:bg-emerald-950/30">
              <button type="button" onClick={() => p.onTestPing(dev.id)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-base font-bold transition">
                Ping do internetu z tohoto PC
              </button>
            </div>
          ) : (
            <ServiceSection {...p} device={dev} />
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function IspBody({ isp, cidr }: { isp: IspConfig; cidr: boolean }) {
  const m = parseSubnetMask(isp.gwMask, true);
  const maskText = m ? (cidr ? `/${m.prefix} (${m.maskStr})` : m.maskStr) : isp.gwMask;
  return (
    <div className="p-4 space-y-3 bg-sky-50/40 dark:bg-sky-950/30">
      <Readonly label="IP brány ISP (Gateway)" value={isp.gwIp} />
      <Readonly label="Maska podsítě ISP" value={maskText} />
      <Readonly label="Veřejný DNS / cíl Ping" value={isp.dnsIp} tone="emerald" />
      <p className="text-sm text-ink-2 bg-surface border border-line rounded-lg p-2.5 leading-snug">
        <strong>WAN port Routeru 1</strong> musí mít adresu ze stejné podsítě jako brána ISP.
      </p>
    </div>
  );
}

function Readonly({ label, value, tone = 'sky' }: { label: string; value: string; tone?: 'sky' | 'emerald' }) {
  return (
    <div>
      <div className="text-xs font-semibold text-ink-3 uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-base font-bold rounded-lg px-3 py-1.5 mt-1 border ${tone === 'emerald' ? 'text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800' : 'text-sky-950 bg-surface border-sky-200 dark:border-sky-800'}`}>{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sekce (shora dolů = chronologie zapojení)

type Tone = 'wan' | 'lan' | 'pat' | 'svc';
const TONES: Record<Tone, { bg: string; line: string; text: string; dot: string; side: string; ring: string }> = {
  wan: { bg: 'bg-blue-50/50 dark:bg-blue-950/30', line: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-200', dot: 'bg-blue-600', side: 'text-blue-600 dark:text-blue-400', ring: 'focus:ring-blue-500' },
  lan: { bg: 'bg-emerald-50/50 dark:bg-emerald-950/30', line: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500', side: 'text-emerald-700 dark:text-emerald-300', ring: 'focus:ring-emerald-500' },
  pat: { bg: 'bg-amber-50/50 dark:bg-amber-950/30', line: 'border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-200', dot: 'bg-amber-500', side: 'text-amber-700 dark:text-amber-300', ring: 'focus:ring-amber-500' },
  svc: { bg: 'bg-rose-50/40 dark:bg-rose-950/30', line: 'border-rose-200 dark:border-rose-800', text: 'text-rose-800 dark:text-rose-200', dot: 'bg-rose-500', side: 'text-rose-700 dark:text-rose-300', ring: 'focus:ring-rose-500' },
};

function Section({ tone, step, title, side, action, children }: { tone: Tone; step?: number; title: string; side?: string; action?: ReactNode; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <div className={`p-4 space-y-3 ${t.bg}`}>
      <div className={`flex items-center justify-between gap-2 border-b ${t.line} pb-1.5`}>
        <span className={`text-sm font-bold uppercase tracking-wide ${t.text} flex items-center gap-1.5`}>
          {step ? <span className={`w-5 h-5 rounded-full ${t.dot} text-white text-xs flex items-center justify-center`}>{step}</span> : <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />}
          {title}
        </span>
        {action ?? (side && <span className={`text-xs font-medium ${t.side}`}>{side}</span>)}
      </div>
      {children}
    </div>
  );
}

/** Šipka mezi sekcemi – vizuálně ukazuje směr toku shora dolů. */
function Flow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 bg-surface-2 text-xs font-semibold text-ink-4 border-y border-line">
      <ArrowDown className="w-4 h-4" /> {label} <ArrowDown className="w-4 h-4" />
    </div>
  );
}

function Calc({ ip, mask, cidr }: { ip: string; mask: string; cidr: boolean }) {
  const info = analyzeInterface(ip, mask, cidr);
  return (
    <div className="bg-surface/90 border border-line rounded-lg px-3 py-2 text-xs text-ink-2 space-y-0.5">
      <div className="flex justify-between"><span>Síť:</span><strong className="font-mono text-ink">{info.valid ? (cidr ? `${info.networkStr}/${info.prefix}` : info.networkStr) : '—'}</strong></div>
      <div className="flex justify-between"><span>Bcast:</span><strong className="font-mono text-ink">{info.valid ? info.broadcastStr : '—'}</strong></div>
    </div>
  );
}

const grid2 = 'grid grid-cols-1 @md:grid-cols-2 gap-3';

function fieldMaker(c: Common, tone: Tone) {
  return (id: FieldId, label: string, isMask = false) => {
    const cidrWarn = isMask && !c.cidr && (c.cfg[id] ?? '').trim().startsWith('/');
    return (
      <Field
        key={id}
        id={id}
        label={label}
        value={c.cfg[id] ?? ''}
        onChange={(v) => c.onField(id, v)}
        error={c.errorFields.has(id) || cidrWarn}
        placeholder={isMask ? (c.cidr ? '255.255.255.0 nebo /24' : '255.255.255.0') : undefined}
        title={cidrWarn ? 'Lomený zápis je vypnutý. Zadejte masku např. 255.255.255.0 (nebo ho zapněte v Nastavení).' : undefined}
        ring={TONES[tone].ring}
      />
    );
  };
}

function RouterBody(p: PanelProps & { router: RouterId }) {
  const r = p.router;
  const wan = fieldMaker(p, 'wan'), lan = fieldMaker(p, 'lan');
  const id = (part: string) => `${r}-${part}`;
  return (
    <div>
      <Section tone="wan" step={1} title="WAN – vnější strana" side={r === 'r1' ? '↑ k ISP' : '↑ k Routeru 1'}>
        <div className={grid2}>{wan(id('wan-ip'), 'IPv4 adresa')}{wan(id('wan-mask'), 'Maska podsítě', true)}</div>
        <div className={grid2}>{wan(id('wan-gw'), 'Výchozí brána')}{wan(id('wan-dns'), 'DNS server')}</div>
        {p.showCalc && <Calc ip={p.cfg[id('wan-ip')] ?? ''} mask={p.cfg[id('wan-mask')] ?? ''} cidr={p.cidr} />}
      </Section>
      <Flow label="router směruje" />
      <Section tone="lan" step={2} title={r === 'r1' ? 'LAN 1 – vnitřní strana' : 'LAN 2 – vnitřní strana'} side={r === 'r1' ? '↓ k Routeru 2' : '↓ k zařízením'}>
        <div className={grid2}>{lan(id('lan-ip'), 'IPv4 adresa')}{lan(id('lan-mask'), 'Maska podsítě', true)}</div>
        {p.showCalc && <Calc ip={p.cfg[id('lan-ip')] ?? ''} mask={p.cfg[id('lan-mask')] ?? ''} cidr={p.cidr} />}
      </Section>
      <Flow label="z internetu dovnitř" />
      <PatSection {...p} router={r} />
    </div>
  );
}

function PatSection(p: PanelProps & { router: RouterId }) {
  const r = p.router;
  const ids = p.rules[r];
  return (
    <Section
      tone="pat"
      step={3}
      title="PAT – přesměrování portů"
      action={
        <button type="button" onClick={() => p.onAddRule(r)} className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 dark:text-amber-100 bg-surface border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-md px-2 py-1 transition">
          <Plus className="w-3.5 h-3.5" /> Pravidlo
        </button>
      }
    >
      <p className="text-xs text-ink-2 leading-snug">
        {r === 'r1'
          ? 'Příchozí spojení na veřejnou IP:port přesměruj na WAN adresu Routeru 2.'
          : 'Příchozí spojení na tento port přesměruj na zařízení v LAN 2 (IP a port služby).'}
      </p>
      {ids.length === 0 ? (
        <div className="text-sm text-ink-4 italic border border-dashed border-amber-300 dark:border-amber-700 rounded-lg px-3 py-3 text-center">Žádné pravidlo – příchozí spojení se zahodí.</div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[5.5rem_1fr_5.5rem_1.75rem] gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-3 px-0.5">
            <span>Vnější port</span><span>→ Cílová IP</span><span>Cílový port</span><span />
          </div>
          {ids.map((rid) => (
            <div key={rid} className="grid grid-cols-[5.5rem_1fr_5.5rem_1.75rem] gap-2 items-start">
              {(['ext', 'ip', 'port'] as const).map((part) => {
                const fid = ruleField(r, rid, part);
                return (
                  <MiniField key={fid} id={fid} value={p.cfg[fid] ?? ''} error={p.errorFields.has(fid)} onChange={(v) => p.onField(fid, v)}
                    label={part === 'ext' ? 'Vnější port' : part === 'ip' ? 'Cílová IP' : 'Cílový port'} placeholder={part === 'ip' ? '0.0.0.0' : '0000'} />
                );
              })}
              <button type="button" onClick={() => p.onRemoveRule(r, rid)} title="Smazat pravidlo" aria-label="Smazat pravidlo"
                className="h-[2.55rem] flex items-center justify-center rounded-lg text-ink-4 hover:text-white hover:bg-rose-500 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Klient (základní PC i přidaná zařízení)

function ClientBody(p: PanelProps & { prefix: string; title: string }) {
  const lan = fieldMaker(p, 'lan');
  const id = (s: string) => `${p.prefix}-${s}`;
  return (
    <Section
      tone="lan"
      title={p.title}
      action={
        <button type="button" onClick={() => p.onAutoFill(p.prefix)} title="Doplní IP, masku, bránu a DNS podle LAN portu Routeru 2"
          className="text-xs bg-surface hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 px-2 py-1 rounded-md font-semibold transition flex items-center gap-1">
          <Wand2 className="w-3.5 h-3.5" /> Dle R2
        </button>
      }
    >
      <div className={grid2}>{lan(id('ip'), 'IPv4 adresa')}{lan(id('mask'), 'Maska podsítě', true)}</div>
      <div className={grid2}>{lan(id('gw'), 'Výchozí brána')}{lan(id('dns'), 'DNS server')}</div>
      {p.showCalc && <Calc ip={p.cfg[id('ip')] ?? ''} mask={p.cfg[id('mask')] ?? ''} cidr={p.cidr} />}
    </Section>
  );
}

function ServiceSection(p: PanelProps & { device: Device }) {
  const d = p.device;
  const info = KIND_INFO[d.kind];
  const svc = fieldMaker(p, 'svc');
  const pub = (p.cfg[`${d.id}-pub`] ?? '').trim();
  const wanIp = analyzeInterface(p.cfg['r1-wan-ip'] ?? '', p.cfg['r1-wan-mask'] ?? '', p.cidr);
  const url = `${d.kind === 'camera' ? 'rtsp' : 'http'}://${wanIp.valid ? wanIp.ipStr : '<veřejná IP>'}:${pub || '<port>'}`;
  return (
    <Section tone="svc" title="Služba a přístup z internetu">
      <div className="text-sm text-ink-2 flex items-center justify-between bg-surface/80 border border-line rounded-lg px-3 py-2">
        <span>Služba zařízení</span>
        <strong className="font-mono text-ink">{info.service} · port {info.port}</strong>
      </div>
      <div className={grid2}>
        {svc(`${d.id}-pub`, 'Veřejný port (zvenku)')}
        <div>
          <div className="block text-sm font-semibold text-ink mb-1">Adresa pro klienta</div>
          <div className="font-mono text-sm break-all bg-surface border border-line rounded-lg px-3 py-2.5 text-ink">{url}</div>
        </div>
      </div>
      <button type="button" onClick={() => p.onTestInbound(d.id)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-base font-bold transition">
        <Globe className="w-5 h-5" /> Otestovat přístup z internetu
      </button>
    </Section>
  );
}

// ----------------------------------------------------------------------------

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

const inputBase = 'font-mono w-full border rounded-lg focus:outline-none focus:ring-2 placeholder:text-ink-4';
const inputState = (error: boolean) =>
  error ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100 ring-2 ring-rose-200 dark:ring-rose-800' : 'bg-surface border-line-strong';

function Field({ id, label, value, onChange, error, placeholder, title, ring }: FieldProps) {
  return (
    <div id={`box-${id}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink mb-1">{label}</label>
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
          className={`${inputBase} pl-3 pr-9 py-2 text-base ${ring} ${inputState(error)}`}
        />
        {value && (
          <button type="button" tabIndex={-1} title="Vymazat pole" onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-line hover:bg-rose-500 text-ink-2 hover:text-white flex items-center justify-center text-sm font-bold leading-none transition">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function MiniField({ id, label, value, onChange, error, placeholder }: { id: FieldId; label: string; value: string; onChange: (v: string) => void; error: boolean; placeholder?: string }) {
  return (
    <div id={`box-${id}`}>
      <input
        id={id}
        aria-label={label}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} px-2.5 py-2 text-base focus:ring-amber-500 ${inputState(error)}`}
      />
    </div>
  );
}
