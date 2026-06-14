import { useMemo } from 'react'
import type { GNode, GEdge } from './NetworkGraph'

/* ──────────────────────────────────────────────────────────────
   별자리 공급망 — 관계도 결과를 실제 밤하늘 별자리처럼 그린다.
   · 카드 없이 투명 → 뒤의 StarField 와 자연스럽게 섞인다.
   · 연결 수(degree)로 별의 밝기·크기(등급)를 다르게, 위치는 약간 불규칙하게.
   · 밝은 별엔 十자 반짝임(diffraction spike)을 넣어 별처럼 보이게.
   · 별이 하나씩 톡 빛나면 그 별로 가느다란 선이 뻗어 차례차례 이어진다.
   · prefers-reduced-motion 이면 애니메이션 없이 최종 상태로 표시.
   ────────────────────────────────────────────────────────────── */

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

const shortLabel = (s: string, n = 8) => (s.length > n ? s.slice(0, n) + '…' : s)

// 인덱스 기반 결정적 의사난수(0~1) — 렌더마다 위치가 흔들리지 않게.
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

interface Props {
  nodes: GNode[]
  edges: GEdge[]
}

interface Placed extends GNode {
  x: number
  y: number
  r: number
  isHub: boolean
  spike: boolean // 밝은 별에 十자 반짝임
  delay: number
}

interface PlacedEdge {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  len: number
  color: string
  delay: number
}

const VW = 440
const VH = 300
const STEP = 0.34 // 별이 하나씩 빛나는 간격(초)

