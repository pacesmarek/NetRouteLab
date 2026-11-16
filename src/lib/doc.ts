import type { ApMode, Config, Device, DeviceKind, IspConfig, Mode, NodeId, Pos, Rules, Scenario, Uplinks } from './model';
import { AP_MODES, AP_SUFFIXES, DEFAULT_ISP, ROUTER_SUFFIXES, SCENARIOS, emptyConfig, emptyRules, hasIp, isL2, isRouter } from './model';
import { canParent } from './free';

/** Celý „dokument“ – to, co se ukládá, sdílí a vrací krokem zpět. */
export interface Doc {
  cfg: Config;
  devices: Device[];
  rules: Rules;
  uplinks: Uplinks;
  positions: Record<NodeId, Pos>;
  isp: IspConfig;
  scenario: Scenario | null;
  mode: Mode;
}

export const DEV_SUFFIXES = ['ip', 'mask', 'gw', 'dns', 'pub', 'dhcp'] as const;

export const emptyDoc = (): Doc => ({
  cfg: emptyConfig(),
  devices: [],
  rules: emptyRules(),
  uplinks: {},
  positions: {},
  isp: DEFAULT_ISP,
  scenario: null,
  mode: 'default',
});

/** Pole, která zařízení má mít v konfiguraci. */
export const fieldsOfDevice = (d: Device): string[] =>
  hasIp(d) ? DEV_SUFFIXES.map((s) => `${d.id}-${s}`)
  : isRouter(d) ? ROUTER_SUFFIXES.map((s) => `${d.id}-${s}`)
  : d.kind === 'ap' ? AP_SUFFIXES.map((s) => `${d.id}-${s}`)
  : [];

/** Volné plátno: jen ISP a hraniční router, nic dalšího. */
export const playgroundDoc = (): Doc => ({ ...emptyDoc(), mode: 'playground' });

/** Další volné číslo zařízení (dev-N). */
export const nextDeviceNumber = (devices: Device[]): number =>
  devices.reduce((m, d) => Math.max(m, Number(d.id.replace('dev-', '')) || 0), 0) + 1;

/** Nový dokument pro vybranou úlohu (včetně přednastavených zařízení). */
export function docForScenario(scenario: Scenario | null): Doc {
  const doc: Doc = { ...emptyDoc(), isp: DEFAULT_ISP, scenario, mode: scenario ? 'scenario' : 'default', positions: {} };
  if (!scenario) return doc;
  doc.isp = { gwIp: scenario.ispGw, gwMask: scenario.ispMask, dnsIp: scenario.ispDns };
  const counts: Partial<Record<DeviceKind, number>> = {};
  const labels: Record<DeviceKind, string> = { pc: 'PC', camera: 'Kamera', webserver: 'Web server', switch: 'Switch', ap: 'Wi-Fi AP', router: 'Router' };
  const made: Device[] = [];
  (scenario.devices ?? []).forEach((spec, i) => {
    counts[spec.kind] = (counts[spec.kind] ?? 0) + 1;
    const dev: Device = { id: `dev-${i + 1}`, kind: spec.kind, name: spec.name ?? `${labels[spec.kind]} ${counts[spec.kind]}` };
    made.push(dev);
    if (spec.behind !== undefined && made[spec.behind]) doc.uplinks[dev.id] = made[spec.behind].id;
    for (const f of fieldsOfDevice(dev)) doc.cfg[f] = '';
    if (spec.dhcp && hasIp(dev)) doc.cfg[`${dev.id}-dhcp`] = '1';
  });
  doc.devices = made;
  return doc;
}

// ----------------------------------------------------------------------------
// Ověření dat z odkazu / souboru / úložiště

