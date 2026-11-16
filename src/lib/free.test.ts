import { describe, expect, it } from 'vitest';
import { resolveDhcp } from './dhcp';
import { canParent, dhcpConflicts, dhcpServerOf, isWifiLink, pathAndLinks, routersUp, simulateFree, simulateInboundFree, traceHopsFree, treeLayout, type Topo } from './free';
import { ipMask } from './format';
import { DEFAULT_ISP, type Config, type Device } from './model';

const fmt = (a: string, p: number) => ipMask(a, p, false);
const dev = (id: string, kind: Device['kind'], extra: Partial<Device> = {}): Device => ({ id, kind, name: id, ...extra });

/** ISP → r1 → switch → dev-1 (router) → dev-2 (PC); r1 má LAN 192.168.1.0/24, dev-1 LAN 10.0.0.0/24 */
function chain(): { t: Topo; cfg: Config } {
  const t: Topo = {
    devices: [dev('dev-1', 'router'), dev('dev-2', 'pc'), dev('dev-3', 'switch')],
    uplinks: { 'dev-3': 'r1', 'dev-1': 'dev-3', 'dev-2': 'dev-1' },
  };
  const cfg: Config = {
    'r1-wan-ip': '85.160.10.2', 'r1-wan-mask': '255.255.255.0', 'r1-wan-gw': '85.160.10.1', 'r1-wan-dns': '8.8.8.8',
    'r1-lan-ip': '192.168.1.1', 'r1-lan-mask': '255.255.255.0',
    'dev-1-wan-ip': '192.168.1.2', 'dev-1-wan-mask': '255.255.255.0', 'dev-1-wan-gw': '192.168.1.1', 'dev-1-wan-dns': '8.8.8.8',
    'dev-1-lan-ip': '10.0.0.1', 'dev-1-lan-mask': '255.255.255.0',
    'dev-2-ip': '10.0.0.10', 'dev-2-mask': '255.255.255.0', 'dev-2-gw': '10.0.0.1', 'dev-2-dns': '8.8.8.8',
  };
  return { t, cfg };
}
const ping = (cfg: Config, t: Topo, id = 'dev-2') => simulateFree(cfg, DEFAULT_ISP, t, id, false, fmt);

describe('volné plátno – topologie', () => {
  it('zjistí routery nad zařízením přes switch', () => {
    const { t } = chain();
    expect(routersUp(t, 'dev-2')).toEqual({ routers: ['dev-1', 'r1'], ispReached: true });
    expect(pathAndLinks(t, 'dev-2').path).toEqual(['dev-2', 'dev-1', 'dev-3', 'r1', 'isp']);
  });
  it('zakáže smyčky a klienta pod ISP', () => {
    const { t } = chain();
    expect(canParent(t, 'dev-3', 'dev-2')).toBe(false); // PC nemá porty
    expect(canParent(t, 'dev-3', 'dev-1')).toBe(false); // switch je nad routerem → smyčka
    expect(canParent(t, 'dev-2', 'isp')).toBe(false);
    expect(canParent(t, 'dev-1', 'isp')).toBe(true);
    expect(canParent(t, 'r1', 'dev-1')).toBe(false);
  });
  it('rozmístí strom do řádků', () => {
    const { t } = chain();
    const pos = treeLayout(t, 15, 15.5);
    expect(pos.r1.y).toBeGreaterThan(pos.isp.y);
    expect(pos['dev-2'].y).toBeGreaterThan(pos['dev-1'].y);
  });
});

