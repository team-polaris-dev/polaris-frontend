import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import ForceGraph3D from 'react-force-graph-3d'

/* ──────────────────────────────────────────────────────────────
   GraphExplorer — 3D 그래프 "창" (데모/목업). vasturiano/3d-force-graph 기반.
   외부에서 카메라/하이라이트를 제어할 수 있다(스크롤 카메라 투어용):
     - mode 'overview' : 전체가 화면에 들어오게 줌
     - mode 'node'     : focusId 노드로 카메라 비행 + 그 노드/이웃만 강조
     - mode 'free'     : 사용자가 직접 드래그/줌/클릭 (interactive=true)
   추후 백엔드(Neo4j) 응답을 graphData 로 갈아끼우면 된다.
   ────────────────────────────────────────────────────────────── */

export type Category = 'company' | 'person' | 'product' | 'technology'
export type Mode = 'overview' | 'node' | 'free'

interface UNode {
  id: string
  name: string
  category: Category
  val: number
}
interface ULink {
  source: string
  target: string
  kind: string
}

const PALETTE: Record<Category, string> = {
  company: '#5b8cff',
  person: '#ff6fae',
  product: '#34d399',
  technology: '#fbbf24',
}
const CATEGORY_LABEL: Record<Category, string> = {
  company: '기업',
  person: '인물',
  product: '제품',
  technology: '기술',
}
const DIM = '#2b2b3d'

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// 목표 노드 수 — 이 값만 바꾸면 규모가 조절된다(데모/목업).
const TARGET_NODES = 1000

function buildMockUniverse(): { nodes: UNode[]; links: ULink[] } {
  const rng = makeRng(42)
  // 기업명은 별 이름(접두) × 업종(접미) 조합으로 절차 생성 → 중복 없이 충분한 수 확보.
  const PREFIXES = [
    '폴라리스', '오라이언', '시리우스', '안드로메다', '베가', '카시오페이아', '리겔', '알타이르',
    '프로키온', '데네브', '스피카', '안타레스', '카펠라', '알데바란', '레굴루스', '베텔게우스',
    '포말하우트', '카노푸스', '아크투루스', '미라', '알골', '벨라트릭스', '카스토르', '폴룩스',
    '아크라브', '사이프', '수하일', '알니탁',
  ]
  const SUFFIXES = [
    '전자', '화학', '바이오', '중공업', '소프트', '건설', '에너지', '모빌리티', '식품', '항공',
    '금융', '반도체', '제약', '통신', '디스플레이', '머티리얼즈', '로보틱스', '네트웍스', '인더스트리', '홀딩스',
  ]
  const techPool = ['HBM', '전고체배터리', '초전도체', '생성형AI', '자율주행', '바이오시밀러', '수소연료전지', '양자암호', '3나노공정', '뉴로모픽', '메타렌즈', '탄소포집']
  const productPool = ['NX-1', '클라우드코어', '하이퍼셀', '제로카본', '뉴럴엣지', '메디플러스', '퀀텀링크', '오로라OS', '스타게이트', '테라폼']
  const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
  const titles = ['대표', '이사', '상무', '전무', '부사장', '감사']
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)]
  const companyName = (i: number) =>
    `${PREFIXES[i % PREFIXES.length]}${SUFFIXES[Math.floor(i / PREFIXES.length) % SUFFIXES.length]}`

  const nodes: UNode[] = []
  const links: ULink[] = []
  const add = (n: UNode) => nodes.push(n)
  const companyIds: string[] = []

  // 목표 노드 수에 도달할 때까지 기업 허브 + 위성(임원/제품/기술)을 만든다.
  let ci = 0
  while (nodes.length < TARGET_NODES) {
    const cid = `c${ci}`
    add({ id: cid, name: companyName(ci), category: 'company', val: 16 })
    companyIds.push(cid)

    const persons = 3 + Math.floor(rng() * 4)
    for (let p = 0; p < persons; p++) {
      const id = `p${ci}_${p}`
      add({ id, name: `${pick(surnames)}${pick(titles)}`, category: 'person', val: 5 })
      links.push({ source: cid, target: id, kind: '임원' })
    }
    const products = 1 + Math.floor(rng() * 3)
    for (let q = 0; q < products; q++) {
      const id = `pr${ci}_${q}`
      add({ id, name: pick(productPool), category: 'product', val: 7 })
      links.push({ source: cid, target: id, kind: '제품' })
    }
    const techs = 1 + Math.floor(rng() * 3)
    for (let t = 0; t < techs; t++) {
      const id = `t${ci}_${t}`
      add({ id, name: pick(techPool), category: 'technology', val: 7 })
      links.push({ source: cid, target: id, kind: '보유기술' })
    }
    ci++
  }

  // 기업 간 지분/계열 관계 (허브끼리 연결 → 군집감)
  for (let i = 0; i < companyIds.length; i++) {
    const partners = 1 + Math.floor(rng() * 2)
    for (let k = 0; k < partners; k++) {
      const j = Math.floor(rng() * companyIds.length)
      if (j !== i) links.push({ source: companyIds[i], target: companyIds[j], kind: '지분/계열' })
    }
  }

  return { nodes, links }
}

