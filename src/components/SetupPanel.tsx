import { ArrowDown, Cloud, Globe, Loader2, Monitor, Network, Plus, Router, Server, Trash2, Video, Wand2, Wifi, X } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { serverLoc, type DhcpResult } from '../lib/dhcp';
import { RunningContext } from './RunContext';
import InboundPreviewCard from './InboundPreview';
import Toggle from './Toggle';
import { descendants } from '../lib/graph';
import type { ApMode, Config, Device, DeviceKind, FieldId, IspConfig, NodeId, RouterId, Rules, Uplinks } from '../lib/model';
import { AP_MODES, FIXED_NODES, KIND_INFO, apModeOf, isL2, isRouter, ruleField } from '../lib/model';
import { canParent, freeNodes, nameOf as topoName, ownerOf } from '../lib/free';
import { analyzeInterface, ipToLong, longToIp, parseSubnetMask } from '../lib/net';

export const PANEL_WIDTH_REM = { isp: 22, router: 30, device: 30, l2: 23, ap: 28 } as const;
export const panelWidthRem = (node: NodeId, kind?: DeviceKind, free = false) =>
  node === 'isp' ? (free ? 24 : PANEL_WIDTH_REM.isp)
  : node === 'r1' || node === 'r2' || kind === 'router' ? PANEL_WIDTH_REM.router
  : kind === 'ap' ? (free ? PANEL_WIDTH_REM.ap : PANEL_WIDTH_REM.l2)
  : kind === 'switch' ? PANEL_WIDTH_REM.l2
  : PANEL_WIDTH_REM.device;

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
  devices: Device[];
  uplinks: Uplinks;
  isp: IspConfig;
  rules: Rules;
  dhcp: DhcpResult;
  onFill: (values: Partial<Config>) => void;
  onAddRule: (router: RouterId) => void;
  onRemoveRule: (router: RouterId, id: string) => void;
  onClose: () => void;
  onAutoFill: (nodeId: NodeId) => void;
  onRemoveDevice: (id: NodeId) => void;
  onRename: (id: NodeId, name: string) => void;
  onUplink: (child: NodeId, parent: NodeId) => void;
  onTestPing: (id: NodeId) => void;
  onTestInbound: (id: NodeId) => void;
  /** volné plátno */
  free: boolean;
  onIsp: (key: keyof IspConfig, value: string) => void;
  onApMode: (id: NodeId, mode: ApMode) => void;
  /** upozornění na více DHCP serverů v jedné síti (klíč = server) */
  dhcpConflicts: Record<NodeId, string>;
  /** router, kterým zařízení vychází do internetu (veřejná IP) */
  topRouter: NodeId | null;
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
        bg: dev.kind === 'router' ? 'bg-indigo-900' : dev.kind === 'switch' ? 'bg-teal-900' : dev.kind === 'ap' ? 'bg-cyan-900' : dev.kind === 'camera' ? 'bg-violet-900' : dev.kind === 'webserver' ? 'bg-violet-900' : 'bg-slate-800 dark:bg-slate-700',
        icon: dev.kind === 'router' ? <Router className="w-5 h-5 text-indigo-300" /> : dev.kind === 'switch' ? <Network className="w-5 h-5 text-teal-300" /> : dev.kind === 'ap' ? <Wifi className="w-5 h-5 text-cyan-300" /> : dev.kind === 'camera' ? <Video className="w-5 h-5 text-violet-300" /> : dev.kind === 'webserver' ? <Globe className="w-5 h-5 text-violet-300" /> : <Monitor className="w-5 h-5 text-emerald-400" />,
        title: `Nastavení – ${dev.name}`,
      }
    : p.free && p.node === 'r1' ? { ...FIXED_HEAD.r1, title: 'Nastavení – Hraniční router' }
    : p.free && p.node === 'isp' ? { ...FIXED_HEAD.isp, title: 'Internet / ISP' }
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

      {p.node === 'isp' && <IspBody isp={p.isp} cidr={p.cidr} free={p.free} onIsp={p.onIsp} />}

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
          {isRouter(dev) ? (
            <>
              <div className="px-4 py-3 bg-surface-2/50 border-b border-line">
                <UplinkSelect nodeId={dev.id} {...p} />
              </div>
              <RouterBody {...p} router={dev.id} />
            </>
          ) : isL2(dev) ? (
            <L2Body {...p} device={dev} />
          ) : (
            <ClientBody {...p} prefix={dev.id} title={`Ethernet (${p.free ? 'LAN' : 'LAN 2'}) – ${KIND_INFO[dev.kind].label}`} />
          )}
          {isL2(dev) || isRouter(dev) ? null : dev.kind === 'pc' ? (
            <div className="px-4 pb-4 bg-emerald-50/50 dark:bg-emerald-950/30">
              <PingButton onClick={() => p.onTestPing(dev.id)} />
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

function IspBody({ isp, cidr, free, onIsp }: { isp: IspConfig; cidr: boolean; free: boolean; onIsp: (key: keyof IspConfig, value: string) => void }) {
  const m = parseSubnetMask(isp.gwMask, true);
  const maskText = m ? (cidr ? `/${m.prefix} (${m.maskStr})` : m.maskStr) : isp.gwMask;
  if (free) {
    const f = (key: keyof IspConfig, label: string) => (
      <Field key={key} id={`isp-${key}`} label={label} value={isp[key]} onChange={(v) => onIsp(key, v)} error={false} ring="focus:ring-sky-500" />
    );
    return (
      <div className="p-4 space-y-3 bg-sky-50/40 dark:bg-sky-950/30">
        {f('gwIp', 'IP brány ISP (Gateway)')}
        {f('gwMask', 'Maska podsítě ISP')}
        {f('dnsIp', 'Veřejný DNS / cíl Ping')}
        <p className="text-sm text-ink-2 bg-surface border border-line rounded-lg p-2.5 leading-snug">
          Parametry poskytovatele můžete upravit. <strong>WAN port hraničního routeru</strong> musí mít adresu ze stejné podsítě jako brána ISP.
        </p>
      </div>
    );
  }
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

type Tone = 'wan' | 'lan' | 'pat' | 'svc' | 'dhcp';
const TONES: Record<Tone, { bg: string; line: string; text: string; dot: string; side: string; ring: string }> = {
  wan: { bg: 'bg-blue-50/50 dark:bg-blue-950/30', line: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-200', dot: 'bg-blue-600', side: 'text-blue-600 dark:text-blue-400', ring: 'focus:ring-blue-500' },
  lan: { bg: 'bg-emerald-50/50 dark:bg-emerald-950/30', line: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500', side: 'text-emerald-700 dark:text-emerald-300', ring: 'focus:ring-emerald-500' },
  pat: { bg: 'bg-violet-50/50 dark:bg-violet-950/30', line: 'border-violet-200 dark:border-violet-800', text: 'text-violet-800 dark:text-violet-200', dot: 'bg-violet-500', side: 'text-violet-700 dark:text-violet-300', ring: 'focus:ring-violet-500' },
  dhcp: { bg: 'bg-teal-50/50 dark:bg-teal-950/30', line: 'border-teal-200 dark:border-teal-800', text: 'text-teal-800 dark:text-teal-200', dot: 'bg-teal-500', side: 'text-teal-700 dark:text-teal-300', ring: 'focus:ring-teal-500' },
  svc: { bg: 'bg-violet-50/50 dark:bg-violet-950/30', line: 'border-violet-200 dark:border-violet-800', text: 'text-violet-800 dark:text-violet-200', dot: 'bg-violet-500', side: 'text-violet-700 dark:text-violet-300', ring: 'focus:ring-violet-500' },
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
  const dhcp = p.free || r === 'r2';
  return (
    <div>
      <Section tone="wan" step={1} title="WAN – vnější strana" side={p.free ? (r === 'r1' ? '↑ k ISP' : '↑ k nadřazené síti') : r === 'r1' ? '↑ k ISP' : '↑ k Routeru 1'}>
        <div className={grid2}>{wan(id('wan-ip'), 'IPv4 adresa')}{wan(id('wan-mask'), 'Maska podsítě', true)}</div>
        <div className={grid2}>{wan(id('wan-gw'), 'Výchozí brána')}{wan(id('wan-dns'), 'DNS server')}</div>
        {p.showCalc && <Calc ip={p.cfg[id('wan-ip')] ?? ''} mask={p.cfg[id('wan-mask')] ?? ''} cidr={p.cidr} />}
      </Section>
      <Flow label="router směruje" />
      <Section tone="lan" step={2} title={p.free ? 'LAN – vnitřní strana' : r === 'r1' ? 'LAN 1 – vnitřní strana' : 'LAN 2 – vnitřní strana'} side={p.free ? '↓ k zařízením' : r === 'r1' ? '↓ k Routeru 2' : '↓ k zařízením'}>
        <div className={grid2}>{lan(id('lan-ip'), 'IPv4 adresa')}{lan(id('lan-mask'), 'Maska podsítě', true)}</div>
        {p.showCalc && <Calc ip={p.cfg[id('lan-ip')] ?? ''} mask={p.cfg[id('lan-mask')] ?? ''} cidr={p.cidr} />}
      </Section>
      {dhcp && (
        <>
          <Flow label="služby pro klienty v LAN" />
          <DhcpSection {...p} router={r} />
        </>
      )}
      <Flow label="z internetu dovnitř" />
      <PatSection {...p} router={r} step={dhcp ? 4 : 3} />
    </div>
  );
}

/** Zapnutí DHCP serveru s rozumným předvyplněním rozsahu a DNS. `gwField` = AP (brána pro klienty se zadává ručně). */
function dhcpToggle(p: PanelProps, srv: string, checked: boolean, gwDefault?: string) {
  if (!checked) { p.onFill({ [`${srv}-dhcp-on`]: '' }); return; }
  const lan = analyzeInterface(p.cfg[`${srv}-lan-ip`] ?? '', p.cfg[`${srv}-lan-mask`] ?? '', p.cidr);
  const v: Partial<Config> = { [`${srv}-dhcp-on`]: '1' };
  if (lan.valid && !(p.cfg[`${srv}-dhcp-start`] ?? '').trim() && !(p.cfg[`${srv}-dhcp-end`] ?? '').trim()) {
    const hosts = lan.broadcastLong - lan.networkLong - 1;
    const first = lan.networkLong + (hosts >= 160 ? 100 : 10);
    const last = Math.min(first + (hosts >= 160 ? 50 : 20), lan.broadcastLong - 1);
    v[`${srv}-dhcp-start`] = longToIp(first);
    v[`${srv}-dhcp-end`] = longToIp(last);
  }
  if (!(p.cfg[`${srv}-dhcp-dns`] ?? '').trim()) v[`${srv}-dhcp-dns`] = p.isp.dnsIp;
  if (gwDefault && !(p.cfg[`${srv}-dhcp-gw`] ?? '').trim()) v[`${srv}-dhcp-gw`] = gwDefault;
  p.onFill(v);
}

/** Upozornění, že v jedné síti smí běžet jen jedno DHCP (amber = nápověda, ne chyba). */
function DhcpWarn({ text, strong }: { text?: string; strong?: boolean }) {
  return (
    <p className={`text-xs leading-snug rounded-lg px-3 py-2 border ${strong ? 'bg-amber-100 dark:bg-amber-900/50 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600' : 'bg-amber-50 dark:bg-amber-950/50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'} text-amber-900 dark:text-amber-100`}>
      <strong>Pozor:</strong> {text ?? 'v jedné síti držte jen jedno DHCP – nebo si pohlídejte, aby se rozsahy neprotínaly.'}
    </p>
  );
}

/** DHCP server na routeru: klientům v jeho LAN přiděluje adresu, masku, bránu a DNS. */
function DhcpSection(p: PanelProps & { router: RouterId }) {
  const r = p.router;
  const on = (p.cfg[`${r}-dhcp-on`] ?? '') === '1';
  const lan = analyzeInterface(p.cfg[`${r}-lan-ip`] ?? '', p.cfg[`${r}-lan-mask`] ?? '', p.cidr);
  const f = fieldMaker(p, 'dhcp');
  const s = ipToLong(p.cfg[`${r}-dhcp-start`] ?? ''), e = ipToLong(p.cfg[`${r}-dhcp-end`] ?? '');
  const count = s !== null && e !== null && e >= s ? e - s + 1 : null;
  const err = p.errorFields.has(`${r}-dhcp-on`);
  const conflict = p.dhcpConflicts[r];
  return (
    <Section tone="dhcp" step={3} title={p.free ? 'DHCP server (LAN)' : 'DHCP server (LAN 2)'} side="↓ pro klienty">
      <div id={`box-${r}-dhcp-on`} className={`flex items-center gap-3 rounded-lg p-1.5 ${err ? 'ring-2 ring-rose-400 bg-rose-50 dark:bg-rose-950/50' : ''}`}>
        <Toggle checked={on} onChange={(c) => dhcpToggle(p, r, c)} label="DHCP server" onColor="bg-teal-600" />
        <div className="text-sm text-ink leading-snug">
          <strong className="block text-ink">DHCP server {on ? 'zapnutý' : 'vypnutý'}</strong>
          Zařízení v LAN s volbou „DHCP“ dostanou adresu z rozsahu automaticky.
        </div>
      </div>
      {on && (
        <>
          <div className={grid2}>{f(`${r}-dhcp-start`, 'Začátek rozsahu')}{f(`${r}-dhcp-end`, 'Konec rozsahu')}</div>
          {f(`${r}-dhcp-dns`, 'DNS server pro klienty')}
          <p className="text-xs text-ink-2 leading-snug bg-surface/80 border border-line rounded-lg px-3 py-2">
            {count !== null ? <>Rozsah má <strong>{count}</strong> adres. </> : null}
            Maska a výchozí brána se klientům předají automaticky z LAN rozhraní (adresa routeru <span className="font-mono">{lan.valid ? lan.ipStr : '—'}</span>).
          </p>
          {conflict && <DhcpWarn text={conflict} strong />}
        </>
      )}
    </Section>
  );
}

function PatSection(p: PanelProps & { router: RouterId; step: number }) {
  const r = p.router;
  const ids = p.rules[r] ?? [];
  return (
    <Section
      tone="pat"
      step={p.step}
      title="PAT – přesměrování portů"
      action={
        <button type="button" onClick={() => p.onAddRule(r)} className="inline-flex items-center gap-1 text-xs font-bold text-violet-900 dark:text-violet-100 bg-surface border border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 rounded-md px-2 py-1 transition">
          <Plus className="w-3.5 h-3.5" /> Pravidlo
        </button>
      }
    >
      <p className="text-xs text-ink-2 leading-snug">
        {p.free
          ? 'Příchozí spojení na tento port přesměruj na zařízení v LAN, nebo na WAN adresu dalšího routeru za tímto (IP a port).'
          : r === 'r1'
            ? 'Příchozí spojení na veřejnou IP:port přesměruj na WAN adresu Routeru 2.'
            : 'Příchozí spojení na tento port přesměruj na zařízení v LAN 2 (IP a port služby).'}
      </p>
      {ids.length === 0 ? (
        <div className="text-sm text-ink-4 italic border border-dashed border-violet-300 dark:border-violet-700 rounded-lg px-3 py-3 text-center">Žádné pravidlo – příchozí spojení se zahodí.</div>
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
                    label={part === 'ext' ? 'Vnější port' : part === 'ip' ? 'Cílová IP' : 'Cílový port'} />
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
  const dhcpOn = (p.cfg[id('dhcp')] ?? '') === '1';
  const lease = p.dhcp.leases[p.prefix];
  const problem = p.dhcp.problems[p.prefix];
  const li = lease ? analyzeInterface(lease.ip, lease.mask, true) : null;
  const leaseMask = lease ? (p.cidr && li?.valid ? `/${li.prefix}` : lease.mask) : '';
  return (
    <Section
      tone="lan"
      title={p.title}
      action={
        <button type="button" onClick={() => p.onAutoFill(p.prefix)} title={p.free ? 'Doplní IP, masku, bránu a DNS podle LAN portu routeru, ke kterému je zařízení zapojené' : 'Doplní IP, masku, bránu a DNS podle LAN portu Routeru 2'}
          className="text-xs bg-surface hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 px-2 py-1 rounded-md font-semibold transition flex items-center gap-1">
          <Wand2 className="w-3.5 h-3.5" /> {p.free ? 'Dle brány' : 'Dle R2'}
        </button>
      }
    >
      <UplinkSelect nodeId={p.prefix} {...p} />
      <div>
        <div className="block text-sm font-semibold text-ink mb-1">Získání adresy</div>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Způsob získání adresy">
          {([['', 'Ručně (statická)'], ['1', 'Automaticky (DHCP)']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => p.onField(id('dhcp'), v)}
              className={`px-2 py-2 rounded-lg border text-sm font-semibold transition ${dhcpOn === !!v ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-surface border-line-strong text-ink hover:bg-surface-2'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {dhcpOn ? (
        <div id={`box-${id('ip')}`} className="space-y-2">
          {lease ? (
            <>
              <div className="rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30 dark:bg-teal-950/40 px-3 py-2 text-sm text-ink">
                <div className="font-bold text-ink mb-1">✓ Adresu přidělil DHCP server na {serverLoc(lease.server ?? 'r2', p.devices)}</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
                  <dt className="text-ink-3 font-sans">IP</dt><dd className="font-bold text-ink">{lease.ip}</dd>
                  <dt className="text-ink-3 font-sans">Maska</dt><dd>{leaseMask}</dd>
                  <dt className="text-ink-3 font-sans">Brána</dt><dd>{lease.gw}</dd>
                  <dt className="text-ink-3 font-sans">DNS</dt><dd>{lease.dns}</dd>
                </dl>
              </div>
              {p.showCalc && <Calc ip={lease.ip} mask={lease.mask} cidr={p.cidr} />}
            </>
          ) : (
            <div className="rounded-lg border border-rose-300 dark:border-rose-700 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-900 dark:text-rose-100 dark:text-rose-200">
              <div className="font-bold mb-0.5">Zařízení zatím nemá adresu</div>
              {problem ? problem.text : p.free ? 'V této síti není zapnutý žádný DHCP server.' : 'DHCP server na Routeru 2 není nastaven.'}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={grid2}>{lan(id('ip'), 'IPv4 adresa')}{lan(id('mask'), 'Maska podsítě', true)}</div>
          <div className={grid2}>{lan(id('gw'), 'Výchozí brána')}{lan(id('dns'), 'DNS server')}</div>
          {p.showCalc && <Calc ip={p.cfg[id('ip')] ?? ''} mask={p.cfg[id('mask')] ?? ''} cidr={p.cidr} />}
        </>
      )}
    </Section>
  );
}

/** Výběr, k čemu je zařízení připojeno. V úlohách Router 2 nebo switch / AP; ve volném plátně libovolný přípustný uzel nebo „nezapojeno“. */
function UplinkSelect(p: { nodeId: NodeId; devices: Device[]; uplinks: Uplinks; onUplink: (child: NodeId, parent: NodeId) => void; free: boolean }) {
  const { nodeId, devices, uplinks, onUplink } = p;
  if (p.free) {
    const t = { devices, uplinks };
    const options = freeNodes(devices).filter((n) => canParent(t, nodeId, n));
    const cur = uplinks[nodeId] ?? '';
    const value = cur === '' || options.includes(cur) ? cur : '';
    return (
      <div>
        <label htmlFor={`${nodeId}-uplink`} className="block text-sm font-semibold text-ink mb-1">Připojeno k <span className="font-normal text-ink-3">(nebo přetáhněte kabel v schématu)</span></label>
        <select id={`${nodeId}-uplink`} value={value} onChange={(e) => onUplink(nodeId, e.target.value)}
          className="w-full px-3 py-2 text-base border border-line-strong bg-surface text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
          <option value="">— nezapojeno —</option>
          {options.map((n) => <option key={n} value={n}>{topoName(t, n)}</option>)}
        </select>
      </div>
    );
  }
  const all = [...FIXED_NODES, ...devices.map((d) => d.id)];
  const below = descendants(uplinks, all, nodeId);
  const options = devices.filter((d) => isL2(d) && d.id !== nodeId && !below.includes(d.id));
  const cur = uplinks[nodeId] ?? 'r2';
  const value = cur === '' || cur === 'r2' || options.some((o) => o.id === cur) ? cur : 'r2';
  return (
    <div>
      <label htmlFor={`${nodeId}-uplink`} className="block text-sm font-semibold text-ink mb-1">Připojeno k</label>
      <select
        id={`${nodeId}-uplink`}
        value={value}
        onChange={(e) => onUplink(nodeId, e.target.value)}
        className="w-full px-3 py-2 text-base border border-line-strong bg-surface text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
      >
        <option value="r2">Router 2 (LAN)</option>
        <option value="">— nezapojeno —</option>
        {options.map((d) => <option key={d.id} value={d.id}>{d.name} ({KIND_INFO[d.kind].label}{d.kind === 'ap' ? ' – Wi-Fi' : ''})</option>)}
      </select>
    </div>
  );
}

const AP_MODE_INFO: Record<ApMode, { label: string; text: string }> = {
  ap: { label: 'Access Point', text: 'Vysílá Wi-Fi. Zařízení se k němu připojí bezdrátově (v schématu čárkovaně), samotné AP se zapojí kabelem.' },
  client: { label: 'Klient', text: 'Připojí se bezdrátově k jinému AP a funguje jako Wi-Fi síťovka pro jedno kabelem připojené zařízení (PC, router…).' },
  bridge: { label: 'Bridge', text: 'Bezdrátový most: spojí se s jiným AP a propojí celou kabelovou síť za sebou do stejné podsítě (vrstva 2, bez směrování).' },
};

/** Switch / AP: bez IP konfigurace, jen propojují. Wi-Fi AP ve volném plátně má režimy a volitelný DHCP server. */
function L2Body(p: PanelProps & { device: Device }) {
  const d = p.device;
  const t = { devices: p.devices, uplinks: p.uplinks };
  const all = p.free ? freeNodes(p.devices) : [...FIXED_NODES, ...p.devices.map((x) => x.id)];
  const parent = (n: NodeId) => p.uplinks[n] ?? (p.free ? '' : 'r2');
  const children = all.filter((n) => parent(n) === d.id && n !== d.id);
  const nameOf = (id: NodeId) => (id === 'pc' ? 'Klientské PC' : p.devices.find((x) => x.id === id)?.name ?? id);
  const mode = apModeOf(d);
  return (
    <div className="space-y-0 bg-teal-50/50 dark:bg-teal-950/30">
      <div className="p-4 space-y-3">
        <UplinkSelect nodeId={d.id} {...p} />
        {p.free && d.kind === 'ap' && (
          <div>
            <div className="block text-sm font-semibold text-ink mb-1">Režim AP</div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Režim AP">
              {AP_MODES.map((m) => (
                <button key={m} type="button" onClick={() => p.onApMode(d.id, m)}
                  className={`px-2 py-2 rounded-lg border text-sm font-semibold transition ${mode === m ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-surface border-line-strong text-ink hover:bg-surface-2'}`}>
                  {AP_MODE_INFO[m].label}
                </button>
              ))}
            </div>
            <p className="text-sm text-ink-2 leading-snug bg-surface/80 border border-line rounded-lg p-2.5 mt-2">
              <strong>{AP_MODE_INFO[mode].label}:</strong> {AP_MODE_INFO[mode].text}
              {mode !== 'ap' && <> Zapojte ho k AP v režimu <strong>Access Point</strong>; zařízení za ním se připojují kabelem.</>}
            </p>
          </div>
        )}
        {!(p.free && d.kind === 'ap') && (
          <p className="text-sm text-ink-2 leading-snug bg-surface/80 border border-line rounded-lg p-2.5">
            {d.kind === 'switch'
              ? 'Switch pracuje na vrstvě 2 – nemá IP adresu a jen propojuje zařízení ve stejné podsíti. Zařízení k němu připojíte tažením kabelu (tečka dole na kartě) nebo v jejich nastavení v poli „Připojeno k“.'
              : 'Wi-Fi AP propojuje bezdrátová zařízení do stejné podsítě, sám nemá IP konfiguraci. Zařízení se k němu připojí v poli „Připojeno k“ (v schématu čárkovaně).'}
          </p>
        )}
        <div className="text-sm">
          <div className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-1">Připojená zařízení ({children.length})</div>
          {children.length ? (
            <ul className="space-y-1">{children.map((c) => <li key={c} className="font-mono text-ink">• {nameOf(c)}</li>)}</ul>
          ) : (
            <div className="text-ink-4 italic">Zatím nic.</div>
          )}
        </div>
      </div>
      {p.free && d.kind === 'ap' && mode === 'ap' && <ApDhcp {...p} device={d} owner={ownerOf(t, d.id)} />}
    </div>
  );
}

/** DHCP server na Wi-Fi AP: potřebuje vlastní adresu v síti a ručně zadanou bránu (adresu routeru). */
function ApDhcp(p: PanelProps & { device: Device; owner: NodeId | null }) {
  const id = p.device.id;
  const on = (p.cfg[`${id}-dhcp-on`] ?? '') === '1';
  const f = fieldMaker(p, 'dhcp');
  const ownerLan = p.owner && p.owner !== 'isp' ? analyzeInterface(p.cfg[`${p.owner}-lan-ip`] ?? '', p.cfg[`${p.owner}-lan-mask`] ?? '', p.cidr) : null;
  const err = p.errorFields.has(`${id}-dhcp-on`);
  const conflict = p.dhcpConflicts[id];
  return (
    <Section tone="dhcp" title="DHCP server na AP" side="volitelné">
      <div id={`box-${id}-dhcp-on`} className={`flex items-center gap-3 rounded-lg p-1.5 ${err ? 'ring-2 ring-rose-400 bg-rose-50 dark:bg-rose-950/50' : ''}`}>
        <Toggle checked={on} onChange={(c) => dhcpToggle(p, id, c, ownerLan?.valid ? ownerLan.ipStr : undefined)} label="DHCP server na AP" onColor="bg-teal-600" />
        <div className="text-sm text-ink leading-snug">
          <strong className="block text-ink">DHCP server {on ? 'zapnutý' : 'vypnutý'}</strong>
          AP přiděluje adresy klientům ve své síti.
        </div>
      </div>
      <DhcpWarn text={conflict} strong={!!conflict} />
      {on && (
        <>
          <div className={grid2}>{f(`${id}-lan-ip`, 'IP adresa AP')}{f(`${id}-lan-mask`, 'Maska podsítě', true)}</div>
          <div className={grid2}>{f(`${id}-dhcp-start`, 'Začátek rozsahu')}{f(`${id}-dhcp-end`, 'Konec rozsahu')}</div>
          <div className={grid2}>{f(`${id}-dhcp-gw`, 'Brána pro klienty')}{f(`${id}-dhcp-dns`, 'DNS server pro klienty')}</div>
          <p className="text-xs text-ink-2 leading-snug bg-surface/80 border border-line rounded-lg px-3 py-2">
            Brána pro klienty je adresa routeru v této síti{ownerLan?.valid ? <> (teď <span className="font-mono">{ownerLan.ipStr}</span>)</> : null}. AP musí mít adresu ze stejné podsítě a mimo rozsah DHCP.
          </p>
        </>
      )}
    </Section>
  );
}

const testBtn = 'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-base font-bold transition disabled:opacity-60 disabled:cursor-not-allowed';

function PingButton({ onClick }: { onClick: () => void }) {
  const running = useContext(RunningContext);
  return (
    <button type="button" onClick={onClick} disabled={running !== null} className={`${testBtn} bg-blue-600 hover:bg-blue-700`}>
      {running === 'ping' && <Loader2 className="w-5 h-5 animate-spin" />}
      {running === 'ping' ? 'Testuji…' : 'Ping do internetu z tohoto PC'}
    </button>
  );
}

function ServiceSection(p: PanelProps & { device: Device }) {
  const d = p.device;
  const running = useContext(RunningContext);
  const svc = fieldMaker(p, 'svc');
  const pub = (p.cfg[`${d.id}-pub`] ?? '').trim();
  const topId = p.free ? p.topRouter : 'r1';
  const wanIp = topId ? analyzeInterface(p.cfg[`${topId}-wan-ip`] ?? '', p.cfg[`${topId}-wan-mask`] ?? '', p.cidr) : { valid: false as const };
  const addr = `${wanIp.valid ? wanIp.ipStr : '<veřejná IP>'}:${pub || '<port>'}`;
  return (
    <Section tone="svc" title="Služba a přístup z internetu">
      <div className={grid2}>
        {svc(`${d.id}-pub`, d.kind === 'camera' ? 'Port kamery' : 'Port serveru')}
        <div>
          <div className="block text-sm font-semibold text-ink mb-1">Adresa pro klienta</div>
          <div className="font-mono text-sm break-all bg-surface border border-line rounded-lg px-3 py-2.5 text-ink">{addr}</div>
        </div>
      </div>
      <button type="button" onClick={() => p.onTestInbound(d.id)} disabled={running !== null} className={`${testBtn} bg-violet-600 hover:bg-violet-700`}>
        {running === `in:${d.id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />} {running === `in:${d.id}` ? 'Testuji…' : 'Otestovat přístup z internetu'}
      </button>
      <InboundPreviewCard deviceId={d.id} />
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
        className={`${inputBase} px-2.5 py-2 text-base focus:ring-violet-500 ${inputState(error)}`}
      />
    </div>
  );
}
