import { Mail } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useElementWidth, useMeasuredHeight } from '../hooks';
import type { Config, Device, FieldId, IspConfig, LinkId, NodeId, RouterId, Rules } from '../lib/model';
import { FIXED_NODES, KIND_INFO, linkOf, nodeOfField } from '../lib/model';
import { analyzeInterface } from '../lib/net';
import { CameraArt, CloudArt, PcArt, RouterArt, ServerArt } from './Art';
import DeviceCard, { CARD_H, CARD_W, type Status } from './DeviceCard';
import SetupPanel, { panelWidthRem } from './SetupPanel';

export interface Pos { x: number; y: number }
export interface PacketState { node: NodeId; kind: 'run' | 'ok' | 'error'; label: string }

export interface LayoutApi {
  pos: Record<NodeId, Pos>;
  setPos: (id: NodeId, x: number, y: number) => void;
  reset: () => void;
}

interface Props {
  devices: Device[];
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
  onDismissPacket: () => void;
  rootPx: number;
  onAutoFill: (id: NodeId) => void;
  onAddRule: (router: RouterId) => void;
  onRemoveRule: (router: RouterId, id: string) => void;
  onRemoveDevice: (id: NodeId) => void;
  onRename: (id: NodeId, name: string) => void;
  onTestPing: (id: NodeId) => void;
  onTestInbound: (id: NodeId) => void;
  layout: LayoutApi;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

interface Def { name: string; sub: string; art: ReactNode; tint: string; idleIcon: 'globe' | 'minus'; idleClass: string }

export default function Topology(p: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = useElementWidth(canvasRef);
  const [panelRef, panelH] = useMeasuredHeight();
  const root = p.rootPx;
  const widthRem = canvasW / root;
  const maxX = Math.max(0, widthRem - CARD_W);

  const nodeIds: NodeId[] = [...FIXED_NODES, ...p.devices.map((d) => d.id)];
  const deviceOf = (id: NodeId) => p.devices.find((d) => d.id === id);
  const links: { id: LinkId; from: NodeId; to: NodeId; label: string }[] = [
    { id: 'link-r1-isp', from: 'isp', to: 'r1', label: 'WAN' },
    { id: 'link-r2-r1', from: 'r1', to: 'r2', label: 'ETH' },
    { id: linkOf('pc'), from: 'r2', to: 'pc', label: 'LAN' },
    ...p.devices.map((d) => ({ id: linkOf(d.id), from: 'r2', to: d.id, label: 'LAN' })),
  ];

  const eff = (id: NodeId): Pos => {
    const q = p.layout.pos[id] ?? { x: 0, y: 0 };
    return { x: clamp(q.x, 0, maxX), y: Math.max(0, q.y) };
  };
  const E = Object.fromEntries(nodeIds.map((id) => [id, eff(id)])) as Record<NodeId, Pos>;
  const px = (rem: number) => rem * root;

  // --- umístění a rozměr rozbaleného nastavení ---
  // vedle karty (vpravo / vlevo), pokud je místo; jinak pod kartou; na úzkém plátně jako spodní panel
  type PanelLayout = { mode: 'right' | 'left' | 'below'; widthPx: number; leftPx?: number };
  let panelLayout: PanelLayout | null = null;
  let sheet = false;
  if (p.openNode && E[p.openNode]) {
    const e = E[p.openNode];
    const desired = px(panelWidthRem(p.openNode, !!deviceOf(p.openNode)));
    const availRight = canvasW - px(e.x + CARD_W + 1) - px(0.5);
    const availLeft = px(e.x - 1) - px(0.5);
    if (availRight >= desired) panelLayout = { mode: 'right', widthPx: desired };
    else if (availLeft >= desired) panelLayout = { mode: 'left', widthPx: desired };
    else if (canvasW >= px(20)) {
      const w = Math.min(desired, canvasW - px(1));
      const leftAbs = clamp(px(e.x), px(0.5), canvasW - w - px(0.5));
      panelLayout = { mode: 'below', widthPx: w, leftPx: leftAbs - px(e.x) };
    } else sheet = true;
  }

  // --- výška plátna ---
  const nodesBottom = Math.max(...nodeIds.map((id) => px(E[id].y + CARD_H))) + px(3);
  const panelTop = p.openNode && E[p.openNode] ? px(E[p.openNode].y) + (panelLayout?.mode === 'below' ? px(CARD_H + 0.75) : 0) : 0;
  const panelBottom = p.openNode && E[p.openNode] && !sheet ? panelTop + panelH + px(3) : 0;
  const canvasH = Math.max(nodesBottom, panelBottom);

  // --- kabely ---
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
    return { name: d.name, sub: 'Koncová stanice', art: <PcArt />, tint: 'bg-surface-3', idleIcon: 'minus', idleClass: 'bg-slate-700 text-slate-100' };
  };