function linkEnd(v: any) {
  return typeof v === 'object' ? v.id : v
}

function flyTo(fg: any, node: any) {
  const dist = 80
  const hyp = Math.hypot(node.x, node.y, node.z || 0.0001) || 1
  const r = 1 + dist / hyp
  fg.cameraPosition({ x: node.x * r, y: node.y * r, z: (node.z || 0) * r }, node, 1400)
}

interface Props {
  className?: string
  mode?: Mode
  focusId?: string | null
  interactive?: boolean
  manip?: boolean
}

export default function GraphExplorer({
  className,
  mode = 'free',
  focusId = null,
  interactive = true,
  manip = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const data = useMemo(buildMockUniverse, [])

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    data.nodes.forEach((n) => m.set(n.id, new Set()))
    data.links.forEach((l) => {
      m.get(l.source)?.add(l.target)
      m.get(l.target)?.add(l.source)
    })
    return m
  }, [data])

  const nameById = useMemo(() => {
    const m = new Map<string, UNode>()
    data.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [data])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) setSize({ w: Math.max(320, r.width), h: Math.max(320, r.height) })
    }
    measure() // 즉시 1회 측정 (ResizeObserver 미발화 환경 대비)
    const t = window.setTimeout(measure, 120) // 레이아웃 확정 후 재측정
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // 노드가 뭉치지 않게 반발력/링크 거리를 키운다(마운트 1회, 그래프 초기화 후).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const fg = fgRef.current
      fg?.d3Force?.('charge')?.strength(-160)
      fg?.d3Force?.('link')?.distance(55)
      fg?.d3ReheatSimulation?.()
    }, 60)
    return () => clearTimeout(t)
  }, [])

  // 조작 토글(manip)은 부모(Landing)가 들고 버튼도 거기서 그린다 — 스크롤해도
  // 화면 우하단에 고정되도록. 토글이 켜진 동안만 수동 컨트롤(드래그/휠)을 켠다.
  // 컨트롤이 마운트 직후엔 없을 수 있어 준비될 때까지 재시도한다.
  const controlsOn = manip
  useEffect(() => {
    let tries = 0
    let timer: number | undefined
    const apply = () => {
      const c = fgRef.current?.controls?.()
      if (c) {
        c.enabled = controlsOn
        return
      }
      if (tries++ < 20) timer = window.setTimeout(apply, 100)
    }
    apply()
    if (wrapRef.current) wrapRef.current.style.cursor = controlsOn ? 'grab' : ''
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [controlsOn])

  // 스크롤 단계(mode/focusId)가 바뀌면 카메라를 움직인다.
  // 시뮬레이션이 좌표를 잡기 전이면 잠깐 기다렸다가 재시도한다.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    setSelected(null) // 새 단계로 오면 사용자가 찍어둔 선택은 해제하고 단계 포커스를 보여준다
    let tries = 0
    let timer: number | undefined
    const run = () => {
      const nodes = (fg.graphData?.().nodes ?? []) as any[]
      const ready = nodes.length > 0 && Number.isFinite(nodes[0].x)
      if (!ready) {
        if (tries++ < 30) timer = window.setTimeout(run, 150)
        return
      }
      if (mode === 'overview' || mode === 'free') {
        fg.zoomToFit(1000, 90)
        return
      }
      if (mode === 'node' && focusId) {
        const node = nodes.find((n) => n.id === focusId)
        if (node) flyTo(fg, node)
      }
    }
    run()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [mode, focusId])

  // 강조 기준: 사용자가 찍은(또는 올린) 노드가 항상 우선, 없으면 투어 단계의 focusId.
  const effFocus = selected ?? hover ?? (interactive ? null : focusId)
  const neighbors = effFocus ? adjacency.get(effFocus) : null
  const isActive = useCallback(
    (id: string) => !effFocus || id === effFocus || (neighbors?.has(id) ?? false),
    [effFocus, neighbors],
  )

  const handleNodeClick = useCallback((node: any) => {
    const fg = fgRef.current
    setSelected((prev) => (prev === node.id ? null : node.id))
    if (fg && Number.isFinite(node.x)) flyTo(fg, node)
  }, [])

  const handleBg = useCallback(() => {
    setSelected(null)
    if (interactive) fgRef.current?.zoomToFit?.(800, 70)
  }, [interactive])

  const selectedNode = selected ? nameById.get(selected) : null
  const selectedNeighbors = selected ? Array.from(adjacency.get(selected) ?? []) : []

  return (
    <div ref={wrapRef} className={`relative ${className ?? 'h-full w-full'}`}>
      <ForceGraph3D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data as any}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        nodeLabel={(n: any) => `${n.name}  ·  ${CATEGORY_LABEL[n.category as Category]}`}
        nodeColor={(n: any) => (isActive(n.id) ? PALETTE[n.category as Category] : DIM)}
        nodeVal={(n: any) => n.val}
        nodeOpacity={0.95}
        nodeResolution={8}
        linkColor={(l: any) => {
          const on = !effFocus || linkEnd(l.source) === effFocus || linkEnd(l.target) === effFocus
          return on ? 'rgba(150,175,255,0.45)' : 'rgba(120,130,160,0.05)'
        }}
        linkWidth={(l: any) =>
          effFocus && (linkEnd(l.source) === effFocus || linkEnd(l.target) === effFocus) ? 1.2 : 0.3
        }
        linkDirectionalParticles={(l: any) =>
          effFocus && (linkEnd(l.source) === effFocus || linkEnd(l.target) === effFocus) ? 2 : 0
        }
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleSpeed={0.006}
        onNodeClick={handleNodeClick}
        onNodeHover={(n: any) => {
          setHover(n ? n.id : null)
          if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'grab'
        }}
        onBackgroundClick={handleBg}
        enableNodeDrag={false}
        cooldownTicks={140}
      />

      {/* 범례 (항상) */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white/70 backdrop-blur">
        {(Object.keys(PALETTE) as Category[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[c] }} />
            {CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>

      {/* 조작 안내 (좌하단) */}
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-black/25 px-3 py-1.5 text-[11px] text-white/45 backdrop-blur">
        {manip
          ? '드래그로 회전 · 휠로 확대/축소 · 노드 클릭으로 집중'
          : '노드 클릭으로 집중 · 오른쪽 버튼으로 직접 조작'}
      </div>


      {/* 선택 노드 정보 카드 — 자유모드에서만 */}
      {selectedNode && (
        <div className="absolute right-4 top-4 w-64 rounded-xl border border-white/12 bg-[#0c0a1e]/90 p-4 text-white shadow-2xl backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[selectedNode.category] }} />
            <span className="text-xs text-white/55">{CATEGORY_LABEL[selectedNode.category]}</span>
          </div>
          <h3 className="mb-3 text-lg font-bold">{selectedNode.name}</h3>
          <p className="mb-1.5 text-xs text-white/45">연결 {selectedNeighbors.length}개</p>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto pr-1">
            {selectedNeighbors.map((nid) => {
              const nn = nameById.get(nid)
              if (!nn) return null
              return (
                <button
                  key={nid}
                  onClick={() => {
                    const target = (fgRef.current?.graphData?.().nodes ?? []).find((x: any) => x.id === nid)
                    if (target) handleNodeClick(target)
                    else setSelected(nid)
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-white/75 transition hover:bg-white/10"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[nn.category] }} />
                  <span className="truncate">{nn.name}</span>
                  <span className="ml-auto shrink-0 text-white/35">{CATEGORY_LABEL[nn.category]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
