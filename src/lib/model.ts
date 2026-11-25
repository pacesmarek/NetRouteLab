/** 'isp' | 'r1' | 'r2' | 'pc' + přidaná zařízení ('dev-1', 'dev-2', …) */
export type NodeId = string;
export const FIXED_NODES: NodeId[] = ['isp', 'r1', 'r2', 'pc'];

export const FIXED_FIELD_IDS = [
  'r1-wan-ip', 'r1-wan-mask', 'r1-wan-gw', 'r1-wan-dns',
  'r1-lan-ip', 'r1-lan-mask',
  'r2-wan-ip', 'r2-wan-mask', 'r2-wan-gw', 'r2-wan-dns',
  'r2-lan-ip', 'r2-lan-mask',
  'r2-dhcp-on', 'r2-dhcp-start', 'r2-dhcp-end', 'r2-dhcp-dns',
  'pc-ip', 'pc-mask', 'pc-gw', 'pc-dns', 'pc-dhcp',
] as const;

/** Id pole: pevná ('r1-wan-ip'), zařízení ('dev-1-ip', 'dev-1-pub') nebo pravidlo PAT ('r1-pat-a-ext'). */
export type FieldId = string;
export type Config = Record<string, string>;

export const emptyConfig = (): Config =>
  Object.fromEntries(FIXED_FIELD_IDS.map((f) => [f, ''])) as Config;

/** Kterému zařízení pole patří. */
export function nodeOfField(id: FieldId): NodeId {
  const m = id.match(/^(dev-\d+|r1|r2|pc|isp)-/);
  return m ? m[1] : id.replace(/-(ip|mask|gw|dns|pub|dhcp)$/, '');
}

export type LinkId = string; // `link-${dítě}-${rodič}`: 'link-r1-isp', 'link-r2-r1', 'link-pc-r2', 'link-dev-1-dev-3', …
export const linkId = (child: NodeId, parent: NodeId): LinkId => `link-${child}-${parent}`;

/** Připojení uzlu k nadřazenému (výchozí: Router 2). Zařízení lze připojit k Routeru 2, switchi nebo AP. */
export type Uplinks = Record<NodeId, NodeId>;

export interface Pos { x: number; y: number }
/** default = základní zadání (R1 → R2 → PC), sample = vzorové řešení, scenario = úloha, playground = volné plátno */
export type Mode = 'default' | 'sample' | 'scenario' | 'playground';

// --- Přidaná zařízení v síti LAN 2 ---
export type DeviceKind = 'pc' | 'camera' | 'webserver' | 'switch' | 'ap' | 'router';

/** Režim Wi-Fi AP: vysílač (Access Point), přijímač pro jedno zařízení (Klient) nebo bezdrátový most celé sítě (Bridge). */
export type ApMode = 'ap' | 'client' | 'bridge';
export const AP_MODES: ApMode[] = ['ap', 'client', 'bridge'];

export interface Device {
  id: NodeId; // 'dev-1'…
  kind: DeviceKind;
  name: string;
  /** jen AP: režim (výchozí 'ap') */
  apMode?: ApMode;
}

export const KIND_INFO: Record<DeviceKind, { label: string }> = {
  pc: { label: 'PC' },
  router: { label: 'Router' },
  switch: { label: 'Switch' },
  ap: { label: 'Wi-Fi AP' },
  camera: { label: 'Kamera' },
  webserver: { label: 'Web server' },
};

/** Zařízení, ke kterému se přistupuje zvenku (PAT). */
export const isServer = (d: Device) => d.kind === 'camera' || d.kind === 'webserver';
/** Prvky vrstvy 2 (switch, AP) – nemají IP adresu, jen propojují. */
export const isL2 = (d: { kind: DeviceKind }) => d.kind === 'switch' || d.kind === 'ap';
/** Router přidaný do volného plátna (má WAN a LAN rozhraní). */
export const isRouter = (d: { kind: DeviceKind }) => d.kind === 'router';
/** Koncové zařízení s jednou IP konfigurací (PC, kamera, server). */
export const hasIp = (d: { kind: DeviceKind }) => !isL2(d) && !isRouter(d);
/** Pole routeru (WAN, LAN, DHCP) – `${id}-wan-ip` apod. */
/** Pole Wi-Fi AP v režimu Access Point: vlastní adresa (správa) a volitelný DHCP server. */
export const AP_SUFFIXES = ['lan-ip', 'lan-mask', 'dhcp-on', 'dhcp-start', 'dhcp-end', 'dhcp-gw', 'dhcp-dns'] as const;
export const apModeOf = (d: { kind: DeviceKind; apMode?: ApMode }): ApMode => (d.kind === 'ap' ? d.apMode ?? 'ap' : 'ap');
export const ROUTER_SUFFIXES = ['wan-ip', 'wan-mask', 'wan-gw', 'wan-dns', 'lan-ip', 'lan-mask', 'dhcp-on', 'dhcp-start', 'dhcp-end', 'dhcp-dns'] as const;

// --- Pravidla PAT (přesměrování portů) na routerech ---
export type RouterId = string; // 'r1' | 'r2' | 'dev-N' (router z volného plátna)
/** Pravidla PAT podle routeru (klíč = id routeru). */
export type Rules = Record<string, string[]>;
export const emptyRules = (): Rules => ({ r1: [], r2: [] });
export const ruleField = (router: RouterId, rule: string, part: 'ext' | 'ip' | 'port'): FieldId =>
  `${router}-pat-${rule}-${part}`;

export interface IspConfig {
  gwIp: string;
  gwMask: string; // dekadicky
  dnsIp: string;
}

