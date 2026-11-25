import type { MaskFormatter } from './format';
import type { Hop } from './graph';
import type { ValidIface } from './net';
import { analyzeInterface, ipToLong, isIpInSubnet, isSameSubnet, parseSubnetMask, subnetsOverlap } from './net';
import type { Config, Device, DeviceKind, FieldId, IspConfig, LogItem, NodeId, Pos, Rules, Uplinks } from './model';
import type { ApMode } from './model';
import { apModeOf, hasIp, ruleField } from './model';
import type { SimResult } from './simulate';

/**
 * Volné plátno: libovolný strom zařízení pod ISP. Hraniční router `r1` je pevně zapojený do ISP,
 * ostatní zařízení mají rodiče v `uplinks` ('' = nezapojeno). Router se WAN stranou zapojí do LAN nadřazeného routeru,
 * switch / AP jen propojují (nemají IP), koncová zařízení se zapojí do LAN nejbližšího routeru nad sebou.
 */
export interface Topo { devices: Device[]; uplinks: Uplinks }
export const UNPLUGGED = '';

type Kind = DeviceKind | 'isp';
const FREE_FIXED = ['isp', 'r1'];

export function kindOf(t: Topo, id: NodeId): Kind | null {
  if (id === 'isp') return 'isp';
  if (id === 'r1') return 'router';
  return t.devices.find((d) => d.id === id)?.kind ?? null;
}

export const nameOf = (t: Topo, id: NodeId): string =>
  id === 'isp' ? 'Internet / ISP' : id === 'r1' ? 'Hraniční router' : t.devices.find((d) => d.id === id)?.name ?? id;

export const parentOf = (t: Topo, id: NodeId): NodeId => (id === 'isp' ? '' : id === 'r1' ? 'isp' : t.uplinks[id] ?? UNPLUGGED);

export const freeNodes = (devices: Device[]): NodeId[] => [...FREE_FIXED, ...devices.map((d) => d.id)];

const isL2Kind = (k: Kind | null) => k === 'switch' || k === 'ap';
const isClientKind = (k: Kind | null) => k === 'pc' || k === 'camera' || k === 'webserver';

/** Lze `child` zapojit pod `parent`? (typy zařízení, žádné smyčky, ISP / R1 se nepřesouvají) */
export function canParent(t: Topo, child: NodeId, parent: NodeId): boolean {
  if (child === parent || child === 'isp' || child === 'r1') return false;
  const ck = kindOf(t, child), pk = kindOf(t, parent);
  if (!ck || !pk || isClientKind(pk)) return false;
  if (pk === 'isp' && !(ck === 'router' || isL2Kind(ck))) return false;
  let cur: NodeId = parent;
  for (let i = 0; i < 50; i++) {
    if (cur === child) return false; // smyčka
    const up = parentOf(t, cur);
    if (!up) break;
    cur = up;
  }
  return true;
}

/** Zařízení, která mají „výstup“ (tečku dole) – k nim lze zapojit další. */
export const canHostChildren = (t: Topo, id: NodeId): boolean => {
  const k = kindOf(t, id);
  return k !== null && !isClientKind(k);
};

/** Cesta od uzlu nahoru k ISP: [uzel, rodič, …]. `connected` = dojde se až k ISP. */
export function pathUp(t: Topo, id: NodeId): { nodes: NodeId[]; connected: boolean } {
  const nodes: NodeId[] = [id];
  let cur = id;
  for (let i = 0; i < 50; i++) {
    if (cur === 'isp') return { nodes, connected: true };
    const up = parentOf(t, cur);
    if (!up || nodes.includes(up) || !kindOf(t, up)) return { nodes, connected: false };
    nodes.push(up);
    cur = up;
  }
  return { nodes, connected: false };
}

/** Router (nebo 'isp'), do jehož LAN je uzel zapojený (přes případné switche a AP). null = nezapojeno. */
export function ownerOf(t: Topo, id: NodeId): NodeId | null {
  let cur = parentOf(t, id);
  for (let i = 0; i < 50; i++) {
    if (!cur || !kindOf(t, cur)) return null;
    if (isL2Kind(kindOf(t, cur))) { cur = parentOf(t, cur); continue; }
    return cur;
  }
  return null;
}

