import { ClipboardList, Network, Play, Route } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_VERSION } from './changelog';
import ChangelogDialog from './components/ChangelogDialog';
import { CARD_H, CARD_W, type Status } from './components/DeviceCard';
import DevicePalette from './components/DevicePalette';
import Diagnostics, { type Tone } from './components/Diagnostics';
import Header, { FONT_PX, SPEED_MULT, type FontKey, type SpeedKey, type ThemeKey } from './components/Header';
import TaskPicker from './components/TaskPicker';
import Topology, { type LayoutApi, type PacketState } from './components/Topology';
import Wizard from './components/Wizard';
import { useHistory, useLocalStorage, useViewportRem } from './hooks';
import {
  assignmentOf, decodeDoc, docForScenario, emptyDoc, encodeDoc, fieldsOfDevice, nextDeviceNumber, sanitizeDoc, shareUrl, type Doc,
} from './lib/doc';
import { fmtMask, ipMask } from './lib/format';
import { inboundPath, linksOfPath, pingPath, traceHops } from './lib/graph';
import {
  DEFAULT_ISP, KIND_INFO, SCENARIOS, emptyConfig, hasIp, isL2, nodeOfField,
  type Config, type Device, type DeviceKind, type FieldId, type LinkId, type LogItem, type NodeId, type Pos, type RouterId, type Rules, type Scenario,
} from './lib/model';
import { analyzeInterface, ipToLong, longToIp } from './lib/net';
import { makePlan, solve } from './lib/plan';
import { simulate, simulateInbound, PC_CLIENT, type Other, type SimResult } from './lib/simulate';
import { playSound, unlockAudio } from './lib/sound';

const INFO_LOG: LogItem[] = [{
  type: 'info',
  title: 'Připraveno',
  text: 'Klikněte na zařízení a vyplňte jeho IP konfiguraci (nebo spusťte Průvodce). Potom klikněte na „Otestovat připojení (Ping)“.',
}];

const DOC_KEY = 'netroute.doc.v1';

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

function loadDoc(): Doc {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (raw) return sanitizeDoc(JSON.parse(raw)) ?? emptyDoc();
  } catch { /* poškozená data – začneme znovu */ }
  return emptyDoc();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const omit = <T extends object>(o: T, keep: (k: string) => boolean): T =>
  Object.fromEntries(Object.entries(o).filter(([k]) => keep(k))) as T;

