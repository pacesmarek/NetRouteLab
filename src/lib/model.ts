/** 'isp' | 'r1' | 'r2' | 'pc' + přidaná zařízení ('dev-1', 'dev-2', …) */
export type NodeId = string;
export const FIXED_NODES: NodeId[] = ['isp', 'r1', 'r2', 'pc'];

export const FIXED_FIELD_IDS = [
  'r1-wan-ip', 'r1-wan-mask', 'r1-wan-gw', 'r1-wan-dns',
  'r1-lan-ip', 'r1-lan-mask',
  'r2-wan-ip', 'r2-wan-mask', 'r2-wan-gw', 'r2-wan-dns',
  'r2-lan-ip', 'r2-lan-mask',
  'pc-ip', 'pc-mask', 'pc-gw', 'pc-dns',
] as const;

/** Id pole: pevná ('r1-wan-ip'), zařízení ('dev-1-ip', 'dev-1-pub') nebo pravidlo PAT ('r1-pat-a-ext'). */
export type FieldId = string;
export type Config = Record<string, string>;

export const emptyConfig = (): Config =>
  Object.fromEntries(FIXED_FIELD_IDS.map((f) => [f, ''])) as Config;

/** Kterému zařízení pole patří. */
export function nodeOfField(id: FieldId): NodeId {
  if (id.startsWith('r1-')) return 'r1';
  if (id.startsWith('r2-')) return 'r2';
  return id.replace(/-(ip|mask|gw|dns|pub)$/, '');
}

export type LinkId = string; // 'link-r1-isp' | 'link-r2-r1' | `link-${klient}-r2`
export const linkOf = (device: NodeId): LinkId => `link-${device}-r2`;

// --- Přidaná zařízení v síti LAN 2 ---
export type DeviceKind = 'pc' | 'camera' | 'webserver';

export interface Device {
  id: NodeId; // 'dev-1'…
  kind: DeviceKind;
  name: string;
}

export const KIND_INFO: Record<DeviceKind, { label: string; port?: number; service?: string }> = {
  pc: { label: 'PC' },
  camera: { label: 'Kamera', port: 554, service: 'RTSP' },
  webserver: { label: 'Web server', port: 80, service: 'HTTP' },
};

/** Zařízení, ke kterému se přistupuje zvenku (PAT). */
export const isServer = (d: Device) => d.kind !== 'pc';

// --- Pravidla PAT (přesměrování portů) na routerech ---
export type RouterId = 'r1' | 'r2';
export interface Rules {
  r1: string[];
  r2: string[];
}
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
