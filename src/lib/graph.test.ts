import { describe, expect, it } from 'vitest';
import { assignmentOf, decodeDoc, docForScenario, emptyDoc, encodeDoc, sanitizeDoc } from './doc';
import { chainToRouter, descendants, inboundPath, linksOfPath, pingPath, traceHops } from './graph';
import { SCENARIOS, sampleConfig } from './model';

describe('graf připojení', () => {
  const up = { 'dev-2': 'dev-1', 'dev-3': 'dev-1', 'dev-4': 'dev-2' };
  it('cesta k Routeru 2 vede přes switche', () => {
    expect(chainToRouter({}, 'pc')).toEqual(['pc', 'r2']);
    expect(chainToRouter(up, 'dev-4')).toEqual(['dev-4', 'dev-2', 'dev-1', 'r2']);
  });
  it('smyčka nezacyklí', () => {
    const loop = { 'dev-1': 'dev-2', 'dev-2': 'dev-1' };
    const c = chainToRouter(loop, 'dev-1');
    expect(c[c.length - 1]).toBe('r2');
    expect(c.length).toBeLessThan(6);
  });
  it('potomci uzlu', () => {
    expect(descendants(up, ['pc', 'dev-1', 'dev-2', 'dev-3', 'dev-4'], 'dev-1').sort()).toEqual(['dev-2', 'dev-3', 'dev-4']);
  });
  it('cesty a kabely pro ping i přístup zvenku', () => {
    expect(pingPath(up, 'dev-3')).toEqual(['dev-3', 'dev-1', 'r2', 'r1', 'isp']);
    expect(linksOfPath(up, pingPath(up, 'dev-3'))).toEqual(['link-dev-3-dev-1', 'link-dev-1-r2', 'link-r2-r1', 'link-r1-isp']);
    expect(inboundPath(up, 'dev-3')).toEqual(['isp', 'r1', 'r2', 'dev-1', 'dev-3']);
    expect(linksOfPath(up, inboundPath(up, 'dev-3'))).toEqual(['link-r1-isp', 'link-r2-r1', 'link-dev-1-r2', 'link-dev-3-dev-1']);
  });
  it('traceroute má čtyři hopy', () => {
    const h = traceHops({ r2Lan: '10.0.0.1', r1Lan: '192.168.1.1', ispGw: '85.160.10.1', target: '8.8.8.8' });
    expect(h.map((x) => x.ip)).toEqual(['10.0.0.1', '192.168.1.1', '85.160.10.1', '8.8.8.8']);
    expect(h.at(-1)?.target).toBe(true);
  });
});

describe('dokument: odkaz a ověření', () => {
  it('round-trip přes odkaz', async () => {
    const doc = docForScenario(SCENARIOS[5]);
    doc.cfg = { ...doc.cfg, ...sampleConfig() };
    doc.positions['dev-1'] = { x: 3, y: 4 };
    const code = await encodeDoc(doc);
    expect(code.length).toBeLessThan(2000);
    const back = await decodeDoc(code);
    expect(back?.devices.map((d) => d.kind)).toEqual(['switch', 'webserver', 'camera']);
    expect(back?.uplinks).toEqual({ 'dev-2': 'dev-1', 'dev-3': 'dev-1' });
    expect(back?.cfg['r1-wan-ip']).toBe('85.160.10.2');
    expect(back?.scenario?.title).toBe(SCENARIOS[5].title);
    expect(back?.positions['dev-1']).toEqual({ x: 3, y: 4 });
  });
  it('zadání bez hodnot studenta', () => {
    const doc = docForScenario(SCENARIOS[4]);
    doc.cfg['r1-wan-ip'] = '1.2.3.4';
    const a = assignmentOf(doc);
    expect(a.cfg['r1-wan-ip']).toBe('');
    expect(a.devices).toHaveLength(3);
  });
  it('poškozená data nepoloží aplikaci', async () => {
    expect(await decodeDoc('z.@@@')).toBeNull();
    expect(await decodeDoc('x.abc')).toBeNull();
    expect(sanitizeDoc(null)).toBeNull();
    const d = sanitizeDoc({ cfg: { '<b>': 'x', 'pc-ip': 5 }, devices: [{ id: 'dev-1', kind: 'bomba' }, { id: 'dev-2', kind: 'camera', name: 'K' }], uplinks: { 'dev-2': 'dev-9', pc: 'dev-2' } });
    expect(d?.devices.map((x) => x.id)).toEqual(['dev-2']);
    expect(d?.cfg['<b>']).toBeUndefined();
    expect(d?.uplinks).toEqual({});
    expect(emptyDoc().devices).toEqual([]);
  });
});

