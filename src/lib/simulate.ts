import type { MaskFormatter } from './format';
import { analyzeInterface, ipToLong, isIpInSubnet, isSameSubnet, parseSubnetMask, subnetsOverlap } from './net';
import type { Config, Device, FieldId, IspConfig, LogItem, NodeId, Rules, Scenario } from './model';
import { KIND_INFO, ruleField } from './model';

/** Zdroj pingu: základní PC ('pc') nebo přidané PC ('dev-N'). Pole klienta jsou `${id}-ip|mask|gw|dns`. */
export interface Client { id: NodeId; name: string }
export const PC_CLIENT: Client = { id: 'pc', name: 'Klientské PC' };
/** Ostatní zařízení v LAN 2 (kvůli kontrole konfliktu IP adres). */
export interface Other { name: string; field: FieldId }

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
  client: Client = PC_CLIENT,
  others: Other[] = [],
): SimResult {
  const C = client.id;
  const N = client.name;
  const f = (s: string): FieldId => `${C}-${s}`;
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
  const pc = A(cfg[f('ip')], cfg[f('mask')]);
  const pcGw = cfg[f('gw')];
  if (!pc.valid) {
    const bad: FieldId[] = [];
    if (ipToLong(cfg[f('ip')]) === null) bad.push(f('ip'));
    if (mask(cfg[f('mask')]) === null) bad.push(f('mask'));
    return fail(C, `Chyba: ${N} (IP / Maska)`,
      `IPv4 adresa nebo maska podsítě zařízení ${N} má neplatný formát (nebo chybí).`, pick(bad, [f('ip'), f('mask')]));
  }
  if (!pc.isHostUsable) {
    return fail(C, `Chyba: ${N} (Rezervovaná adresa)`,
      `Zadaná adresa ${fmt(pc.ipStr, pc.prefix)} je ${pc.isNetworkAddress ? 'adresa sítě (Network ID)' : 'všesměrová adresa (Broadcast)'} a nelze ji přiřadit počítači.`, [f('ip')]);
  }
  if (ipToLong(pcGw) === null) {
    return fail(C, `Chyba: ${N} (Výchozí brána)`,
      `${N} nemá nastavenou platnou IP adresu výchozí brány (Default Gateway), proto neví, kam posílat pakety mimo svou síť.`, [f('gw')]);
  }
  if (!isIpInSubnet(pcGw, pc)) {
    return fail(C, `Chyba: ${N} (Nedosažitelná brána)`,
      `Výchozí brána zařízení ${N} (${pcGw.trim()}) neleží ve stejné podsíti jako ono samo (${fmt(pc.networkStr, pc.prefix)}).`, [f('gw'), f('ip'), f('mask')]);
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
    return fail('r2', `Neshoda podsítě: ${N} a Router 2 (LAN)`,
      `${N} (${fmt(pc.ipStr, pc.prefix)}, síť ${fmt(pc.networkStr, pc.prefix)}) není ve stejné podsíti jako LAN rozhraní Routeru 2 (${fmt(r2Lan.ipStr, r2Lan.prefix)}, síť ${fmt(r2Lan.networkStr, r2Lan.prefix)}).`,
      [f('ip'), f('mask'), 'r2-lan-ip', 'r2-lan-mask']);
  }
  for (const o of others) {
    if (ipToLong(cfg[o.field]) === pc.ipLong) {
      return fail(C, 'Konflikt IP adres v síti LAN 2',
        `${N} a zařízení ${o.name} mají shodnou IP adresu (${pc.ipStr}). Každé zařízení v síti musí mít unikátní IP.`, [f('ip'), o.field]);
    }
  }
  if (pc.ipLong === r2Lan.ipLong) {
    return fail('r2', 'Konflikt IP adres v síti LAN 2',
      `${N} i LAN rozhraní Routeru 2 mají shodnou IP adresu (${pc.ipStr}). Každé zařízení v síti musí mít unikátní IP.`, [f('ip'), 'r2-lan-ip']);
  }
  if (ipToLong(pcGw) !== r2Lan.ipLong) {
    return fail('r2', `Špatná výchozí brána: ${N}`,
      `${N} má nastavenou bránu ${pcGw.trim()}, ale LAN rozhraní Routeru 2 má adresu ${r2Lan.ipStr}. Paket se nedostane na router.`, [f('gw'), 'r2-lan-ip']);
  }
  if (scenario && (r2Lan.networkStr !== scenario.lan2RequiredNet || r2Lan.prefix !== scenario.lan2RequiredPrefix)) {
    return fail('r2', 'Nesplněno zadání pro síť LAN 2',
      `Zadání vyžaduje pro síť mezi Routerem 2 a PC rozsah ${fmt(scenario.lan2RequiredNet, scenario.lan2RequiredPrefix)}, ale nakonfigurována je síť ${fmt(r2Lan.networkStr, r2Lan.prefix)}.`,
      ['r2-lan-ip', 'r2-lan-mask', f('ip'), f('mask')]);
  }
  pass(`1. úsek OK: ${N} ↔ Router 2 (LAN)`,
    `${N} (${fmt(pc.ipStr, pc.prefix)}) úspěšně předalo paket své výchozí bráně na Routeru 2 (${fmt(r2Lan.ipStr, r2Lan.prefix)}).`);

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
    { id: f('dns'), device: N },
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
    `Paket dorazil k cílovému serveru ${isp.dnsIp.trim()} a vrátil se zpět na zařízení ${N}. Všechny podsítě, brány i DNS záznamy jsou nastaveny správně!`);

  return { ok: true, stopNode: 'isp', logs, errorFields: [] };
}

