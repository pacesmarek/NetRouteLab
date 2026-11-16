import { Mail, Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useElementWidth, useLocalStorage, useMeasuredHeight } from '../hooks';
import type { Config, Device, FieldId, IspConfig, LinkId, NodeId, Pos, RouterId, Rules, Uplinks } from '../lib/model';
import { FIXED_NODES, KIND_INFO, isL2, linkId, nodeOfField } from '../lib/model';
import { analyzeInterface } from '../lib/net';
import { ApArt, CameraArt, CloudArt, PcArt, RouterArt, ServerArt, SwitchArt } from './Art';
import DeviceCard, { CARD_H, CARD_W, type Status } from './DeviceCard';
import SetupPanel, { panelWidthRem } from './SetupPanel';

export type { Pos };
export interface PacketState { node: NodeId; kind: 'run' | 'ok' | 'error'; label: string }

export interface LayoutApi {
  pos: Record<NodeId, Pos>;
  setPos: (id: NodeId, x: number, y: number) => void;
  reset: () => void;
}

interface Props {
  devices: Device[];
  uplinks: Uplinks;
  rules: Rules;
  cfg: Config;
  onField: (id: FieldId, value: string) => void;
  errorFields: Set<FieldId>;
  isp: IspConfig;
  cidr: boolean;
  showCalc: boolean;
  openNode: NodeId | null;
  onToggleNode: (id: NodeId) => void;
  onCloseNode: () => void;
  nodeStatus: Record<NodeId, Status>;
  linkStatus: Record<LinkId, 'idle' | 'ok'>;
  packet: PacketState | null;
  packetMs: number;
  onDismissPacket: () => void;
  rootPx: number;
  snap: boolean;
  onAutoFill: (id: NodeId) => void;
  onAddRule: (router: RouterId) => void;
  onRemoveRule: (router: RouterId, id: string) => void;
  onRemoveDevice: (id: NodeId) => void;
  onRename: (id: NodeId, name: string) => void;
  onUplink: (child: NodeId, parent: NodeId) => void;
  onTestPing: (id: NodeId) => void;
  onTestInbound: (id: NodeId) => void;
  layout: LayoutApi;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const GRID = 0.5; // rem
const SNAP_THRESHOLD = 0.7; // rem

interface Def { name: string; sub: string; art: ReactNode; tint: string; idleIcon: 'globe' | 'minus'; idleClass: string }
interface LinkDef { id: LinkId; from: NodeId; to: NodeId; label: string; wifi?: boolean }

export default function Topology(p: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const outerW = useElementWidth(canvasRef);
  const [panelRef, panelH] = useMeasuredHeight();
  const [zoom, setZoom] = useLocalStorage('netroute.zoom', 1);
  const [pan, setPan] = useState(0);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const pinching = useRef(false);
  const root = p.rootPx;

  // logická šířka plátna: při oddálení se plátno „zvětší“, při přiblížení zůstává (rozmístění se nemění)
  const logicalW = outerW / Math.min(zoom, 1);
  const widthRem = logicalW / root;
  const maxX = Math.max(0, widthRem - CARD_W);
  const px = (rem: number) => rem * root;

  const clampPan = useCallback((v: number, z: number) => (z <= 1 ? 0 : clamp(v, outerW * (1 - z), 0)), [outerW]);

  const nodeIds: NodeId[] = [...FIXED_NODES, ...p.devices.map((d) => d.id)];
  const deviceOf = (id: NodeId) => p.devices.find((d) => d.id === id);

  const eff = (id: NodeId): Pos => {
    const q = p.layout.pos[id] ?? { x: 0, y: 0 };
    return { x: clamp(q.x, 0, maxX), y: Math.max(0, q.y) };
  };
  const E = Object.fromEntries(nodeIds.map((id) => [id, eff(id)])) as Record<NodeId, Pos>;

  // --- kabely podle připojení (uplinks) ---
  const parentOf = (child: NodeId): NodeId => {
    const up = p.uplinks[child] ?? 'r2';
    return up === 'r2' || deviceOf(up) ? up : 'r2';
  };
  const links: LinkDef[] = [
    { id: 'link-r1-isp', from: 'isp', to: 'r1', label: 'WAN' },
    { id: 'link-r2-r1', from: 'r1', to: 'r2', label: 'ETH' },
    ...['pc', ...p.devices.map((d) => d.id)].map((child): LinkDef => {
      const parent = parentOf(child);
      const wifi = deviceOf(parent)?.kind === 'ap';
      return { id: linkId(child, parent), from: parent, to: child, label: wifi ? 'Wi-Fi' : 'LAN', wifi };
    }),
  ];

  // --- umístění a rozměr rozbaleného nastavení ---
  type PanelLayout = { mode: 'right' | 'left' | 'below'; widthPx: number; leftPx?: number };
  let panelLayout: PanelLayout | null = null;
  let sheet = false;
  if (p.openNode && E[p.openNode]) {
    const e = E[p.openNode];
    const desired = px(panelWidthRem(p.openNode, !!deviceOf(p.openNode), !!deviceOf(p.openNode) && isL2(deviceOf(p.openNode)!)));
    const availRight = logicalW - px(e.x + CARD_W + 1) - px(0.5);
    const availLeft = px(e.x - 1) - px(0.5);
    if (availRight >= desired) panelLayout = { mode: 'right', widthPx: desired };
    else if (availLeft >= desired) panelLayout = { mode: 'left', widthPx: desired };
    else if (logicalW >= px(20)) {
      const w = Math.min(desired, logicalW - px(1));
      const leftAbs = clamp(px(e.x), px(0.5), logicalW - w - px(0.5));
      panelLayout = { mode: 'below', widthPx: w, leftPx: leftAbs - px(e.x) };
    } else sheet = true;
  }
  // úzká obrazovka: nastavení jako spodní panel (mimo plátno, aby ho nezmenšil zoom)
  if (typeof window !== 'undefined' && window.innerWidth < 640 && p.openNode) sheet = true;

  // --- výška plátna (logická) ---
  const nodesBottom = Math.max(...nodeIds.map((id) => px(E[id].y + CARD_H))) + px(3);
  const panelTop = p.openNode && E[p.openNode] ? px(E[p.openNode].y) + (panelLayout?.mode === 'below' ? px(CARD_H + 0.75) : 0) : 0;
  const panelBottom = p.openNode && E[p.openNode] && !sheet ? panelTop + panelH + px(3) : 0;
  const canvasH = Math.max(nodesBottom, panelBottom);

  // --- zoom a posun ---
  const zoomTo = useCallback((nz: number, anchorX: number) => {
    const z = clamp(nz, ZOOM_MIN, ZOOM_MAX);
    setPan((pn) => clampPan(anchorX - (anchorX - pn) * (z / zoom), z));
    setZoom(Math.round(z * 100) / 100);
  }, [zoom, clampPan, setZoom]);

  const fit = () => {
    const maxRight = Math.max(...nodeIds.map((id) => E[id].x + CARD_W)) + 1.5;
    const cw = px(maxRight);
    const ch = Math.max(...nodeIds.map((id) => px(E[id].y + CARD_H))) + px(2);
    const z = clamp(Math.min(2, (outerW * Math.min(zoom, 1)) / cw, (window.innerHeight * 0.82) / ch), ZOOM_MIN, ZOOM_MAX);
    setPan(0);
    setZoom(Math.round(z * 100) / 100);
  };

  useEffect(() => { setPan((pn) => clampPan(pn, zoom)); }, [outerW, zoom, clampPan]);

  // Ctrl/⌘ + kolečko = zoom kolem kurzoru
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - rect.left);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, zoomTo]);

  // dotyk: dva prsty = pinch-zoom, jeden prst / myš na pozadí = posun (při přiblížení)
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'pan'; x0: number; pan0: number } | { kind: 'pinch'; d0: number; z0: number; pan0: number; cx0: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinching.current = true;
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, pan0: pan, cx0: (a.x + b.x) / 2 - rect.left };
    } else if (ptrs.current.size === 1 && zoom > 1 && !(e.target as Element).closest('[data-node-root],button,input,select,textarea,a')) {
      gesture.current = { kind: 'pan', x0: e.clientX, pan0: pan };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') setPan(clampPan(g.pan0 + (e.clientX - g.x0), zoom));
    else if (ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      const nz = clamp(g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), ZOOM_MIN, ZOOM_MAX);
      const cx = (a.x + b.x) / 2 - rect.left;
      setPan(clampPan(cx - (g.cx0 - g.pan0) * (nz / g.z0), nz));
      setZoom(Math.round(nz * 100) / 100);
    }
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2 && gesture.current?.kind === 'pinch') gesture.current = null;
    if (ptrs.current.size === 0) { gesture.current = null; pinching.current = false; }
  };

  // --- přichytávání k mřížce a zarovnávací vodítka ---
  const applySnap = (id: NodeId, x: number, y: number): Pos => {
    let nx = x, ny = y;
    const gv: number[] = [], gh: number[] = [];
    if (p.snap) {
      let bdx = Infinity, bcx = 0, bdy = Infinity, bcy = 0;
      for (const o of nodeIds) {
        if (o === id) continue;
        const oe = E[o];
        for (const a of [0, CARD_W / 2, CARD_W]) for (const c of [oe.x, oe.x + CARD_W / 2, oe.x + CARD_W]) {
          const d = c - (x + a);
          if (Math.abs(d) < Math.abs(bdx)) { bdx = d; bcx = c; }
        }
        for (const a of [0, CARD_H / 2, CARD_H]) for (const c of [oe.y, oe.y + CARD_H / 2, oe.y + CARD_H]) {
          const d = c - (y + a);
          if (Math.abs(d) < Math.abs(bdy)) { bdy = d; bcy = c; }
        }
      }
      if (Math.abs(bdx) <= SNAP_THRESHOLD) { nx = x + bdx; gv.push(bcx); } else nx = Math.round(x / GRID) * GRID;
      if (Math.abs(bdy) <= SNAP_THRESHOLD) { ny = y + bdy; gh.push(bcy); } else ny = Math.round(y / GRID) * GRID;
    }
    setGuides((g) => (g.v.join() === gv.join() && g.h.join() === gh.join() ? g : { v: gv, h: gh }));
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    return { x: r3(nx), y: r3(ny) };
  };
  const endDrag = () => setGuides({ v: [], h: [] });

  // --- kabely: geometrie ---
  const anchors = (a: NodeId, b: NodeId) => {
    const A = { l: px(E[a].x), t: px(E[a].y), w: px(CARD_W), h: px(CARD_H) };
    const B = { l: px(E[b].x), t: px(E[b].y), w: px(CARD_W), h: px(CARD_H) };
    const gap = px(0.2);
    type Anchor = { x: number; y: number; dx: number; dy: number };
    let s: Anchor, t: Anchor;
    if (B.t >= A.t + A.h + gap) {
      s = { x: A.l + A.w / 2, y: A.t + A.h, dx: 0, dy: 1 };
      t = { x: B.l + B.w / 2, y: B.t, dx: 0, dy: -1 };
    } else if (B.t + B.h <= A.t - gap) {
      s = { x: A.l + A.w / 2, y: A.t, dx: 0, dy: -1 };
      t = { x: B.l + B.w / 2, y: B.t + B.h, dx: 0, dy: 1 };
    } else if (B.l >= A.l) {
      s = { x: A.l + A.w, y: A.t + A.h / 2, dx: 1, dy: 0 };
      t = { x: B.l, y: B.t + B.h / 2, dx: -1, dy: 0 };
    } else {
      s = { x: A.l, y: A.t + A.h / 2, dx: -1, dy: 0 };
      t = { x: B.l + B.w, y: B.t + B.h / 2, dx: 1, dy: 0 };
    }
    const dist = Math.hypot(t.x - s.x, t.y - s.y);
    const k = Math.max(px(2), dist * 0.4);
    const c1 = { x: s.x + s.dx * k, y: s.y + s.dy * k };
    const c2 = { x: t.x + t.dx * k, y: t.y + t.dy * k };
    return {
      d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${t.x} ${t.y}`,
      mid: { x: (s.x + 3 * c1.x + 3 * c2.x + t.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + t.y) / 8 },
    };
  };

  // --- obsah karet ---
  const fmtIface = (label: string, ip: string, mask: string, suffix = ''): ReactNode => {
    if (!(ip ?? '').trim() && !(mask ?? '').trim()) return <span className="block text-ink-4">{label} —</span>;
    const i = analyzeInterface(ip ?? '', mask ?? '', p.cidr);
    const text = i.valid ? `${i.ipStr}${p.cidr ? '/' + i.prefix : ''}` : (ip ?? '').trim() || '—';
    return <span className="block"><span className="text-ink-4">{label}</span> {text}{suffix}</span>;
  };
  const c = p.cfg;
  const summary = (id: NodeId): ReactNode => {
    if (id === 'isp') return <span className="block"><span className="text-ink-4">GW</span> {p.isp.gwIp}</span>;
    if (id === 'r1' || id === 'r2') {
      return <>{fmtIface('WAN', c[`${id}-wan-ip`], c[`${id}-wan-mask`])}{fmtIface('LAN', c[`${id}-lan-ip`], c[`${id}-lan-mask`])}</>;
    }
    const d = deviceOf(id);
    if (d && isL2(d)) {
      const n = links.filter((l) => l.from === id).length;
      return <><span className="block text-ink-4">{d.kind === 'ap' ? 'Wi-Fi · bez IP' : 'Vrstva 2 · bez IP'}</span><span className="block"><span className="text-ink-4">PORTY</span> {n} připojeno</span></>;
    }
    if (!d || d.kind === 'pc') return fmtIface('IP', c[`${id}-ip`], c[`${id}-mask`]);
    const pub = (c[`${id}-pub`] ?? '').trim();
    return <>{fmtIface('IP', c[`${id}-ip`], c[`${id}-mask`], `:${KIND_INFO[d.kind].port}`)}<span className="block"><span className="text-ink-4">PUB</span> {pub ? `:${pub}` : '—'}</span></>;
  };
  const nodesWithErrors = new Set<NodeId>([...p.errorFields].map(nodeOfField));

  const def = (id: NodeId): Def => {
    switch (id) {
      case 'isp': return { name: 'Internet / ISP', sub: 'Poskytovatel připojení', art: <CloudArt />, tint: 'bg-sky-50 dark:bg-sky-950/50', idleIcon: 'globe', idleClass: 'bg-sky-800 text-sky-100' };
      case 'r1': return { name: 'Router 1 (Hraniční)', sub: 'Hlavní směrovač do internetu', art: <RouterArt tone="blue" />, tint: 'bg-blue-50 dark:bg-blue-950/50', idleIcon: 'minus', idleClass: 'bg-blue-800 text-blue-100' };
      case 'r2': return { name: 'Router 2 (Vnitřní)', sub: 'Podřízený směrovač (LAN 2)', art: <RouterArt tone="indigo" />, tint: 'bg-indigo-50 dark:bg-indigo-950/50', idleIcon: 'minus', idleClass: 'bg-indigo-800 text-indigo-100' };
      case 'pc': return { name: 'Klientské PC', sub: 'Koncová stanice (zdroj Ping)', art: <PcArt />, tint: 'bg-surface-3', idleIcon: 'minus', idleClass: 'bg-slate-700 text-slate-100' };
    }
    const d = deviceOf(id)!;
    if (d.kind === 'camera') return { name: d.name, sub: `Kamera · ${KIND_INFO.camera.service} ${KIND_INFO.camera.port}`, art: <CameraArt />, tint: 'bg-violet-50 dark:bg-violet-950/50', idleIcon: 'minus', idleClass: 'bg-violet-800 text-violet-100' };
    if (d.kind === 'webserver') return { name: d.name, sub: `Web server · ${KIND_INFO.webserver.service} ${KIND_INFO.webserver.port}`, art: <ServerArt />, tint: 'bg-violet-50 dark:bg-violet-950/50', idleIcon: 'minus', idleClass: 'bg-violet-800 text-violet-100' };
    if (d.kind === 'switch') return { name: d.name, sub: 'Switch (vrstva 2)', art: <SwitchArt />, tint: 'bg-teal-50 dark:bg-teal-950/50', idleIcon: 'minus', idleClass: 'bg-teal-800 text-teal-100' };
    if (d.kind === 'ap') return { name: d.name, sub: 'Wi-Fi přístupový bod', art: <ApArt />, tint: 'bg-cyan-50 dark:bg-cyan-950/50', idleIcon: 'minus', idleClass: 'bg-cyan-800 text-cyan-100' };
    return { name: d.name, sub: 'Koncová stanice', art: <PcArt />, tint: 'bg-surface-3', idleIcon: 'minus', idleClass: 'bg-slate-700 text-slate-100' };
  };

  const packetPos = p.packet && E[p.packet.node] ? { left: px(E[p.packet.node].x + CARD_W / 2), top: px(E[p.packet.node].y) } : null;
  const linkPaths = links.filter((l) => E[l.from] && E[l.to]).map((l) => ({ l, ...anchors(l.from, l.to) }));

  const panelFor = (id: NodeId) => (
    <SetupPanel
      node={id}
      device={deviceOf(id)}
      devices={p.devices}
      uplinks={p.uplinks}
      cfg={p.cfg}
      onField={p.onField}
      errorFields={p.errorFields}
      isp={p.isp}
      cidr={p.cidr}
      showCalc={p.showCalc}
      rules={p.rules}
      onAddRule={p.onAddRule}
      onRemoveRule={p.onRemoveRule}
      onClose={p.onCloseNode}
      onAutoFill={p.onAutoFill}
      onRemoveDevice={p.onRemoveDevice}
      onRename={p.onRename}
      onUplink={p.onUplink}
      onTestPing={p.onTestPing}
      onTestInbound={p.onTestInbound}
    />
  );

  const zbtn = 'w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-line-strong text-ink-2 hover:bg-surface-3 hover:text-ink active:scale-95 transition shadow-sm';

  return (
    <div className="relative">
      {/* ovládání zoomu */}
      <div className="absolute right-2 top-2 z-40 flex items-center gap-1.5" data-nopan>
        <button className={zbtn} onClick={() => zoomTo(zoom / 1.2, outerW / 2)} title="Oddálit (Ctrl + kolečko)" aria-label="Oddálit"><Minus className="w-4 h-4" /></button>
        <button className={`${zbtn} w-auto px-2 text-xs font-bold font-mono`} onClick={() => { setPan(0); setZoom(1); }} title="Původní velikost">{Math.round(zoom * 100)} %</button>
        <button className={zbtn} onClick={() => zoomTo(zoom * 1.2, outerW / 2)} title="Přiblížit (Ctrl + kolečko)" aria-label="Přiblížit"><Plus className="w-4 h-4" /></button>
        <button className={zbtn} onClick={fit} title="Přizpůsobit celé schéma oknu" aria-label="Přizpůsobit"><Maximize className="w-4 h-4" /></button>
      </div>

      <div
        ref={canvasRef}
        data-canvas
        className="relative overflow-hidden rounded-xl border border-line/80 bg-surface-2/70"
        style={{ height: canvasH * zoom, touchAction: 'pan-y', cursor: zoom > 1 ? 'grab' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          id="netroute-world"
          data-w={logicalW}
          data-h={canvasH}
          className="absolute left-0 top-0 bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] [background-size:1.4rem_1.4rem] bg-surface-2/70"
          style={{ width: logicalW, height: canvasH, transformOrigin: '0 0', transform: `translateX(${pan}px) scale(${zoom})` }}
        >
          {/* kabely */}
          <svg className="absolute inset-0 pointer-events-none" width={logicalW} height={canvasH} aria-hidden="true">
            {linkPaths.map(({ l, d }) => (
              <path key={l.id} id={l.id} d={d} fill="none" strokeLinecap={l.wifi ? 'butt' : 'round'}
                style={{
                  strokeWidth: l.wifi ? '0.3rem' : '0.45rem',
                  strokeDasharray: l.wifi ? '0.6rem 0.5rem' : undefined,
                  stroke: p.linkStatus[l.id] === 'ok' ? '#10b981' : 'var(--cable-idle)',
                  transition: 'stroke .3s',
                }} />
            ))}
            {/* zarovnávací vodítka */}
            {guides.v.map((g) => <line key={`v${g}`} x1={px(g)} x2={px(g)} y1={0} y2={canvasH} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 5" opacity=".8" />)}
            {guides.h.map((g) => <line key={`h${g}`} y1={px(g)} y2={px(g)} x1={0} x2={logicalW} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 5" opacity=".8" />)}
          </svg>
          {linkPaths.map(({ l, mid }) => (
            <span key={l.id} className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[5] rounded-full bg-surface/90 border border-line px-2 py-0.5 text-xs font-mono font-bold text-ink-3 tracking-tight"
              style={{ left: mid.x, top: mid.y }}>
              {l.label}
            </span>
          ))}

          {/* zařízení */}
          {nodeIds.map((id) => {
            const e = E[id];
            const open = p.openNode === id;
            return (
              <div key={id} data-node-root={id} className="absolute" style={{ left: `${e.x}rem`, top: `${e.y}rem`, width: `${CARD_W}rem`, zIndex: open ? 30 : 10 }}>
                <DeviceCard
                  nodeId={id}
                  {...def(id)}
                  summary={summary(id)}
                  status={p.nodeStatus[id] ?? 'idle'}
                  hasError={nodesWithErrors.has(id)}
                  open={open}
                  x={e.x}
                  y={e.y}
                  rootPx={root * zoom}
                  onMove={(x, y) => {
                    if (pinching.current) return;
                    const s = applySnap(id, clamp(x, 0, maxX), Math.max(0, y));
                    p.layout.setPos(id, clamp(s.x, 0, maxX), Math.max(0, s.y));
                  }}
                  onToggle={() => p.onToggleNode(id)}
                  onDragEnd={endDrag}
                />
                {open && !sheet && panelLayout && (
                  <div
                    ref={panelRef}
                    className={`absolute -z-10 ${panelLayout.mode === 'right' ? 'top-0 animate-panel-right' : panelLayout.mode === 'left' ? 'top-0 animate-panel-left' : 'animate-sheet'}`}
                    style={panelLayout.mode === 'right' ? { left: 'calc(100% + 1rem)', width: panelLayout.widthPx }
                      : panelLayout.mode === 'left' ? { right: 'calc(100% + 1rem)', width: panelLayout.widthPx }
                      : { top: `${CARD_H + 0.75}rem`, left: panelLayout.leftPx, width: panelLayout.widthPx }}
                  >
                    {panelFor(id)}
                  </div>
                )}
                {/* spodní panel: mimo plátno (portál), aby ho nezmenšil zoom ani ho neořízl overflow */}
                {open && sheet && createPortal(
                  <div data-node-root={id} className="fixed inset-x-2 bottom-2 mx-auto max-w-[36rem] z-50 max-h-[78vh] overflow-y-auto rounded-2xl animate-sheet shadow-2xl">
                    {panelFor(id)}
                  </div>,
                  document.body,
                )}
              </div>
            );
          })}

          {/* paket */}
          {p.packet && packetPos && (
            <div
              onClick={p.onDismissPacket}
              title="Kliknutím skryjete stavovou bublinu"
              className="absolute z-40 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-[left,top] ease-in-out"
              style={{ left: packetPos.left, top: packetPos.top, transitionDuration: `${p.packetMs}ms` }}
            >
              <div className={`px-3 py-1.5 rounded-full text-white text-sm font-bold shadow-lg flex items-center gap-1.5 border-2 border-white whitespace-nowrap
                ${p.packet.kind === 'ok' ? 'bg-emerald-600' : p.packet.kind === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
                <Mail className="w-4 h-4" />
                <span>{p.packet.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