export default function Constellation({ nodes, edges }: Props) {
  const { placed, placedEdges, ambient, total, legendTypes } = useMemo(() => {
    // 1) 연결 수(degree) = 별의 밝기·중요도
    const degree = new Map<string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1)
      degree.set(e.target, (degree.get(e.target) || 0) + 1)
    }

    // 2) degree 순 정렬 후 전체 렌더링, 허브 = 최다 연결
    const keptNodes = [...nodes].sort(
      (a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0),
    )
    const keptIds = new Set(keptNodes.map((n) => n.id))

    // degree → 별 크기(등급) 매핑
    const degs = keptNodes.map((n) => degree.get(n.id) || 0)
    const dMax = Math.max(1, ...degs)
    const dMin = Math.min(...degs)
    const sizeOf = (d: number) => 3 + ((d - dMin) / Math.max(1, dMax - dMin)) * 3.5 // 3~6.5

    const hub = keptNodes[0]
    const spokes = keptNodes.slice(1)
    const cx = VW / 2
    const cy = VH / 2
    const rx = 165
    const ry = 102

    // 3) 배치(살짝 불규칙) + 등장 타이밍(허브 먼저, 그다음 하나씩)
    const placed: Placed[] = []
    if (hub) {
      const r = sizeOf(degree.get(hub.id) || 0) + 1.2
      placed.push({ ...hub, x: cx, y: cy, r, isHub: true, spike: true, delay: 0 })
    }
    spokes.forEach((n, i) => {
      const base = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(spokes.length, 1)
      const theta = base + (rnd(i * 2 + 1) - 0.5) * 0.5 // 각도 ±14°
      const sx = 0.74 + rnd(i * 3 + 7) * 0.42 // 반경 흔들기
      const sy = 0.74 + rnd(i * 5 + 13) * 0.42
      const r = sizeOf(degree.get(n.id) || 0)
      placed.push({
        ...n,
        x: cx + rx * sx * Math.cos(theta),
        y: cy + ry * sy * Math.sin(theta),
        r,
        isHub: false,
        spike: r >= 4.8, // 밝은 별만 반짝임
        delay: 0.25 + i * STEP,
      })
    })

    const delayById = new Map(placed.map((p) => [p.id, p.delay]))
    const posById = new Map(placed.map((p) => [p.id, p]))

    // 4) 채택된 노드 사이의 엣지만, 양 끝 별이 빛난 직후 선이 뻗도록
    const placedEdges: PlacedEdge[] = []
    edges.forEach((e, i) => {
      const a = posById.get(e.source)
      const b = posById.get(e.target)
      if (!a || !b || !keptIds.has(e.source) || !keptIds.has(e.target)) return
      placedEdges.push({
        key: `${e.source}|${e.target}|${e.type}|${i}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        len: Math.hypot(b.x - a.x, b.y - a.y),
        color: relColor(e.type),
        delay: Math.max(delayById.get(e.source) || 0, delayById.get(e.target) || 0) + 0.12,
      })
    })

    // 5) 배경과 섞이는 흐릿한 앰비언트 별
    const ambient = Array.from({ length: 34 }, (_, i) => ({
      id: i,
      x: rnd(i + 1) * VW,
      y: rnd(i * 2 + 3) * VH,
      r: rnd(i * 3 + 5) * 1 + 0.35,
      o: rnd(i * 4 + 9) * 0.35 + 0.1,
      d: rnd(i * 5 + 11) * 4,
    }))

    // 6) 실제로 등장한 관계 유형만 범례로 추출 (중복 제거)
    const legendTypes = [...new Set(
      edges
        .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
        .map((e) => e.type)
        .filter(Boolean)
    )]

    return { placed, placedEdges, ambient, total: nodes.length, legendTypes }
  }, [nodes, edges])

  if (!placed.length) return null

  return (
    <div className="relative w-full">
      <style>{`
        @keyframes cnsPop { 0% { opacity:0; transform:scale(0);} 55% { opacity:1; transform:scale(1.5);} 100% { opacity:1; transform:scale(1);} }
        @keyframes cnsDraw { from { stroke-dashoffset: var(--len);} to { stroke-dashoffset: 0; } }
        @keyframes cnsFade { from { opacity:0;} to { opacity:1;} }
        @keyframes cnsTwinkle { 0%,100% { opacity:.95;} 50% { opacity:.5;} }
        @keyframes cnsSpark { 0%,100% { opacity:.55; transform:scale(1);} 50% { opacity:.95; transform:scale(1.15);} }
        .cns-star { transform-box: fill-box; transform-origin:center; animation: cnsPop .5s cubic-bezier(.2,.8,.3,1.4) both; }
        .cns-twinkle { animation: cnsTwinkle var(--tw,3s) ease-in-out infinite; }
        .cns-glow { animation: cnsFade .6s ease both; }
        .cns-line { stroke-dasharray: var(--len); animation: cnsDraw .55s cubic-bezier(.4,0,.2,1) both; }
        .cns-label { animation: cnsFade .5s ease both; }
        .cns-spike { transform-box: fill-box; transform-origin:center; animation: cnsFade .6s ease both, cnsSpark var(--tw,4s) ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cns-star,.cns-glow,.cns-label,.cns-spike { animation: none !important; }
          .cns-line { animation: none !important; stroke-dashoffset: 0 !important; }
          .cns-twinkle { animation: none !important; }
        }
      `}</style>

      <span className="pointer-events-none absolute left-1 top-1 z-10 text-[10px] font-medium tracking-wider text-slate-400/80">
        공급망 · {total}개
      </span>

      <svg viewBox={`0 0 ${VW} ${VH}`} className="h-[260px] w-full">
        <defs>
          <radialGradient id="cnsGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#bcd6ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#7ab0ff" stopOpacity="0" />
          </radialGradient>
          {/* 十자 반짝임용 가로/세로 그라데이션 (가운데 밝고 끝은 투명) */}
          <linearGradient id="cnsSpkH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cnsSpkV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 앰비언트 별 — 배경과 경계를 흐린다 */}
        {ambient.map((a) => (
          <circle
            key={`amb-${a.id}`}
            cx={a.x}
            cy={a.y}
            r={a.r}
            className="cns-twinkle fill-slate-400 dark:fill-white"
            style={{ opacity: a.o, ['--tw' as string]: `${2 + a.d}s` }}
          />
        ))}

        {/* 관계선 — 얇은 빛나는 실 (글로우 underlay + 가는 본선) */}
        {placedEdges.map((e) => {
          const v = { ['--len' as string]: `${e.len}` } as React.CSSProperties
          return (
            <g key={e.key}>
              <line
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={e.color} strokeWidth={2.4} strokeLinecap="round" opacity={0.1}
                className="cns-line" style={{ ...v, animationDelay: `${e.delay}s` }}
              />
              <line
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={e.color} strokeWidth={0.6} strokeLinecap="round" opacity={0.8}
                className="cns-line" style={{ ...v, animationDelay: `${e.delay}s` }}
              />
            </g>
          )
        })}

        {/* 노드(별) + 반짝임 + 라벨 — 하나씩 톡 빛난다 */}
        {placed.map((p, i) => {
          const spk = p.isHub ? 18 : 12 // 반짝임 길이
          const tw = `${2.6 + (i % 3)}s`
          return (
            <g key={p.id}>
              <circle
                cx={p.x} cy={p.y} r={p.r * 3.2}
                fill="url(#cnsGlow)" className="cns-glow"
                style={{ animationDelay: `${p.delay}s` }}
              />
              {p.spike && (
                <g className="cns-spike" style={{ animationDelay: `${p.delay}s`, ['--tw' as string]: tw }}>
                  <rect x={p.x - spk} y={p.y - 0.55} width={spk * 2} height={1.1} fill="url(#cnsSpkH)" />
                  <rect x={p.x - 0.55} y={p.y - spk} width={1.1} height={spk * 2} fill="url(#cnsSpkV)" />
                </g>
              )}
              <circle
                cx={p.x} cy={p.y} r={p.r}
                className="cns-star cns-twinkle fill-white"
                style={{
                  animationDelay: `${p.delay}s`,
                  ['--tw' as string]: tw,
                  filter: `drop-shadow(0 0 ${p.isHub ? 7 : 4}px rgba(122,176,255,.95))`,
                }}
              />
              <text
                x={p.x} y={p.y + p.r + 13} textAnchor="middle"
                className="cns-label fill-slate-600 text-[10px] font-medium dark:fill-slate-200"
                style={{ animationDelay: `${p.delay + 0.15}s` }}
              >
                {shortLabel(p.label || p.id)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 색상 범례 — 실제 등장한 관계 유형만 */}
      {legendTypes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1">
          {legendTypes.map((t) => (
            <span key={t} className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              <span
                className="inline-block h-px w-4 rounded-full"
                style={{ backgroundColor: relColor(t), opacity: 0.85 }}
              />
              {relLabel(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
