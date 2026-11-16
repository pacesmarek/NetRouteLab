import type { Device, NodeId, Uplinks } from './model';
import { linkId } from './model';

/** Cesta od uzlu nahoru k Routeru 2: [uzel, switch/AP…, 'r2']. Odolné proti smyčkám. */
export function chainToRouter(uplinks: Uplinks, id: NodeId): NodeId[] {
  const out: NodeId[] = [id];
  let cur = id;
  for (let i = 0; i < 12; i++) {
    const up = uplinks[cur] ?? 'r2';
    if (up === '') return out; // kabel odpojen – cesta končí u tohoto uzlu
    if (out.includes(up)) break; // smyčka
    out.push(up);
    if (up === 'r2') return out;
    cur = up;
  }
  out.push('r2');
  return out;
}

/** Všechny uzly, jejichž cesta k Routeru 2 vede přes `id`. */
export function descendants(uplinks: Uplinks, nodes: NodeId[], id: NodeId): NodeId[] {
  return nodes.filter((n) => n !== id && chainToRouter(uplinks, n).includes(id));
}

/** Id kabelu mezi dvěma sousedními uzly (v libovolném pořadí). */
export function linkBetween(uplinks: Uplinks, a: NodeId, b: NodeId): string {
  const fixed = (x: NodeId, y: NodeId) => (x === 'r1' && y === 'isp') || (x === 'r2' && y === 'r1');
  if (fixed(a, b)) return linkId(a, b);
  if (fixed(b, a)) return linkId(b, a);
  return (uplinks[a] ?? 'r2') === b ? linkId(a, b) : linkId(b, a);
}

export function linksOfPath(uplinks: Uplinks, path: NodeId[]): string[] {
  return path.slice(1).map((n, i) => linkBetween(uplinks, path[i], n));
}

/** Ping: klient → (switch/AP) → R2 → R1 → ISP. */
export function pingPath(uplinks: Uplinks, client: NodeId): NodeId[] {
  return [...chainToRouter(uplinks, client), 'r1', 'isp'];
}

/** Přístup zvenku: ISP → R1 → R2 → (switch/AP) → zařízení. */
export function inboundPath(uplinks: Uplinks, device: NodeId): NodeId[] {
  return ['isp', 'r1', ...chainToRouter(uplinks, device).reverse()];
}

export interface Hop {
  /** pořadí hopu (hodnota TTL) */
  ttl: number;
  /** uzel, na kterém hop „odpovídá“ */
  node: NodeId;
  name: string;
  /** adresa, která se v traceroute zobrazí (vstupní rozhraní) */
  ip: string;
  ms: number;
  target?: boolean;
}

/**
 * Hopy traceroute z klienta k cílovému serveru: LAN adresa R2, LAN adresa R1, brána ISP, cíl.
 * `reached` = kolik hopů odpovědělo (podle počtu úspěšných úseků simulace); další hop vyprší (* * *).
 */
export function traceHops(ips: { r2Lan: string; r1Lan: string; ispGw: string; target: string }): Hop[] {
  return [
    { ttl: 1, node: 'r2', name: 'Router 2 (LAN)', ip: ips.r2Lan, ms: 0.6 },
    { ttl: 2, node: 'r1', name: 'Router 1 (LAN)', ip: ips.r1Lan, ms: 1.4 },
    { ttl: 3, node: 'isp', name: 'Brána ISP', ip: ips.ispGw, ms: 7.8 },
    { ttl: 4, node: 'isp', name: 'Cílový server', ip: ips.target, ms: 12.3, target: true },
  ];
}

export const kindName = (devices: Device[], id: NodeId): string => {
  if (id === 'r2') return 'Router 2 (LAN)';
  return devices.find((d) => d.id === id)?.name ?? id;
};
