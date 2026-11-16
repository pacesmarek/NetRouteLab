import type { Config, Device, NodeId } from './model';
import { hasIp } from './model';
import { analyzeInterface, ipToLong, isIpInSubnet, longToIp } from './net';

export interface Lease { ip: string; mask: string; gw: string; dns: string }
export interface DhcpProblem { title: string; text: string; fields: string[] }

export interface DhcpResult {
  /** konfigurace s doplněnými hodnotami z DHCP (pro simulaci) */
  cfg: Config;
  leases: Record<NodeId, Lease>;
  problems: Record<NodeId, DhcpProblem>;
}

export const isDhcpClient = (cfg: Config, id: NodeId): boolean => (cfg[`${id}-dhcp`] ?? '') === '1';

/**
 * DHCP server na Routeru 2: klientům v LAN 2 (základní PC a přidaná zařízení s IP) přidělí adresu z rozsahu.
 * Maska a brána se předají z LAN rozhraní Routeru 2, DNS z nastavení DHCP. Adresy ručně nastavených zařízení
 * a adresa routeru se přeskočí.
 */
export function resolveDhcp(cfg: Config, devices: Device[], allowCidr: boolean): DhcpResult {
  const out: DhcpResult = { cfg, leases: {}, problems: {} };
  const ids: NodeId[] = ['pc', ...devices.filter(hasIp).map((d) => d.id)];
  const clients = ids.filter((id) => isDhcpClient(cfg, id));
  if (!clients.length) return out;

  const g = (k: string) => cfg[k] ?? '';
  const nameOf = (id: NodeId) => (id === 'pc' ? 'Klientské PC' : devices.find((d) => d.id === id)?.name ?? id);
  const next: Config = { ...cfg };
  out.cfg = next;

  const fail = (title: string, text: string, fields: string[]) => {
    for (const id of clients) {
      out.problems[id] = { title: `${title} (${nameOf(id)})`, text: text.replace('{name}', nameOf(id)), fields };
      for (const s of ['ip', 'mask', 'gw', 'dns']) next[`${id}-${s}`] = ''; // bez adresy
    }
  };

  const lan = analyzeInterface(g('r2-lan-ip'), g('r2-lan-mask'), allowCidr);
  if (g('r2-dhcp-on') !== '1') {
    return fail('DHCP: bez odpovědi', 'Zařízení {name} má zapnuté automatické získání adresy, ale DHCP server na Routeru 2 je vypnutý. Zařízení zůstane bez adresy (APIPA 169.254.x.x) a mimo svou síť nekomunikuje.', ['r2-dhcp-on']), out;
  }
  if (!lan.valid || !lan.isHostUsable) {
    return fail('DHCP: router nemá LAN adresu', 'DHCP server na Routeru 2 nemůže přidělovat adresy, dokud nemá platnou IP adresu a masku na rozhraní LAN 2.', ['r2-lan-ip', 'r2-lan-mask']), out;
  }
  const start = ipToLong(g('r2-dhcp-start'));
  const end = ipToLong(g('r2-dhcp-end'));
  if (start === null || end === null) {
    return fail('DHCP: neplatný rozsah', 'Zadejte začátek a konec rozsahu DHCP (platné IPv4 adresy).', ['r2-dhcp-start', 'r2-dhcp-end']), out;
  }
  if (start > end) {
    return fail('DHCP: rozsah je obrácený', 'Začátek rozsahu DHCP musí být menší než jeho konec.', ['r2-dhcp-start', 'r2-dhcp-end']), out;
  }
  if (!isIpInSubnet(g('r2-dhcp-start'), lan) || !isIpInSubnet(g('r2-dhcp-end'), lan)) {
    return fail('DHCP: rozsah mimo síť LAN 2', `Rozsah DHCP musí ležet v síti LAN 2 (${lan.networkStr}). Jinak by klienti dostali adresu z cizí sítě.`, ['r2-dhcp-start', 'r2-dhcp-end']), out;
  }
  if (ipToLong(g('r2-dhcp-dns')) === null) {
    return fail('DHCP: chybí DNS', 'DHCP server musí klientům předat DNS server (např. adresu z ISP). Vyplňte DNS v nastavení DHCP.', ['r2-dhcp-dns']), out;
  }

  // adresy, které DHCP nesmí přidělit: router a ručně nastavená zařízení
  const taken = new Set<number>([lan.ipLong]);
  for (const id of ids) {
    if (isDhcpClient(cfg, id)) continue;
    const v = ipToLong(g(`${id}-ip`));
    if (v !== null) taken.add(v);
  }

  for (const id of clients) {
    let lease: number | null = null;
    for (let a = start; a <= end; a++) {
      if (a === lan.networkLong || a === lan.broadcastLong || taken.has(a)) continue;
      lease = a;
      break;
    }
    if (lease === null) {
      out.problems[id] = { title: `DHCP: rozsah vyčerpán (${nameOf(id)})`, text: 'V rozsahu DHCP už nezbývá volná adresa pro další zařízení. Zvětšete rozsah.', fields: ['r2-dhcp-start', 'r2-dhcp-end'] };
      for (const s of ['ip', 'mask', 'gw', 'dns']) next[`${id}-${s}`] = '';
      continue;
    }
    taken.add(lease);
    const l: Lease = { ip: longToIp(lease), mask: lan.maskStr, gw: lan.ipStr, dns: g('r2-dhcp-dns').trim() };
    out.leases[id] = l;
    next[`${id}-ip`] = l.ip;
    next[`${id}-mask`] = l.mask;
    next[`${id}-gw`] = l.gw;
    next[`${id}-dns`] = l.dns;
  }
  return out;
}