// ============================================================================
// Přístup z internetu k zařízení v LAN 2 přes PAT (přesměrování portů) – dvojitý NAT
// ============================================================================

const parsePort = (s: string): number | null => {
  const t = s.trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 65535 ? n : null;
};

/**
 * Internet → R1 (veřejná IP:port) → R2 (WAN IP:port) → zařízení (IP:port služby).
 * Každý router potřebuje pravidlo PAT, jinak příchozí spojení zahodí.
 */
export function simulateInbound(
  cfg: Config,
  isp: IspConfig,
  allowCidr: boolean,
  fmt: MaskFormatter,
  device: Device,
  rules: Rules,
  others: Other[],
): SimResult {
  const logs: LogItem[] = [];
  const A = (ip: string, m: string) => analyzeInterface(ip, m, allowCidr);
  const D = device.id;
  const dn = device.name;
  const info = KIND_INFO[device.kind];
  const svcPort = info.port ?? 80;
  const df = (s: string): FieldId => `${D}-${s}`;

  const fail = (stopNode: NodeId, title: string, text: string, errorFields: FieldId[]): SimResult => {
    logs.push({ type: 'error', title, text });
    return { ok: false, stopNode, logs, errorFields };
  };
  const pass = (title: string, text: string) => logs.push({ type: 'success', title, text });

  // --- ISP ---
  const ispI = A(isp.gwIp, isp.gwMask);
  if (!ispI.valid || !ispI.isHostUsable) {
    return fail('isp', 'Neplatné parametry ISP', 'Zkontrolujte IP adresu a masku brány ISP.', []);
  }

  // --- Router 1: veřejná adresa (WAN) ---
  const r1Wan = A(cfg['r1-wan-ip'], cfg['r1-wan-mask']);
  if (!r1Wan.valid || !r1Wan.isHostUsable) {
    return fail('r1', 'Chyba na Routeru 1 (WAN rozhraní)',
      'Router 1 nemá platnou veřejnou IP adresu na WAN rozhraní – z internetu se na něj nelze dostat.', ['r1-wan-ip', 'r1-wan-mask']);
  }
  if (!isSameSubnet(r1Wan, ispI) || r1Wan.ipLong === ispI.ipLong) {
    return fail('r1', 'Router 1 není ve stejné podsíti jako brána ISP',
      `WAN adresa ${fmt(r1Wan.ipStr, r1Wan.prefix)} neleží v síti ISP (${fmt(ispI.networkStr, ispI.prefix)}) nebo koliduje s bránou ISP.`, ['r1-wan-ip', 'r1-wan-mask']);
  }
  if (ipToLong(cfg['r1-wan-gw']) !== ispI.ipLong) {
    return fail('r1', 'Špatná výchozí brána na Routeru 1 (WAN)',
      `Odpověď by se nedostala zpět do internetu – brána Routeru 1 musí být ${ispI.ipStr}.`, ['r1-wan-gw']);
  }

  // --- Veřejný port, kterým se přistupuje ---
  const pub = parsePort(cfg[df('pub')] ?? '');
  if (pub === null) {
    return fail('isp', 'Chybí veřejný port',
      `U zařízení ${dn} zadejte veřejný port (1–65535), na kterém bude dostupné z internetu, např. 8081.`, [df('pub')]);
  }
  pass(`1. Internet → Router 1: požadavek na ${r1Wan.ipStr}:${pub}`,
    `Klient z internetu se připojuje na veřejnou adresu Routeru 1 (${r1Wan.ipStr}) a port ${pub}.`);

  // --- Router 1: PAT ---
  const dupes = (router: 'r1' | 'r2'): FieldId[] => {
    const seen = new Map<number, string>();
    const bad: FieldId[] = [];
    for (const id of rules[router]) {
      const p = parsePort(cfg[ruleField(router, id, 'ext')] ?? '');
      if (p === null) continue;
      if (seen.has(p)) bad.push(ruleField(router, id, 'ext'), ruleField(router, seen.get(p)!, 'ext'));
      else seen.set(p, id);
    }
    return bad;
  };
  const d1 = dupes('r1');
  if (d1.length) {
    return fail('r1', 'Dvě pravidla PAT na Routeru 1 používají stejný vnější port',
      'Jeden vnější port lze přesměrovat jen na jedno místo. Každé zařízení (kamera, server) potřebuje na veřejné IP svůj vlastní port.', d1);
  }
  const rule1 = rules.r1.find((id) => parsePort(cfg[ruleField('r1', id, 'ext')] ?? '') === pub);
  if (!rule1) {
    return fail('r1', `Router 1 nemá pravidlo PAT pro port ${pub}`,
      `Bez přesměrování portu router příchozí spojení na ${r1Wan.ipStr}:${pub} zahodí. Přidejte v Routeru 1 pravidlo PAT: vnější port ${pub} → Router 2.`, []);
  }
  const r1Target = cfg[ruleField('r1', rule1, 'ip')] ?? '';
  const r1TargetPort = parsePort(cfg[ruleField('r1', rule1, 'port')] ?? '');

  // --- Spojení R1 ↔ R2 ---
  const r1Lan = A(cfg['r1-lan-ip'], cfg['r1-lan-mask']);
  const r2Wan = A(cfg['r2-wan-ip'], cfg['r2-wan-mask']);
  if (!r1Lan.valid || !r1Lan.isHostUsable) {
    return fail('r1', 'Chyba na Routeru 1 (LAN rozhraní)', 'Router 1 nemá platnou IP adresu a masku na LAN rozhraní.', ['r1-lan-ip', 'r1-lan-mask']);
  }
  if (!r2Wan.valid || !r2Wan.isHostUsable) {
    return fail('r2', 'Chyba na Routeru 2 (WAN rozhraní)', 'Router 2 nemá platnou IP adresu a masku na WAN rozhraní.', ['r2-wan-ip', 'r2-wan-mask']);
  }
  if (!isSameSubnet(r1Lan, r2Wan) || r1Lan.ipLong === r2Wan.ipLong) {
    return fail('r1', 'Router 1 a Router 2 nejsou ve společné podsíti',
      `LAN Routeru 1 (${fmt(r1Lan.ipStr, r1Lan.prefix)}) a WAN Routeru 2 (${fmt(r2Wan.ipStr, r2Wan.prefix)}) musí být ve stejné podsíti a mít různé adresy.`,
      ['r1-lan-ip', 'r1-lan-mask', 'r2-wan-ip', 'r2-wan-mask']);
  }
  if (ipToLong(r1Target) !== r2Wan.ipLong) {
    return fail('r1', 'Pravidlo PAT na Routeru 1 míří na špatnou adresu',
      `Router 1 přesměrovává port ${pub} na ${r1Target.trim() || 'nevyplněno'}, ale další router v řetězci (Router 2) má na WAN adresu ${r2Wan.ipStr}.`,
      [ruleField('r1', rule1, 'ip')]);
  }
  if (r1TargetPort === null) {
    return fail('r1', 'Neplatný cílový port v pravidle PAT na Routeru 1', 'Cílový port musí být číslo 1–65535.', [ruleField('r1', rule1, 'port')]);
  }
  pass(`2. Router 1 (PAT): ${pub} → ${r2Wan.ipStr}:${r1TargetPort}`,
    `Router 1 přeložil veřejný port ${pub} na ${r2Wan.ipStr}:${r1TargetPort} (WAN Routeru 2) a předal paket dál.`);

  // --- Router 2: PAT ---
  if (ipToLong(cfg['r2-wan-gw']) !== r1Lan.ipLong) {
    return fail('r2', 'Špatná výchozí brána na Routeru 2',
      `Odpověď by se nedostala zpět – brána Routeru 2 musí být LAN adresa Routeru 1 (${r1Lan.ipStr}).`, ['r2-wan-gw']);
  }
  const d2 = dupes('r2');
  if (d2.length) {
    return fail('r2', 'Dvě pravidla PAT na Routeru 2 používají stejný vnější port',
      'Každý vnější port lze přesměrovat jen na jedno zařízení.', d2);
  }
  const rule2 = rules.r2.find((id) => parsePort(cfg[ruleField('r2', id, 'ext')] ?? '') === r1TargetPort);
  if (!rule2) {
    return fail('r2', `Router 2 nemá pravidlo PAT pro port ${r1TargetPort}`,
      `Router 2 dostal spojení na portu ${r1TargetPort}, ale nemá co s ním dělat. Přidejte pravidlo PAT: vnější port ${r1TargetPort} → ${dn}.`,
      []);
  }
  const r2Target = cfg[ruleField('r2', rule2, 'ip')] ?? '';
  const r2TargetPort = parsePort(cfg[ruleField('r2', rule2, 'port')] ?? '');

  // --- LAN 2 a zařízení ---
  const r2Lan = A(cfg['r2-lan-ip'], cfg['r2-lan-mask']);
  if (!r2Lan.valid || !r2Lan.isHostUsable) {
    return fail('r2', 'Chyba na Routeru 2 (LAN rozhraní)', 'Router 2 nemá platnou IP adresu a masku na LAN rozhraní.', ['r2-lan-ip', 'r2-lan-mask']);
  }
  const dev = A(cfg[df('ip')], cfg[df('mask')]);
  if (!dev.valid || !dev.isHostUsable) {
    return fail(D, `Chyba: ${dn} (IP / Maska)`,
      `Zařízení ${dn} nemá platnou použitelnou IP adresu a masku.`, [df('ip'), df('mask')]);
  }
  if (ipToLong(r2Target) !== dev.ipLong) {
    return fail('r2', 'Pravidlo PAT na Routeru 2 míří na špatné zařízení',
      `Pravidlo přesměrovává na ${r2Target.trim() || 'nevyplněno'}, ale ${dn} má adresu ${dev.ipStr}.`, [ruleField('r2', rule2, 'ip'), df('ip')]);
  }
  if (r2TargetPort !== svcPort) {
    return fail('r2', 'Pravidlo PAT na Routeru 2 míří na špatný port',
      `${dn} poslouchá na portu ${svcPort} (${info.service}), ale pravidlo přesměrovává na port ${cfg[ruleField('r2', rule2, 'port')]?.trim() || 'nevyplněno'}.`,
      [ruleField('r2', rule2, 'port')]);
  }
  if (!isSameSubnet(dev, r2Lan)) {
    return fail(D, `Neshoda podsítě: ${dn} a Router 2 (LAN)`,
      `${dn} (${fmt(dev.ipStr, dev.prefix)}) není ve stejné podsíti jako LAN Routeru 2 (${fmt(r2Lan.ipStr, r2Lan.prefix)}).`,
      [df('ip'), df('mask'), 'r2-lan-ip', 'r2-lan-mask']);
  }
  if (dev.ipLong === r2Lan.ipLong) {
    return fail(D, 'Konflikt IP adres v síti LAN 2', `${dn} má stejnou adresu jako LAN rozhraní Routeru 2 (${dev.ipStr}).`, [df('ip'), 'r2-lan-ip']);
  }
  for (const o of others) {
    if (ipToLong(cfg[o.field]) === dev.ipLong) {
      return fail(D, 'Konflikt IP adres v síti LAN 2', `${dn} a ${o.name} mají shodnou IP adresu (${dev.ipStr}).`, [df('ip'), o.field]);
    }
  }
  if (ipToLong(cfg[df('gw')]) !== r2Lan.ipLong) {
    return fail(D, `Špatná výchozí brána: ${dn}`,
      `Zařízení ${dn} přijme požadavek, ale odpověď nepošle zpět – brána musí být LAN adresa Routeru 2 (${r2Lan.ipStr}).`, [df('gw')]);
  }
  pass(`3. Router 2 (PAT): ${r1TargetPort} → ${dev.ipStr}:${svcPort}`,
    `Router 2 přeložil port ${r1TargetPort} na ${dev.ipStr}:${svcPort} a doručil paket zařízení ${dn}.`);
  pass(`4. ${dn} dostupné z internetu`,
    `Služba ${info.service} (port ${svcPort}) odpověděla. Zvenku se na ni připojíte na ${r1Wan.ipStr}:${pub}.`);

  return { ok: true, stopNode: D, logs, errorFields: [] };
}
