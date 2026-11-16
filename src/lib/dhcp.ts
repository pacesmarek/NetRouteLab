import type { Config, Device, NodeId } from './model';
import { hasIp } from './model';
import { analyzeInterface, ipToLong, isIpInSubnet, longToIp } from './net';

export interface Lease { ip: string; mask: string; gw: string; dns: string; /** router, který adresu přidělil */ server?: NodeId }
export interface DhcpProblem { title: string; text: string; fields: string[] }

export interface DhcpResult {
  /** konfigurace s doplněnými hodnotami z DHCP (pro simulaci) */
  cfg: Config;
  leases: Record<NodeId, Lease>;
  problems: Record<NodeId, DhcpProblem>;
}

export const isDhcpClient = (cfg: Config, id: NodeId): boolean => (cfg[`${id}-dhcp`] ?? '') === '1';

/** Volné plátno: který router obsluhuje klienta (null = nezapojen) a které další pevné adresy jsou v jeho LAN. */
export interface DhcpTopo {
  serverOf: (clientId: NodeId) => NodeId | null;
  /** pole s pevnou IP adresou dalších zařízení v LAN routeru (např. WAN sousedních routerů) */
  extraFields?: (server: NodeId) => string[];
  /** AP jako DHCP server nemá vlastní LAN bránu – brána pro klienty je v poli (jinak se předá adresa routeru) */
  gatewayField?: (server: NodeId) => string | null;
  nameOf: (id: NodeId) => string;
}

/** „na Routeru 2“ / „na routeru „Router 3““ – pro texty hlášek. */
export const serverLoc = (server: NodeId, devices: Device[]): string => {
  if (server === 'r2') return 'Routeru 2';
  const d = devices.find((x) => x.id === server);
  const name = server === 'r1' ? 'Hraniční router' : d?.name ?? server;
  return d?.kind === 'ap' ? `AP „${name}“` : `routeru „${name}“`;
};

/**
 * DHCP server na routeru: klientům v jeho LAN přidělí adresu z rozsahu. Maska a brána se předají z LAN rozhraní routeru,
 * DNS z nastavení DHCP. Adresy ručně nastavených zařízení a adresa routeru se přeskočí.
 * Bez `topo` (úlohy) obsluhuje všechna zařízení Router 2 a klienty jsou základní PC + přidaná zařízení.
 */
