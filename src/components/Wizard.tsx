import { ChevronLeft, ChevronRight, Lightbulb, Play, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtMask, ipMask } from '../lib/format';
import { KIND_INFO, isL2, isServer, ruleField, type Config, type Device, type FieldId, type IspConfig, type NodeId, type Rules, type Scenario } from '../lib/model';
import { ipToLong, parseSubnetMask } from '../lib/net';
import { makePlan, solve, type Plan, type Solution } from '../lib/plan';

interface FillItem {
  id: FieldId;
  label: string;
  value: string;
  kind: 'ip' | 'mask' | 'text';
  prefix?: number;
}
interface Step {
  title: string;
  body: ReactNode;
  node?: NodeId;
  fields?: FieldId[];
  targetId?: string;
  fill?: FillItem[];
  center?: boolean;
  last?: boolean;
  next?: string;
  /** řádky pravidel PAT, které mají v zařízení existovat */
  ensure?: Rules;
  /** další tlačítka na posledním kroku (test přístupu z internetu) */
  extra?: { label: string; id: NodeId }[];
}

const B = ({ children }: { children: ReactNode }) => <strong className="text-ink">{children}</strong>;
const C = ({ children }: { children: ReactNode }) => (
  <code className="font-mono font-semibold text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 px-1 rounded">{children}</code>
);


const fillOf = (sol: Solution, id: FieldId, label: string, kind: FillItem['kind'] = 'ip', prefix?: number): FillItem => ({ id, label, value: sol.cfg[id] ?? '', kind, prefix });

function deviceSteps(d: Device, p: Plan, sol: Solution): Step[] {
  const info = KIND_INFO[d.kind];
  const maskPrefix = p.l2.prefix;
  const steps: Step[] = [
    {
      node: d.id, fields: [`${d.id}-ip`, `${d.id}-mask`],
      title: `${d.name}: adresa a maska`,
      body: <>Zařízení patří do sítě LAN 2 (za Routerem 2): <B>volná adresa</B> z této podsítě, <B>unikátní</B> (jiná než router, PC i ostatní zařízení), a <B>stejná maska</B>.<br /><span className="text-ink-3">Zkratka: tlačítko „Dle R2“ doplní zařízení automaticky.</span></>,
      fill: [fillOf(sol, `${d.id}-ip`, 'IPv4 adresa'), fillOf(sol, `${d.id}-mask`, 'Maska podsítě', 'mask', maskPrefix)],
    },
    {
      node: d.id, fields: [`${d.id}-gw`, `${d.id}-dns`],
      title: `${d.name}: brána a DNS`,
      body: <>Výchozí brána je <B>LAN adresa Routeru 2</B> (<C>{p.r2Lan}</C>) – přes ni zařízení odpovídá klientům mimo svou síť. Bez brány by požadavek došel, ale odpověď ne.</>,
      fill: [fillOf(sol, `${d.id}-gw`, 'Výchozí brána'), fillOf(sol, `${d.id}-dns`, 'DNS server')],
    },
  ];
  if (!isServer(d)) return steps;

  const pub = sol.cfg[`${d.id}-pub`];
  steps.push(
    {
      node: d.id, fields: [`${d.id}-pub`],
      title: d.kind === 'camera' ? `${d.name}: port kamery` : `${d.name}: veřejný port`,
      body: <>Zvenku se na veřejnou IP routeru připojuje jen přes číslo portu. Každé zařízení (kamera, server) proto potřebuje na veřejné adrese <B>svůj vlastní port</B>. Zvolte např. <C>{pub}</C>. Přístupová adresa se zobrazí pod polem.</>,
      fill: [fillOf(sol, `${d.id}-pub`, d.kind === 'camera' ? 'Port kamery' : 'Veřejný port', 'text')],
    },
    {
      node: 'r1', fields: [ruleField('r1', d.id, 'ext'), ruleField('r1', d.id, 'ip'), ruleField('r1', d.id, 'port')],
      ensure: { r1: [d.id], r2: [] },
      title: `PAT na Routeru 1 pro ${d.name}`,
      body: <>Router 1 vidí internet. Spojení na veřejný port <C>{pub}</C> přesměruje na <B>WAN adresu Routeru 2</B> (<C>{p.r2Wan}</C>) – o samotném zařízení neví nic, je schované za druhým routerem.</>,
      fill: [fillOf(sol, ruleField('r1', d.id, 'ext'), 'Vnější port', 'text'), fillOf(sol, ruleField('r1', d.id, 'ip'), 'Cílová IP'), fillOf(sol, ruleField('r1', d.id, 'port'), 'Cílový port', 'text')],
    },
    {
      node: 'r2', fields: [ruleField('r2', d.id, 'ext'), ruleField('r2', d.id, 'ip'), ruleField('r2', d.id, 'port')],
      ensure: { r1: [], r2: [d.id] },
      title: `PAT na Routeru 2 pro ${d.name}`,
      body: <>Router 2 přijme port <C>{pub}</C> od Routeru 1 a přesměruje ho na <B>IP zařízení</B> a <B>port jeho služby</B>: {d.kind === 'camera' ? <>port kamery = <C>{pub}</C></> : <>{info.service} = <C>{String(info.port)}</C></>}.</>,
      fill: [fillOf(sol, ruleField('r2', d.id, 'ext'), 'Vnější port', 'text'), fillOf(sol, ruleField('r2', d.id, 'ip'), 'Cílová IP'), fillOf(sol, ruleField('r2', d.id, 'port'), 'Cílový port', 'text')],
    },
  );
  return steps;
}

