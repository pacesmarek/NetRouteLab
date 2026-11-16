import { ClipboardList, Network, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import DevicePalette from './components/DevicePalette';
import Diagnostics, { type Tone } from './components/Diagnostics';
import { CARD_H, CARD_W, type Status } from './components/DeviceCard';
import Header, { FONT_PX, type FontKey, type ThemeKey } from './components/Header';
import Topology, { type LayoutApi, type PacketState, type Pos } from './components/Topology';
import Wizard from './components/Wizard';
import { useLocalStorage, useViewportRem } from './hooks';
import { fmtMask, ipMask } from './lib/format';
import {
  DEFAULT_ISP, KIND_INFO, SCENARIOS, emptyConfig, emptyRules, linkOf, nodeOfField,
  type Config, type Device, type DeviceKind, type FieldId, type IspConfig, type LinkId, type LogItem, type NodeId, type RouterId, type Rules, type Scenario,
} from './lib/model';
import { analyzeInterface, ipToLong, longToIp } from './lib/net';
import { makePlan, solve } from './lib/plan';
import { PC_CLIENT, simulate, simulateInbound, type Other, type SimResult } from './lib/simulate';

const INFO_LOG: LogItem[] = [{
  type: 'info',
  title: 'Připraveno',
  text: 'Klikněte na zařízení a vyplňte jeho IP konfiguraci (nebo spusťte Průvodce). Potom klikněte na „Otestovat připojení (Ping)“.',
}];

const DEV_SUFFIXES = ['ip', 'mask', 'gw', 'dns', 'pub'] as const;

const defaultFixedPos = (): Record<NodeId, Pos> => ({
  isp: { x: 1.5, y: 2 },
  r1: { x: 1.5, y: 2 + (CARD_H + 4) },
  r2: { x: 1.5, y: 2 + 2 * (CARD_H + 4) },
  pc: { x: 1.5, y: 2 + 3 * (CARD_H + 4) },
});
/** Přidaná zařízení se řadí do mřížky pod Routerem 2 vedle PC (PC je ve sloupci 0, aby kabel nevypadal jako řetěz). */
const defaultDevicePos = (index: number, cols: number): Pos => {
  const perRow = Math.max(1, cols - 1);
  const col = cols === 1 ? 0 : 1 + (index % perRow);
  const row = cols === 1 ? index + 1 : Math.floor(index / perRow);
  return { x: 1.5 + col * (CARD_W + 2), y: 2 + 3 * (CARD_H + 4) + row * (CARD_H + 3) };
};

type Mode = 'default' | 'sample' | 'scenario';

export default function App() {
  const [cfg, setCfg] = useState<Config>(emptyConfig);
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Rules>(emptyRules);
  const [isp, setIsp] = useState<IspConfig>(DEFAULT_ISP);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<Mode>('default');
  const [cidr, setCidr] = useLocalStorage('netroute.cidr', false);
  const [font, setFont] = useLocalStorage<FontKey>('netroute.font', 'large');
  const [theme, setTheme] = useLocalStorage<ThemeKey>('netroute.theme', 'system');
  const [positions, setPositions] = useLocalStorage<Record<NodeId, Pos>>('netroute.layout.v2', {});
  const [showCalc, setShowCalc] = useState(true);
  const [openNode, setOpenNode] = useState<NodeId | null>(null);
  const [wizard, setWizard] = useState(false);

  const [nodeStatus, setNodeStatus] = useState<Record<NodeId, Status>>({});
  const [linkStatus, setLinkStatus] = useState<Record<LinkId, 'idle' | 'ok'>>({});
  const [packet, setPacket] = useState<PacketState | null>(null);
  const [errorFields, setErrorFields] = useState<Set<FieldId>>(new Set());
  const [logs, setLogs] = useState<LogItem[]>(INFO_LOG);
  const [badge, setBadge] = useState<{ text: string; tone: Tone }>({ text: 'Čeká na spuštění testu', tone: 'neutral' });
  const timer = useRef<number | undefined>(undefined);
  const devCounter = useRef(1);
  const ruleCounter = useRef(1);

  const rootPx = FONT_PX[font];
  const viewRem = useViewportRem(rootPx);
  const wide = viewRem >= 80;
  const cols = viewRem >= 62 ? 3 : viewRem >= 40 ? 2 : 1;
  const fmt = useCallback((a: string, p: number) => ipMask(a, p, cidr), [cidr]);

  useEffect(() => { document.documentElement.style.fontSize = `${rootPx}px`; }, [rootPx]);

  // --- motiv (světlý / tmavý / podle systému) ---
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // --- rozmístění zařízení (drag & drop) ---
  const defaults: Record<NodeId, Pos> = { ...defaultFixedPos() };
  devices.forEach((d, i) => { defaults[d.id] = defaultDevicePos(i, cols); });
  const layout: LayoutApi = {
    pos: { ...defaults, ...Object.fromEntries(Object.entries(positions).filter(([k]) => k in defaults)) },
    setPos: (id, x, y) => setPositions((prev) => ({ ...prev, [id]: { x, y } })),
    reset: () => setPositions({}),
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
    setNodeStatus({});
    setLinkStatus({});
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
    setCfg((c) => ({ ...c, ...(values as Config) }));
  };

  /** Animace průchodu paketu po `path` (po `links`) a vyhodnocení výsledku. */
  const animate = (path: NodeId[], links: LinkId[], res: SimResult, labels: { run: string; ok: string; err: string; badgeOk: string }) => {
    resetVisual();
    const stopIdx = Math.max(0, path.indexOf(res.stopNode));
    let step = 0;
    setPacket({ node: path[0], kind: 'run', label: labels.run });

    const advance = () => {
      const cur = path[step];
      if (step < stopIdx) {
        const link = links[step];
        setNodeStatus((s) => ({ ...s, [cur]: 'ok' }));
        setLinkStatus((s) => ({ ...s, [link]: 'ok' }));
        step++;
        setPacket({ node: path[step], kind: 'run', label: labels.run });
        timer.current = window.setTimeout(advance, 650);
        return;
      }
      setLogs(res.logs);
      if (res.ok) {
        setNodeStatus((s) => ({ ...s, [cur]: 'ok' }));
        setPacket({ node: cur, kind: 'ok', label: labels.ok });
        setBadge({ text: labels.badgeOk, tone: 'success' });
      } else {
        setNodeStatus((s) => ({ ...s, [cur]: 'error' }));
        setPacket({ node: cur, kind: 'error', label: labels.err });
        setBadge({ text: 'Nalezena chyba v konfiguraci sítě', tone: 'error' });
        setErrorFields(new Set(res.errorFields));
        // otevřeme zařízení s chybou: nejdřív to, kde paket skončil, jinak první zařízení s chybným polem
        const owners = res.errorFields.map(nodeOfField);
        setOpenNode(owners.includes(res.stopNode) || !owners.length ? res.stopNode : owners[0]);
      }
    };
    timer.current = window.setTimeout(advance, 120);
  };

  const othersFor = (selfId: NodeId): Other[] => [
    ...(selfId === 'pc' ? [] : [{ name: PC_CLIENT.name, field: 'pc-ip' }]),
    ...devices.filter((d) => d.id !== selfId).map((d) => ({ name: d.name, field: `${d.id}-ip` })),
  ];

  /** Ping do internetu z PC (základního nebo přidaného). */
  const runPing = (clientId: NodeId = 'pc') => {
    const dev = devices.find((d) => d.id === clientId);
    const client = dev ? { id: dev.id, name: dev.name } : PC_CLIENT;
    const res = simulate(cfg, isp, scenario, cidr, fmt, client, othersFor(clientId));
    animate([clientId, 'r2', 'r1', 'isp'], [linkOf(clientId), 'link-r2-r1', 'link-r1-isp'], res,
      { run: 'ICMP Ping...', ok: '✓ Pong (OK)', err: '✕ Paket zahozen', badgeOk: 'Připojení k internetu je funkční!' });
  };

  /** Přístup z internetu k serveru/kameře přes PAT. */
  const runInbound = (deviceId: NodeId) => {
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;
    const res = simulateInbound(cfg, isp, cidr, fmt, dev, rules, othersFor(deviceId));
    const proto = KIND_INFO[dev.kind].service ?? 'TCP';
    animate(['isp', 'r1', 'r2', deviceId], ['link-r1-isp', 'link-r2-r1', linkOf(deviceId)], res,
      { run: `${proto} z internetu...`, ok: `✓ ${dev.name} odpovídá`, err: '✕ Spojení zahozeno', badgeOk: `${dev.name} je dostupné z internetu!` });
  };

  // --- zařízení v LAN 2 ---
  const addDevice = (kind: DeviceKind) => {
    const id = `dev-${devCounter.current++}`;
    let n = 1;
    while (devices.some((d) => d.name === `${KIND_INFO[kind].label} ${n}`)) n++;
    const device: Device = { id, kind, name: `${KIND_INFO[kind].label} ${n}` };
    setPositions((prev) => { const { [id]: _drop, ...rest } = prev; return rest; });
    setCfg((c) => ({ ...c, ...Object.fromEntries(DEV_SUFFIXES.map((s) => [`${id}-${s}`, ''])) }));
    setDevices((ds) => [...ds, device]);
    setOpenNode(id);
  };

  const removeDevice = (id: NodeId) => {
    stopAnim();
    setDevices((ds) => ds.filter((d) => d.id !== id));
    setCfg((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith(`${id}-`))));
    setPositions((prev) => { const { [id]: _drop, ...rest } = prev; return rest; });
    setOpenNode(null);
    resetVisual();
  };

  const renameDevice = (id: NodeId, name: string) => setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, name } : d)));

  // --- pravidla PAT ---
  const addRule = (router: RouterId) => {
    const id = `n${ruleCounter.current++}`;
    setCfg((c) => ({ ...c, [`${router}-pat-${id}-ext`]: '', [`${router}-pat-${id}-ip`]: '', [`${router}-pat-${id}-port`]: '' }));
    setRules((r) => ({ ...r, [router]: [...r[router], id] }));
  };
  const removeRule = (router: RouterId, id: string) => {
    stopAnim();
    setPacket(null);
    setRules((r) => ({ ...r, [router]: r[router].filter((x) => x !== id) }));
    setCfg((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith(`${router}-pat-${id}-`))));
  };
  /** Průvodce: doplní chybějící řádky pravidel (existující nechá). */
  const ensureRules = (want: Rules) => {
    setRules((r) => ({
      r1: [...r.r1, ...want.r1.filter((x) => !r.r1.includes(x))],
      r2: [...r.r2, ...want.r2.filter((x) => !r.r2.includes(x))],
    }));
    setCfg((c) => {
      const next = { ...c };
      (['r1', 'r2'] as const).forEach((rt) => want[rt].forEach((id) => (['ext', 'ip', 'port'] as const).forEach((part) => {
        const k = `${rt}-pat-${id}-${part}`;
        if (!(k in next)) next[k] = '';
      })));
      return next;
    });
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
    const sol = solve(DEFAULT_ISP, null, devices, cidr);
    setRules(sol.rules);
    setCfg((c) => ({ ...emptyConfig(), ...sol.cfg, ...Object.fromEntries(Object.keys(c).filter((k) => !(k in sol.cfg)).map((k) => [k, ''])) }));
  };

  const clearAll = () => {
    resetRun('Připraveno k zadání');
    setCfg((c) => Object.fromEntries(Object.keys(c).map((k) => [k, ''])));
    setLogs([{ type: 'info', title: 'Konfigurace vymazána', text: 'Všechna konfigurační pole byla vyčištěna. Můžete začít znovu.' }]);
  };

  const randomScenario = () => {
    resetRun();
    let chosen = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    if (scenario && chosen.title === scenario.title) chosen = SCENARIOS[(SCENARIOS.indexOf(chosen) + 1) % SCENARIOS.length];
    setScenario(chosen);
    setIsp({ gwIp: chosen.ispGw, gwMask: chosen.ispMask, dnsIp: chosen.ispDns });
    setMode('scenario');
    setCfg((c) => Object.fromEntries(Object.keys(c).map((k) => [k, ''])));
  };

  /** „Dle R2“: doplní IP, masku, bránu a DNS klienta podle LAN portu Routeru 2 (volná adresa). */
  const autoFill = (id: NodeId) => {
    const r2 = analyzeInterface(cfg['r2-lan-ip'] ?? '', cfg['r2-lan-mask'] ?? '', cidr);
    if (!r2.valid || !r2.isHostUsable) {
      setLogs([{ type: 'error', title: 'Nelze automaticky vyplnit zařízení', text: 'Nejprve zadejte platnou použitelnou IP adresu a masku na vnitřním rozhraní (LAN 2) Routeru 2.' }]);
      setBadge({ text: 'Chyba předvyplnění', tone: 'error' });
      return;
    }
    const used = new Set<number>([r2.ipLong]);
    ['pc', ...devices.map((d) => d.id)].filter((x) => x !== id).forEach((x) => {
      const v = ipToLong(cfg[`${x}-ip`] ?? '');
      if (v !== null) used.add(v);
    });
    let cand: number | null = null;
    for (let a = r2.networkLong + 10; a < r2.broadcastLong && cand === null; a++) if (!used.has(a)) cand = a;
    for (let a = r2.networkLong + 1; a < r2.broadcastLong && cand === null; a++) if (!used.has(a)) cand = a;
    if (cand === null) {
      setLogs([{ type: 'error', title: 'Příliš malá podsíť na Routeru 2', text: 'V zadané podsíti nezbývá volná adresa pro další zařízení.' }]);
      setBadge({ text: 'Chyba rozsahu', tone: 'error' });
      return;
    }
    fillFields({ [`${id}-ip`]: longToIp(cand), [`${id}-mask`]: fmtMask(r2.prefix, cidr), [`${id}-gw`]: r2.ipStr, [`${id}-dns`]: isp.dnsIp });
  };

  // --- zadání ---
  const C = ({ children }: { children: ReactNode }) => (
    <code className="font-mono font-semibold text-blue-900 dark:text-blue-100 bg-surface px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">{children}</code>
  );
  let title = 'Základní kaskádové propojení dvou routerů';
  let description: ReactNode = (
    <>Nakonfigurujte zařízení (<strong>Router 1</strong>, <strong>Router 2</strong> a <strong>Klientské PC</strong>) tak, aby koncový počítač mohl komunikovat s internetem (cílový server <C>{isp.dnsIp}</C>). Vytvořte tři oddělené IP podsítě. Do plochy můžete přidat další PC, kamery a web servery a zpřístupnit je z internetu pomocí PAT.</>
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
    const chip = 'px-3 py-1.5 rounded-lg bg-surface border text-ink font-medium text-sm';
    chips = (
      <div className="flex flex-wrap gap-2 pt-1">
        <span className={`${chip} border-blue-200 dark:border-blue-800`}>1. ISP síť: <strong className="font-mono text-blue-700 dark:text-blue-300">{ipMask(scenario.ispGw, ispPrefix, cidr)}</strong></span>
        <span className={`${chip} border-emerald-200 dark:border-emerald-800`}>2. Síť LAN 1 (mezi R1 a R2): <strong className="font-mono text-emerald-700 dark:text-emerald-300">{ipMask(scenario.lan1RequiredNet, scenario.lan1RequiredPrefix, cidr)}</strong></span>
        <span className={`${chip} border-indigo-200 dark:border-indigo-800`}>3. Síť LAN 2 (mezi R2 a PC): <strong className="font-mono text-indigo-700 dark:text-indigo-300">{ipMask(scenario.lan2RequiredNet, scenario.lan2RequiredPrefix, cidr)}</strong></span>
      </div>
    );
  }

  const diag = <Diagnostics logs={logs} badge={badge.text} tone={badge.tone} />;

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100 dark:selection:bg-blue-900/50 selection:text-blue-900 dark:selection:text-blue-100">
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
        theme={theme}
        onTheme={setTheme}
        onResetLayout={layout.reset}
      />

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-3 sm:px-6 py-5 space-y-5">
        <section className="bg-gradient-to-r from-indigo-50 dark:from-indigo-950/40 via-blue-50 dark:via-blue-950/40 to-sky-50 dark:to-sky-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2.5 py-0.5 rounded-md">
                <ClipboardList className="w-3.5 h-3.5" /> Zadání úlohy
              </span>
              <span className="text-base font-semibold text-ink">{title}</span>
            </div>
            <p className="text-base text-ink leading-relaxed">{description}</p>
            {chips}
          </div>
          <button id="btn-run-test" onClick={() => runPing('pc')}
            className="shrink-0 w-full lg:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-md shadow-blue-600/20">
            <Play className="w-5 h-5 fill-current" /> Otestovat připojení (Ping)
          </button>
        </section>

        {!wide && <DevicePalette onAdd={addDevice} layout="row" />}

        <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start' : 'space-y-5'}>
          <section className="bg-surface border border-line rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3 px-1">
              <div>
                <h2 className="text-lg font-bold text-ink flex items-center gap-2"><Network className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Topologie sítě</h2>
                <p className="text-sm text-ink-3 mt-0.5">Klikněte na zařízení – jeho nastavení vyjede do strany. Zařízení můžete přetahovat. Kliknutím mimo nastavení zavřete.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium mb-3 px-1">
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-blue-100 dark:bg-blue-900/50 border border-blue-400 dark:border-blue-600 inline-block" /> WAN port (vnější)</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-400 dark:border-emerald-600 inline-block" /> LAN port (vnitřní)</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-violet-100 dark:bg-violet-900/50 border border-violet-400 dark:border-violet-600 inline-block" /> PAT (přesměrování portů)</span>
            </div>
            <Topology
              devices={devices}
              rules={rules}
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
              onAutoFill={autoFill}
              onAddRule={addRule}
              onRemoveRule={removeRule}
              onRemoveDevice={removeDevice}
              onRename={renameDevice}
              onTestPing={runPing}
              onTestInbound={runInbound}
              layout={layout}
            />
          </section>
          {wide ? (
            <aside className="space-y-5 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 -mr-1">
              {diag}
              <DevicePalette onAdd={addDevice} layout="column" />
            </aside>
          ) : (
            diag
          )}
        </div>
      </main>

      <footer className="bg-surface border-t border-line py-5 mt-8">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-ink-3">
          <div className="flex items-center gap-4">
            <img src="/logo-tf.png" alt="ČZU – Technická fakulta" className="h-10 w-auto dark:brightness-0 dark:invert" />
            <div>
              <p className="font-semibold text-ink">© {new Date().getFullYear()} Laboratoř výpočetních aplikací - Technická fakulta ČZU v Praze</p>
              <p>Interaktivní pomůcka pro výuku počítačových sítí • Směrování IPv4, masky podsítí, Double NAT a PAT</p>
            </div>
          </div>
          <p className="font-mono text-ink-4">{cidr ? 'Formát masek: dekadicky (255.255.255.0) i lomeně (/24)' : 'Formát masek: dekadicky (255.255.255.0)'}</p>
        </div>
      </footer>

      {wizard && (
        <Wizard
          cfg={cfg}
          isp={isp}
          scenario={scenario}
          cidr={cidr}
          devices={devices}
          onFill={fillFields}
          onEnsureRules={ensureRules}
          onOpenNode={setOpenNode}
          onClose={() => setWizard(false)}
          onFinish={() => { setWizard(false); runPing('pc'); }}
          onRunInbound={(id) => { setWizard(false); runInbound(id); }}
        />
      )}
    </div>
  );
}

