import { fmtMask } from './format';
import { KIND_INFO, emptyRules, isServer, ruleField, type Config, type Device, type IspConfig, type Rules, type Scenario } from './model';
import { analyzeInterface, ipToLong, longToIp, prefixToMaskStr } from './net';

export interface Plan {
  ispGw: string;
  ispPrefix: number;
  dns: string;
  r1Wan: string;
  r1Lan: string;
  r2Wan: string;
  r2Lan: string;
  pc: string;
  l1: { net: string; prefix: number };
  l2: { net: string; prefix: number };
}

/** Správné řešení pro aktuální zadání (ISP + případné požadavky na podsítě). */
export function makePlan(isp: IspConfig, scenario: Scenario | null): Plan {
  const ispI = analyzeInterface(isp.gwIp, isp.gwMask, true);
  if (!ispI.valid) throw new Error('Neplatná konfigurace ISP');

  const l1 = scenario
    ? { net: scenario.lan1RequiredNet, prefix: scenario.lan1RequiredPrefix }
    : { net: '192.168.1.0', prefix: 24 };
  const l2 = scenario
    ? { net: scenario.lan2RequiredNet, prefix: scenario.lan2RequiredPrefix }
    : { net: '10.0.0.0', prefix: 24 };

  let wan = ispI.ipLong + 1;
  if (wan >= ispI.broadcastLong) wan = ispI.ipLong - 1;

  const n1 = ipToLong(l1.net)!;
  const n2 = ipToLong(l2.net)!;
  const lan2 = analyzeInterface(longToIp(n2 + 1), prefixToMaskStr(l2.prefix), true);
  let pc = n2 + 10;
  if (lan2.valid && pc >= lan2.broadcastLong) pc = n2 + 2;

  return {
    ispGw: ispI.ipStr,
    ispPrefix: ispI.prefix,
    dns: isp.dnsIp,
    r1Wan: longToIp(wan),
    r1Lan: longToIp(n1 + 1),
    r2Wan: longToIp(n1 + 2),
    r2Lan: longToIp(n2 + 1),
    pc: longToIp(pc),
    l1,
    l2,
  };
}

// ============================================================================
// Kompletní řešení včetně přidaných zařízení a pravidel PAT
// ============================================================================

export interface Solution {
  /** Hodnoty všech polí (pevná, zařízení, pravidla PAT). */
  cfg: Config;
  /** Pravidla PAT (id pravidla = id serverového zařízení). */
  rules: Rules;
  /** Veřejné porty serverových zařízení. */
  pub: Record<string, number>;
}

/** Spočítá správné hodnoty pro všechna pole. Maska se formátuje podle zvoleného režimu (dekadicky / CIDR). */
export function solve(isp: IspConfig, scenario: Scenario | null, devices: Device[], cidr: boolean): Solution {
  const p = makePlan(isp, scenario);
  const m1 = fmtMask(p.l1.prefix, cidr);
  const m2 = fmtMask(p.l2.prefix, cidr);
  const mw = fmtMask(p.ispPrefix, cidr);

  const cfg: Config = {
    'r1-wan-ip': p.r1Wan, 'r1-wan-mask': mw, 'r1-wan-gw': p.ispGw, 'r1-wan-dns': p.dns,
    'r1-lan-ip': p.r1Lan, 'r1-lan-mask': m1,
    'r2-wan-ip': p.r2Wan, 'r2-wan-mask': m1, 'r2-wan-gw': p.r1Lan, 'r2-wan-dns': p.dns,
    'r2-lan-ip': p.r2Lan, 'r2-lan-mask': m2,
    'pc-ip': p.pc, 'pc-mask': m2, 'pc-gw': p.r2Lan, 'pc-dns': p.dns,
  };

  // volné adresy v LAN 2 pro další zařízení
  const n2 = ipToLong(p.l2.net)!;
  const lan2 = analyzeInterface(longToIp(n2 + 1), prefixToMaskStr(p.l2.prefix), true);
  const used = new Set<number>([n2, n2 + 1, ipToLong(p.pc)!]);
  const alloc = (): string => {
    const max = lan2.valid ? lan2.broadcastLong : n2 + 1;
    for (let a = n2 + 11; a < max; a++) if (!used.has(a)) { used.add(a); return longToIp(a); }
    for (let a = n2 + 2; a < max; a++) if (!used.has(a)) { used.add(a); return longToIp(a); }
    return longToIp(n2 + 2);
  };

  const rules = emptyRules();
  const pub: Record<string, number> = {};
  let serverIdx = 0;
  for (const d of devices) {
    const ip = alloc();
    cfg[`${d.id}-ip`] = ip;
    cfg[`${d.id}-mask`] = m2;
    cfg[`${d.id}-gw`] = p.r2Lan;
    cfg[`${d.id}-dns`] = p.dns;
    if (isServer(d)) {
      const port = 8080 + serverIdx++;
      pub[d.id] = port;
      cfg[`${d.id}-pub`] = String(port);
      rules.r1.push(d.id);
      rules.r2.push(d.id);
      cfg[ruleField('r1', d.id, 'ext')] = String(port);
      cfg[ruleField('r1', d.id, 'ip')] = p.r2Wan;
      cfg[ruleField('r1', d.id, 'port')] = String(port);
      cfg[ruleField('r2', d.id, 'ext')] = String(port);
      cfg[ruleField('r2', d.id, 'ip')] = ip;
      cfg[ruleField('r2', d.id, 'port')] = String(KIND_INFO[d.kind].port);
    }
  }
  return { cfg, rules, pub };
}
