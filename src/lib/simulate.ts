import type { MaskFormatter } from './format';
import { analyzeInterface, ipToLong, isIpInSubnet, isSameSubnet, parseSubnetMask, subnetsOverlap } from './net';
import type { Config, FieldId, IspConfig, LogItem, NodeId, Scenario } from './model';

export interface SimResult {
  ok: boolean;
  /** Zařízení, u kterého paket skončil (při úspěchu je to 'isp'). */
  stopNode: NodeId;
  logs: LogItem[];
  /** Pole, která mají být označena jako chybná. */
  errorFields: FieldId[];
}

/**
 * Validační a simulační engine: kontroluje všechny vrstvy od PC přes R2 a R1 až k ISP a DNS.
 * Čistá funkce – žádný přístup k DOM.
 */
export function simulate(
  cfg: Config,
  isp: IspConfig,
  scenario: Scenario | null,
  allowCidr: boolean,
  fmt: MaskFormatter,
): SimResult {
  const logs: LogItem[] = [];
  const A = (ip: string, mask: string) => analyzeInterface(ip, mask, allowCidr);
  const mask = (s: string) => parseSubnetMask(s, allowCidr);

  const fail = (stopNode: NodeId, title: string, text: string, errorFields: FieldId[]): SimResult => {
    logs.push({ type: 'error', title, text });
    return { ok: false, stopNode, logs, errorFields };
  };
  const pass = (title: string, text: string) => logs.push({ type: 'success', title, text });
  /** Kterému z polí vyčítat chybu – pokud žádné není konkrétně špatně, označí se obě. */
  const pick = (bad: FieldId[], fallback: FieldId[]) => (bad.length ? bad : fallback);

  // --- KROK 0: ISP ---
  const ispI = A(isp.gwIp, isp.gwMask);
  const ispDnsLong = ipToLong(isp.dnsIp);
  if (!ispI.valid || !ispI.isHostUsable || ispDnsLong === null) {
    return fail('isp', 'Neplatné parametry ISP', 'Zkontrolujte IP adresu a masku brány ISP nebo cílového DNS serveru.', []);
  }

  // --- KROK 1: Klientské PC ---
  const pc = A(cfg['pc-ip'], cfg['pc-mask']);
  const pcGw = cfg['pc-gw'];
  if (!pc.valid) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg['pc-ip']) === null) bad.push('pc-ip');
    if (mask(cfg['pc-mask']) === null) bad.push('pc-mask');
    return fail('pc', 'Chyba na Klientském PC (IP / Maska)',
      'IPv4 adresa nebo maska podsítě klientského PC má neplatný formát (nebo chybí).', pick(bad, ['pc-ip', 'pc-mask']));
  }
  if (!pc.isHostUsable) {
    return fail('pc', 'Chyba na Klientském PC (Rezervovaná adresa)',
      `Zadaná adresa ${fmt(pc.ipStr, pc.prefix)} je ${pc.isNetworkAddress ? 'adresa sítě (Network ID)' : 'všesměrová adresa (Broadcast)'} a nelze ji přiřadit počítači.`, ['pc-ip']);
  }
  if (ipToLong(pcGw) === null) {
    return fail('pc', 'Chyba na Klientském PC (Výchozí brána)',
      'Klientské PC nemá nastavenou platnou IP adresu výchozí brány (Default Gateway), proto neví, kam posílat pakety mimo svou síť.', ['pc-gw']);
  }
  if (!isIpInSubnet(pcGw, pc)) {
    return fail('pc', 'Chyba na Klientském PC (Nedosažitelná brána)',
      `Výchozí brána PC (${pcGw.trim()}) neleží ve stejné podsíti jako samotné PC (${fmt(pc.networkStr, pc.prefix)}).`, ['pc-gw', 'pc-ip', 'pc-mask']);
  }

  // --- KROK 2: Router 2 – LAN ---
  const r2Lan = A(cfg['r2-lan-ip'], cfg['r2-lan-mask']);
  if (!r2Lan.valid || !r2Lan.isHostUsable) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg['r2-lan-ip']) === null || (r2Lan.valid && !r2Lan.isHostUsable)) bad.push('r2-lan-ip');
    if (mask(cfg['r2-lan-mask']) === null) bad.push('r2-lan-mask');
    return fail('r2', 'Chyba na Routeru 2 (LAN rozhraní)',
      !r2Lan.valid
        ? 'Vnitřní rozhraní (LAN) Routeru 2 nemá platnou IP adresu nebo masku podsítě.'
        : `Adresa ${fmt(r2Lan.ipStr, r2Lan.prefix)} na LAN rozhraní Routeru 2 je adresa sítě nebo broadcastu.`,
      pick(bad, ['r2-lan-ip', 'r2-lan-mask']));
  }
  if (!isSameSubnet(pc, r2Lan)) {
    return fail('r2', 'Neshoda podsítě mezi PC a Routerem 2 (LAN)',
      `Klientské PC (${fmt(pc.ipStr, pc.prefix)}, síť ${fmt(pc.networkStr, pc.prefix)}) není ve stejné podsíti jako LAN rozhraní Routeru 2 (${fmt(r2Lan.ipStr, r2Lan.prefix)}, síť ${fmt(r2Lan.networkStr, r2Lan.prefix)}).`,
      ['pc-ip', 'pc-mask', 'r2-lan-ip', 'r2-lan-mask']);
  }
  if (pc.ipLong === r2Lan.ipLong) {
    return fail('r2', 'Konflikt IP adres v síti LAN 2',
      `Klientské PC i LAN rozhraní Routeru 2 mají shodnou IP adresu (${pc.ipStr}). Každé zařízení v síti musí mít unikátní IP.`, ['pc-ip', 'r2-lan-ip']);
  }
  if (ipToLong(pcGw) !== r2Lan.ipLong) {
    return fail('r2', 'Špatná výchozí brána na Klientském PC',
      `Klientské PC má nastavenou bránu ${pcGw.trim()}, ale LAN rozhraní Routeru 2 má adresu ${r2Lan.ipStr}. Paket se nedostane na router.`, ['pc-gw', 'r2-lan-ip']);
  }
  if (scenario && (r2Lan.networkStr !== scenario.lan2RequiredNet || r2Lan.prefix !== scenario.lan2RequiredPrefix)) {
    return fail('r2', 'Nesplněno zadání pro síť LAN 2',
      `Zadání vyžaduje pro síť mezi Routerem 2 a PC rozsah ${fmt(scenario.lan2RequiredNet, scenario.lan2RequiredPrefix)}, ale nakonfigurována je síť ${fmt(r2Lan.networkStr, r2Lan.prefix)}.`,
      ['r2-lan-ip', 'r2-lan-mask', 'pc-ip', 'pc-mask']);
  }
  pass('1. úsek OK: Klientské PC ↔ Router 2 (LAN)',
    `PC (${fmt(pc.ipStr, pc.prefix)}) úspěšně předalo paket své výchozí bráně na Routeru 2 (${fmt(r2Lan.ipStr, r2Lan.prefix)}).`);

  // --- KROK 3: Router 2 – WAN ---
  const r2Wan = A(cfg['r2-wan-ip'], cfg['r2-wan-mask']);
  const r2WanGw = cfg['r2-wan-gw'];
  if (!r2Wan.valid || !r2Wan.isHostUsable) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg['r2-wan-ip']) === null || (r2Wan.valid && !r2Wan.isHostUsable)) bad.push('r2-wan-ip');
    if (mask(cfg['r2-wan-mask']) === null) bad.push('r2-wan-mask');
    return fail('r2', 'Chyba na Routeru 2 (WAN rozhraní)',
      !r2Wan.valid
        ? 'Vnější rozhraní (WAN) Routeru 2 nemá platnou IP adresu nebo masku podsítě.'
        : `Adresa ${fmt(r2Wan.ipStr, r2Wan.prefix)} na WAN rozhraní Routeru 2 je rezervovaná (síť/broadcast).`,
      pick(bad, ['r2-wan-ip', 'r2-wan-mask']));
  }
  if (subnetsOverlap(r2Lan, r2Wan)) {
    return fail('r2', 'Kolize podsítí na Routeru 2 (WAN vs. LAN)',
      `Router nemůže směrovat mezi dvěma překrývajícími se podsítěmi! WAN (${fmt(r2Wan.networkStr, r2Wan.prefix)}) a LAN (${fmt(r2Lan.networkStr, r2Lan.prefix)}) na Routeru 2 kolidují.`,
      ['r2-wan-ip', 'r2-wan-mask', 'r2-lan-ip', 'r2-lan-mask']);
  }
  if (ipToLong(r2WanGw) === null) {
    return fail('r2', 'Chybí výchozí brána na Routeru 2 (WAN)',
      'Router 2 nemá nastavenou výchozí bránu (Default Gateway), takže neví, kudy odeslat pakety směrem do internetu.', ['r2-wan-gw']);
  }
  if (!isIpInSubnet(r2WanGw, r2Wan)) {
    return fail('r2', 'Nedosažitelná výchozí brána na Routeru 2',
      `Výchozí brána Routeru 2 (${r2WanGw.trim()}) neleží v podsíti jeho WAN rozhraní (${fmt(r2Wan.networkStr, r2Wan.prefix)}).`,
      ['r2-wan-gw', 'r2-wan-ip', 'r2-wan-mask']);
  }

  // --- KROK 4: Router 1 – LAN a spojení s R2 WAN ---
  const r1Lan = A(cfg['r1-lan-ip'], cfg['r1-lan-mask']);
  if (!r1Lan.valid || !r1Lan.isHostUsable) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg['r1-lan-ip']) === null || (r1Lan.valid && !r1Lan.isHostUsable)) bad.push('r1-lan-ip');
    if (mask(cfg['r1-lan-mask']) === null) bad.push('r1-lan-mask');
    return fail('r1', 'Chyba na Routeru 1 (LAN rozhraní)',
      !r1Lan.valid
        ? 'Vnitřní rozhraní (LAN) Routeru 1 nemá platnou IP adresu nebo masku podsítě.'
        : `Adresa ${fmt(r1Lan.ipStr, r1Lan.prefix)} na LAN rozhraní Routeru 1 je rezervovaná (síť/broadcast).`,
      pick(bad, ['r1-lan-ip', 'r1-lan-mask']));
  }
  if (!isSameSubnet(r2Wan, r1Lan)) {
    return fail('r1', 'Chyba na Routeru 2 (WAN) / Routeru 1 (LAN)',
      `WAN rozhraní Routeru 2 (${fmt(r2Wan.ipStr, r2Wan.prefix)}) není ve stejné podsíti jako LAN rozhraní Routeru 1 (${fmt(r1Lan.ipStr, r1Lan.prefix)}).`,
      ['r2-wan-ip', 'r2-wan-mask', 'r1-lan-ip', 'r1-lan-mask']);
  }
  if (r2Wan.ipLong === r1Lan.ipLong) {
    return fail('r1', 'Konflikt IP adres mezi Routerem 2 a Routerem 1',
      `WAN rozhraní Routeru 2 a LAN rozhraní Routeru 1 mají shodnou IP adresu (${r2Wan.ipStr}).`, ['r2-wan-ip', 'r1-lan-ip']);
  }
  if (ipToLong(r2WanGw) !== r1Lan.ipLong) {
    return fail('r1', 'Špatná výchozí brána na Routeru 2',
      `Router 2 má nastavenou výchozí bránu ${r2WanGw.trim()}, ale LAN rozhraní Routeru 1 má IP adresu ${r1Lan.ipStr}.`, ['r2-wan-gw', 'r1-lan-ip']);
  }
  if (scenario && (r1Lan.networkStr !== scenario.lan1RequiredNet || r1Lan.prefix !== scenario.lan1RequiredPrefix)) {
    return fail('r1', 'Nesplněno zadání pro síť LAN 1',
      `Zadání vyžaduje pro síť mezi Routerem 1 a Routerem 2 rozsah ${fmt(scenario.lan1RequiredNet, scenario.lan1RequiredPrefix)}, ale nastavena je síť ${fmt(r1Lan.networkStr, r1Lan.prefix)}.`,
      ['r1-lan-ip', 'r1-lan-mask', 'r2-wan-ip', 'r2-wan-mask']);
  }
  pass('2. úsek OK: Router 2 (WAN) ↔ Router 1 (LAN)',
    `Router 2 provedl překlad adres (NAT) a odeslal paket přes své WAN rozhraní (${r2Wan.ipStr}) na bránu Routeru 1 (${r1Lan.ipStr}).`);

  // --- KROK 5: Router 1 – WAN a ISP ---
  const r1Wan = A(cfg['r1-wan-ip'], cfg['r1-wan-mask']);
  const r1WanGw = cfg['r1-wan-gw'];
  if (!r1Wan.valid || !r1Wan.isHostUsable) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg['r1-wan-ip']) === null || (r1Wan.valid && !r1Wan.isHostUsable)) bad.push('r1-wan-ip');
    if (mask(cfg['r1-wan-mask']) === null) bad.push('r1-wan-mask');
    return fail('r1', 'Chyba na Routeru 1 (WAN rozhraní)',
      !r1Wan.valid
        ? 'Vnější rozhraní (WAN) Routeru 1 nemá platnou IP adresu nebo masku podsítě.'
        : `Adresa ${fmt(r1Wan.ipStr, r1Wan.prefix)} na WAN rozhraní Routeru 1 je rezervovaná (síť/broadcast).`,
      pick(bad, ['r1-wan-ip', 'r1-wan-mask']));
  }
  if (subnetsOverlap(r1Lan, r1Wan)) {
    return fail('r1', 'Kolize podsítí na Routeru 1 (WAN vs. LAN)',
      `Na Routeru 1 se překrývá podsíť WAN (${fmt(r1Wan.networkStr, r1Wan.prefix)}) s podsítí LAN (${fmt(r1Lan.networkStr, r1Lan.prefix)}). Router nemůže směrovat.`,
      ['r1-wan-ip', 'r1-wan-mask', 'r1-lan-ip', 'r1-lan-mask']);
  }
  if (!isSameSubnet(r1Wan, ispI)) {
    return fail('r1', 'Chyba na Routeru 1 (WAN): Neshoda se sítí ISP',
      `WAN rozhraní Routeru 1 (${fmt(r1Wan.ipStr, r1Wan.prefix)}) neleží ve stejné podsíti jako brána poskytovatele ISP (${fmt(ispI.ipStr, ispI.prefix)}, síť ${fmt(ispI.networkStr, ispI.prefix)}).`,
      ['r1-wan-ip', 'r1-wan-mask']);
  }
  if (r1Wan.ipLong === ispI.ipLong) {
    return fail('r1', 'Konflikt IP adresy s bránou ISP',
      `Router 1 (WAN) používá stejnou IP adresu (${r1Wan.ipStr}) jako brána poskytovatele internetu (ISP).`, ['r1-wan-ip']);
  }
  if (ipToLong(r1WanGw) !== ispI.ipLong) {
    return fail('r1', 'Špatná výchozí brána na Routeru 1 (WAN)',
      `Výchozí brána Routeru 1 (${r1WanGw.trim() || 'nevyplněno'}) neodpovídá IP adrese brány ISP (${ispI.ipStr}).`, ['r1-wan-gw']);
  }
  pass('3. úsek OK: Router 1 (WAN) ↔ Brána ISP',
    `Router 1 odeslal paket ze svého WAN rozhraní (${fmt(r1Wan.ipStr, r1Wan.prefix)}) přímo na bránu poskytovatele (${ispI.ipStr}).`);

  // --- KROK 6: DNS na všech zařízeních ---
  const dnsChecks: { id: FieldId; device: string }[] = [
    { id: 'pc-dns', device: 'Klientské PC' },
    { id: 'r2-wan-dns', device: 'Router 2 (WAN)' },
    { id: 'r1-wan-dns', device: 'Router 1 (WAN)' },
  ];
  for (const check of dnsChecks) {
    const val = cfg[check.id];
    const dnsLong = ipToLong(val);
    if (dnsLong === null) {
      return fail('isp', `Chybějící nebo neplatný DNS server (${check.device})`,
        `Zařízení ${check.device} nemá nastavenou platnou IPv4 adresu DNS serveru (např. ${isp.dnsIp.trim()} nebo IP nadřazeného routeru).`, [check.id]);
    }
    // Jakákoli platná unicast adresa je dosažitelná přes výchozí bránu.
    if (dnsLong === 0 || dnsLong === 0xffffffff) {
      return fail('isp', `Nedosažitelný DNS server (${check.device})`,
        `Adresa DNS serveru ${val} na zařízení ${check.device} není platná cílová adresa.`, [check.id]);
    }
  }
  pass('4. úsek OK: Dosažitelnost internetu a překlad DNS',
    `Paket dorazil k cílovému serveru ${isp.dnsIp.trim()} a vrátil se zpět na PC. Všechny podsítě, brány i DNS záznamy jsou nastaveny správně!`);

  return { ok: true, stopNode: 'isp', logs, errorFields: [] };
}
