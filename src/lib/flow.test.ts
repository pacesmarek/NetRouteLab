import { describe, expect, it } from 'vitest';
import { fmtMask, ipMask } from './format';
import { DEFAULT_ISP, SCENARIOS, emptyConfig, isServer, ruleField, sampleConfig, type Config, type Device, type IspConfig, type Rules, type Scenario } from './model';
import { analyzeInterface, parseSubnetMask } from './net';
import { makePlan, solve } from './plan';
import { simulate, simulateInbound } from './simulate';

const run = (cfg: Config, isp: IspConfig, sc: Scenario | null, cidr = false) =>
  simulate(cfg, isp, sc, cidr, (a, p) => ipMask(a, p, cidr));

/** Vyplní konfiguraci přesně tak, jak by to udělal průvodce. */
function planConfig(isp: IspConfig, sc: Scenario | null, cidr = false): Config {
  const p = makePlan(isp, sc);
  const m1 = fmtMask(p.l1.prefix, cidr);
  const m2 = fmtMask(p.l2.prefix, cidr);
  const mw = fmtMask(p.ispPrefix, cidr);
  return {
    'r1-wan-ip': p.r1Wan, 'r1-wan-mask': mw, 'r1-wan-gw': p.ispGw, 'r1-wan-dns': p.dns,
    'r1-lan-ip': p.r1Lan, 'r1-lan-mask': m1,
    'r2-wan-ip': p.r2Wan, 'r2-wan-mask': m1, 'r2-wan-gw': p.r1Lan, 'r2-wan-dns': p.dns,
    'r2-lan-ip': p.r2Lan, 'r2-lan-mask': m2,
    'pc-ip': p.pc, 'pc-mask': m2, 'pc-gw': p.r2Lan, 'pc-dns': p.dns,
  };
}

describe('masky', () => {
  it('dekadicky vždy, lomeně jen když je povoleno', () => {
    expect(parseSubnetMask('255.255.255.0', false)?.prefix).toBe(24);
    expect(parseSubnetMask('/24', false)).toBeNull();
    expect(parseSubnetMask('24', false)).toBeNull();
    expect(parseSubnetMask('/24', true)?.prefix).toBe(24);
  });
  it('odmítne nesouvislou masku', () => {
    expect(parseSubnetMask('255.0.255.0', false)).toBeNull();
  });
  it('spočítá síť a broadcast', () => {
    const i = analyzeInterface('192.168.1.77', '255.255.255.192', false);
    expect(i.valid && i.networkStr).toBe('192.168.1.64');
    expect(i.valid && i.broadcastStr).toBe('192.168.1.127');
  });
});

describe('simulace', () => {
  it('vzorové řešení projde', () => {
    const r = run(sampleConfig(), DEFAULT_ISP, null);
    expect(r.ok).toBe(true);
    expect(r.stopNode).toBe('isp');
  });

  it('prázdná konfigurace selže na PC', () => {
    const r = run(emptyConfig(), DEFAULT_ISP, null);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('pc');
  });

  it('špatná brána na PC zastaví paket na R2 a označí pole', () => {
    const cfg = { ...sampleConfig(), 'pc-gw': '10.0.0.5' };
    const r = run(cfg, DEFAULT_ISP, null);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('r2');
    expect(r.errorFields).toContain('pc-gw');
  });

  it('špatná brána na R1 zastaví paket na R1', () => {
    const cfg = { ...sampleConfig(), 'r1-wan-gw': '85.160.10.99' };
    const r = run(cfg, DEFAULT_ISP, null);
    expect(r.stopNode).toBe('r1');
    expect(r.errorFields).toEqual(['r1-wan-gw']);
  });

  it('lomená maska je při vypnutém CIDR chyba', () => {
    const cfg = { ...sampleConfig(), 'pc-mask': '/24' };
    expect(run(cfg, DEFAULT_ISP, null, false).ok).toBe(false);
    expect(run(cfg, DEFAULT_ISP, null, true).ok).toBe(true);
  });

  it('překrývající se podsítě na R1 jsou chyba', () => {
    const cfg = { ...sampleConfig(), 'r1-lan-ip': '85.160.10.20' };
    expect(run(cfg, DEFAULT_ISP, null).ok).toBe(false);
  });

  it('zadání scénáře vynucuje požadované podsítě', () => {
    const sc = SCENARIOS[0];
    const isp: IspConfig = { gwIp: sc.ispGw, gwMask: sc.ispMask, dnsIp: sc.ispDns };
    const r = run(planConfig({ ...isp }, null), isp, sc); // řešení pro jiné podsítě
    expect(r.ok).toBe(false);
  });
});

