import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { useTheme } from '../theme/ThemeContext'

/* ──────────────────────────────────────────────────────────────
   기업 관계도 — 백엔드(Neo4j)에서 조회한 노드/엣지를 force-graph 로 렌더링.
   DB에서 오는 노드 수가 가변적이라 좌표를 직접 잡지 않고 자동 레이아웃을 쓴다.
   엣지를 클릭하면 onSelectEdge(_key) 로 상위에 알려 근거(rcept_no)를 표시한다.
   ────────────────────────────────────────────────────────────── */

export interface GNode {
  id: string
  label: string
  category: string
}
export interface GEdge {
  source: string
  target: string
  type: string
  label: string
  rcept_no: string
}

export function edgeKey(e: GEdge, i: number) {
  return `${e.source}|${e.target}|${e.type}|${i}`
}

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  selectedKey: string | null
  onSelectEdge: (key: string | null) => void
}

export default function NetworkGraph({ nodes, edges, selectedKey, onSelectEdge }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 320, h: 320 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize({ w: Math.max(200, cr.width), h: Math.max(240, cr.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.map((e, i) => ({ ...e, _key: edgeKey(e, i) })),
    }),
    [nodes, edges],
  )

  // 그래프가 바뀌면 화면에 맞게 한 번 줌
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const t = setTimeout(() => fg.zoomToFit?.(400, 30), 500)
    return () => clearTimeout(t)
  }, [graphData])

  const nodeColor = dark ? '#60a5fa' : '#2563eb'
  const textColor = dark ? '#e2e8f0' : '#1e293b'
  const linkColor = dark ? 'rgba(148,163,184,.5)' : 'rgba(100,116,139,.5)'
  const linkActive = dark ? '#38bdf8' : '#2563eb'

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = 5
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = nodeColor
      ctx.fill()
      const label = node.label || node.id
      const fontSize = Math.max(11 / scale, 3)
      ctx.font = `${fontSize}px Pretendard, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = textColor
      ctx.fillText(label, node.x, node.y + r + 1.5)
    },
    [nodeColor, textColor],
  )

  return (
    <div ref={wrapRef} className="h-[320px] w-full">
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={5}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, 9, 0, 2 * Math.PI)
          ctx.fill()
        }}
        linkColor={(l: any) => (l._key === selectedKey ? linkActive : linkColor)}
        linkWidth={(l: any) => (l._key === selectedKey ? 2.5 : 1)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkLabel={(l: any) => l.label || l.type}
        linkCurvature={0.08}
        onLinkClick={(l: any) => onSelectEdge(l._key === selectedKey ? null : l._key)}
        onBackgroundClick={() => onSelectEdge(null)}
        cooldownTicks={80}
      />
    </div>
  )
}
