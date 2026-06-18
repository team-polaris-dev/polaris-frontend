import { useEffect, useMemo, useRef, useReducer } from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink as d3ForceLink,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force'
import type { GNode, GEdge } from './NetworkGraph'

/* ── 상수 ── */
const REL_COLOR: Record<string, string> = {
  IS_SUBSIDIARY_OF: '#7ab0ff',
  EXECUTIVE_OF: '#f0a8d0',
  IS_MAJOR_SHAREHOLDER_OF: '#6ee7b7',
  SUPPLIES_TO: '#7dd3fc',
  ACQUIRES: '#f0a8d0',
  INVESTS: '#6ee7b7',
  INVESTS_IN: '#6ee7b7',
}
const REL_LABEL: Record<string, string> = {
  IS_SUBSIDIARY_OF: '자회사',
  EXECUTIVE_OF: '임원',
  IS_MAJOR_SHAREHOLDER_OF: '대주주',
  SUPPLIES_TO: '공급',
  ACQUIRES: '인수',
  INVESTS: '투자',
  INVESTS_IN: '투자',
}
const relColor = (t: string) => REL_COLOR[t] || '#9ec3ff'
const relLabel = (t: string) => REL_LABEL[t] || t

/* 라벨 충돌 해소 — 박스들을 수직으로 밀어 겹침을 푼다. 짧은 라벨이라
   몇 번의 패스로 수렴한다. (live 좌표라 매 렌더 호출되지만 개수가 적어 가볍다) */
interface LabelBox { key: string; x: number; y: number; w: number; h: number; color: string; text: string }
function resolveCollisions(boxes: LabelBox[]) {
  for (let pass = 0; pass < 16; pass++) {
    let moved = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x)
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y)
        if (ox > 0 && oy > 0) {
          const push = oy / 2 + 0.5
          if (a.y <= b.y) { a.y -= push; b.y += push }
          else            { a.y += push; b.y -= push }
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return boxes
}

/* 긴 이름을 최대 2줄로 줄바꿈한다. 공백이 있으면 가운데 근처에서,
   없으면(한글 기업명 등) 글자 수로 강제 줄바꿈. 그래도 길면 …로 자른다. */
function wrapLabel(s: string, perLine: number): string[] {
  if (s.length <= perLine) return [s]
  const spaceIdxs: number[] = []
  for (let i = 0; i < s.length; i++) if (s[i] === ' ') spaceIdxs.push(i)
  const mid = Math.floor(s.length / 2)
  let cut = -1
  if (spaceIdxs.length) {
    cut = spaceIdxs[0]
    for (const idx of spaceIdxs) if (Math.abs(idx - mid) < Math.abs(cut - mid)) cut = idx
  }
  let l1: string, l2: string
  if (cut >= 0) { l1 = s.slice(0, cut); l2 = s.slice(cut + 1) }
  else          { l1 = s.slice(0, perLine); l2 = s.slice(perLine) }
  if (l2.length > perLine) l2 = l2.slice(0, perLine - 1) + '…'
  return [l1, l2]
}

const rnd = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

const NODE_COLORS = [
  '#ffffff',
  '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171',
  '#38bdf8', '#4ade80', '#e879f9', '#fb923c', '#2dd4bf',
  '#f472b6', '#818cf8', '#a3e635', '#facc15',
]

const VW = 440
const VH = 320

/* ── 타입 ── */
interface D3Node extends SimulationNodeDatum {
  id: string
  label: string
  color: string
  r: number
  isHub: boolean
  spike: boolean
  delay: number
}
interface D3Link extends SimulationLinkDatum<D3Node> {
  key: string
  type: string
  color: string
  srcLabel: string
  tgtLabel: string
  rcept_no: string
}

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  panelMode?: boolean
}