export interface Scenario {
  title: string;
  ispGw: string;
  ispMask: string; // dekadicky
  ispDns: string;
  lan1RequiredNet: string;
  lan1RequiredPrefix: number;
  lan2RequiredNet: string;
  lan2RequiredPrefix: number;
  /** krátký popis úlohy pro seznam úloh */
  summary?: string;
  /** doplňující požadavek zadání (text) */
  note?: string;
  /** zařízení, která se přidají do plochy při spuštění úlohy (behind = index zařízení v tomto poli, za kterým je zapojené) */
  devices?: { kind: DeviceKind; name?: string; behind?: number; dhcp?: boolean }[];
}

export interface LogItem {
  type: 'success' | 'error' | 'info';
  title: string;
  text: string;
}

export const DEFAULT_ISP: IspConfig = { gwIp: '85.160.10.1', gwMask: '255.255.255.0', dnsIp: '8.8.8.8' };

export const SCENARIOS: Scenario[] = [
  {
    title: 'Scénář #1: Firemní pobočka a oddělená síť pro hosty',
    ispGw: '195.113.42.1', ispMask: '255.255.255.0', ispDns: '1.1.1.1',
    lan1RequiredNet: '172.16.10.0', lan1RequiredPrefix: 24,
    lan2RequiredNet: '192.168.50.0', lan2RequiredPrefix: 24,
  },
  {
    title: 'Scénář #2: Domácí laboratoř za poskytovatelem s menší podsítí (/29)',
    ispGw: '82.114.200.1', ispMask: '255.255.255.248', ispDns: '8.8.4.4',
    lan1RequiredNet: '10.10.1.0', lan1RequiredPrefix: 24,
    lan2RequiredNet: '10.20.2.0', lan2RequiredPrefix: 24,
  },
  {
    title: 'Scénář #3: Podsítě s maskou /25 a /26 (VLSM v praxi)',
    ispGw: '212.71.15.65', ispMask: '255.255.255.192', ispDns: '8.8.8.8',
    lan1RequiredNet: '192.168.100.0', lan1RequiredPrefix: 25,
    lan2RequiredNet: '172.20.5.128', lan2RequiredPrefix: 25,
  },
  {
    title: 'Scénář #4: Školní učebna za hlavním školním routerem',
    ispGw: '78.102.88.129', ispMask: '255.255.255.128', ispDns: '9.9.9.9',
    lan1RequiredNet: '10.100.0.0', lan1RequiredPrefix: 16,
    lan2RequiredNet: '192.168.200.0', lan2RequiredPrefix: 24,
  },
  {
    title: 'Scénář #5: Kamerový systém – tři kamery z internetu',
    summary: 'Tři IP kamery v LAN 2, každá dostupná z internetu na vlastním portu (8081–8083) přes dvojitý NAT.',
    note: 'Kamery musí být dostupné z internetu na portech 8081, 8082 a 8083 (každá kamera na svém). Nastavte PAT na obou routerech.',
    ispGw: '90.176.20.1', ispMask: '255.255.255.0', ispDns: '8.8.8.8',
    lan1RequiredNet: '192.168.10.0', lan1RequiredPrefix: 24,
    lan2RequiredNet: '10.10.0.0', lan2RequiredPrefix: 24,
    devices: [{ kind: 'camera' }, { kind: 'camera' }, { kind: 'camera' }],
  },
  {
    title: 'Scénář #6: Server a kamera za switchem',
    summary: 'Web server a kamera zapojené přes switch do LAN 2; obě zařízení zpřístupněte z internetu.',
    note: 'Web server i kamera jsou zapojeny přes switch. Zpřístupněte je z internetu pomocí PAT; každé na vlastním portu.',
    ispGw: '147.32.10.1', ispMask: '255.255.255.128', ispDns: '1.1.1.1',
    lan1RequiredNet: '172.20.0.0', lan1RequiredPrefix: 24,
    lan2RequiredNet: '192.168.77.0', lan2RequiredPrefix: 24,
    devices: [{ kind: 'switch' }, { kind: 'webserver', behind: 0 }, { kind: 'camera', behind: 0 }],
  },
  {
    title: 'Scénář #7: DHCP v síti LAN 2',
    summary: 'PC a kamera dostávají adresu automaticky z DHCP serveru na Routeru 2; kamera je navíc dostupná z internetu.',
    note: 'Na Routeru 2 zapněte DHCP server (rozsah v síti LAN 2, DNS podle ISP). Přidané PC a kamera mají zapnuté automatické získání adresy – přidělenou adresu kamery použijte v pravidle PAT.',
    ispGw: '81.200.30.1', ispMask: '255.255.255.0', ispDns: '9.9.9.9',
    lan1RequiredNet: '10.1.0.0', lan1RequiredPrefix: 24,
    lan2RequiredNet: '192.168.30.0', lan2RequiredPrefix: 24,
    devices: [{ kind: 'pc', dhcp: true }, { kind: 'camera', dhcp: true }],
  },
];

/** Vzorové funkční řešení (výchozí ISP + tři podsítě). */
export function sampleConfig(): Config {
  return {
    'r1-wan-ip': '85.160.10.2', 'r1-wan-mask': '255.255.255.0', 'r1-wan-gw': '85.160.10.1', 'r1-wan-dns': '8.8.8.8',
    'r1-lan-ip': '192.168.1.1', 'r1-lan-mask': '255.255.255.0',
    'r2-wan-ip': '192.168.1.2', 'r2-wan-mask': '255.255.255.0', 'r2-wan-gw': '192.168.1.1', 'r2-wan-dns': '8.8.8.8',
    'r2-lan-ip': '10.0.0.1', 'r2-lan-mask': '255.255.255.0',
    'pc-ip': '10.0.0.10', 'pc-mask': '255.255.255.0', 'pc-gw': '10.0.0.1', 'pc-dns': '8.8.8.8',
  };
}