import { resolveDhcp } from './dhcp';
import { DEFAULT_ISP, emptyConfig } from './model';
import { solve } from './plan';
import { simulate, simulateInbound } from './simulate';
import { ipMask } from './format';
import type { Config, Device } from './model';

describe('DHCP', () => {
  const devs: Device[] = [
    { id: 'dev-1', kind: 'camera', name: 'Kamera 1' },
    { id: 'dev-2', kind: 'pc', name: 'PC 2' },
  ];
  const base = (): Config => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    return { ...emptyConfig(), ...sol.cfg };
  };
  const withDhcp = (c: Config): Config => ({
    ...c, 'r2-dhcp-on': '1', 'r2-dhcp-start': '10.0.0.100', 'r2-dhcp-end': '10.0.0.150', 'r2-dhcp-dns': '8.8.8.8',
    'pc-dhcp': '1', 'dev-1-dhcp': '1',
  });
  const fmt = (a: string, p: number) => ipMask(a, p, false);

  it('přidělí adresy z rozsahu postupně a předá masku, bránu i DNS', () => {
    const r = resolveDhcp(withDhcp(base()), devs, false);
    expect(r.leases.pc).toMatchObject({ ip: '10.0.0.100', mask: '255.255.255.0', gw: '10.0.0.1', dns: '8.8.8.8' });
    expect(r.leases['dev-1'].ip).toBe('10.0.0.101');
    expect(r.leases['dev-2']).toBeUndefined(); // statické zařízení
    expect(Object.keys(r.problems)).toEqual([]);
  });

  it('přeskočí adresy ručně nastavených zařízení', () => {
    const c = withDhcp(base());
    c['dev-2-ip'] = '10.0.0.100';
    expect(resolveDhcp(c, devs, false).leases.pc.ip).toBe('10.0.0.101');
  });

  it('ping i přístup zvenku fungují s adresami z DHCP', () => {
    const c = withDhcp(base());
    const r = resolveDhcp(c, devs, false);
    // pravidlo PAT na R2 musí mířit na přidělenou adresu kamery
    const eff = { ...r.cfg, 'r2-pat-dev-1-ip': r.leases['dev-1'].ip };
    expect(simulate(eff, DEFAULT_ISP, null, false, fmt).ok).toBe(true);
    const sol = solve(DEFAULT_ISP, null, devs, false);
    expect(simulateInbound(eff, DEFAULT_ISP, false, fmt, devs[0], sol.rules, []).ok).toBe(true);
  });

  it('vypnutý DHCP server = klient bez adresy, chyba míří na přepínač DHCP', () => {
    const c = withDhcp(base());
    c['r2-dhcp-on'] = '';
    const r = resolveDhcp(c, devs, false);
    expect(r.problems.pc.fields).toEqual(['r2-dhcp-on']);
    expect(simulate(r.cfg, DEFAULT_ISP, null, false, fmt).ok).toBe(false);
  });

  it('rozsah mimo síť, obrácený a vyčerpaný', () => {
    const out = withDhcp(base()); out['r2-dhcp-start'] = '192.168.5.10'; out['r2-dhcp-end'] = '192.168.5.20';
    expect(resolveDhcp(out, devs, false).problems.pc.title).toContain('mimo síť');
    const rev = withDhcp(base()); rev['r2-dhcp-start'] = '10.0.0.150'; rev['r2-dhcp-end'] = '10.0.0.100';
    expect(resolveDhcp(rev, devs, false).problems.pc.title).toContain('obrácený');
    const tiny = withDhcp(base()); tiny['r2-dhcp-end'] = '10.0.0.100';
    const t = resolveDhcp(tiny, devs, false);
    expect(t.leases.pc.ip).toBe('10.0.0.100');
    expect(t.problems['dev-1'].title).toContain('vyčerpán');
  });

  it('bez DHCP klientů se konfigurace nemění', () => {
    const c = base();
    expect(resolveDhcp(c, devs, false).cfg).toBe(c);
  });
});