describe('řešení z průvodce', () => {
  it('projde pro vzorové zadání', () => {
    expect(run(planConfig(DEFAULT_ISP, null), DEFAULT_ISP, null).ok).toBe(true);
  });
  for (const sc of SCENARIOS) {
    for (const cidr of [false, true]) {
      it(`projde pro ${sc.title.slice(0, 10)} (CIDR ${cidr})`, () => {
        const isp: IspConfig = { gwIp: sc.ispGw, gwMask: sc.ispMask, dnsIp: sc.ispDns };
        const r = run(planConfig(isp, sc, cidr), isp, sc, cidr);
        expect(r.logs.at(-1)?.title).toBeDefined();
        expect(r.ok).toBe(true);
      });
    }
  }
});

describe('veřejné porty v řešení', () => {
  it('kamery 8081, 8082, …; web server 8080', () => {
    const ds: Device[] = [
      { id: 'dev-1', kind: 'camera', name: 'K1' }, { id: 'dev-2', kind: 'webserver', name: 'W1' },
      { id: 'dev-3', kind: 'camera', name: 'K2' }, { id: 'dev-4', kind: 'camera', name: 'K3' },
      { id: 'dev-5', kind: 'webserver', name: 'W2' },
    ];
    const sol = solve(DEFAULT_ISP, null, ds, false);
    expect(ds.map((d) => sol.pub[d.id])).toEqual([8081, 8080, 8082, 8083, 9080]);
  });
});

describe('přidaná zařízení a PAT', () => {
  const devs: Device[] = [
    { id: 'dev-1', kind: 'camera', name: 'Kamera 1' },
    { id: 'dev-2', kind: 'webserver', name: 'Web server 1' },
    { id: 'dev-3', kind: 'pc', name: 'PC 2' },
    { id: 'dev-4', kind: 'camera', name: 'Kamera 2' },
  ];
  const others = (cfgDevs: Device[], self: string) => [
    { name: 'Klientské PC', field: 'pc-ip' },
    ...cfgDevs.filter((d) => d.id !== self).map((d) => ({ name: d.name, field: `${d.id}-ip` })),
  ];

  for (const sc of [null, ...SCENARIOS]) {
    it(`řešení projde (ping z PC i přístup zvenku) – ${sc ? sc.title.slice(0, 10) : 'vzorové'}`, () => {
      const isp: IspConfig = sc ? { gwIp: sc.ispGw, gwMask: sc.ispMask, dnsIp: sc.ispDns } : DEFAULT_ISP;
      const sol = solve(isp, sc, devs, false);
      expect(run(sol.cfg, isp, sc).ok).toBe(true);
      const pc2 = simulate(sol.cfg, isp, sc, false, (a, p) => ipMask(a, p, false), { id: 'dev-3', name: 'PC 2' }, others(devs, 'dev-3'));
      expect(pc2.ok).toBe(true);
      for (const d of devs.filter(isServer)) {
        const r = simulateInbound(sol.cfg, isp, false, (a, p) => ipMask(a, p, false), d, sol.rules, others(devs, d.id));
        expect(r.logs.at(-1)?.title).toContain('dostupné z internetu');
        expect(r.ok).toBe(true);
      }
    });
  }

  const inbound = (cfg: Config, rules: Rules, d: Device) =>
    simulateInbound(cfg, DEFAULT_ISP, false, (a, p) => ipMask(a, p, false), d, rules, others(devs, d.id));

  it('bez pravidla PAT na R1 spojení selže na R1', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const r = inbound(sol.cfg, { r1: [], r2: sol.rules.r2 }, devs[0]);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('r1');
  });

  it('bez pravidla PAT na R2 spojení selže na R2', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const r = inbound(sol.cfg, { r1: sol.rules.r1, r2: [] }, devs[0]);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('r2');
  });

  it('špatný cílový port (kamera nemá port 80) selže na R2', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const cfg = { ...sol.cfg, [ruleField('r2', 'dev-1', 'port')]: '80' };
    const r = inbound(cfg, sol.rules, devs[0]);
    expect(r.ok).toBe(false);
    expect(r.stopNode).toBe('r2');
    expect(r.errorFields).toEqual([ruleField('r2', 'dev-1', 'port')]);
  });

  it('pravidlo na R1 míří přímo na kameru (ignoruje druhý router) selže na R1', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const cfg = { ...sol.cfg, [ruleField('r1', 'dev-1', 'ip')]: sol.cfg['dev-1-ip'] };
    const r = inbound(cfg, sol.rules, devs[0]);
    expect(r.stopNode).toBe('r1');
  });

  it('dvě kamery na stejném vnějším portu = konflikt', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const cfg = { ...sol.cfg, [ruleField('r1', 'dev-4', 'ext')]: sol.cfg[ruleField('r1', 'dev-1', 'ext')] };
    const r = inbound(cfg, sol.rules, devs[0]);
    expect(r.ok).toBe(false);
    expect(r.logs.at(-1)?.title).toContain('stejný vnější port');
  });

  it('shodná IP kamery a PC je konflikt', () => {
    const sol = solve(DEFAULT_ISP, null, devs, false);
    const cfg = { ...sol.cfg, 'dev-1-ip': sol.cfg['pc-ip'] };
    const r = inbound(cfg, sol.rules, devs[0]);
    expect(r.ok).toBe(false);
  });
});