/* ── 컴포넌트 ── */
export default function Constellation({ nodes, edges, panelMode = false }: Props) {
  /* refs */
  const svgRef    = useRef<SVGSVGElement>(null)
  const simRef    = useRef<ReturnType<typeof forceSimulation<D3Node>> | null>(null)
  const dragNode  = useRef<D3Node | null>(null)
  const rafRef    = useRef<number | null>(null)
  /* d3 tick / 드래그가 위치를 바꾸면 이 함수로 리렌더를 한 번 예약한다.
     노드와 엣지를 같은 렌더 패스에서 같은 좌표로 그려 절대 떨어지지 않게 함. */
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const scheduleRender = () => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      bump()
    })
  }


  /* ── 데이터 준비 ── */
  const { d3Nodes, d3Links, nodeById, linkSrcTgt, total, legendTypes, vw, vh } = useMemo(() => {
    const degree = new Map<string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1)
      degree.set(e.target, (degree.get(e.target) || 0) + 1)
    }
    const sorted = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    const keptIds = new Set(sorted.map(n => n.id))

    const degs = sorted.map(n => degree.get(n.id) || 0)
    const dMax = Math.max(1, ...degs)
    const dMin = Math.min(...degs)
    const sizeOf = (d: number) => 5.5 + ((d - dMin) / Math.max(1, dMax - dMin)) * 6

    const spread = Math.min(2.0, Math.max(1, Math.sqrt(Math.max(0, sorted.length - 1) / 8)))
    const vw = VW * spread
    const vh = VH * spread
    const cx = vw / 2, cy = vh / 2
    const rx = 160 * spread, ry = 110 * spread

    /* 초기 위치 시드 — 시뮬레이션 시작 시 자연스럽게 */
    const hub = sorted[0]
    const spokes = sorted.slice(1)

    const d3Nodes: D3Node[] = []
    if (hub) {
      d3Nodes.push({
        id: hub.id, label: hub.label || hub.id,
        color: NODE_COLORS[0], r: sizeOf(degree.get(hub.id) || 0) + 2.5,
        isHub: true, spike: true, delay: 0,
        x: cx, y: cy,
      })
    }
    spokes.forEach((n, i) => {
      const base  = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(spokes.length, 1)
      const theta = base + (rnd(i * 2 + 1) - 0.5) * 0.4
      const sx = 0.8 + rnd(i * 3 + 7) * 0.35
      const sy = 0.8 + rnd(i * 5 + 13) * 0.35
      const r   = sizeOf(degree.get(n.id) || 0)
      d3Nodes.push({
        id: n.id, label: n.label || n.id,
        color: NODE_COLORS[(i % (NODE_COLORS.length - 1)) + 1],
        r, isHub: false, spike: r >= 5.5, delay: 0.25 + i * 0.34,
        x: cx + rx * sx * Math.cos(theta),
        y: cy + ry * sy * Math.sin(theta),
      })
    })

    const nodeById = new Map(d3Nodes.map(n => [n.id, n]))
    const d3Links: D3Link[] = []
    edges.forEach((e, i) => {
      if (!keptIds.has(e.source) || !keptIds.has(e.target)) return
      const a = nodeById.get(e.source)
      const b = nodeById.get(e.target)
      if (!a || !b) return
      d3Links.push({
        source: e.source, target: e.target,
        key: `${e.source}|${e.target}|${e.type}|${i}`,
        type: e.type, color: relColor(e.type),
        srcLabel: a.label, tgtLabel: b.label,
        rcept_no: e.rcept_no || '',
      })
    })

    const legendTypes = [...new Set(
      edges.filter(e => keptIds.has(e.source) && keptIds.has(e.target)).map(e => e.type).filter(Boolean)
    )]

    /* 드래그 핸들러/tick 에서 공유할 조회 맵 (string ID 보존) */
    const linkSrcTgt = new Map(
      d3Links.map(l => [l.key, [l.source as string, l.target as string] as const])
    )

    return { d3Nodes, d3Links, nodeById, linkSrcTgt, total: nodes.length, legendTypes, vw, vh }
  }, [nodes, edges])

  /* ── d3 시뮬레이션 ──
     tick 마다 d3 가 노드 좌표를 갱신 → scheduleRender 로 React 리렌더 예약.
     실제 그리기는 JSX 에서 node.x/node.y 를 읽어 노드·엣지를 함께 그린다. */
  useEffect(() => {
    if (!d3Nodes.length) return

    const sim = forceSimulation<D3Node>(d3Nodes)
      .force('charge', forceManyBody<D3Node>().strength(-180).distanceMax(260))
      .force('link',   d3ForceLink<D3Node, D3Link>(d3Links)
        .id(d => d.id).distance(120).strength(0.5))
      .force('center', forceCenter<D3Node>(vw / 2, vh / 2).strength(0.05))
      .force('collide', forceCollide<D3Node>().radius(d => d.r * 7).strength(0.85).iterations(2))
      .alphaDecay(0.012)
      .velocityDecay(0.55)
      .on('tick', scheduleRender)

    simRef.current = sim
    return () => {
      sim.stop()
      simRef.current = null
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d3Nodes, d3Links, vw, vh])

  /* ── SVG 좌표 변환 ── */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  /* ── 드래그 ── */
  const startDrag = (_clientX: number, _clientY: number, node: D3Node) => {
    dragNode.current = node
    node.fx = node.x ?? 0
    node.fy = node.y ?? 0
    // 시뮬레이션을 따뜻하게 유지 → 잡은 별을 따라 이웃 별·선이 유동적으로 흐름
    simRef.current?.alphaTarget(0.3).restart()
  }
  const onMove = (clientX: number, clientY: number) => {
    const node = dragNode.current
    if (!node) return
    const { x, y } = toSvg(clientX, clientY)
    // fx/fy 만 갱신 → 다음 tick 에서 노드·엣지가 한 번에 같은 좌표로 그려짐
    node.fx = x; node.fy = y
    node.x = x; node.y = y
    scheduleRender()
  }
  const endDrag = () => {
    if (dragNode.current) {
      dragNode.current.fx = null
      dragNode.current.fy = null
    }
    dragNode.current = null
    simRef.current?.alphaTarget(0)
  }

  if (!d3Nodes.length) return null

  // 2줄 줄바꿈 기준 — 한 줄당 글자 수 (총 최대 2줄)
  const labelLen = panelMode ? 12 : 9

  /* ── 같은 노드 쌍의 여러 관계를 하나로 묶기 ──
     선은 한 번만 그리고, 라벨은 "대주주 · 투자"처럼 합쳐 표시한다. */
  const linkPairs = useMemo(() => {
    const m = new Map<string, { ids: readonly [string, string]; types: string[] }>()
    for (const lk of d3Links) {
      const ids = linkSrcTgt.get(lk.key)
      if (!ids) continue
      const pk = ids[0] < ids[1] ? `${ids[0]}|${ids[1]}` : `${ids[1]}|${ids[0]}`
      const entry = m.get(pk)
      if (entry) { if (!entry.types.includes(lk.type)) entry.types.push(lk.type) }
      else       { m.set(pk, { ids, types: [lk.type] }) }
    }
    return Array.from(m.entries()).map(([key, v]) => ({ key, ...v }))
  }, [d3Links, linkSrcTgt])

  /* ── 선택된 엣지 메타 (클릭 시 하단 표시용) ── */

  return (
    <div className={panelMode ? 'flex h-full flex-col overflow-hidden' : 'relative w-full'}>
      <style>{`
        @keyframes cnsPop     { 0%{opacity:0;transform:scale(0)} 55%{opacity:1;transform:scale(1.5)} 100%{opacity:1;transform:scale(1)} }
        @keyframes cnsDraw    { from{stroke-dashoffset:var(--len)} to{stroke-dashoffset:0} }
        @keyframes cnsFade    { from{opacity:0} to{opacity:1} }
        @keyframes cnsTwinkle { 0%,100%{opacity:.95} 50%{opacity:.45} }
        @keyframes cnsSpark   { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.9;transform:scale(1.2)} }
        .cns-star   { transform-box:fill-box; transform-origin:center; animation:cnsPop .5s cubic-bezier(.2,.8,.3,1.4) both; }
        .cns-twinkle{ animation:cnsTwinkle var(--tw,3s) ease-in-out infinite; }
        .cns-glow   { animation:cnsFade .6s ease both; }
        .cns-line   { stroke-dasharray:var(--len); animation:cnsDraw .55s cubic-bezier(.4,0,.2,1) both; }
        .cns-label  { animation:cnsFade .5s ease both; }
        .cns-spike  { transform-box:fill-box; transform-origin:center; animation:cnsFade .6s ease both, cnsSpark var(--tw,4s) ease-in-out infinite; }
        @media (prefers-reduced-motion:reduce) {
          .cns-star,.cns-glow,.cns-label,.cns-spike { animation:none !important; }
          .cns-line { animation:none !important; stroke-dashoffset:0 !important; }
          .cns-twinkle { animation:none !important; }
        }
      `}</style>

      <span className={`pointer-events-none z-10 text-[10px] font-medium tracking-wider text-slate-400/80 ${panelMode ? 'shrink-0 px-3 pt-2' : 'absolute left-1 top-1'}`}>
        공급망 · {total}개
      </span>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${vh}`}
        className={panelMode ? 'min-h-0 w-full flex-1' : 'h-[280px] w-full'}
        style={{ userSelect: 'none', touchAction: 'none', cursor: dragNode.current ? 'grabbing' : 'default' }}
        onPointerMove={e => onMove(e.clientX, e.clientY)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <radialGradient id="cnsGlow">
            <stop offset="0%"   stopColor="white" stopOpacity={0.55} />
            <stop offset="100%" stopColor="white" stopOpacity={0}    />
          </radialGradient>
          <linearGradient id="spkH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="white" stopOpacity={0}   />
            <stop offset="50%"  stopColor="white" stopOpacity={0.85}/>
            <stop offset="100%" stopColor="white" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="spkV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity={0}   />
            <stop offset="50%"  stopColor="white" stopOpacity={0.85}/>
            <stop offset="100%" stopColor="white" stopOpacity={0}   />
          </linearGradient>
        </defs>

        {/* 관계선 — 노드 쌍마다 한 번만 그림 (중복 관계는 하나의 선으로) */}
        {linkPairs.map(p => {
          const s = nodeById.get(p.ids[0])
          const t = nodeById.get(p.ids[1])
          if (!s || !t || s.x == null || s.y == null || t.x == null || t.y == null) return null
          const color = relColor(p.types[0])
          return (
            <g key={p.key}>
              {/* 글로우 라인 */}
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={0.1} />
              {/* 메인 라인 */}
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={color} strokeWidth={0.7} strokeLinecap="round" opacity={0.75} />
            </g>
          )
        })}

        {/* 관계 라벨 — 노드 쌍당 하나로 합치고, 위치 계산 후 충돌 해소 */}
        {(() => {
          const fs = panelMode ? 11 : 9
          const charW = fs * 0.92
          // 충돌 박스 + 표시할 세그먼트(색·텍스트)를 함께 보관
          const items: (LabelBox & { segs: { text: string; color: string }[] })[] = []
          for (const p of linkPairs) {
            const s = nodeById.get(p.ids[0])
            const t = nodeById.get(p.ids[1])
            if (!s || !t || s.x == null || s.y == null || t.x == null || t.y == null) continue
            let f = 0.5
            if (s.isHub && !t.isHub) f = 0.68
            else if (t.isHub && !s.isHub) f = 0.32
            const segs = p.types.map(ty => ({ text: relLabel(ty), color: relColor(ty) }))
            const full = segs.map(sg => sg.text).join(' · ')
            items.push({
              key: p.key, color: relColor(p.types[0]), text: full,
              segs,
              x: s.x + (t.x - s.x) * f,
              y: s.y + (t.y - s.y) * f - 5,
              w: full.length * charW + 4,
              h: fs * 1.4,
            })
          }
          resolveCollisions(items)
          return items.map(b => (
            <text key={b.key} x={b.x} y={b.y} textAnchor="middle"
              className="pointer-events-none select-none"
              fontSize={fs} fontWeight={500} opacity={0.85}>
              {b.segs.map((sg, si) => (
                <tspan key={si}
                  fill={sg.color}
                  style={{ paintOrder: 'stroke', stroke: '#0b0820', strokeWidth: 3, strokeLinejoin: 'round' } as React.CSSProperties}>
                  {si > 0 ? ' · ' : ''}{sg.text}
                </tspan>
              ))}
            </text>
          ))
        })()}

        {/* 별 노드 — 드래그 가능, 좌표는 (0,0) 기준 → 그룹 transform으로 이동 */}
        {d3Nodes.map((node, i) => {
          const spk = node.isHub ? 22 : 14
          const tw  = `${2.6 + (i % 4) * 0.5}s`
          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
              style={{ cursor: 'grab' }}
              onPointerDown={e => {
                e.preventDefault()
                // svg 에 캡처 → 포인터가 패널 밖으로 나가도 onPointerMove 유지
                svgRef.current?.setPointerCapture(e.pointerId)
                startDrag(e.clientX, e.clientY, node)
              }}
            >
              <circle cx={0} cy={0} r={node.r * (node.isHub ? 5.5 : 3.8)}
                fill="url(#cnsGlow)" className="cns-glow"
                style={{ animationDelay: `${node.delay}s` }} />
              {node.spike && (
                <g className="cns-spike" style={{ animationDelay: `${node.delay}s`, ['--tw' as string]: tw }}>
                  <line x1={-spk} y1={0} x2={spk} y2={0}
                    stroke="url(#spkH)" strokeWidth={node.isHub ? 1.2 : 0.9} strokeLinecap="round" />
                  <line x1={0} y1={-spk} x2={0} y2={spk}
                    stroke="url(#spkV)" strokeWidth={node.isHub ? 1.2 : 0.9} strokeLinecap="round" />
                </g>
              )}
              <circle cx={0} cy={0} r={node.r}
                className="cns-star cns-twinkle fill-white"
                stroke={node.isHub ? 'none' : node.color}
                strokeWidth={1.4} strokeOpacity={0.9}
                style={{ animationDelay: `${node.delay}s`, ['--tw' as string]: tw }} />
              <text x={0} y={node.r + (panelMode ? 20 : 13)} textAnchor="middle"
                className="cns-label select-none"
                fontSize={panelMode ? 13 : 10}
                fontWeight={node.isHub ? 700 : 400}
                style={{
                  animationDelay: `${node.delay + 0.15}s`,
                  opacity: panelMode ? 0.95 : 1,
                  paintOrder: 'stroke',
                  stroke: '#0b0820',
                  strokeWidth: 3.5,
                  strokeLinejoin: 'round',
                } as React.CSSProperties}
              >
                {wrapLabel(node.label, labelLen).map((ln, li) => (
                  <tspan
                    key={li}
                    x={0}
                    dy={li === 0 ? 0 : (panelMode ? 15 : 12)}
                    className="fill-slate-600 dark:fill-slate-200"
                    style={panelMode ? { fill: node.color } : undefined}
                  >
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 하단: 범례 */}
      {legendTypes.length > 0 && (
        <div className={`shrink-0 flex flex-wrap gap-x-4 gap-y-1.5 px-4 ${panelMode ? 'py-3 border-t border-slate-200 dark:border-white/[0.06]' : 'py-1.5'}`}>
          {legendTypes.map(t => (
            <span key={t} className={`flex items-center gap-1.5 ${panelMode ? 'text-[13px]' : 'text-[10px]'} text-slate-400 dark:text-slate-400`}>
              <span className={`inline-block rounded-full ${panelMode ? 'h-0.5 w-6' : 'h-px w-4'}`} style={{ backgroundColor: relColor(t), opacity: 0.9 }} />
              {relLabel(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
