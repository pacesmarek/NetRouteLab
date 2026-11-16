import { analyzeInterface, ipToLong, longToIp, prefixToMaskStr } from './net';
import type { IspConfig, Scenario } from './model';

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