describe('volné plátno – ping', () => {
  it('trojitý NAT přes switch projde', () => {
    const { t, cfg } = chain();
    const r = ping(cfg, t);
    expect(r.ok).toBe(true);
    expect(r.logs.filter((l) => l.type === 'success').length).toBe(4); // 3 úseky + DNS
    expect(traceHopsFree(cfg, DEFAULT_ISP, t, 'dev-2').length).toBe(4);
  });
  it('nezapojené zařízení zastaví paket na sobě', () => {
    const { t, cfg } = chain();
    delete t.uplinks['dev-2'];
    const r = ping(cfg, t);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('dev-2');
  });
  it('špatná brána na vnitřním routeru zastaví paket na horním routeru', () => {
    const { t, cfg } = chain();
    cfg['dev-1-wan-gw'] = '192.168.1.99';
    const r = ping(cfg, t);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('r1');
    expect(r.errorFields).toContain('dev-1-wan-gw');
  });
  it('shodná IP dvou zařízení v jedné síti je konflikt', () => {
    const { t, cfg } = chain();
    t.devices.push(dev('dev-4', 'pc'));
    t.uplinks['dev-4'] = 'dev-1';
    Object.assign(cfg, { 'dev-4-ip': '10.0.0.10', 'dev-4-mask': '255.255.255.0', 'dev-4-gw': '10.0.0.1', 'dev-4-dns': '8.8.8.8' });
    const r = ping(cfg, t);
    expect(r.ok).toBe(false);
    expect(r.logs[r.logs.length - 1].title).toContain('Konflikt');
  });
  it('router za bezdrátovým klientem projde, klient s více zařízeními ne', () => {
    const { t, cfg } = chain();
    // dev-3: switch → AP vysílač; dev-5: AP Klient pod ním; router dev-1 za klientem
    t.devices.push(dev('dev-5', 'ap', { apMode: 'client' }));
    t.devices[2] = dev('dev-3', 'ap');
    t.uplinks['dev-5'] = 'dev-3';
    t.uplinks['dev-1'] = 'dev-5';
    expect(isWifiLink(t, 'dev-5', 'dev-3')).toBe(true);
    expect(isWifiLink(t, 'dev-1', 'dev-5')).toBe(false);
    expect(ping(cfg, t).ok).toBe(true);
    t.devices.push(dev('dev-6', 'pc'));
    t.uplinks['dev-6'] = 'dev-5';
    const r = ping(cfg, t);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('dev-5');
  });
  it('AP v režimu Klient potřebuje bezdrátové spojení', () => {
    const { t, cfg } = chain();
    t.devices[2] = dev('dev-3', 'ap', { apMode: 'bridge' });
    const r = ping(cfg, t);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('dev-3');
  });
});

describe('volné plátno – PAT přes dva routery', () => {
  it('web server za vnitřním routerem', () => {
    const { t, cfg } = chain();
    t.devices.push(dev('dev-7', 'webserver'));
    t.uplinks['dev-7'] = 'dev-1';
    Object.assign(cfg, {
      'dev-7-ip': '10.0.0.20', 'dev-7-mask': '255.255.255.0', 'dev-7-gw': '10.0.0.1', 'dev-7-dns': '8.8.8.8', 'dev-7-pub': '8080',
      'r1-pat-n1-ext': '8080', 'r1-pat-n1-ip': '192.168.1.2', 'r1-pat-n1-port': '8080',
      'dev-1-pat-n2-ext': '8080', 'dev-1-pat-n2-ip': '10.0.0.20', 'dev-1-pat-n2-port': '80',
    });
    const rules = { r1: ['n1'], 'dev-1': ['n2'] };
    const ok = simulateInboundFree(cfg, DEFAULT_ISP, t, 'dev-7', rules, false, fmt);
    expect(ok.ok).toBe(true);
    const noRule = simulateInboundFree(cfg, DEFAULT_ISP, t, 'dev-7', { r1: ['n1'], 'dev-1': [] }, false, fmt);
    expect(noRule.ok).toBe(false);
    expect(noRule.stopNode).toBe('dev-1');
    cfg['dev-1-pat-n2-port'] = '8080';
    expect(simulateInboundFree(cfg, DEFAULT_ISP, t, 'dev-7', rules, false, fmt).errorFields).toContain('dev-1-pat-n2-port');
  });
});

