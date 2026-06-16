import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, Link2, Sparkles } from 'lucide-react'
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

// DART 공식 공시 뷰어 URL — 14자리 접수번호(rcept_no)가 곧 관계의 근거(출처).
const dartUrl = (rceptNo: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`

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
  mx: number // 중점(클릭 시 라벨 위치 참고용)
  my: number
  len: number
  color: string
  delay: number
  type: string
  srcLabel: string
  tgtLabel: string
  rcept_no: string
}

const VW = 440
const VH = 300
const STEP = 0.34 // 별이 하나씩 빛나는 간격(초)

export default function Constellation({ nodes, edges }: Props) {
  const { placed, placedEdges, ambient, total, legendTypes, vw, vh } = useMemo(() => {
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

    // 노드가 많을수록 좌표 공간(viewBox)과 타원 반경을 함께 키운다.
    // 별 크기·글자는 그대로라 캔버스가 커진 만큼 별 사이가 넓어진다(겹침 완화).
    const spread = Math.min(1.8, Math.max(1, Math.sqrt(spokes.length / 10)))
    const vw = VW * spread
    const vh = VH * spread
    const cx = vw / 2
    const cy = vh / 2
    const rx = 165 * spread
    const ry = 102 * spread

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
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        len: Math.hypot(b.x - a.x, b.y - a.y),
        color: relColor(e.type),
        delay: Math.max(delayById.get(e.source) || 0, delayById.get(e.target) || 0) + 0.12,
        type: e.type,
        srcLabel: a.label || a.id,
        tgtLabel: b.label || b.id,
        rcept_no: e.rcept_no || '',
      })
    })

    // 5) 배경과 섞이는 흐릿한 앰비언트 별
    const ambient = Array.from({ length: 34 }, (_, i) => ({
      id: i,
      x: rnd(i + 1) * vw,
      y: rnd(i * 2 + 3) * vh,
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

    return { placed, placedEdges, ambient, total: nodes.length, legendTypes, vw, vh }
  }, [nodes, edges])

  // 자세히 보기 — 큰 별자리를 모달로 띄우고, 관계선을 클릭하면 출처를 보여준다.
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = placedEdges.find((e) => e.key === selectedKey) || null

  // ESC 로 닫기 + 모달 열려 있을 때 배경 스크롤 잠금. 열 때 선택 초기화.
  useEffect(() => {
    if (!detailOpen) return
    setSelectedKey(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDetailOpen(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [detailOpen])

  if (!placed.length) return null

  return (
    <div className="relative w-full">
      <style>{`
        @keyframes cnsPop { 0% { opacity:0; transform:scale(0);} 55% { opacity:1; transform:scale(1.5);} 100% { opacity:1; transform:scale(1);} }
        @keyframes cnsDraw { from { stroke-dashoffset: var(--len);} to { stroke-dashoffset: 0; } }
        @keyframes cnsFade { from { opacity:0;} to { opacity:1;} }
        @keyframes cnsTwinkle { 0%,100% { opacity:.95;} 50% { opacity:.5;} }
        @keyframes cnsSpark { 0%,100% { opacity:.55; transform:scale(1);} 50% { opacity:.95; transform:scale(1.15);} }
        @keyframes cnsModalIn { from { opacity:0; transform: translateY(10px) scale(.97);} to { opacity:1; transform:none; } }
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

      <svg viewBox={`0 0 ${vw} ${vh}`} className="h-[260px] w-full">
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

      {/* 자세히 보기 — 큰 별자리를 모달로 (관계선 클릭 → 출처) */}
      {placedEdges.length > 0 && (
        <div className="px-1 pt-0.5">
          <button
            onClick={() => setDetailOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            <Link2 size={13} /> 별자리 크게 보기 · 관계 {placedEdges.length}건
          </button>
        </div>
      )}

      {detailOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ animation: 'cnsFade .2s ease both' }}
          onClick={() => setDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="기업 관계 자세히 보기"
        >
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'cnsModalIn .28s cubic-bezier(.2,.8,.3,1.1) both' }}
            className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b0a1f] to-[#0c1030] shadow-2xl shadow-blue-950/50 ring-1 ring-white/5"
          >
            {/* 헤더 */}
            <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
              <div className="relative flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400/90 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                  <Sparkles size={16} />
                </span>
                <div>
                  <h3 className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-sm font-semibold text-transparent">
                    기업 관계 별자리
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    기업 {total}개 · 관계 {placedEdges.length}건 · 선을 클릭하면 출처가 보입니다
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailOpen(false)}
                className="relative grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="닫기"
              >
                <X size={17} />
              </button>
            </div>

            {/* 큰 별자리 — 어두운 밤하늘 배경에서 별/관계선이 잘 보이게 */}
            <div className="relative flex-1 overflow-hidden">
              {/* 성운 글로우 */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-1/2 h-[130%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,.22),transparent)] blur-2xl" />
                <div className="absolute right-[12%] top-[18%] h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,.18),transparent)] blur-2xl" />
              </div>
              {/* 범례 — 좌상단 오버레이 */}
              {legendTypes.length > 0 && (
                <div className="pointer-events-none absolute left-4 top-3 z-10 flex flex-wrap gap-x-3 gap-y-1">
                  {legendTypes.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-[10px] text-slate-300/90">
                      <span className="inline-block h-px w-4 rounded-full" style={{ backgroundColor: relColor(t) }} />
                      {relLabel(t)}
                    </span>
                  ))}
                </div>
              )}
              <svg viewBox={`0 0 ${vw} ${vh}`} className="relative h-[460px] max-h-[60vh] w-full">
                <defs>
                  {/* 부드러운 후광 */}
                  <radialGradient id="cnsHaloL" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                    <stop offset="35%" stopColor="#9ec3ff" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#6d8bff" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* 앰비언트 별 */}
                {ambient.map((a) => (
                  <circle
                    key={`m-amb-${a.id}`}
                    cx={a.x} cy={a.y} r={a.r}
                    className="cns-twinkle fill-white"
                    style={{ opacity: a.o, ['--tw' as string]: `${2 + a.d}s` }}
                  />
                ))}

                {/* 관계선 — 인라인과 동일(글로우 + 본선) + 선택 강조 + 투명 클릭영역 */}
                {placedEdges.map((e) => {
                  const on = e.key === selectedKey
                  const v = { ['--len' as string]: `${e.len}` } as React.CSSProperties
                  return (
                    <g key={`m-${e.key}`}>
                      <line
                        x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                        stroke={e.color} strokeWidth={on ? 3.2 : 2.4} strokeLinecap="round"
                        opacity={on ? 0.35 : 0.1}
                        className="cns-line" style={{ ...v, animationDelay: `${e.delay}s` }}
                      />
                      <line
                        x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                        stroke={e.color} strokeWidth={on ? 1.6 : 0.6} strokeLinecap="round"
                        opacity={on ? 1 : 0.8}
                        className="cns-line" style={{ ...v, animationDelay: `${e.delay}s` }}
                      />
                      <line
                        x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                        stroke="transparent" strokeWidth={9} strokeLinecap="round"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedKey(on ? null : e.key)}
                      />
                      {on && (
                        <text
                          x={e.mx} y={e.my - 3} textAnchor="middle"
                          className="pointer-events-none text-[8px] font-semibold"
                          fill={e.color}
                        >
                          {relLabel(e.type)}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* 별(노드) — 조그맣게 빛나는 동그라미 + 후광 + 라벨 */}
                {placed.map((p, i) => {
                  const tw = `${2.6 + (i % 3)}s`
                  return (
                    <g key={`m-${p.id}`}>
                      <circle
                        cx={p.x} cy={p.y} r={p.r * 3.4}
                        fill="url(#cnsHaloL)" className="cns-glow"
                        style={{ animationDelay: `${p.delay}s` }}
                      />
                      <circle
                        cx={p.x} cy={p.y} r={p.r}
                        className="cns-star cns-twinkle fill-white"
                        style={{
                          animationDelay: `${p.delay}s`,
                          ['--tw' as string]: tw,
                          filter: `drop-shadow(0 0 ${p.isHub ? 7 : 4}px rgba(150,195,255,.95))`,
                        }}
                      />
                      <text
                        x={p.x} y={p.y + p.r + 13} textAnchor="middle"
                        className="cns-label fill-slate-200 text-[10px] font-medium"
                        style={{ animationDelay: `${p.delay + 0.15}s` }}
                      >
                        {shortLabel(p.label || p.id, 12)}
                      </text>
                    </g>
                  )
                })}
              </svg>
              {/* 비네팅 — 가장자리를 어둡게 해 깊이감 */}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_110px_30px_rgba(5,4,20,.85)]" />
            </div>

            {/* 선택된 관계의 출처 — 하단 고정 영역 */}
            <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">
              {selected ? (
                <div
                  key={selected.key}
                  style={{
                    animation: 'cnsFade .25s ease both',
                    borderColor: selected.color + '55',
                    backgroundColor: selected.color + '12',
                  }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                    <span className="font-semibold text-white">{selected.srcLabel}</span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ color: selected.color, backgroundColor: selected.color + '22' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: selected.color }} />
                      {relLabel(selected.type)}
                    </span>
                    <span style={{ color: selected.color }}>→</span>
                    <span className="font-semibold text-white">{selected.tgtLabel}</span>
                  </div>
                  {selected.rcept_no ? (
                    <a
                      href={dartUrl(selected.rcept_no)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400/15 px-3 py-1.5 text-[12px] font-medium text-sky-300 transition hover:bg-sky-400/25"
                    >
                      <ExternalLink size={13} /> DART 원문
                      <span className="font-mono text-[10px] text-slate-400">#{selected.rcept_no}</span>
                    </a>
                  ) : (
                    <span className="text-[12px] text-slate-400">출처 정보 없음</span>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-slate-400">
                  <Link2 size={13} className="shrink-0 text-slate-500" />
                  관계선을 클릭하면 두 기업의 관계와 출처(DART 원문)가 여기에 표시됩니다.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