function buildSteps(p: Plan, sol: Solution, devices: Device[], cidr: boolean, scenario: Scenario | null): Step[] {
  const m = (prefix: number) => fmtMask(prefix, cidr);
  const net = (n: { net: string; prefix: number }) => ipMask(n.net, n.prefix, cidr);
  return [
    {
      center: true,
      title: 'Průvodce nastavením sítě',
      next: 'Začít',
      body: (
        <>
          Společně nastavíme <B>tři oddělené podsítě</B>: <em>ISP ↔ Router 1</em>, <em>Router 1 ↔ Router 2</em> a <em>Router 2 ↔ PC</em>.
          <br /><br />
          U každého kroku uvidíte, <strong>co</strong> a <strong>proč</strong> zadat. Chcete-li, zkuste si hodnotu vymyslet sami – nápovědu a řešení ukážete až tlačítkem.
        </>
      ),
    },
    {
      node: 'isp',
      targetId: 'panel-isp',
      title: 'Parametry poskytovatele (ISP)',
      body: (
        <>
          ISP vám dal pevné údaje: brána <C>{p.ispGw}</C>, maska <C>{m(p.ispPrefix)}</C> a DNS <C>{p.dns}</C>. Ty neměníte – podle nich nastavíte Router 1.
          <br /><br />
          Router 1 se musí dostat do <B>stejné podsítě jako brána ISP</B>.
          {scenario && (
            <>
              <br /><br />
              Zadání dál vyžaduje: LAN 1 = <C>{net(p.l1)}</C>, LAN 2 = <C>{net(p.l2)}</C>.
            </>
          )}
        </>
      ),
    },
    {
      node: 'r1', fields: ['r1-wan-ip', 'r1-wan-mask'],
      title: 'Router 1 – WAN: adresa a maska',
      body: (
        <>
          WAN port míří k ISP, proto potřebuje <B>volnou adresu ze stejné podsítě</B> jako brána ISP (<C>{p.ispGw}</C>) a <B>stejnou masku</B>.
          <br />Adresa nesmí být adresa sítě, broadcast ani adresa brány.
        </>
      ),
      fill: [
        { id: 'r1-wan-ip', label: 'IPv4 adresa', value: p.r1Wan, kind: 'ip' },
        { id: 'r1-wan-mask', label: 'Maska podsítě', value: m(p.ispPrefix), kind: 'mask', prefix: p.ispPrefix },
      ],
    },
    {
      node: 'r1', fields: ['r1-wan-gw', 'r1-wan-dns'],
      title: 'Router 1 – WAN: brána a DNS',
      body: <>Router 1 posílá vše „ven“ na <B>bránu poskytovatele</B> – je to jediná cesta do internetu. DNS server vyplňte podle ISP.</>,
      fill: [
        { id: 'r1-wan-gw', label: 'Výchozí brána', value: p.ispGw, kind: 'ip' },
        { id: 'r1-wan-dns', label: 'DNS server', value: p.dns, kind: 'ip' },
      ],
    },
    {
      node: 'r1', fields: ['r1-lan-ip', 'r1-lan-mask'],
      title: 'Router 1 – LAN 1: první vnitřní síť',
      body: (
        <>
          Mezi Router 1 a Router 2 vzniká <B>nová, samostatná podsíť</B> <C>{net(p.l1)}</C>. Nesmí se překrývat s podsítí ISP.
          <br />Router 1 si vezme <B>první použitelnou adresu</B> v této síti. Kalkulačka pod polem ukáže adresu sítě a broadcast.
        </>
      ),
      fill: [
        { id: 'r1-lan-ip', label: 'IPv4 adresa', value: p.r1Lan, kind: 'ip' },
        { id: 'r1-lan-mask', label: 'Maska podsítě', value: m(p.l1.prefix), kind: 'mask', prefix: p.l1.prefix },
      ],
    },
    {
      node: 'r2', fields: ['r2-wan-ip', 'r2-wan-mask'],
      title: 'Router 2 – WAN: adresa a maska',
      body: <>Pro Router 1 je Router 2 „klient“. Jeho WAN port proto musí ležet ve <B>stejné podsíti jako LAN 1 Routeru 1</B> (<C>{net(p.l1)}</C>) a mít jinou adresu než Router 1.</>,
      fill: [
        { id: 'r2-wan-ip', label: 'IPv4 adresa', value: p.r2Wan, kind: 'ip' },
        { id: 'r2-wan-mask', label: 'Maska podsítě', value: m(p.l1.prefix), kind: 'mask', prefix: p.l1.prefix },
      ],
    },
    {
      node: 'r2', fields: ['r2-wan-gw', 'r2-wan-dns'],
      title: 'Router 2 – WAN: brána a DNS',
      body: <>Výchozí brána Routeru 2 je <B>LAN adresa Routeru 1</B> (<C>{p.r1Lan}</C>) – tam posílá všechno, co nezná. DNS opět podle ISP.</>,
      fill: [
        { id: 'r2-wan-gw', label: 'Výchozí brána', value: p.r1Lan, kind: 'ip' },
        { id: 'r2-wan-dns', label: 'DNS server', value: p.dns, kind: 'ip' },
      ],
    },
    {
      node: 'r2', fields: ['r2-lan-ip', 'r2-lan-mask'],
      title: 'Router 2 – LAN 2: síť pro počítač',
      body: (
        <>
          Třetí podsíť <C>{net(p.l2)}</C> pro klientské PC. Musí být <B>jiná než WAN i LAN 1</B> – jinak by se podsítě překrývaly a router by nevěděl, kam paket poslat.
          <br />Router 2 opět dostane první použitelnou adresu.
        </>
      ),
      fill: [
        { id: 'r2-lan-ip', label: 'IPv4 adresa', value: p.r2Lan, kind: 'ip' },
        { id: 'r2-lan-mask', label: 'Maska podsítě', value: m(p.l2.prefix), kind: 'mask', prefix: p.l2.prefix },
      ],
    },
    {
      node: 'pc', fields: ['pc-ip', 'pc-mask'],
      title: 'Klientské PC: adresa a maska',
      body: (
        <>
          PC patří do sítě LAN 2: <B>volná adresa</B> ze stejné podsítě jako LAN port Routeru 2 (ne adresa routeru, sítě ani broadcast) a <B>stejná maska</B>.
          <br /><span className="text-ink-3">Zkratka: tlačítko „Dle R2“ doplní celé PC automaticky.</span>
        </>
      ),
      fill: [
        { id: 'pc-ip', label: 'IPv4 adresa PC', value: p.pc, kind: 'ip' },
        { id: 'pc-mask', label: 'Maska podsítě', value: m(p.l2.prefix), kind: 'mask', prefix: p.l2.prefix },
      ],
    },
    {
      node: 'pc', fields: ['pc-gw', 'pc-dns'],
      title: 'Klientské PC: brána a DNS',
      body: <>Výchozí brána počítače je <B>LAN adresa Routeru 2</B> (<C>{p.r2Lan}</C>) – přes ni PC komunikuje mimo svou síť. DNS podle ISP.</>,
      fill: [
        { id: 'pc-gw', label: 'Výchozí brána', value: p.r2Lan, kind: 'ip' },
        { id: 'pc-dns', label: 'DNS server', value: p.dns, kind: 'ip' },
      ],
    },
    ...devices.filter((d) => !isL2(d)).flatMap((d): Step[] => deviceSteps(d, p, sol)),
    {
      last: true,
      targetId: 'btn-run-test',
      title: 'Hotovo – otestujte spojení',
      next: 'Otestovat připojení (Ping)',
      extra: devices.filter(isServer).map((d) => ({ label: `Zvenku: ${d.name}`, id: d.id })),
      body: <>Všechna zařízení jsou nastavena. Paket teď vyšle ping z PC přes Router 2 a Router 1 až k serveru <C>{p.dns}</C>. Pokud něco nesedí, průvodce vás vrátí k chybnému zařízení.</>,
    },
  ];
}