  const packetPos = p.packet && E[p.packet.node] ? { left: px(E[p.packet.node].x + CARD_W / 2), top: px(E[p.packet.node].y) } : null;
  const linkPaths = links.filter((l) => E[l.from] && E[l.to]).map((l) => ({ l, ...anchors(l.from, l.to) }));

  return (
    <div
      ref={canvasRef}
      data-canvas
      className="relative overflow-hidden rounded-xl border border-line/80 bg-surface-2/70 bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] [background-size:1.4rem_1.4rem]"
      style={{ height: canvasH }}
    >
      {/* kabely */}
      <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH} aria-hidden="true">
        {linkPaths.map(({ l, d }) => (
          <path key={l.id} id={l.id} d={d} fill="none" strokeLinecap="round"
            style={{ strokeWidth: '0.45rem', stroke: p.linkStatus[l.id] === 'ok' ? '#10b981' : 'var(--cable-idle)', transition: 'stroke .3s' }} />
        ))}
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
              rootPx={root}
              onMove={(x, y) => p.layout.setPos(id, clamp(x, 0, maxX), Math.max(0, y))}
              onToggle={() => p.onToggleNode(id)}
            />
            {open && (
              <div
                ref={sheet ? undefined : panelRef}
                className={sheet
                  ? 'fixed inset-x-2 bottom-2 mx-auto max-w-[36rem] z-50 max-h-[78vh] overflow-y-auto rounded-2xl animate-sheet'
                  : `absolute -z-10 ${panelLayout!.mode === 'right' ? 'top-0 animate-panel-right' : panelLayout!.mode === 'left' ? 'top-0 animate-panel-left' : 'animate-sheet'}`}
                style={sheet ? undefined
                  : panelLayout!.mode === 'right' ? { left: 'calc(100% + 1rem)', width: panelLayout!.widthPx }
                  : panelLayout!.mode === 'left' ? { right: 'calc(100% + 1rem)', width: panelLayout!.widthPx }
                  : { top: `${CARD_H + 0.75}rem`, left: panelLayout!.leftPx, width: panelLayout!.widthPx }}
              >
                <SetupPanel
                  node={id}
                  device={deviceOf(id)}
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
                  onTestPing={p.onTestPing}
                  onTestInbound={p.onTestInbound}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* paket */}
      {p.packet && packetPos && !sheet && (
        <div
          onClick={p.onDismissPacket}
          title="Kliknutím skryjete stavovou bublinu"
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-[left,top] duration-700 ease-in-out"
          style={{ left: packetPos.left, top: packetPos.top }}
        >
          <div className={`px-3 py-1.5 rounded-full text-white text-sm font-bold shadow-lg flex items-center gap-1.5 border-2 border-white whitespace-nowrap
            ${p.packet.kind === 'ok' ? 'bg-emerald-600' : p.packet.kind === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
            <Mail className="w-4 h-4" />
            <span>{p.packet.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