export function resolveDhcp(cfg: Config, devices: Device[], allowCidr: boolean, topo?: DhcpTopo): DhcpResult {
  const out: DhcpResult = { cfg, leases: {}, problems: {} };
  const ids: NodeId[] = topo ? devices.filter(hasIp).map((d) => d.id) : ['pc', ...devices.filter(hasIp).map((d) => d.id)];
  const clients = ids.filter((id) => isDhcpClient(cfg, id));
  if (!clients.length) return out;

  const g = (k: string) => cfg[k] ?? '';
  const nameOf = (id: NodeId) => (topo ? topo.nameOf(id) : id === 'pc' ? 'Klientské PC' : devices.find((d) => d.id === id)?.name ?? id);
  const serverOf = (id: NodeId): NodeId | null => (topo ? topo.serverOf(id) : 'r2');
  const next: Config = { ...cfg };
  out.cfg = next;

  const clear = (id: NodeId) => { for (const s of ['ip', 'mask', 'gw', 'dns']) next[`${id}-${s}`] = ''; };
  const fail = (group: NodeId[], title: string, text: string, fields: string[]) => {
    for (const id of group) {
      out.problems[id] = { title: `${title} (${nameOf(id)})`, text: text.replace('{name}', nameOf(id)), fields };
      clear(id);
    }
  };

  // klienti bez routeru
  const orphans = clients.filter((id) => serverOf(id) === null);
  fail(orphans, 'DHCP: bez odpovědi', 'Zařízení {name} není zapojeno do sítě žádného routeru, takže nemá od koho adresu získat. Zapojte ho kabelem do LAN routeru, switche nebo AP.', []);

  const servers = [...new Set(clients.map(serverOf).filter((s): s is NodeId => s !== null))];
  for (const S of servers) {
    const group = clients.filter((id) => serverOf(id) === S);
    const loc = serverLoc(S, devices);
    const on = `${S}-dhcp-on`, st = `${S}-dhcp-start`, en = `${S}-dhcp-end`, dns = `${S}-dhcp-dns`;
    const lan = analyzeInterface(g(`${S}-lan-ip`), g(`${S}-lan-mask`), allowCidr);

    if (g(on) !== '1') {
      fail(group, 'DHCP: bez odpovědi', `Zařízení {name} má zapnuté automatické získání adresy, ale DHCP server na ${loc} je vypnutý. Zařízení zůstane bez adresy (APIPA 169.254.x.x) a mimo svou síť nekomunikuje.`, [on]);
      continue;
    }
    if (!lan.valid || !lan.isHostUsable) {
      fail(group, 'DHCP: router nemá LAN adresu', `DHCP server na ${loc} nemůže přidělovat adresy, dokud nemá platnou IP adresu a masku na rozhraní LAN.`, [`${S}-lan-ip`, `${S}-lan-mask`]);
      continue;
    }
    const start = ipToLong(g(st));
    const end = ipToLong(g(en));
    if (start === null || end === null) {
      fail(group, 'DHCP: neplatný rozsah', 'Zadejte začátek a konec rozsahu DHCP (platné IPv4 adresy).', [st, en]);
      continue;
    }
    if (start > end) {
      fail(group, 'DHCP: rozsah je obrácený', 'Začátek rozsahu DHCP musí být menší než jeho konec.', [st, en]);
      continue;
    }
    if (!isIpInSubnet(g(st), lan) || !isIpInSubnet(g(en), lan)) {
      fail(group, 'DHCP: rozsah mimo síť LAN', `Rozsah DHCP musí ležet v síti LAN (${lan.networkStr}). Jinak by klienti dostali adresu z cizí sítě.`, [st, en]);
      continue;
    }
    const gwF = topo?.gatewayField?.(S) ?? null;
    if (gwF && (ipToLong(g(gwF)) === null || !isIpInSubnet(g(gwF), lan))) {
      fail(group, 'DHCP: chybí brána', `DHCP server na ${loc} musí klientům předat výchozí bránu (adresu routeru v této síti). Vyplňte bránu v nastavení DHCP.`, [gwF]);
      continue;
    }
    if (ipToLong(g(dns)) === null) {
      fail(group, 'DHCP: chybí DNS', 'DHCP server musí klientům předat DNS server (např. adresu z ISP). Vyplňte DNS v nastavení DHCP.', [dns]);
      continue;
    }

    // adresy, které DHCP nesmí přidělit: router, ručně nastavená zařízení a další pevné adresy v téže LAN
    const taken = new Set<number>([lan.ipLong]);
    for (const id of ids) {
      if (serverOf(id) !== S || isDhcpClient(cfg, id)) continue;
      const v = ipToLong(g(`${id}-ip`));
      if (v !== null) taken.add(v);
    }
    for (const f of topo?.extraFields?.(S) ?? []) {
      const v = ipToLong(g(f));
      if (v !== null) taken.add(v);
    }

    for (const id of group) {
      let lease: number | null = null;
      for (let a = start; a <= end; a++) {
        if (a === lan.networkLong || a === lan.broadcastLong || taken.has(a)) continue;
        lease = a;
        break;
      }
      if (lease === null) {
        out.problems[id] = { title: `DHCP: rozsah vyčerpán (${nameOf(id)})`, text: 'V rozsahu DHCP už nezbývá volná adresa pro další zařízení. Zvětšete rozsah.', fields: [st, en] };
        clear(id);
        continue;
      }
      taken.add(lease);
      const l: Lease = { ip: longToIp(lease), mask: lan.maskStr, gw: gwF ? g(gwF).trim() : lan.ipStr, dns: g(dns).trim(), server: S };
      out.leases[id] = l;
      next[`${id}-ip`] = l.ip;
      next[`${id}-mask`] = l.mask;
      next[`${id}-gw`] = l.gw;
      next[`${id}-dns`] = l.dns;
    }
  }
  return out;
}