interface Props {
  cfg: Config;
  isp: IspConfig;
  scenario: Scenario | null;
  cidr: boolean;
  devices: Device[];
  onFill: (values: Partial<Config>) => void;
  onEnsureRules: (rules: Rules) => void;
  onOpenNode: (id: NodeId | null) => void;
  onClose: () => void;
  onFinish: () => void;
  onRunInbound: (id: NodeId) => void;
}

interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

export default function Wizard({ cfg, isp, scenario, cidr, devices, onFill, onEnsureRules, onOpenNode, onClose, onFinish, onRunInbound }: Props) {
  const steps = useMemo(
    () => buildSteps(makePlan(isp, scenario), solve(isp, scenario, devices, cidr), devices, cidr, scenario),
    [isp, scenario, cidr, devices],
  );
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const step = steps[i];
  const cardRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const targetRect = useCallback((s: Step): Rect | null => {
    const els: HTMLElement[] = [];
    if (s.fields) s.fields.forEach((f) => { const el = document.getElementById(`box-${f}`); if (el) els.push(el); });
    else if (s.targetId) { const el = document.getElementById(s.targetId); if (el) els.push(el); }
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }, []);

  const layout = useCallback(() => {
    const hole = holeRef.current, card = cardRef.current;
    if (!hole || !card) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = targetRect(step);
    const pad = 8, gap = 16;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    if (!r) {
      Object.assign(hole.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
      Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${Math.max(12, (vh - ch) / 2)}px`, right: 'auto', bottom: 'auto', width: '' });
      return;
    }
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    if (vw < 700) {
      Object.assign(card.style, { left: '12px', right: '12px', top: 'auto', bottom: '12px', width: 'auto' });
      return;
    }
    card.style.width = ''; card.style.right = 'auto'; card.style.bottom = 'auto';
    let x: number, y: number;
    if (r.right + pad + gap + cw <= vw - 12) { x = r.right + pad + gap; y = r.top; }
    else if (r.left - pad - gap - cw >= 12) { x = r.left - pad - gap - cw; y = r.top; }
    else if (r.bottom + pad + gap + ch <= vh - 12) { x = r.left; y = r.bottom + pad + gap; }
    else { x = r.left; y = r.top - pad - gap - ch; }
    card.style.left = `${clamp(x, 12, vw - cw - 12)}px`;
    card.style.top = `${clamp(y, 12, vh - ch - 12)}px`;
  }, [step, targetRect]);

  const ensureVisible = useCallback(() => {
    const r = targetRect(step);
    if (!r) return;
    const vh = window.innerHeight, mobile = window.innerWidth < 700;
    const minTop = 90, maxBottom = mobile ? vh - 320 : vh - 24;
    if (r.top < minTop || r.bottom > maxBottom) window.scrollBy({ top: r.top - (mobile ? 110 : vh * 0.28), behavior: 'smooth' });
  }, [step, targetRect]);

  // Změna kroku: otevřít zařízení, odscrollovat, sledovat animaci rozbalení
  useEffect(() => {
    if (step.ensure) onEnsureRules(step.ensure);
    if (step.node) onOpenNode(step.node);
    const t1 = setTimeout(ensureVisible, 120);
    const t2 = setTimeout(() => {
      ensureVisible();
      if (step.fields && window.innerWidth >= 700) document.getElementById(step.fields[0])?.focus({ preventScroll: true });
    }, 700);
    const end = performance.now() + 1100;
    const tick = () => {
      layout();
      if (performance.now() < end) rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => { layout(); });

  useEffect(() => {
    const on = () => layout();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, { passive: true });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on);
      document.removeEventListener('keydown', key);
    };
  }, [layout, onClose]);

  const go = (d: number) => {
    const ni = Math.max(0, Math.min(steps.length - 1, i + d));
    if (ni === i) return;
    setI(ni);
    setRevealed(false);
  };

  const fieldState = (f: FillItem): 'empty' | 'ok' | 'bad' => {
    const v = (cfg[f.id] ?? '').trim();
    if (!v) return 'empty';
    if (f.kind === 'mask') { const mk = parseSubnetMask(v, cidr); return mk && mk.prefix === f.prefix ? 'ok' : 'bad'; }
    if (f.kind === 'text') return v === f.value.trim() ? 'ok' : 'bad';
    const a = ipToLong(v), b = ipToLong(f.value);
    return a !== null && a === b ? 'ok' : 'bad';
  };
  const states = step.fill?.map(fieldState) ?? [];
  const status = states.every((s) => s === 'ok')
    ? { cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 font-semibold', text: '✓ Hodnoty v zařízení jsou správně' }
    : states.some((s) => s === 'bad')
      ? { cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800 font-semibold', text: 'Zatím to nesedí – zkontrolujte hodnoty' }
      : { cls: 'bg-surface-2 text-ink-2 border-line', text: 'Vyplňte zvýrazněná pole v zařízení' };

  const nextLabel = step.next ?? (i === steps.length - 1 ? 'Dokončit' : 'Další');

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" role="dialog" aria-label="Průvodce nastavením sítě" data-wizard>
      <div
        ref={holeRef}
        className="fixed rounded-[14px] pointer-events-none transition-[left,top,width,height] duration-300 shadow-[0_0_0_9999px_rgba(15,23,42,0.66),0_0_0_3px_#60a5fa,0_0_22px_4px_rgba(96,165,250,0.65)]"
      />
      <div
        ref={cardRef}
        aria-live="polite"
        className="fixed w-[26rem] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto pointer-events-auto bg-surface rounded-2xl shadow-2xl border border-line transition-[left,top] duration-300"
      >
        <div className="px-5 pt-4 pb-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 rounded-full">
              Krok {i + 1} / {steps.length}
            </span>
            <button onClick={onClose} className="p-1 -mr-1 rounded-md text-ink-4 hover:text-ink hover:bg-surface-3 transition" aria-label="Zavřít průvodce" title="Zavřít (Esc)">
              <X className="w-5 h-5" />
            </button>
          </div>
          <h4 className="font-bold text-xl text-ink leading-snug">{step.title}</h4>
          <p className="text-base text-ink-2 leading-relaxed">{step.body}</p>

          {step.fill && (
            <>
              <div className="rounded-lg border border-line bg-surface-2 divide-y divide-line text-sm">
                {step.fill.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-ink-3">{f.label}</span>
                    <span className={`font-mono font-bold ${revealed ? 'text-ink' : 'text-ink-4 select-none'}`}>{revealed ? f.value : '• • • • • •'}</span>
                  </div>
                ))}
              </div>
              <div className={`text-sm rounded-lg px-3 py-2 border ${status.cls}`}>{status.text}</div>
              {revealed ? (
                <button
                  onClick={() => { onFill(Object.fromEntries(step.fill!.map((f) => [f.id, f.value])) as Partial<Config>); }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  <Wand2 className="w-4 h-4" /> Vyplnit za mě
                </button>
              ) : (
                <button
                  onClick={() => setRevealed(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition"
                >
                  <Lightbulb className="w-4 h-4" /> Ukázat řešení
                </button>
              )}
            </>
          )}

          {step.extra?.map((x) => (
            <button key={x.id} onClick={() => onRunInbound(x.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition">
              {x.label}
            </button>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => go(-1)}
              disabled={i === 0}
              className="inline-flex items-center gap-1 px-3.5 py-2.5 text-sm font-semibold rounded-lg border border-line-strong text-ink hover:bg-surface-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Zpět
            </button>
            <button
              onClick={step.last ? onFinish : () => go(1)}
              className="inline-flex items-center gap-1 px-5 py-2.5 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              {nextLabel} {step.last ? <Play className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="h-1.5 bg-surface-3"><div className="h-1.5 bg-blue-500 transition-all" style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
      </div>
    </div>
  );
}
