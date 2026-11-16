import { describe, expect, it } from 'vitest';
import { fmtMask, ipMask } from './format';
import { DEFAULT_ISP, SCENARIOS, emptyConfig, sampleConfig, type Config, type IspConfig, type Scenario } from './model';
import { analyzeInterface, parseSubnetMask } from './net';
import { makePlan } from './plan';
import { simulate } from './simulate';

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
