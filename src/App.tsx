import { ClipboardList, Network, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Diagnostics, { type Tone } from './components/Diagnostics';
import type { Status } from './components/DeviceCard';
import { CARD_H } from './components/DeviceCard';
import Header, { FONT_PX, type FontKey } from './components/Header';
import Topology, { type LayoutApi, type PacketState, type Pos } from './components/Topology';
import Wizard from './components/Wizard';
import { useLocalStorage, useViewportRem } from './hooks';
import { fmtMask, ipMask } from './lib/format';
import {
  DEFAULT_ISP, NODE_ORDER, SCENARIOS, emptyConfig, nodeOfField, sampleConfig,
  type Config, type FieldId, type IspConfig, type LinkId, type LogItem, type NodeId, type Scenario,
} from './lib/model';
import { analyzeInterface } from './lib/net';
import { makePlan } from './lib/plan';
import { simulate } from './lib/simulate';

const INFO_LOG: LogItem[] = [{
  type: 'info',
  title: 'Připraveno',
  text: 'Klikněte na zařízení a vyplňte jeho IP konfiguraci (nebo spusťte Průvodce). Potom klikněte na „Otestovat připojení (Ping)“.',
}];

const idleNodes = (): Record<NodeId, Status> => ({ isp: 'idle', r1: 'idle', r2: 'idle', pc: 'idle' });
const idleLinks = (): Record<LinkId, 'idle' | 'ok'> => ({ 'link-r1-isp': 'idle', 'link-r2-r1': 'idle', 'link-pc-r2': 'idle' });

const defaultPos = (): Record<NodeId, Pos> =>
  Object.fromEntries(NODE_ORDER.map((id, i) => [id, { x: 1.5, y: 2 + i * (CARD_H + 4) }])) as Record<NodeId, Pos>;

type Mode = 'default' | 'sample' | 'scenario';

export default function App() {
  const [cfg, setCfg] = useState<Config>(emptyConfig);
  const [isp, setIsp] = useState<IspConfig>(DEFAULT_ISP);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<Mode>('default');
  const [cidr, setCidr] = useLocalStorage('netroute.cidr', false);
  const [font, setFont] = useLocalStorage<FontKey>('netroute.font', 'large');
  const [positions, setPositions] = useLocalStorage<Record<NodeId, Pos>>('netroute.layout.v1', defaultPos());
  const [showCalc, setShowCalc] = useState(true);
  const [openNode, setOpenNode] = useState<NodeId | null>(null);
  const [wizard, setWizard] = useState(false);

  const [nodeStatus, setNodeStatus] = useState(idleNodes);
  const [linkStatus, setLinkStatus] = useState(idleLinks);
  const [packet, setPacket] = useState<PacketState | null>(null);
  const [errorFields, setErrorFields] = useState<Set<FieldId>>(new Set());
  const [logs, setLogs] = useState<LogItem[]>(INFO_LOG);
  const [badge, setBadge] = useState<{ text: string; tone: Tone }>({ text: 'Čeká na spuštění testu', tone: 'neutral' });
  const timer = useRef<number | undefined>(undefined);

  const rootPx = FONT_PX[font];
  const wide = useViewportRem(rootPx) >= 80;
  const fmt = useCallback((a: string, p: number) => ipMask(a, p, cidr), [cidr]);

  useEffect(() => { document.documentElement.style.fontSize = `${rootPx}px`; }, [rootPx]);

  // --- rozmístění zařízení (drag & drop) ---
  const layout: LayoutApi = {
    pos: positions,
    setPos: (id, x, y) => setPositions((prev) => ({ ...prev, [id]: { x, y } })),
    reset: () => setPositions(defaultPos()),
  };

  // --- zavření otevřeného uzlu kliknutím do prostoru ---
  useEffect(() => {
    if (!openNode || wizard) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(`[data-node-root="${openNode}"]`)) return;
      setOpenNode(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenNode(null); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [openNode, wizard]);

  // --- běh simulace ---
  const stopAnim = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  const resetVisual = useCallback(() => {
    stopAnim();
    setNodeStatus(idleNodes());
    setLinkStatus(idleLinks());
    setPacket(null);
    setErrorFields(new Set());
  }, []);
  useEffect(() => () => stopAnim(), []);

  const onField = (id: FieldId, value: string) => {
    stopAnim();
    setPacket(null);
    setErrorFields((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
    setCfg((c) => ({ ...c, [id]: value }));
  };

  const fillFields = (values: Partial<Config>) => {
    stopAnim();
    setPacket(null);
    setErrorFields(new Set());
    setCfg((c) => ({ ...c, ...values }));
  };

  const runTest = () => {
    resetVisual();
    const res = simulate(cfg, isp, scenario, cidr, fmt);
    const order: NodeId[] = ['pc', 'r2', 'r1', 'isp'];
    const links: LinkId[] = ['link-pc-r2', 'link-r2-r1', 'link-r1-isp'];
    const stopIdx = order.indexOf(res.stopNode);
    let step = 0;
    setPacket({ node: 'pc', kind: 'run', label: 'ICMP Ping...' });

    const advance = () => {
      const cur = order[step];
      if (step < stopIdx) {
        const link = links[step];
        setNodeStatus((s) => ({ ...s, [cur]: 'ok' }));
        setLinkStatus((s) => ({ ...s, [link]: 'ok' }));
        step++;
        setPacket({ node: order[step], kind: 'run', label: 'ICMP Ping...' });
        timer.current = window.setTimeout(advance, 650);
        return;
      }
      setLogs(res.logs);
      if (res.ok) {
        setNodeStatus((s) => ({ ...s, [cur]: 'ok' }));
        setPacket({ node: cur, kind: 'ok', label: '✓ Pong (OK)' });
        setBadge({ text: 'Připojení k internetu je funkční!', tone: 'success' });
      } else {
        setNodeStatus((s) => ({ ...s, [cur]: 'error' }));
        setPacket({ node: cur, kind: 'error', label: '✕ Paket zahozen' });
        setBadge({ text: 'Nalezena chyba v konfiguraci sítě', tone: 'error' });
        setErrorFields(new Set(res.errorFields));
        // otevřeme zařízení s chybou: nejdřív to, kde paket skončil, jinak první zařízení s chybným polem
        const owners = res.errorFields.map(nodeOfField);
        setOpenNode(owners.includes(res.stopNode) || !owners.length ? res.stopNode : owners[0]);
      }
    };
    timer.current = window.setTimeout(advance, 120);
  };

  // --- akce v hlavičce ---
  const resetRun = (text = 'Čeká na spuštění testu') => {
    resetVisual();
    setLogs(INFO_LOG);
    setBadge({ text, tone: 'neutral' });
  };

  const loadSample = () => {
    resetRun();
    setScenario(null);
    setIsp(DEFAULT_ISP);
    setMode('sample');
    setCfg(sampleConfig());
  };

  const clearAll = () => {
    resetRun('Připraveno k zadání');
    setCfg(emptyConfig());
    setLogs([{ type: 'info', title: 'Konfigurace vymazána', text: 'Všechna konfigurační pole byla vyčištěna. Můžete začít znovu.' }]);
  };

  const randomScenario = () => {
    resetRun();
    let chosen = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    if (scenario && chosen.title === scenario.title) chosen = SCENARIOS[(SCENARIOS.indexOf(chosen) + 1) % SCENARIOS.length];
    setScenario(chosen);
    setIsp({ gwIp: chosen.ispGw, gwMask: chosen.ispMask, dnsIp: chosen.ispDns });
    setMode('scenario');
    setCfg(emptyConfig());
  };

  const autoFillPc = () => {
    const r2 = analyzeInterface(cfg['r2-lan-ip'], cfg['r2-lan-mask'], cidr);
    if (!r2.valid || !r2.isHostUsable) {
      setLogs([{ type: 'error', title: 'Nelze automaticky vyplnit PC', text: 'Nejprve zadejte platnou použitelnou IP adresu a masku na vnitřním rozhraní (LAN 2) Routeru 2.' }]);
      setBadge({ text: 'Chyba předvyplnění', tone: 'error' });
      return;
    }
    let cand = r2.networkLong + 10;
    if (cand >= r2.broadcastLong || cand === r2.ipLong) cand = r2.ipLong + 1 < r2.broadcastLong ? r2.ipLong + 1 : r2.ipLong - 1;
    if (cand <= r2.networkLong || cand >= r2.broadcastLong) {
      setLogs([{ type: 'error', title: 'Příliš malá podsíť na Routeru 2', text: 'V zadané podsíti nezbývá volná adresa pro klientské PC.' }]);
      setBadge({ text: 'Chyba rozsahu', tone: 'error' });
      return;
    }
    const ip = [(cand >>> 24) & 255, (cand >>> 16) & 255, (cand >>> 8) & 255, cand & 255].join('.');
    fillFields({ 'pc-ip': ip, 'pc-mask': fmtMask(r2.prefix, cidr), 'pc-gw': r2.ipStr, 'pc-dns': isp.dnsIp });
  };

  // --- zadání ---
  const C = ({ children }: { children: ReactNode }) => (
    <code className="font-mono font-semibold text-blue-900 bg-white px-1.5 py-0.5 rounded border border-blue-200">{children}</code>
  );
  let title = 'Základní kaskádové propojení dvou routerů';
  let description: ReactNode = (
    <>Nakonfigurujte zařízení (<strong>Router 1</strong>, <strong>Router 2</strong> a <strong>Klientské PC</strong>) tak, aby koncový počítač mohl komunikovat s internetem (cílový server <C>{isp.dnsIp}</C>). Vytvořte tři oddělené IP podsítě. Kliknutím na zařízení otevřete jeho nastavení.</>
  );
  let chips: ReactNode = null;
  if (mode === 'sample') {
    const p = makePlan(DEFAULT_ISP, null);
    title = 'Vzorové funkční zapojení (Double NAT)';
    description = (
      <>Všechny tři podsítě jsou správně odděleny: <strong>ISP ↔ R1</strong> (<C>{ipMask('85.160.10.0', p.ispPrefix, cidr)}</C>), <strong>R1 ↔ R2</strong> (<C>{ipMask('192.168.1.0', 24, cidr)}</C>) a <strong>R2 ↔ PC</strong> (<C>{ipMask('10.0.0.0', 24, cidr)}</C>). Klikněte na <strong>Otestovat připojení</strong>.</>
    );
  } else if (mode === 'scenario' && scenario) {
    const ispI = analyzeInterface(scenario.ispGw, scenario.ispMask, true);
    const ispPrefix = ispI.valid ? ispI.prefix : 24;
    title = scenario.title;
    description = (
      <>Připojte síť k ISP bráně <C>{ipMask(scenario.ispGw, ispPrefix, cidr)}</C> (DNS <C>{scenario.ispDns}</C>) a dodržte zadané adresní rozsahy pro obě vnitřní sítě:</>
    );
    const chip = 'px-3 py-1.5 rounded-lg bg-white border text-slate-700 font-medium text-sm';
    chips = (
      <div className="flex flex-wrap gap-2 pt-1">
        <span className={`${chip} border-blue-200`}>1. ISP síť: <strong className="font-mono text-blue-700">{ipMask(scenario.ispGw, ispPrefix, cidr)}</strong></span>
        <span className={`${chip} border-emerald-200`}>2. Síť LAN 1 (mezi R1 a R2): <strong className="font-mono text-emerald-700">{ipMask(scenario.lan1RequiredNet, scenario.lan1RequiredPrefix, cidr)}</strong></span>
        <span className={`${chip} border-indigo-200`}>3. Síť LAN 2 (mezi R2 a PC): <strong className="font-mono text-indigo-700">{ipMask(scenario.lan2RequiredNet, scenario.lan2RequiredPrefix, cidr)}</strong></span>
      </div>
    );
  }

  const diag = <Diagnostics logs={logs} badge={badge.text} tone={badge.tone} className={wide ? 'sticky top-4' : ''} />;

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100 selection:text-blue-900">
      <Header
        showCalc={showCalc}
        onToggleCalc={() => setShowCalc((v) => !v)}
        onWizard={() => setWizard(true)}
        onRandom={randomScenario}
        onSample={loadSample}
        onClear={clearAll}
        cidr={cidr}
        onCidr={setCidr}
        font={font}
        onFont={setFont}
        onResetLayout={layout.reset}
      />

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-3 sm:px-6 py-5 space-y-5">
        <section className="bg-gradient-to-r from-indigo-50 via-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                <ClipboardList className="w-3.5 h-3.5" /> Zadání úlohy
              </span>
              <span className="text-base font-semibold text-slate-800">{title}</span>
            </div>
            <p className="text-base text-slate-700 leading-relaxed">{description}</p>
            {chips}
          </div>
          <button id="btn-run-test" onClick={runTest}
            className="shrink-0 w-full lg:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-md shadow-blue-600/20">
            <Play className="w-5 h-5 fill-current" /> Otestovat připojení (Ping)
          </button>
        </section>

        <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start' : 'space-y-5'}>
          <section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Network className="w-5 h-5 text-blue-600" /> Topologie sítě</h2>
                <p className="text-sm text-slate-500 mt-0.5">Klikněte na zařízení – jeho nastavení vyjede do strany. Zařízení můžete přetahovat. Kliknutím mimo nastavení zavřete.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-blue-100 border border-blue-400 inline-block" /> WAN port (vnější)</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-emerald-100 border border-emerald-400 inline-block" /> LAN port (vnitřní)</span>
              </div>
            </div>
            <Topology
              cfg={cfg}
              onField={onField}
              errorFields={errorFields}
              isp={isp}
              cidr={cidr}
              showCalc={showCalc}
              openNode={openNode}
              onToggleNode={(id) => setOpenNode((cur) => (cur === id ? null : id))}
              onCloseNode={() => setOpenNode(null)}
              nodeStatus={nodeStatus}
              linkStatus={linkStatus}
              packet={packet}
              onDismissPacket={() => { stopAnim(); setPacket(null); }}
              rootPx={rootPx}
              onAutoFillPc={autoFillPc}
              layout={layout}
            />
          </section>
          {diag}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 mt-8">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500">
          <p>Interaktivní pomůcka pro výuku počítačových sítí • Směrování IPv4, masky podsítí a Double NAT</p>
          <p className="font-mono text-slate-400">{cidr ? 'Formát masek: dekadicky (255.255.255.0) i lomeně (/24)' : 'Formát masek: dekadicky (255.255.255.0)'}</p>
        </div>
      </footer>

      {wizard && (
        <Wizard
          cfg={cfg}
          isp={isp}
          scenario={scenario}
          cidr={cidr}
          onFill={fillFields}
          onOpenNode={setOpenNode}
          onClose={() => setWizard(false)}
          onFinish={() => { setWizard(false); runTest(); }}
        />
      )}
    </div>
  );
}
