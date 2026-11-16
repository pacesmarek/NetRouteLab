export type NodeId = 'isp' | 'r1' | 'r2' | 'pc';
export const NODE_ORDER: NodeId[] = ['isp', 'r1', 'r2', 'pc'];

export const FIELD_IDS = [
  'r1-wan-ip', 'r1-wan-mask', 'r1-wan-gw', 'r1-wan-dns',
  'r1-lan-ip', 'r1-lan-mask',
  'r2-wan-ip', 'r2-wan-mask', 'r2-wan-gw', 'r2-wan-dns',
  'r2-lan-ip', 'r2-lan-mask',
  'pc-ip', 'pc-mask', 'pc-gw', 'pc-dns',
] as const;
export type FieldId = (typeof FIELD_IDS)[number];
export type Config = Record<FieldId, string>;

export const emptyConfig = (): Config =>
  Object.fromEntries(FIELD_IDS.map((f) => [f, ''])) as Config;

export function nodeOfField(id: FieldId): NodeId {
  return id.startsWith('r1') ? 'r1' : id.startsWith('r2') ? 'r2' : 'pc';
}

export type LinkId = 'link-r1-isp' | 'link-r2-r1' | 'link-pc-r2';

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