describe('volné plátno – DHCP', () => {
  const topo = (t: Topo, cfg: Config) => ({
    serverOf: (id: string) => dhcpServerOf(t, cfg, id),
    nameOf: (id: string) => t.devices.find((d) => d.id === id)?.name ?? id,
    gatewayField: (s: string) => (t.devices.find((d) => d.id === s)?.kind === 'ap' ? `${s}-dhcp-gw` : null),
  });
  it('router přidělí adresu klientovi za sebou', () => {
    const { t, cfg } = chain();
    Object.assign(cfg, { 'dev-2-dhcp': '1', 'dev-2-ip': '', 'dev-1-dhcp-on': '1', 'dev-1-dhcp-start': '10.0.0.100', 'dev-1-dhcp-end': '10.0.0.110', 'dev-1-dhcp-dns': '8.8.8.8' });
    const d = resolveDhcp(cfg, t.devices, false, topo(t, cfg));
    expect(d.leases['dev-2'].ip).toBe('10.0.0.100');
    expect(d.leases['dev-2'].gw).toBe('10.0.0.1');
    expect(ping(d.cfg, t).ok).toBe(true);
  });
  it('DHCP na AP s vlastní bránou a upozornění na dva servery', () => {
    const { t, cfg } = chain();
    t.devices.push(dev('dev-8', 'ap'), dev('dev-9', 'pc'));
    t.uplinks['dev-8'] = 'dev-1';
    t.uplinks['dev-9'] = 'dev-8';
    Object.assign(cfg, {
      'dev-9-dhcp': '1', 'dev-8-dhcp-on': '1', 'dev-8-lan-ip': '10.0.0.2', 'dev-8-lan-mask': '255.255.255.0',
      'dev-8-dhcp-start': '10.0.0.50', 'dev-8-dhcp-end': '10.0.0.60', 'dev-8-dhcp-gw': '10.0.0.1', 'dev-8-dhcp-dns': '1.1.1.1',
    });
    const d = resolveDhcp(cfg, t.devices, false, topo(t, cfg));
    expect(d.leases['dev-9'].ip).toBe('10.0.0.50');
    expect(d.leases['dev-9'].server).toBe('dev-8');
    expect(Object.keys(dhcpConflicts(t, cfg))).toEqual([]);
    Object.assign(cfg, { 'dev-1-dhcp-on': '1', 'dev-1-dhcp-start': '10.0.0.55', 'dev-1-dhcp-end': '10.0.0.70', 'dev-1-dhcp-dns': '8.8.8.8' });
    const c = dhcpConflicts(t, cfg);
    expect(Object.keys(c).sort()).toEqual(['dev-1', 'dev-8']);
    expect(c['dev-1']).toContain('překrývají');
  });
  it('nezapojený klient s DHCP hlásí chybu', () => {
    const { t, cfg } = chain();
    delete t.uplinks['dev-2'];
    cfg['dev-2-dhcp'] = '1';
    const d = resolveDhcp(cfg, t.devices, false, topo(t, cfg));
    expect(d.problems['dev-2']).toBeTruthy();
  });
});

import { playgroundDoc, sanitizeDoc } from './doc';
describe('volné plátno – dokument', () => {
  it('zachová routery a odstraní smyčky v zapojení', () => {
    const d = playgroundDoc();
    d.devices = [dev('dev-1', 'router'), dev('dev-2', 'switch'), dev('dev-3', 'pc')];
    d.uplinks = { 'dev-1': 'dev-2', 'dev-2': 'dev-1', 'dev-3': 'dev-1' }; // dev-1 ↔ dev-2 = smyčka
    const out = sanitizeDoc(JSON.parse(JSON.stringify(d)))!;
    expect(out.mode).toBe('playground');
    expect(out.devices.map((x) => x.kind)).toEqual(['router', 'switch', 'pc']);
    expect(out.uplinks['dev-1']).toBe('dev-2');
    expect(out.uplinks['dev-2']).toBeUndefined();
    expect(out.cfg['dev-1-wan-ip']).toBe('');
    expect(out.rules['dev-1'] ?? []).toEqual([]);
  });
  it('router mimo volné plátno se zahodí', () => {
    const out = sanitizeDoc({ mode: 'default', devices: [{ id: 'dev-1', kind: 'router', name: 'x' }] })!;
    expect(out.devices).toEqual([]);
  });
});
