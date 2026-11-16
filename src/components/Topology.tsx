import { Mail } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useElementWidth, useMeasuredHeight } from '../hooks';
import type { Config, FieldId, IspConfig, LinkId, NodeId } from '../lib/model';
import { NODE_ORDER, nodeOfField } from '../lib/model';
import { analyzeInterface } from '../lib/net';
import { CloudArt, PcArt, RouterArt } from './Art';
import DeviceCard, { CARD_H, CARD_W, type Status } from './DeviceCard';
import SetupPanel, { PANEL_WIDTH_REM } from './SetupPanel';

export interface Pos { x: number; y: number }
export interface PacketState { node: NodeId; kind: 'run' | 'ok' | 'error'; label: string }

export interface LayoutApi {
  pos: Record<NodeId, Pos>;
  setPos: (id: NodeId, x: number, y: number) => void;
  reset: () => void;
}

interface Props {
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
  onAutoFillPc: () => void;
  layout: LayoutApi;
}

const LINKS: { id: LinkId; from: NodeId; to: NodeId; label: string }[] = [
  { id: 'link-r1-isp', from: 'isp', to: 'r1', label: 'WAN' },
  { id: 'link-r2-r1', from: 'r1', to: 'r2', label: 'ETH' },
  { id: 'link-pc-r2', from: 'r2', to: 'pc', label: 'LAN' },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export default function Topology(p: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = useElementWidth(canvasRef);
  const [panelRef, panelH] = useMeasuredHeight();
  const root = p.rootPx;
  const widthRem = canvasW / root;
  const maxX = Math.max(0, widthRem - CARD_W);

  const eff = (id: NodeId): Pos => ({ x: clamp(p.layout.pos[id].x, 0, maxX), y: Math.max(0, p.layout.pos[id].y) });
  const E = Object.fromEntries(NODE_ORDER.map((id) => [id, eff(id)])) as Record<NodeId, Pos>;
  const px = (rem: number) => rem * root;

  // --- umístění a rozměr rozbaleného nastavení ---
  let panelLayout: { side: 'right' | 'left'; widthPx: number } | null = null;
  let sheet = false;
  if (p.openNode) {
    const e = E[p.openNode];
    const desired = px(PANEL_WIDTH_REM[p.openNode]);
    const availRight = canvasW - px(e.x + CARD_W + 1) - px(0.5);
    const availLeft = px(e.x - 1) - px(0.5);
    const side = availRight >= desired || availRight >= availLeft ? 'right' : 'left';
    const best = side === 'right' ? availRight : availLeft;
    if (best < px(18)) sheet = true;
    else panelLayout = { side, widthPx: Math.min(desired, best) };
  }

  // --- výška plátna ---
  const nodesBottom = Math.max(...NODE_ORDER.map((id) => px(E[id].y + CARD_H))) + px(3);
  const panelBottom = p.openNode && !sheet ? px(E[p.openNode].y) + panelH + px(3) : 0;
  const canvasH = Math.max(nodesBottom, panelBottom);

  // --- kabely ---
  const anchors = (a: NodeId, b: NodeId) => {
    const A = { l: px(E[a].x), t: px(E[a].y), w: px(CARD_W), h: px(CARD_H) };
    const B = { l: px(E[b].x), t: px(E[b].y), w: px(CARD_W), h: px(CARD_H) };
    const gap = px(0.2);
    let s: { x: number; y: number; dx: number; dy: number };
    let t: { x: number; y: number; dx: number; dy: number };
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
  const fmtIface = (label: string, ip: string, mask: string): ReactNode => {
    if (!ip.trim() && !mask.trim()) return <span className="block text-slate-400">{label} —</span>;
    const i = analyzeInterface(ip, mask, p.cidr);
    const text = i.valid ? `${i.ipStr}${p.cidr ? '/' + i.prefix : ''}` : ip.trim() || '—';
    return <span className="block"><span className="text-slate-400">{label}</span> {text}</span>;
  };
  const c = p.cfg;
  const summaries: Record<NodeId, ReactNode> = {
    isp: <span className="block"><span className="text-slate-400">GW</span> {p.isp.gwIp}</span>,
    r1: <>{fmtIface('WAN', c['r1-wan-ip'], c['r1-wan-mask'])}{fmtIface('LAN', c['r1-lan-ip'], c['r1-lan-mask'])}</>,
    r2: <>{fmtIface('WAN', c['r2-wan-ip'], c['r2-wan-mask'])}{fmtIface('LAN', c['r2-lan-ip'], c['r2-lan-mask'])}</>,
    pc: fmtIface('IP', c['pc-ip'], c['pc-mask']),
  };
  const nodesWithErrors = new Set<NodeId>([...p.errorFields].map(nodeOfField));

  const defs: Record<NodeId, { name: string; sub: string; art: ReactNode; tint: string; idleIcon: 'globe' | 'minus'; idleClass: string }> = {
    isp: { name: 'Internet / ISP', sub: 'Poskytovatel připojení', art: <CloudArt />, tint: 'bg-sky-50', idleIcon: 'globe', idleClass: 'bg-sky-800 text-sky-100' },
    r1: { name: 'Router 1 (Hraniční)', sub: 'Hlavní směrovač do internetu', art: <RouterArt tone="blue" />, tint: 'bg-blue-50', idleIcon: 'minus', idleClass: 'bg-blue-800 text-blue-100' },
    r2: { name: 'Router 2 (Vnitřní)', sub: 'Podřízený směrovač (LAN 2)', art: <RouterArt tone="indigo" />, tint: 'bg-indigo-50', idleIcon: 'minus', idleClass: 'bg-indigo-800 text-indigo-100' },
    pc: { name: 'Klientské PC', sub: 'Koncová stanice (zdroj Ping)', art: <PcArt />, tint: 'bg-slate-100', idleIcon: 'minus', idleClass: 'bg-slate-700 text-slate-100' },
  };

  const packetPos = p.packet ? { left: px(E[p.packet.node].x + CARD_W / 2), top: px(E[p.packet.node].y) } : null;

  return (
    <div
      ref={canvasRef}
      data-canvas
      className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70 bg-[radial-gradient(circle,#cbd5e1_1px,transparent_1px)] [background-size:1.4rem_1.4rem]"
      style={{ height: canvasH }}
    >
      {/* kabely */}
      <svg className="absolute inset-0 pointer-events-none" width={canvasW} height={canvasH} aria-hidden="true">
        {LINKS.map((l) => (
          <path key={l.id} id={l.id} d={anchors(l.from, l.to).d} fill="none" strokeLinecap="round"
            style={{ strokeWidth: '0.45rem', stroke: p.linkStatus[l.id] === 'ok' ? '#10b981' : '#cbd5e1', transition: 'stroke .3s' }} />
        ))}
      </svg>
      {LINKS.map((l) => {
        const m = anchors(l.from, l.to).mid;
        return (
          <span key={l.id} className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[5] rounded-full bg-white/90 border border-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-slate-500 tracking-tight"
            style={{ left: m.x, top: m.y }}>
            {l.label}
          </span>
        );
      })}

      {/* zařízení */}
      {NODE_ORDER.map((id) => {
        const e = E[id];
        const open = p.openNode === id;
        return (
          <div key={id} data-node-root={id} className="absolute" style={{ left: `${e.x}rem`, top: `${e.y}rem`, width: `${CARD_W}rem`, zIndex: open ? 30 : 10 }}>
            <DeviceCard
              nodeId={id}
              {...defs[id]}
              summary={summaries[id]}
              status={p.nodeStatus[id]}
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
                  ? 'fixed inset-x-2 bottom-2 z-50 max-h-[78vh] overflow-y-auto rounded-2xl animate-sheet'
                  : `absolute top-0 -z-10 ${panelLayout!.side === 'right' ? 'animate-panel-right' : 'animate-panel-left'}`}
                style={sheet ? undefined : panelLayout!.side === 'right'
                  ? { left: `calc(100% + ${1}rem)`, width: panelLayout!.widthPx }
                  : { right: `calc(100% + ${1}rem)`, width: panelLayout!.widthPx }}
              >
                <SetupPanel
                  node={id}
                  cfg={p.cfg}
                  onField={p.onField}
                  errorFields={p.errorFields}
                  isp={p.isp}
                  cidr={p.cidr}
                  showCalc={p.showCalc}
                  onClose={p.onCloseNode}
                  onAutoFillPc={p.onAutoFillPc}
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