/** Routery nad uzlem (nejbližší první) a informace, zda řetěz končí u ISP. */
export function routersUp(t: Topo, id: NodeId): { routers: NodeId[]; ispReached: boolean } {
  const routers: NodeId[] = [];
  let cur = id;
  for (let i = 0; i < 30; i++) {
    const o = ownerOf(t, cur);
    if (!o) return { routers, ispReached: false };
    if (o === 'isp') return { routers, ispReached: true };
    if (routers.includes(o)) return { routers, ispReached: false };
    routers.push(o);
    cur = o;
  }
  return { routers, ispReached: false };
}

/** Router, který je „nahoře“ (zapojený do ISP) a kterým zařízení vychází do internetu. */
export const topRouterOf = (t: Topo, id: NodeId): NodeId | null => {
  const r = routersUp(t, id);
  return r.ispReached && r.routers.length ? r.routers[r.routers.length - 1] : null;
};

/** Režim AP (výchozí Access Point); pro jiná zařízení 'ap'. */
export const apMode = (t: Topo, id: NodeId): ApMode => {
  const d = t.devices.find((x) => x.id === id);
  return d ? apModeOf(d) : 'ap';
};

/** Bezdrátový spoj: dítě vysílá k AP v režimu Access Point, nebo AP v režimu Klient / Bridge se připojuje k AP. */
export const isWifiLink = (t: Topo, child: NodeId, parent: NodeId): boolean => {
  if (kindOf(t, parent) !== 'ap') return false;
  if (apMode(t, parent) === 'ap') return true;
  return kindOf(t, child) === 'ap' && apMode(t, child) !== 'ap';
};

/** DHCP servery zapnuté v síti routeru `owner` (router sám a AP v jeho LAN). Router má přednost. */
export function dhcpServersIn(t: Topo, cfg: Config, owner: NodeId): NodeId[] {
  const out: NodeId[] = [];
  if (owner !== 'isp' && (cfg[`${owner}-dhcp-on`] ?? '') === '1') out.push(owner);
  for (const d of t.devices) {
    if (d.kind === 'ap' && apModeOf(d) === 'ap' && ownerOf(t, d.id) === owner && (cfg[`${d.id}-dhcp-on`] ?? '') === '1') out.push(d.id);
  }
  return out;
}

/** Který DHCP server obslouží klienta: první zapnutý v jeho síti, jinak router sítě (kvůli hlášení „vypnuto“). null = nezapojeno. */
export function dhcpServerOf(t: Topo, cfg: Config, id: NodeId): NodeId | null {
  const o = ownerOf(t, id);
  if (!o || o === 'isp') return null;
  return dhcpServersIn(t, cfg, o)[0] ?? o;
}

/** Upozornění na více DHCP serverů v jedné síti (klíč = server): jiný server, případně překryv rozsahů. */
export function dhcpConflicts(t: Topo, cfg: Config): Record<NodeId, string> {
  const out: Record<NodeId, string> = {};
  const owners = new Set<NodeId>(['r1', ...t.devices.filter((d) => d.kind === 'router').map((d) => d.id)]);
  for (const o of owners) {
    const servers = dhcpServersIn(t, cfg, o);
    if (servers.length < 2) continue;
    for (const s of servers) {
      const others = servers.filter((x) => x !== s);
      const range = (x: NodeId) => [ipToLong(cfg[`${x}-dhcp-start`] ?? ''), ipToLong(cfg[`${x}-dhcp-end`] ?? '')] as const;
      const [a0, a1] = range(s);
      const overlap = others.filter((x) => {
        const [b0, b1] = range(x);
        return a0 !== null && a1 !== null && b0 !== null && b1 !== null && a0 <= b1 && b0 <= a1;
      });
      out[s] = `V této síti běží ještě další DHCP server (${others.map((x) => nameOf(t, x)).join(', ')}). ` +
        (overlap.length ? `Rozsahy se překrývají (${overlap.map((x) => nameOf(t, x)).join(', ')}) – klienti mohou dostat stejnou adresu dvakrát. ` : 'Rozsahy sice nekolidují, ale klienti si server vybírají náhodně. ') +
        'V jedné síti nechte běžet jen jedno DHCP.';
    }
  }
  return out;
}