const ID_RE = /^[a-z0-9-]{1,40}$/;
const KINDS: DeviceKind[] = ['pc', 'camera', 'webserver', 'switch', 'ap', 'router'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeDoc(raw: unknown): Doc | null {
  if (!isObj(raw)) return null;
  const doc = emptyDoc();
  const free = raw.mode === 'playground';

  if (isObj(raw.cfg)) {
    for (const [k, v] of Object.entries(raw.cfg)) if (ID_RE.test(k) && typeof v === 'string') doc.cfg[k] = v.slice(0, 64);
  }
  if (Array.isArray(raw.devices)) {
    for (const d of raw.devices.slice(0, 60)) {
      if (!isObj(d) || typeof d.id !== 'string' || !/^dev-\d{1,4}$/.test(d.id)) continue;
      if (!KINDS.includes(d.kind as DeviceKind)) continue;
      if (!free && d.kind === 'router') continue; // routery jen ve volném plátně
      if (doc.devices.some((x) => x.id === d.id)) continue;
      const dev: Device = { id: d.id, kind: d.kind as DeviceKind, name: str(d.name, 28) || d.id };
      if (dev.kind === 'ap' && AP_MODES.includes(d.apMode as ApMode) && d.apMode !== 'ap') dev.apMode = d.apMode as ApMode;
      doc.devices.push(dev);
    }
  }
  doc.mode = raw.mode === 'sample' || raw.mode === 'scenario' || free ? (raw.mode as Doc['mode']) : 'default';

  const ruleOwners = new Set<string>(['r1', 'r2', ...doc.devices.filter(isRouter).map((d) => d.id)]);
  if (isObj(raw.rules)) {
    for (const r of ruleOwners) {
      const list = raw.rules[r];
      if (Array.isArray(list)) doc.rules[r] = [...new Set(list.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, 40);
    }
  }
  const nodeIds = new Set<string>(free ? ['isp', 'r1', ...doc.devices.map((d) => d.id)] : ['isp', 'r1', 'r2', 'pc', ...doc.devices.map((d) => d.id)]);
  if (isObj(raw.uplinks)) {
    if (free) {
      // volné plátno: platné typy a žádné smyčky (kontroluje canParent průběžně)
      const t = { devices: doc.devices, uplinks: doc.uplinks };
      for (const [k, v] of Object.entries(raw.uplinks)) {
        if (typeof v === 'string' && v !== '' && nodeIds.has(k) && canParent(t, k, v)) doc.uplinks[k] = v;
      }
    } else {
      for (const [k, v] of Object.entries(raw.uplinks)) {
        const parent = doc.devices.find((d) => d.id === v);
        if (nodeIds.has(k) && k !== 'isp' && k !== 'r1' && k !== 'r2' && typeof v === 'string' && (v === 'r2' || (parent && isL2(parent) && v !== k))) doc.uplinks[k] = v;
      }
    }
  }
  if (isObj(raw.positions)) {
    for (const [k, v] of Object.entries(raw.positions)) {
      if (!nodeIds.has(k) || !isObj(v)) continue;
      const x = Number(v.x), y = Number(v.y);
      if (Number.isFinite(x) && Number.isFinite(y)) doc.positions[k] = { x: Math.max(-50, Math.min(300, x)), y: Math.max(-50, Math.min(600, y)) };
    }
  }
  if (isObj(raw.isp)) doc.isp = { gwIp: str(raw.isp.gwIp, 20), gwMask: str(raw.isp.gwMask, 20), dnsIp: str(raw.isp.dnsIp, 20) };
  if (isObj(raw.scenario)) {
    const sc = raw.scenario;
    const known = SCENARIOS.find((s) => s.title === sc.title);
    doc.scenario = known ?? null; // nové scénáře z odkazů ber jen ze známých
  }
  if (doc.mode === 'scenario' && !doc.scenario) doc.mode = 'default';

  // každé zařízení má mít svá pole
  for (const d of doc.devices) for (const f of fieldsOfDevice(d)) if (!(f in doc.cfg)) doc.cfg[f] = '';
  for (const r of Object.keys(doc.rules)) for (const id of doc.rules[r]) for (const part of ['ext', 'ip', 'port']) {
    const k = `${r}-pat-${id}-${part}`;
    if (!(k in doc.cfg)) doc.cfg[k] = '';
  }
  return doc;
}

/** Zadání bez vyplněných hodnot studenta (pro sdílení). */
export function assignmentOf(doc: Doc): Doc {
  return { ...doc, cfg: Object.fromEntries(Object.keys(doc.cfg).map((k) => [k, ''])) , rules: Object.fromEntries(Object.keys(doc.rules).map((k) => [k, [] as string[]])) as Rules };
}

// ----------------------------------------------------------------------------
// Kódování do odkazu: JSON → (deflate) → base64url

const toB64Url = (bytes: Uint8Array): string => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeDoc(doc: Doc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, ...doc }));
  if (typeof CompressionStream !== 'undefined') return 'z.' + toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'p.' + toB64Url(json);
}

export async function decodeDoc(code: string): Promise<Doc | null> {
  try {
    const [kind, data] = [code.slice(0, 2), code.slice(2)];
    let bytes = fromB64Url(data);
    if (kind === 'z.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'p.') return null;
    return sanitizeDoc(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export const shareUrl = (code: string, base = location.origin + location.pathname): string => `${base}#s=${code}`;