export default function App() {
  const { doc, set, undo, redo, reset, canUndo, canRedo } = useHistory<Doc>(loadDoc);
  const { cfg, devices, rules, uplinks, positions, isp, scenario, mode } = doc;

  const [cidr, setCidr] = useLocalStorage('netroute.cidr', false);
  const [font, setFont] = useLocalStorage<FontKey>('netroute.font', 'large');
  const [theme, setTheme] = useLocalStorage<ThemeKey>('netroute.theme', 'system');
  const [snap, setSnap] = useLocalStorage('netroute.snap', true);
  const [sound, setSound] = useLocalStorage('netroute.sound', false);
  const [speed, setSpeed] = useLocalStorage<SpeedKey>('netroute.speed', 'normal');
  const [showCalc, setShowCalc] = useState(true);
  const [openNode, setOpenNode] = useState<NodeId | null>(null);
  const [wizard, setWizard] = useState(false);
  const [tasks, setTasks] = useState(false);
  const [changelog, setChangelog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [nodeStatus, setNodeStatus] = useState<Record<NodeId, Status>>({});
  const [linkStatus, setLinkStatus] = useState<Record<LinkId, 'idle' | 'ok'>>({});
  const [packet, setPacket] = useState<PacketState | null>(null);
  const [errorFields, setErrorFields] = useState<Set<FieldId>>(new Set());
  const [logs, setLogs] = useState<LogItem[]>(INFO_LOG);
  const [badge, setBadge] = useState<{ text: string; tone: Tone }>({ text: 'Čeká na spuštění testu', tone: 'neutral' });
  const timer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const rootPx = FONT_PX[font];
  const stepMs = 650 * SPEED_MULT[speed];
  const viewRem = useViewportRem(rootPx);
  const wide = viewRem >= 80;
  const cols = viewRem >= 62 ? 3 : viewRem >= 40 ? 2 : 1;
  const fmt = useCallback((a: string, p: number) => ipMask(a, p, cidr), [cidr]);

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

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

  // --- ukládání stavu (po krátké prodlevě) ---
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch { /* úložiště nemusí být dostupné */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [doc]);

  // --- načtení z odkazu (#s=…) ---
  useEffect(() => {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return;
    void decodeDoc(m[1]).then((d) => {
      history.replaceState(null, '', location.pathname + location.search);
      if (d) { reset(d); say('Zadání načteno z odkazu'); }
      else say('Odkaz se nepodařilo načíst');
    });
  }, [reset, say]);

  // --- rozmístění zařízení (drag & drop) ---
  const defaults: Record<NodeId, Pos> = { ...defaultFixedPos() };
  devices.forEach((d, i) => { defaults[d.id] = defaultDevicePos(i, cols); });
  const layout: LayoutApi = {
    pos: { ...defaults, ...Object.fromEntries(Object.entries(positions).filter(([k]) => k in defaults)) },
    setPos: (id, x, y) => set((d) => ({ ...d, positions: { ...d.positions, [id]: { x, y } } }), `move:${id}`),
    reset: () => set((d) => ({ ...d, positions: {} })),
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

  // otevřený uzel, který už neexistuje (např. po kroku zpět), zavřít
  useEffect(() => {
    if (openNode && !['isp', 'r1', 'r2', 'pc'].includes(openNode) && !devices.some((d) => d.id === openNode)) setOpenNode(null);
  }, [devices, openNode]);

  // --- běh simulace ---
  const stopAnim = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  const resetVisual = useCallback(() => {
    stopAnim();
    setNodeStatus({});
    setLinkStatus({});
    setPacket(null);
    setErrorFields(new Set());
  }, []);
  useEffect(() => () => { stopAnim(); window.clearTimeout(toastTimer.current); }, []);

  const doUndo = () => { undo(); resetVisual(); };
  const doRedo = () => { redo(); resetVisual(); };

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (v textových polích zůstává vlastní zpět prohlížeče)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); resetVisual(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); resetVisual(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [undo, redo, resetVisual]);

  const onField = (id: FieldId, value: string) => {
    stopAnim();
    setPacket(null);
    setErrorFields((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
    set((d) => (d.cfg[id] === value ? d : { ...d, cfg: { ...d.cfg, [id]: value } }), `f:${id}`);
  };

  const fillFields = (values: Partial<Config>) => {
    stopAnim();
    setPacket(null);
    setErrorFields(new Set());
    set((d) => ({ ...d, cfg: { ...d.cfg, ...(values as Config) } }));
  };

  /** Společné zpracování chyby: označí pole a otevře zařízení, kde je potřeba zasáhnout. */
  const showFailure = (res: SimResult) => {
    setErrorFields(new Set(res.errorFields));
    const owners = res.errorFields.map(nodeOfField);
    setOpenNode(owners.includes(res.stopNode) || !owners.length ? res.stopNode : owners[0]);
  };

  /** Animace průchodu paketu po `path` (po `links`) a vyhodnocení výsledku. */
  const animate = (path: NodeId[], links: LinkId[], res: SimResult, labels: { run: string; ok: string; err: string; badgeOk: string }) => {
    unlockAudio();
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
        timer.current = window.setTimeout(advance, stepMs);
        return;
      }
      setLogs(res.logs);
      if (res.ok) {
        setNodeStatus((s) => ({ ...s, [cur]: 'ok' }));
        setPacket({ node: cur, kind: 'ok', label: labels.ok });
        setBadge({ text: labels.badgeOk, tone: 'success' });
        playSound('ok', sound);
      } else {
        setNodeStatus((s) => ({ ...s, [cur]: 'error' }));
        setPacket({ node: cur, kind: 'error', label: labels.err });
        setBadge({ text: 'Nalezena chyba v konfiguraci sítě', tone: 'error' });
        showFailure(res);
        playSound('error', sound);
      }
    };
    timer.current = window.setTimeout(advance, 120);
  };

  const othersFor = (selfId: NodeId): Other[] => [
    ...(selfId === 'pc' ? [] : [{ name: PC_CLIENT.name, field: 'pc-ip' }]),
    ...devices.filter((d) => d.id !== selfId && hasIp(d)).map((d) => ({ name: d.name, field: `${d.id}-ip` })),
  ];

  /** Ping do internetu z PC (základního nebo přidaného). */
  const runPing = (clientId: NodeId = 'pc') => {
    const dev = devices.find((d) => d.id === clientId);
    const client = dev ? { id: dev.id, name: dev.name } : PC_CLIENT;
    const res = simulate(cfg, isp, scenario, cidr, fmt, client, othersFor(clientId));
    const path = pingPath(uplinks, clientId);
    animate(path, linksOfPath(uplinks, path) as LinkId[], res,
      { run: 'ICMP Ping...', ok: '✓ Pong (OK)', err: '✕ Paket zahozen', badgeOk: 'Připojení k internetu je funkční!' });
  };

  /** Přístup z internetu k serveru/kameře přes PAT. */
  const runInbound = (deviceId: NodeId) => {
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;
    const res = simulateInbound(cfg, isp, cidr, fmt, dev, rules, othersFor(deviceId));
    const proto = KIND_INFO[dev.kind].service ?? 'TCP';
    const path = inboundPath(uplinks, deviceId);
    animate(path, linksOfPath(uplinks, path) as LinkId[], res,
      { run: `${proto} z internetu...`, ok: `✓ ${dev.name} odpovídá`, err: '✕ Spojení zahozeno', badgeOk: `${dev.name} je dostupné z internetu!` });
  };

  /** Traceroute z klientského PC: paket postupně doputuje na každý hop (TTL 1, 2, 3 …). */
  const runTrace = () => {
    unlockAudio();
    resetVisual();
    const res = simulate(cfg, isp, scenario, cidr, fmt, PC_CLIENT, othersFor('pc'));
    const reached = res.logs.filter((l) => l.type === 'success').length; // 0–4 odpovídajících hopů
    const t = (id: string) => (cfg[id] ?? '').trim() || '?';
    const hops = traceHops({ r2Lan: t('r2-lan-ip'), r1Lan: t('r1-lan-ip'), ispGw: isp.gwIp, target: isp.dnsIp });
    const path = pingPath(uplinks, 'pc');
    const links = linksOfPath(uplinks, path) as LinkId[];

    setLogs([{ type: 'info', title: `traceroute to ${isp.dnsIp}, 30 hops max`, text: 'Z klientského PC. Každý hop je zařízení, na kterém vyprší TTL a které odpoví.' }]);
    setBadge({ text: 'Traceroute běží…', tone: 'neutral' });
    setPacket({ node: 'pc', kind: 'run', label: 'TTL=1' });

    let i = 0;
    const step = () => {
      if (i < reached) {
        const hop = hops[i];
        const idx = path.indexOf(hop.node);
        setNodeStatus((s) => ({ ...s, ...Object.fromEntries(path.slice(0, idx + 1).map((n) => [n, 'ok' as Status])) }));
        setLinkStatus((s) => ({ ...s, ...Object.fromEntries(links.slice(0, idx).map((l) => [l, 'ok' as const])) }));
        setPacket({ node: hop.node, kind: 'run', label: `TTL=${hop.ttl}` });
        playSound('hop', sound);
        timer.current = window.setTimeout(() => {
          setLogs((l) => [...l, { type: 'success', title: `${hop.ttl}   ${hop.ip}`, text: `${hop.name} · ${hop.ms.toFixed(1)} ms${hop.target ? ' · cíl dosažen' : ''}` }]);
          i++;
          timer.current = window.setTimeout(step, stepMs * 0.35);
        }, stepMs);
      } else if (i < hops.length) {
        const hop = hops[i];
        const last = i === 0 ? 'pc' : hops[i - 1].node;
        setNodeStatus((s) => ({ ...s, [last]: 'error' }));
        setPacket({ node: last, kind: 'error', label: `TTL=${hop.ttl}: * * *` });
        setLogs((l) => [...l, { type: 'error', title: `${hop.ttl}   * * *`, text: 'Žádná odpověď (vypršel časový limit).' }, ...res.logs.filter((x) => x.type === 'error')]);
        setBadge({ text: `Traceroute selhal na hopu ${hop.ttl}`, tone: 'error' });
        showFailure(res);
        playSound('error', sound);
      } else {
        const lastNode = hops[hops.length - 1].node;
        setNodeStatus((s) => ({ ...s, [lastNode]: 'ok' }));
        setPacket({ node: lastNode, kind: 'ok', label: '✓ Cíl dosažen' });
        setBadge({ text: `Cíl dosažen za ${hops.length} hopy`, tone: 'success' });
        playSound('ok', sound);
      }
    };
    timer.current = window.setTimeout(step, 150);
  };

  // --- zařízení v plátně ---
  /** Přidá zařízení. S `drop` (souřadnice puštění) ho umístí na to místo plochy a případně připojí ke switchi / AP pod kurzorem. */
  const addDevice = (kind: DeviceKind, drop?: { clientX: number; clientY: number }) => {
    const n = nextDeviceNumber(devices);
    const id = `dev-${n}`;
    let k = 1;
    while (devices.some((d) => d.name === `${KIND_INFO[kind].label} ${k}`)) k++;
    const device: Device = { id, kind, name: `${KIND_INFO[kind].label} ${k}` };

    let at: Pos | null = null;
    let parent: NodeId | null = null;
    if (drop) {
      const world = document.getElementById('netroute-world');
      if (world) {
        const r = world.getBoundingClientRect();
        const z = r.width / (Number(world.dataset.w) || r.width) || 1;
        const remX = (drop.clientX - r.left) / z / rootPx;
        const remY = (drop.clientY - r.top) / z / rootPx;
        const round = (v: number) => (snap ? Math.round(v * 2) / 2 : Math.round(v * 1000) / 1000);
        at = { x: Math.max(0, round(remX - CARD_W / 2)), y: Math.max(0, round(remY - CARD_H / 2)) };
      }
      const under = document.elementsFromPoint(drop.clientX, drop.clientY)
        .map((el) => el.closest('[data-node-root]')?.getAttribute('data-node-root'))
        .find((x): x is string => !!x);
      const target = under ? devices.find((d) => d.id === under) : undefined;
      if (target && isL2(target)) {
        parent = target.id;
        // nové zařízení nepoložíme přímo na switch / AP, ale pod něj (vedle už připojených)
        const base = layout.pos[target.id];
        const kids = devices.filter((x) => (uplinks[x.id] ?? 'r2') === target.id).length;
        if (base) at = { x: base.x + kids * (CARD_W + 2), y: base.y + CARD_H + 3 };
      }
    }

    resetVisual();
    set((d) => ({
      ...d,
      devices: [...d.devices, device],
      cfg: { ...d.cfg, ...Object.fromEntries(fieldsOfDevice(device).map((f) => [f, ''])) },
      positions: { ...omit(d.positions, (key) => key !== id), ...(at ? { [id]: at } : {}) },
      uplinks: parent ? { ...d.uplinks, [id]: parent } : d.uplinks,
    }));
    setOpenNode(id);
    if (parent) say(`${device.name} připojeno k ${devices.find((d) => d.id === parent)?.name ?? 'zařízení'}`);
  };

  const removeDevice = (id: NodeId) => {
    resetVisual();
    set((d) => {
      const parent = d.uplinks[id] ?? 'r2';
      const ups = omit(d.uplinks, (k) => k !== id);
      for (const k of Object.keys(ups)) if (ups[k] === id) ups[k] = parent; // děti přejdou o úroveň výš
      return {
        ...d,
        devices: d.devices.filter((x) => x.id !== id),
        cfg: omit(d.cfg, (k) => !k.startsWith(`${id}-`)),
        positions: omit(d.positions, (k) => k !== id),
        uplinks: ups,
      };
    });
    setOpenNode(null);
  };

  const renameDevice = (id: NodeId, name: string) =>
    set((d) => ({ ...d, devices: d.devices.map((x) => (x.id === id ? { ...x, name } : x)) }), `name:${id}`);

  const setUplink = (child: NodeId, parent: NodeId) => {
    resetVisual();
    set((d) => ({ ...d, uplinks: parent === 'r2' ? omit(d.uplinks, (k) => k !== child) : { ...d.uplinks, [child]: parent } }));
  };

  // --- pravidla PAT ---
  const addRule = (router: RouterId) => {
    set((d) => {
      const max = [...d.rules.r1, ...d.rules.r2].reduce((m, r) => Math.max(m, Number(r.replace(/^n/, '')) || 0), 0);
      const id = `n${max + 1}`;
      return {
        ...d,
        cfg: { ...d.cfg, [`${router}-pat-${id}-ext`]: '', [`${router}-pat-${id}-ip`]: '', [`${router}-pat-${id}-port`]: '' },
        rules: { ...d.rules, [router]: [...d.rules[router], id] },
      };
    });
  };
  const removeRule = (router: RouterId, id: string) => {
    stopAnim();
    setPacket(null);
    set((d) => ({
      ...d,
      rules: { ...d.rules, [router]: d.rules[router].filter((x) => x !== id) },
      cfg: omit(d.cfg, (k) => !k.startsWith(`${router}-pat-${id}-`)),
    }));
  };
  /** Průvodce: doplní chybějící řádky pravidel (existující nechá). */
  const ensureRules = (want: Rules) => {
    set((d) => {
      const next = {
        r1: [...d.rules.r1, ...want.r1.filter((x) => !d.rules.r1.includes(x))],
        r2: [...d.rules.r2, ...want.r2.filter((x) => !d.rules.r2.includes(x))],
      };
      if (next.r1.length === d.rules.r1.length && next.r2.length === d.rules.r2.length) return d;
      const cfgNext = { ...d.cfg };
      (['r1', 'r2'] as const).forEach((rt) => want[rt].forEach((id) => (['ext', 'ip', 'port'] as const).forEach((part) => {
        const k = `${rt}-pat-${id}-${part}`;
        if (!(k in cfgNext)) cfgNext[k] = '';
      })));
      return { ...d, rules: next, cfg: cfgNext };
    });
  };

  // --- akce v hlavičce ---
  const resetRun = (text = 'Čeká na spuštění testu') => {
    resetVisual();
    setLogs(INFO_LOG);
    setBadge({ text, tone: 'neutral' });
  };

  /** Spustí úlohu (null = základní zadání). Nahrazuje aktuální práci, lze vrátit krokem Zpět. */
  const startTask = (sc: Scenario | null) => {
    resetRun();
    setOpenNode(null);
    set(() => docForScenario(sc));
    say(sc ? `Spuštěna úloha: ${sc.title.split(':')[0]}` : 'Spuštěno základní zadání');
  };

  const randomScenario = () => {
    const pool = SCENARIOS.filter((s) => s.title !== scenario?.title);
    startTask(pool[Math.floor(Math.random() * pool.length)]);
  };

  const loadSample = () => {
    resetRun();
    set((d) => {
      const sol = solve(DEFAULT_ISP, null, d.devices, cidr);
      const blank = Object.fromEntries(Object.keys(d.cfg).map((k) => [k, '']));
      return { ...d, scenario: null, isp: DEFAULT_ISP, mode: 'sample', rules: sol.rules, cfg: { ...emptyConfig(), ...blank, ...sol.cfg } };
    });
  };

  const clearAll = () => {
    resetRun('Připraveno k zadání');
    set((d) => ({ ...d, cfg: Object.fromEntries(Object.keys(d.cfg).map((k) => [k, ''])) }));
    setLogs([{ type: 'info', title: 'Konfigurace vymazána', text: 'Všechna konfigurační pole byla vyčištěna. Můžete začít znovu (nebo krokem Zpět vše vrátit).' }]);
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
    ['pc', ...devices.filter(hasIp).map((d) => d.id)].filter((x) => x !== id).forEach((x) => {
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

  // --- sdílení a export ---
  const share = async (withSolution: boolean) => {
    const url = shareUrl(await encodeDoc(withSolution ? doc : assignmentOf(doc)));
    try {
      await navigator.clipboard.writeText(url);
      say(withSolution ? 'Odkaz s řešením zkopírován do schránky' : 'Odkaz na zadání zkopírován do schránky');
    } catch {
      window.prompt('Zkopírujte odkaz:', url);
    }
  };

  const download = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  };
  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'netroutelab', version: APP_VERSION, doc }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(url, `netroutelab-${stamp()}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say('Soubor uložen');
  };

  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as { doc?: unknown };
      const d = sanitizeDoc(raw && typeof raw === 'object' && 'doc' in raw ? raw.doc : raw);
      if (!d) throw new Error('bad');
      resetRun();
      setOpenNode(null);
      set(() => d);
      say('Soubor načten (lze vrátit krokem Zpět)');
    } catch {
      say('Soubor se nepodařilo načíst');
    }
  };

  const exportPng = async () => {
    setOpenNode(null);
    await sleep(380);
    const el = document.getElementById('netroute-world');
    if (!el) return;
    try {
      const { toPng } = await import('html-to-image');
      const dark = document.documentElement.classList.contains('dark');
      const url = await toPng(el, {
        width: Number(el.dataset.w), height: Number(el.dataset.h), pixelRatio: 2, cacheBust: true,
        backgroundColor: dark ? '#0b1220' : '#f8fafc', style: { transform: 'none' },
      });
      download(url, `netroutelab-schema-${stamp()}.png`);
      say('Schéma uloženo jako obrázek');
    } catch {
      say('Export obrázku se nezdařil');
    }
  };

  // --- zadání ---
  const C = ({ children }: { children: ReactNode }) => (
    <code className="font-mono font-semibold text-blue-900 dark:text-blue-100 bg-surface px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">{children}</code>
  );
  let title = 'Základní kaskádové propojení dvou routerů';
  let description: ReactNode = (
    <>Nakonfigurujte zařízení (<strong>Router 1</strong>, <strong>Router 2</strong> a <strong>Klientské PC</strong>) tak, aby koncový počítač mohl komunikovat s internetem (cílový server <C>{isp.dnsIp}</C>). Vytvořte tři oddělené IP podsítě. Do plochy můžete přidat další PC, kamery, web servery, switche a Wi-Fi AP a zpřístupnit je z internetu pomocí PAT.</>
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
      <>Připojte síť k ISP bráně <C>{ipMask(scenario.ispGw, ispPrefix, cidr)}</C> (DNS <C>{scenario.ispDns}</C>) a dodržte zadané adresní rozsahy pro obě vnitřní sítě:{scenario.note ? <> {scenario.note}</> : null}</>
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

  const runButtons = (stacked: boolean) => (
    <div className={`flex gap-2 shrink-0 w-full lg:w-auto ${stacked ? 'flex-col' : ''}`}>
      <button id="btn-run-test" onClick={() => runPing('pc')}
        className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-md shadow-blue-600/20">
        <Play className="w-5 h-5 fill-current shrink-0" /> Otestovat připojení (Ping)
      </button>
      <button id="btn-trace" onClick={runTrace} title="Traceroute z klientského PC k cílovému serveru – paket putuje hop po hopu"
        className="inline-flex items-center justify-center gap-2 px-4 py-3 text-base font-bold rounded-xl border-2 border-blue-600 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50 active:scale-[0.99] transition">
        <Route className="w-5 h-5 shrink-0" /> Traceroute (hop po hopu)
      </button>
    </div>
  );
  const diag = <Diagnostics logs={logs} badge={badge.text} tone={badge.tone} />;

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100 dark:selection:bg-blue-900/50 selection:text-blue-900 dark:selection:text-blue-100">
      <Header
        showCalc={showCalc}
        onToggleCalc={() => setShowCalc((v) => !v)}
        onWizard={() => setWizard(true)}
        onTasks={() => setTasks(true)}
        onRandom={randomScenario}
        onSample={loadSample}
        onClear={clearAll}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={doUndo}
        onRedo={doRedo}
        onShare={share}
        onExportJson={exportJson}
        onImportFile={importFile}
        onExportPng={exportPng}
        cidr={cidr}
        onCidr={setCidr}
        font={font}
        onFont={setFont}
        theme={theme}
        onTheme={setTheme}
        snap={snap}
        onSnap={setSnap}
        sound={sound}
        onSound={(v) => { setSound(v); if (v) { unlockAudio(); playSound('ok', true); } }}
        speed={speed}
        onSpeed={setSpeed}
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
          {!wide && runButtons(false)}
        </section>

        {!wide && <DevicePalette onAdd={(k) => addDevice(k)} onDrop={(k, x, y) => addDevice(k, { clientX: x, clientY: y })} layout="row" />}

        <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start' : 'space-y-5'}>
          <section className="bg-surface border border-line rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3 px-1">
              <div>
                <h2 className="text-lg font-bold text-ink flex items-center gap-2"><Network className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Topologie sítě</h2>
                <p className="text-sm text-ink-3 mt-0.5">Klikněte na zařízení – jeho nastavení vyjede do strany. Zařízení můžete přetahovat, plochu přibližovat (Ctrl + kolečko, dva prsty). Kliknutím mimo nastavení zavřete.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium mb-3 px-1">
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-blue-100 dark:bg-blue-900/50 border border-blue-400 dark:border-blue-600 inline-block" /> WAN port (vnější)</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-400 dark:border-emerald-600 inline-block" /> LAN port (vnitřní)</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-violet-100 dark:bg-violet-900/50 border border-violet-400 dark:border-violet-600 inline-block" /> PAT (přesměrování portů)</span>
              <span className="flex items-center gap-1.5"><span className="w-6 border-t-[3px] border-dashed border-slate-400 inline-block" /> Wi-Fi</span>
            </div>
            <Topology
              devices={devices}
              uplinks={uplinks}
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
              packetMs={700 * SPEED_MULT[speed]}
              onDismissPacket={() => { stopAnim(); setPacket(null); }}
              rootPx={rootPx}
              snap={snap}
              onAutoFill={autoFill}
              onAddRule={addRule}
              onRemoveRule={removeRule}
              onRemoveDevice={removeDevice}
              onRename={renameDevice}
              onUplink={setUplink}
              onTestPing={runPing}
              onTestInbound={runInbound}
              layout={layout}
            />
          </section>
          {wide ? (
            <aside className="space-y-5 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 -mr-1">
              {runButtons(true)}
              {diag}
              <DevicePalette onAdd={(k) => addDevice(k)} onDrop={(k, x, y) => addDevice(k, { clientX: x, clientY: y })} layout="column" />
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
          <div className="flex flex-col items-center md:items-end gap-1">
            <button onClick={() => setChangelog(true)} className="font-semibold text-blue-700 dark:text-blue-300 hover:underline" title="Přehled verzí a změn">
              NetRoute Lab · verze {APP_VERSION} · Co je nového
            </button>
            <p className="font-mono text-ink-4">{cidr ? 'Formát masek: dekadicky (255.255.255.0) i lomeně (/24)' : 'Formát masek: dekadicky (255.255.255.0)'}</p>
          </div>
        </div>
      </footer>

      {tasks && <TaskPicker cidr={cidr} current={mode === 'scenario' && scenario ? scenario.title : mode === 'default' ? null : '·'} onStart={startTask} onClose={() => setTasks(false)} />}
      {changelog && <ChangelogDialog onClose={() => setChangelog(false)} />}

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold">
          {toast}
        </div>
      )}

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