/** Uzly, jejichž cesta k ISP vede přes `id`. */
export const descendantsOf = (t: Topo, id: NodeId): NodeId[] =>
  freeNodes(t.devices).filter((n) => n !== id && pathUp(t, n).nodes.includes(id));

/** Id kabelu mezi uzlem a jeho rodičem. */
export const cableId = (child: NodeId, parent: NodeId) => `link-${child}-${parent}`;

/** Cesta paketu od zařízení k ISP a jejich kabely. */
export function pathAndLinks(t: Topo, id: NodeId): { path: NodeId[]; links: string[] } {
  const { nodes } = pathUp(t, id);
  return { path: nodes, links: nodes.slice(1).map((n, i) => cableId(nodes[i], n)) };
}

/** Rozmístění stromu: kořen nahoře, děti pod rodičem, nezapojené v řádku úplně dole. */
export function treeLayout(t: Topo, w: number, h: number): Record<NodeId, Pos> {
  const all = freeNodes(t.devices);
  const children: Record<NodeId, NodeId[]> = {};
  const loose: NodeId[] = [];
  for (const id of all) {
    if (id === 'isp') continue;
    const p = parentOf(t, id);
    if (p && all.includes(p)) (children[p] ??= []).push(id);
    else loose.push(id);
  }
  const pos: Record<NodeId, Pos> = {};
  const seen = new Set<NodeId>();
  let slot = 0;
  let maxDepth = 0;
  const place = (id: NodeId, depth: number): number => {
    seen.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const kids = (children[id] ?? []).filter((k) => !seen.has(k));
    let x: number;
    if (!kids.length) x = slot++;
    else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos[id] = { x: 1.5 + x * (w + 2), y: 2 + depth * (h + 4) };
    return x;
  };
  place('isp', 0);
  // nezapojené uzly (a jejich podstromy) úplně dole
  let lx = 0;
  const rest = all.filter((id) => !seen.has(id) && !loose.includes(id));
  for (const id of [...loose, ...rest]) {
    if (seen.has(id)) continue;
    pos[id] = { x: 1.5 + lx++ * (w + 2), y: 2 + (maxDepth + 1) * (h + 4) };
    seen.add(id);
  }
  return pos;
}

// ============================================================================
// Simulace

interface Ctx { cfg: Config; isp: IspConfig; t: Topo; cidr: boolean; fmt: MaskFormatter }
type Iface = ValidIface;

const parsePort = (s: string | undefined): number | null => {
  const v = (s ?? '').trim();
  if (!/^\d{1,5}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 65535 ? n : null;
};

/**
 * Společná část ping i přístupu zvenku: zkontroluje klienta, všechny routery nad ním a napojení na ISP.
 * Vrací chybu, nebo seznam routerů (nejbližší první).
 */
function connectivity(c: Ctx, id: NodeId, logs: LogItem[], quiet: boolean): SimResult | { routers: NodeId[] } {
  const { cfg, isp, t, fmt } = c;
  const A = (ip: string, m: string) => analyzeInterface(ip ?? '', m ?? '', c.cidr);
  const mask = (s: string) => parseSubnetMask(s ?? '', c.cidr);
  const g = (k: string) => cfg[k] ?? '';
  const N = nameOf(t, id);
  const f = (s: string): FieldId => `${id}-${s}`;

  const fail = (stopNode: NodeId, title: string, text: string, errorFields: FieldId[]): SimResult => {
    logs.push({ type: 'error', title, text });
    return { ok: false, stopNode, logs, errorFields };
  };
  const pass = (title: string, text: string) => { if (!quiet) logs.push({ type: 'success', title, text }); };
  const pick = (bad: FieldId[], fallback: FieldId[]) => (bad.length ? bad : fallback);

  // --- ISP ---
  const ispI = A(isp.gwIp, isp.gwMask);
  if (!ispI.valid || !ispI.isHostUsable || ipToLong(isp.dnsIp) === null) {
    return fail('isp', 'Neplatné parametry ISP', 'Zkontrolujte IP adresu a masku brány ISP nebo cílového DNS serveru (klikněte na Internet / ISP).', []);
  }

  // --- zapojení ---
  const path = pathUp(t, id);
  if (!path.connected) {
    const last = path.nodes[path.nodes.length - 1];
    const text = last === id
      ? `${N} není zapojeno do sítě – paket nemá kudy jít. Přetáhněte kabel (tečku nahoře na kartě) na router, switch nebo AP.`
      : `Cesta od zařízení ${N} se přerušila: ${nameOf(t, last)} není zapojeno do sítě. Přetáhněte jeho kabel (tečku nahoře na kartě) na nadřazené zařízení.`;
    return fail(last, last === id ? 'Zařízení není zapojeno do sítě' : 'Přerušená cesta k internetu', text, []);
  }
  const { routers } = routersUp(t, id);
  if (!routers.length) {
    return fail(id, 'Zařízení není za routerem', `${N} je zapojeno přímo do sítě ISP, bez routeru. Koncové zařízení patří do LAN některého routeru.`, []);
  }

  // --- Wi-Fi: režimy Klient / Bridge ---
  for (let i = 0; i < path.nodes.length - 1; i++) {
    const node = path.nodes[i], up = path.nodes[i + 1];
    if (kindOf(t, node) !== 'ap' || apMode(t, node) === 'ap') continue;
    const modeName = apMode(t, node) === 'client' ? 'Klient' : 'Bridge';
    if (kindOf(t, up) !== 'ap' || apMode(t, up) !== 'ap') {
      return fail(node, `${nameOf(t, node)}: režim ${modeName} nemá s čím se spojit`,
        `AP v režimu ${modeName} se připojuje bezdrátově – musí být zapojený k jinému AP v režimu Access Point (ne k ${nameOf(t, up)}). Přetáhněte jeho kabel na vysílající AP, nebo ho přepněte do režimu Access Point.`, []);
    }
    const wired = t.devices.filter((d) => parentOf(t, d.id) === node).length;
    if (apMode(t, node) === 'client' && wired > 1) {
      return fail(node, `${nameOf(t, node)}: režim Klient přenese jen jedno zařízení`,
        `AP v režimu Klient se chová jako bezdrátová síťovka – za ním může být jen jedno zařízení (zde ${wired}). Pro propojení celé sítě přepněte AP do režimu Bridge.`, []);
    }
  }

  // --- pomocné kontroly rozhraní ---
  const lanOf = (r: NodeId) => A(g(`${r}-lan-ip`), g(`${r}-lan-mask`)) as Iface; // použito až po kontrole platnosti
  const wanOf = (r: NodeId) => A(g(`${r}-wan-ip`), g(`${r}-wan-mask`)) as Iface;
  const checkIface = (r: NodeId, side: 'lan' | 'wan'): SimResult | null => {
    const rn = nameOf(t, r);
    const i = side === 'lan' ? lanOf(r) : wanOf(r);
    if (i.valid && i.isHostUsable) return null;
    const ipF = `${r}-${side}-ip`, mF = `${r}-${side}-mask`;
    const bad: FieldId[] = [];
    if (ipToLong(g(ipF)) === null || (i.valid && !i.isHostUsable)) bad.push(ipF);
    if (mask(g(mF)) === null) bad.push(mF);
    const where = side === 'lan' ? 'Vnitřní rozhraní (LAN)' : 'Vnější rozhraní (WAN)';
    return fail(r, `Chyba: ${rn} (${side === 'lan' ? 'LAN' : 'WAN'} rozhraní)`,
      !i.valid
        ? `${where} zařízení ${rn} nemá platnou IP adresu nebo masku podsítě.`
        : `Adresa ${fmt(i.ipStr, i.prefix)} na rozhraní ${side.toUpperCase()} zařízení ${rn} je adresa sítě nebo broadcast.`,
      pick(bad, [ipF, mF]));
  };

  /** Ostatní zařízení se stejným „sousedstvím“ (stejný router / ISP nad sebou) – kvůli konfliktu IP. */
  const siblings = (owner: NodeId, self: NodeId): { name: string; field: FieldId }[] => {
    const out: { name: string; field: FieldId }[] = [];
    for (const nid of ['r1', ...t.devices.map((d) => d.id)]) {
      if (nid === self || ownerOf(t, nid) !== owner) continue;
      const k = kindOf(t, nid);
      if (isClientKind(k)) out.push({ name: nameOf(t, nid), field: `${nid}-ip` });
      else if (k === 'router') out.push({ name: nameOf(t, nid), field: `${nid}-wan-ip` });
      else if (k === 'ap' && (g(`${nid}-lan-ip`)).trim()) out.push({ name: nameOf(t, nid), field: `${nid}-lan-ip` });
    }
    return out;
  };

  /** Úsek: `subj` (klient nebo WAN routeru) → LAN routeru `owner` (nebo ISP). */
  const segment = (opts: { subj: NodeId; sname: string; iface: Iface; ipF: FieldId; maskF: FieldId; gwF: FieldId; owner: NodeId; label: string; num: number }): SimResult | null => {
    const { subj, sname, iface, ipF, maskF, gwF, owner, num } = opts;
    const toIsp = owner === 'isp';
    const oIf = toIsp ? ispI : lanOf(owner);
    const oName = toIsp ? 'brána ISP' : nameOf(t, owner);
    const oIp: FieldId[] = toIsp ? [] : [`${owner}-lan-ip`];
    const oFields: FieldId[] = toIsp ? [] : [`${owner}-lan-ip`, `${owner}-lan-mask`];
    const gw = g(gwF);

    if (ipToLong(gw) === null) {
      return fail(subj, `Chyba: ${sname} (Výchozí brána)`,
        `${sname} nemá nastavenou platnou IP adresu výchozí brány (Default Gateway), proto neví, kam posílat pakety mimo svou síť.`, [gwF]);
    }
    if (!isIpInSubnet(gw, iface)) {
      return fail(subj, `Chyba: ${sname} (Nedosažitelná brána)`,
        `Výchozí brána zařízení ${sname} (${gw.trim()}) neleží ve stejné podsíti jako ono samo (${fmt(iface.networkStr, iface.prefix)}).`, [gwF, ipF, maskF]);
    }
    if (!isSameSubnet(iface, oIf)) {
      return fail(owner, toIsp ? `Chyba: ${sname} – neshoda se sítí ISP` : `Neshoda podsítě: ${sname} a ${oName}`,
        `${sname} (${fmt(iface.ipStr, iface.prefix)}, síť ${fmt(iface.networkStr, iface.prefix)}) není ve stejné podsíti jako ${toIsp ? 'brána poskytovatele ISP' : `LAN rozhraní zařízení ${oName}`} (${fmt(oIf.ipStr, oIf.prefix)}, síť ${fmt(oIf.networkStr, oIf.prefix)}).`,
        [ipF, maskF, ...oFields]);
    }
    for (const o of siblings(owner, subj)) {
      if (ipToLong(g(o.field)) === iface.ipLong) {
        return fail(subj, 'Konflikt IP adres v jedné síti',
          `${sname} a ${o.name} mají shodnou IP adresu (${iface.ipStr}). Každé zařízení v síti musí mít unikátní IP.`, [ipF, o.field]);
      }
    }
    if (iface.ipLong === oIf.ipLong) {
      return fail(owner, 'Konflikt IP adres v jedné síti',
        `${sname} i ${toIsp ? 'brána ISP' : `LAN rozhraní zařízení ${oName}`} mají shodnou IP adresu (${iface.ipStr}).`, [ipF, ...oIp]);
    }
    if (ipToLong(gw) !== oIf.ipLong) {
      return fail(owner, `Špatná výchozí brána: ${sname}`,
        `${sname} má nastavenou bránu ${gw.trim()}, ale ${toIsp ? 'brána ISP' : `LAN rozhraní zařízení ${oName}`} má adresu ${oIf.ipStr}. Paket se nedostane na ${toIsp ? 'bránu' : 'router'}.`, [gwF, ...oIp]);
    }
    pass(`${num}. úsek OK: ${sname} ↔ ${toIsp ? 'brána ISP' : oName + ' (LAN)'}`,
      `${sname} (${fmt(iface.ipStr, iface.prefix)}) předalo paket své výchozí bráně ${fmt(oIf.ipStr, oIf.prefix)}${toIsp ? '' : ` na zařízení ${oName}`}.`);
    return null;
  };

  // --- klient ---
  const cl = A(g(f('ip')), g(f('mask')));
  if (!cl.valid) {
    const bad: FieldId[] = [];
    if (ipToLong(g(f('ip'))) === null) bad.push(f('ip'));
    if (mask(g(f('mask'))) === null) bad.push(f('mask'));
    return fail(id, `Chyba: ${N} (IP / Maska)`, `IPv4 adresa nebo maska podsítě zařízení ${N} má neplatný formát (nebo chybí).`, pick(bad, [f('ip'), f('mask')]));
  }
  if (!cl.isHostUsable) {
    return fail(id, `Chyba: ${N} (Rezervovaná adresa)`,
      `Zadaná adresa ${fmt(cl.ipStr, cl.prefix)} je ${cl.isNetworkAddress ? 'adresa sítě (Network ID)' : 'všesměrová adresa (Broadcast)'} a nelze ji přiřadit zařízení.`, [f('ip')]);
  }

  // --- řetěz routerů ---
  for (let i = 0; i < routers.length; i++) {
    const r = routers[i];
    const rn = nameOf(t, r);
    const bad = checkIface(r, 'lan');
    if (bad) return bad;
    const seg = i === 0
      ? segment({ subj: id, sname: N, iface: cl, ipF: f('ip'), maskF: f('mask'), gwF: f('gw'), owner: r, label: 'LAN', num: 1 })
      : segment({ subj: routers[i - 1], sname: `${nameOf(t, routers[i - 1])} (WAN)`, iface: wanOf(routers[i - 1]), ipF: `${routers[i - 1]}-wan-ip`, maskF: `${routers[i - 1]}-wan-mask`, gwF: `${routers[i - 1]}-wan-gw`, owner: r, label: 'WAN', num: i + 1 });
    if (seg) return seg;
    const badWan = checkIface(r, 'wan');
    if (badWan) return badWan;
    if (subnetsOverlap(lanOf(r), wanOf(r))) {
      const l = lanOf(r), w = wanOf(r);
      return fail(r, `Kolize podsítí na zařízení ${rn} (WAN vs. LAN)`,
        `Router nemůže směrovat mezi dvěma překrývajícími se podsítěmi! WAN (${fmt(w.networkStr, w.prefix)}) a LAN (${fmt(l.networkStr, l.prefix)}) zařízení ${rn} kolidují.`,
        [`${r}-wan-ip`, `${r}-wan-mask`, `${r}-lan-ip`, `${r}-lan-mask`]);
    }
  }
  const top = routers[routers.length - 1];
  const last = segment({ subj: top, sname: `${nameOf(t, top)} (WAN)`, iface: wanOf(top), ipF: `${top}-wan-ip`, maskF: `${top}-wan-mask`, gwF: `${top}-wan-gw`, owner: 'isp', label: 'WAN', num: routers.length + 1 });
  if (last) return last;
  return { routers };
}

/** Ping z koncového zařízení do internetu (přes libovolný počet routerů). */
export function simulateFree(cfg: Config, isp: IspConfig, t: Topo, clientId: NodeId, allowCidr: boolean, fmt: MaskFormatter): SimResult {
  const logs: LogItem[] = [];
  const N = nameOf(t, clientId);
  const res = connectivity({ cfg, isp, t, cidr: allowCidr, fmt }, clientId, logs, false);
  if (!('routers' in res)) return res;

  const checks: { id: FieldId; device: string }[] = [
    { id: `${clientId}-dns`, device: N },
    ...res.routers.map((r) => ({ id: `${r}-wan-dns`, device: `${nameOf(t, r)} (WAN)` })),
  ];
  for (const check of checks) {
    const val = cfg[check.id] ?? '';
    const v = ipToLong(val);
    if (v === null) {
      logs.push({ type: 'error', title: `Chybějící nebo neplatný DNS server (${check.device})`,
        text: `Zařízení ${check.device} nemá nastavenou platnou IPv4 adresu DNS serveru (např. ${isp.dnsIp.trim()} nebo IP nadřazeného routeru).` });
      return { ok: false, stopNode: 'isp', logs, errorFields: [check.id] };
    }
    if (v === 0 || v === 0xffffffff) {
      logs.push({ type: 'error', title: `Nedosažitelný DNS server (${check.device})`, text: `Adresa DNS serveru ${val} na zařízení ${check.device} není platná cílová adresa.` });
      return { ok: false, stopNode: 'isp', logs, errorFields: [check.id] };
    }
  }
  logs.push({ type: 'success', title: 'Dosažitelnost internetu a překlad DNS OK',
    text: `Paket dorazil k cílovému serveru ${isp.dnsIp.trim()} a vrátil se zpět na zařízení ${N}. Všechny podsítě, brány i DNS záznamy jsou nastaveny správně!` });
  return { ok: true, stopNode: 'isp', logs, errorFields: [] };
}

/** Hopy traceroute z koncového zařízení: LAN adresa každého routeru na cestě, brána ISP a cíl. */
export function traceHopsFree(cfg: Config, isp: IspConfig, t: Topo, id: NodeId): Hop[] {
  const { routers } = routersUp(t, id);
  const hops: Hop[] = routers.map((r, i) => ({
    ttl: i + 1, node: r, name: `${nameOf(t, r)} (LAN)`, ip: (cfg[`${r}-lan-ip`] ?? '').trim() || '?', ms: 0.6 + i * 0.8,
  }));
  hops.push({ ttl: hops.length + 1, node: 'isp', name: 'Brána ISP', ip: isp.gwIp, ms: 7.8 });
  hops.push({ ttl: hops.length + 1, node: 'isp', name: 'Cílový server', ip: isp.dnsIp, ms: 12.3, target: true });
  return hops;
}

/** Přístup z internetu k serveru / kameře: každý router na cestě potřebuje pravidlo PAT (dvojitý, trojitý … NAT). */
export function simulateInboundFree(
  cfg: Config, isp: IspConfig, t: Topo, deviceId: NodeId, rules: Rules, allowCidr: boolean, fmt: MaskFormatter,
): SimResult {
  const logs: LogItem[] = [];
  const dev = t.devices.find((d) => d.id === deviceId);
  if (!dev) return { ok: false, stopNode: deviceId, logs: [{ type: 'error', title: 'Zařízení neexistuje', text: '' }], errorFields: [] };
  const A = (ip: string, m: string) => analyzeInterface(ip ?? '', m ?? '', allowCidr) as ValidIface; // platnost ověřila connectivity()
  const g = (k: string) => cfg[k] ?? '';
  const dn = dev.name;
  const df = (s: string): FieldId => `${deviceId}-${s}`;
  const fail = (stopNode: NodeId, title: string, text: string, errorFields: FieldId[]): SimResult => {
    logs.push({ type: 'error', title, text });
    return { ok: false, stopNode, logs, errorFields };
  };
  const pass = (title: string, text: string) => logs.push({ type: 'success', title, text });

  const res = connectivity({ cfg, isp, t, cidr: allowCidr, fmt }, deviceId, logs, true);
  if (!('routers' in res)) return res;
  const routers = res.routers;
  const top = routers[routers.length - 1];
  const topWan = A(g(`${top}-wan-ip`), g(`${top}-wan-mask`));
  const devIf = A(g(df('ip')), g(df('mask')));

  const pub = parsePort(g(df('pub')));
  if (pub === null) {
    return fail('isp', 'Chybí veřejný port', `U zařízení ${dn} zadejte veřejný port (1–65535), na kterém bude dostupné z internetu, např. 8081.`, [df('pub')]);
  }
  // zařízení nemá pevný port služby – poslouchá na portu zadaném v jeho poli
  const svcPort = pub;
  pass(`1. Internet → ${nameOf(t, top)}: požadavek na ${topWan.ipStr}:${pub}`,
    `Klient z internetu se připojuje na veřejnou adresu zařízení ${nameOf(t, top)} (${topWan.ipStr}) a port ${pub}.`);

  let port = pub;
  let n = 2;
  for (let i = routers.length - 1; i >= 0; i--) {
    const r = routers[i];
    const rn = nameOf(t, r);
    const list = rules[r] ?? [];
    // duplicitní vnější porty
    const seen = new Map<number, string>();
    const dup: FieldId[] = [];
    for (const rid of list) {
      const p = parsePort(g(ruleField(r, rid, 'ext')));
      if (p === null) continue;
      if (seen.has(p)) dup.push(ruleField(r, rid, 'ext'), ruleField(r, seen.get(p)!, 'ext'));
      else seen.set(p, rid);
    }
    if (dup.length) {
      return fail(r, `Dvě pravidla PAT na zařízení ${rn} používají stejný vnější port`,
        'Jeden vnější port lze přesměrovat jen na jedno místo. Každé zařízení potřebuje na veřejné IP svůj vlastní port.', dup);
    }
    const rule = list.find((rid) => parsePort(g(ruleField(r, rid, 'ext'))) === port);
    if (!rule) {
      const next = i === 0 ? dn : nameOf(t, routers[i - 1]);
      return fail(r, `${rn} nemá pravidlo PAT pro port ${port}`,
        `Bez přesměrování portu router příchozí spojení na port ${port} zahodí. Přidejte v nastavení zařízení ${rn} pravidlo PAT: vnější port ${port} → ${next}.`, []);
    }
    const target = g(ruleField(r, rule, 'ip'));
    const tport = parsePort(g(ruleField(r, rule, 'port')));
    const lastHop = i === 0;
    const expected = lastHop ? devIf : A(g(`${routers[i - 1]}-wan-ip`), g(`${routers[i - 1]}-wan-mask`));
    if (ipToLong(target) !== expected.ipLong) {
      return fail(r, lastHop ? `Pravidlo PAT na zařízení ${rn} míří na špatné zařízení` : `Pravidlo PAT na zařízení ${rn} míří na špatnou adresu`,
        lastHop
          ? `Pravidlo přesměrovává na ${target.trim() || 'nevyplněno'}, ale ${dn} má adresu ${expected.ipStr}.`
          : `${rn} přesměrovává port ${port} na ${target.trim() || 'nevyplněno'}, ale další router v řetězci (${nameOf(t, routers[i - 1])}) má na WAN adresu ${expected.ipStr}.`,
        lastHop ? [ruleField(r, rule, 'ip'), df('ip')] : [ruleField(r, rule, 'ip')]);
    }
    if (tport === null) {
      return fail(r, `Neplatný cílový port v pravidle PAT na zařízení ${rn}`, 'Cílový port musí být číslo 1–65535.', [ruleField(r, rule, 'port')]);
    }
    if (lastHop && tport !== svcPort) {
      return fail(r, `Pravidlo PAT na zařízení ${rn} míří na špatný port`,
        `${dn} poslouchá na portu ${svcPort}, ale pravidlo přesměrovává na port ${g(ruleField(r, rule, 'port')).trim() || 'nevyplněno'}.`, [ruleField(r, rule, 'port')]);
    }
    pass(`${n++}. ${rn} (PAT): ${port} → ${expected.ipStr}:${tport}`,
      `${rn} přeložil port ${port} na ${expected.ipStr}:${tport} a předal paket dál.`);
    port = tport;
  }
  pass(`${n}. ${dn} dostupné z internetu`, `Služba na portu ${svcPort} odpověděla. Zvenku se na ni připojíte na ${topWan.ipStr}:${pub}.`);
  return { ok: true, stopNode: deviceId, logs, errorFields: [] };
}

export { hasIp };
