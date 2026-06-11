import { useState, useRef, useEffect } from 'react'
import {
  Menu,
  X,
  Plus,
  Search,
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  BarChart3,
  Network,
  Link2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import StarField from '../components/StarField'
import ThemeToggle from '../components/ThemeToggle'

/* ──────────────────────────────────────────────────────────────
   /app — POLARIS 워크스페이스
   · '추출 근거' 탭 → '기업 관계도(Network Graph)' 탭으로 변경
   · 노드(기업)+엣지(관계) 인터랙티브 지식그래프(SVG)
   · 엣지 클릭 → 해당 관계의 공시 원문 근거가 하단 패널에 표시
   · 의도 기반 자동 패널 오픈 + 탭 포커스 (show_graph_panel 규격)
   ────────────────────────────────────────────────────────────── */

type Role = 'user' | 'assistant'
type TabKey = 'summary' | 'finance' | 'graph'
type Level = 'beginner' | 'expert'

interface Message {
  id: number
  role: Role
  content: string
  tab?: TabKey
}
interface ChatItem {
  id: number
  title: string
  preview: string
  date: string
}
interface DisclosureSummary {
  company: string
  date: string
  title: string
  summary: string
}
interface FinanceRow {
  year: string
  account: string
  value: number
  unit: string
}

/* 지식그래프 데이터 (JSON Schema 규격) */
interface GraphNode {
  id: string
  label: string
  category: string
  size?: 'large' | 'normal'
  x: number // viewBox 좌표
  y: number
}
interface GraphEdge {
  source: string
  target: string
  type: string
  label: string
  evidence: string
  confidence: number
}

/* 엣지 타입별 표시 라벨 / 색상 */
const EDGE_STYLE: Record<string, { ko: string; stroke: string }> = {
  SUPPLIES_TO: { ko: '공급', stroke: '#60a5fa' },
  ACQUIRES: { ko: '인수', stroke: '#f472b6' },
  INVESTS: { ko: '투자', stroke: '#34d399' },
}

const GRAPH_DATA: { nodes: GraphNode[]; edges: GraphEdge[] } = {
  nodes: [
    { id: '미래디스플레이', label: '미래디스플레이', category: '고객사', size: 'large', x: 180, y: 64 },
    { id: '한빛전자', label: '한빛전자', category: '공급사', x: 66, y: 158 },
    { id: '대성중공업', label: '대성중공업', category: '투자사', x: 296, y: 158 },
    { id: '스타캐피탈', label: '스타캐피탈', category: '사모펀드', x: 78, y: 244 },
    { id: '누리소프트', label: '누리소프트', category: '피인수기업', x: 214, y: 240 },
  ],
  edges: [
    {
      source: '한빛전자',
      target: '미래디스플레이',
      type: 'SUPPLIES_TO',
      label: '디스플레이 부품 공급 (18%)',
      evidence: '당사는 미래디스플레이와 디스플레이 구동 부품에 대한 공급계약을 체결하였으며, 계약금액은 직전 사업연도 매출액의 약 18% 규모입니다.',
      confidence: 0.96,
    },
    {
      source: '스타캐피탈',
      target: '누리소프트',
      type: 'ACQUIRES',
      label: '경영권 인수 (최대주주)',
      evidence: '경영권 양수도 계약에 따라 최대주주가 스타캐피탈로 변경될 예정이며, 잔금 납입 후 지배구조가 확정됩니다.',
      confidence: 0.91,
    },
    {
      source: '대성중공업',
      target: '미래디스플레이',
      type: 'INVESTS',
      label: '신규 설비 공동투자',
      evidence: '친환경 디스플레이 생산설비 증설을 위해 미래디스플레이와 공동으로 자기자본의 약 12%를 투자하기로 결정하였습니다.',
      confidence: 0.88,
    },
  ],
}

/* 탭별 안내 멘트 / 버튼 라벨 */
const TAB_META: Record<TabKey, { mention: string; button: string }> = {
  summary: {
    mention: '최근 공시 요약을 우측 대시보드에 정리해 드렸습니다.',
    button: '공시 요약 보기',
  },
  finance: {
    mention: '사업연도별 재무 지표를 우측 대시보드에 표와 차트로 정리해 드렸습니다.',
    button: '재무 지표 보기',
  },
  graph: {
    mention: '우측 관계도에서 기업 간의 공급망과 지분 구조를 시각적으로 확인해 보세요.',
    button: '관계도 보기',
  },
}

/* 데모용 의도 분류기 — 실제로는 LLM payload의 show_graph_panel/type 사용 */
function classifyIntent(text: string): TabKey | null {
  if (/관계|관계도|지분|지배|공급망|공급|밸류체인|그래프|연결|구조|인수|투자|네트워크|근거|출처|원문/.test(text))
    return 'graph'
  if (/재무|매출|영업이익|실적|이익|추이|성장|연도|몇\s?년|비교|표|지표/.test(text)) return 'finance'
  if (/공시|요약|최근|뉴스|발표|소식/.test(text)) return 'summary'
  return null
}

/* 노드 중심 좌표를 반지름만큼 잘라 엣지가 원 경계에 닿게 */
const NODE_R = (n: GraphNode) => (n.size === 'large' ? 23 : 18)
function trimLine(s: GraphNode, t: GraphNode) {
  const dx = t.x - s.x
  const dy = t.y - s.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    x1: s.x + ux * NODE_R(s),
    y1: s.y + uy * NODE_R(s),
    x2: t.x - ux * (NODE_R(t) + 6),
    y2: t.y - uy * (NODE_R(t) + 6),
  }
}

/* ── 데모 데이터 ── */
const CHAT_HISTORY: ChatItem[] = [
  { id: 1, title: '한빛전자 공급계약 영향 분석', preview: '단일판매·공급계약 체결 공시…', date: '오늘' },
  { id: 2, title: '서연바이오 유상증자 해석', preview: '주주배정 후 실권주 일반공모…', date: '오늘' },
  { id: 3, title: '누리소프트 최대주주 변경', preview: '경영권 양수도 계약 체결로…', date: '어제' },
  { id: 4, title: '반도체 밸류체인 정리', preview: '소부장 공급망 2-hop 추적…', date: '3일 전' },
  { id: 5, title: '별빛에너지 신규시설 투자', preview: '설비 증설 규모 대비 자본…', date: '지난주' },
]

const DISCLOSURE_SUMMARIES: DisclosureSummary[] = [
  { company: '한빛전자', date: '2026.06.04', title: '단일판매·공급계약 체결', summary: '매출액 대비 약 18% 규모의 디스플레이 부품 공급계약을 체결. 계약기간 2년.' },
  { company: '서연바이오', date: '2026.06.04', title: '유상증자 결정', summary: '주주배정 후 실권주 일반공모 방식, 운영자금 및 시설자금 조달 목적.' },
  { company: '대성중공업', date: '2026.06.03', title: '신규시설투자 등', summary: '친환경 선박 설비 증설에 자기자본의 약 12% 투자 결정.' },
  { company: '누리소프트', date: '2026.06.03', title: '최대주주 변경을 수반하는 주식 양수도', summary: '경영권 양수도 계약 체결로 최대주주가 사모펀드로 변경 예정.' },
]

const FINANCE_ROWS: FinanceRow[] = [
  { year: '2022', account: '매출액', value: 8420, unit: '억원' },
  { year: '2023', account: '매출액', value: 9610, unit: '억원' },
  { year: '2024', account: '매출액', value: 11240, unit: '억원' },
  { year: '2025', account: '매출액', value: 13080, unit: '억원' },
  { year: '2022', account: '영업이익', value: 610, unit: '억원' },
  { year: '2023', account: '영업이익', value: 880, unit: '억원' },
  { year: '2024', account: '영업이익', value: 1150, unit: '억원' },
  { year: '2025', account: '영업이익', value: 1490, unit: '억원' },
]

const GREETING: Message = {
  id: 0,
  role: 'assistant',
  content:
    '안녕하세요, POLARIS입니다. 기업 공시와 뉴스를 그래프로 연결해 분석해 드려요. 궁금한 종목이나 공시 내용을 물어보세요.',
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [activeChat, setActiveChat] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<TabKey>('summary')
  const [metric, setMetric] = useState<'매출액' | '영업이익'>('매출액')
  const [level, setLevel] = useState<Level>('beginner')
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const started = messages.some((m) => m.role === 'user')
  const financeRows = FINANCE_ROWS.filter((r) => r.account === metric)
  const financeMax = Math.max(...financeRows.map((r) => r.value))
  const nodeById = Object.fromEntries(GRAPH_DATA.nodes.map((n) => [n.id, n]))

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const openVisual = (t: TabKey) => {
    setTab(t)
    setRightOpen(true)
  }

  const handleSend = async () => {
  const text = input.trim();
  if (!text || loading) return;

  // 1. 사용자 메시지 UI에 즉시 추가 & 입력창 비우기
  setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text }]);
  setInput('');
  setLoading(true);

  try {
    // 2. FastAPI 서버로 POST 요청
    const response = await fetch('http://127.0.0.1:8000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: 'user_123',       // TODO: 실제 유저 ID 또는 세션 ID로 교체
        message: text,
        thread_id: 'session_1',    // TODO: 대화 기록 유지를 위한 고유 ID (LangGraph Memory용)
      }),
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    // 3. 서버 응답 데이터 파싱
    const data = await response.json();
    // data 형태: { response: "에이전트 응답 텍스트", intent: "graph" }
    
    const botResponse = data.response;
    // 서버에서 온 intent 값이 프론트의 TAB_META 키(예: 'graph', 'rdb' 등)와 일치해야 합니다.
    const intentTab = data.intent !== 'unknown' ? data.intent : null;

    // 4. 에이전트 응답을 채팅창에 추가
    setMessages((prev) => [
      ...prev,
      { 
        id: Date.now() + 1, 
        role: 'assistant', 
        content: botResponse, 
        tab: intentTab ?? undefined 
      },
    ]);

    // 5. Intent가 감지되었을 경우 우측 패널(탭) 열기
    if (intentTab) {
      setTab(intentTab);
      setRightOpen(true);
      if (intentTab === 'graph' && typeof setSelectedEdge === 'function') {
        setSelectedEdge(null);
      }
    }
  } catch (error) {
    console.error('API 통신 실패:', error);
    setMessages((prev) => [
      ...prev,
      { 
        id: Date.now() + 1, 
        role: 'assistant', 
        content: '서버와 연결하는 중 오류가 발생했습니다. 백엔드가 켜져 있는지 확인해 주세요.' 
      },
    ]);
  } finally {
    // 통신이 끝났으므로 로딩 상태 해제
    setLoading(false);
  }
};

  const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: 'summary', label: '공시 요약', icon: FileText },
    { key: 'finance', label: '재무 지표', icon: BarChart3 },
    { key: 'graph', label: '기업 관계도', icon: Network },
  ]

  const showRight = started && rightOpen

  return (
    <div className="relative h-screen overflow-hidden bg-white text-slate-900 transition-colors duration-500 dark:bg-[#0B0820] dark:text-white">
      <style>{`
        @keyframes polarisFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes polarisRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes polarisSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}

        @keyframes lineDrawBig { 0% { stroke-dashoffset: 350; } 100% { stroke-dashoffset: 0; } }
        @keyframes starPulse { 0%,100% { opacity:.3; transform:scale(.8); } 50% { opacity:1; transform:scale(1.4); } }
        @keyframes textGlow { 0% { opacity:.5; filter:drop-shadow(0 0 2px currentColor); } 100% { opacity:1; filter:drop-shadow(0 0 8px currentColor); } }

        /* 관계도 엣지 그리기 / 노드 등장 */
        @keyframes edgeDraw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
        @keyframes nodePop { 0% { opacity:0; transform:scale(.5);} 100% { opacity:1; transform:scale(1);} }

        .polaris-glow{position:relative;padding:1.5px;border-radius:1rem;overflow:hidden;
          box-shadow:0 0 12px rgba(122,176,255,.18);transition:box-shadow .45s ease}
        .polaris-glow::before{content:'';position:absolute;left:50%;top:50%;
          width:170%;aspect-ratio:1;transform:translate(-50%,-50%);
          background:conic-gradient(from 0deg,
            transparent 0deg, rgba(122,176,255,.55) 60deg,
            rgba(232,240,255,.95) 100deg, rgba(122,176,255,.55) 140deg,
            transparent 200deg, transparent 360deg);
          opacity:.5;animation:polarisSpin 7s linear infinite;transition:opacity .45s ease}
        .polaris-glow-inner{position:relative;z-index:1;border-radius:calc(1rem - 1.5px)}
        .polaris-glow.is-active{box-shadow:0 0 24px rgba(96,165,250,.45)}
        .polaris-glow.is-active::before{opacity:1;animation-duration:3.2s;
          background:conic-gradient(from 0deg,
            transparent 0deg, rgba(96,165,250,.9) 55deg,
            #ffffff 100deg, rgba(56,189,248,.95) 145deg,
            transparent 210deg, transparent 360deg)}
        @media (prefers-reduced-motion: reduce){.polaris-glow::before{animation:none}}
      `}</style>

      <StarField />
      <img
        src="/cliff.png"
        alt=""
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
        className="pointer-events-none absolute bottom-0 right-0 z-0 w-[38%] max-w-xl select-none opacity-95 transition duration-500 dark:invert"
      />

      {/* ───────── 좌측 슬라이드 드로어 (대화 기록) ───────── */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/60 ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-transform duration-300 ease-out dark:border-white/[0.08] dark:bg-[#0B0820]/95 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <span className="font-bold tracking-tight">POLARIS</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-3">
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700">
            <Plus size={16} /> 새 대화
          </button>
        </div>
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
            <Search size={14} className="text-slate-400" />
            <input
              placeholder="대화 검색"
              className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            최근 대화
          </p>
          {CHAT_HISTORY.map((chat) => (
            <button
              key={chat.id}
              onClick={() => {
                setActiveChat(chat.id)
                setDrawerOpen(false)
              }}
              className={`group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                activeChat === chat.id
                  ? 'bg-blue-600/10 dark:bg-white/[0.08]'
                  : 'hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <MessageSquare
                size={15}
                className={`mt-0.5 shrink-0 ${
                  activeChat === chat.id ? 'text-blue-500' : 'text-slate-400'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{chat.title}</span>
                <span className="block truncate text-xs text-slate-400">{chat.preview}</span>
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">{chat.date}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* ───────── 메인 화면 (중앙 + 우측 대시보드) ───────── */}
      <div className="relative z-10 flex h-full">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-500 ease-out">
          <header
            className={`flex items-center gap-3 px-5 py-4 transition-all duration-500 ${
              started ? 'border-b border-slate-200 dark:border-white/[0.06]' : 'border-b border-transparent'
            }`}
          >
            <button
              onClick={() => setDrawerOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="대화 기록 열기"
            >
              <Menu size={18} />
            </button>
            <span className="font-bold tracking-tight">POLARIS</span>
            {started && (
              <>
                <span className="hidden h-4 w-px bg-slate-200 dark:bg-white/15 sm:block" />
                <h2 className="hidden truncate text-sm text-slate-500 dark:text-slate-400 sm:block">
                  한빛전자 공급계약 영향 분석
                </h2>
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {started && !rightOpen && (
                <button
                  onClick={() => setRightOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="대시보드 열기"
                  title="DART 대시보드 열기"
                >
                  <PanelRightOpen size={18} />
                </button>
              )}
              <ThemeToggle />
            </div>
          </header>

          <div
            className={`relative flex min-h-0 flex-1 flex-col transition-all duration-500 ${
              started ? '' : 'items-center justify-center px-6'
            }`}
          >
            {!started && (
              <div
                style={{ animation: 'polarisRise .6s ease both' }}
                className="mb-8 flex flex-col items-center text-center"
              >
                <span className="relative mb-5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60 blur-[3px]" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-400 dark:bg-white" />
                </span>
                <h1 className="mb-2 text-2xl font-bold sm:text-3xl">무엇이 궁금하신가요?</h1>
                <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                  기업 공시·뉴스를 그래프로 연결해 분석해 드려요. 종목명이나 공시 내용을 입력해 보세요.
                </p>
              </div>
            )}

            {started && (
              <div ref={scrollRef} className="min-h-0 w-full flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto flex max-w-3xl flex-col space-y-6">
                  {messages.map((m) =>
                    m.role === 'user' ? (
                      <div key={m.id} style={{ animation: 'polarisRise .4s ease both' }} className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-lg shadow-blue-600/20">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} style={{ animation: 'polarisRise .4s ease both' }} className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-blue-600 text-white shadow-md shadow-blue-500/30">
                          <Sparkles size={14} />
                        </span>
                        <div className="flex max-w-[80%] flex-col items-start gap-2">
                          <div className="whitespace-pre-line rounded-2xl rounded-tl-sm border border-slate-200 bg-white/70 px-4 py-2.5 text-sm leading-relaxed backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                            {m.content}
                          </div>
                          {m.tab && (
                            <button
                              onClick={() => openVisual(m.tab!)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-300 dark:hover:bg-sky-300/20"
                            >
                              <PanelRightOpen size={13} /> {TAB_META[m.tab]?.button}
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                  )}

                  {loading && (
                    <div
                      style={{ animation: 'polarisRise .4s ease both' }}
                      className="flex w-full flex-col items-center justify-center py-10"
                    >
                      <svg
                        viewBox="0 0 200 100"
                        className="h-28 w-56 overflow-visible text-blue-500 drop-shadow-xl dark:text-sky-300 sm:h-32 sm:w-64"
                      >
                        <path
                          d="M 20 80 L 60 20 L 110 50 L 160 15 L 180 70"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="350"
                          strokeDashoffset="350"
                          style={{ animation: 'lineDrawBig 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
                        />
                        <circle cx="20" cy="80" r="3.5" fill="currentColor" style={{ animation: 'starPulse 2s infinite 0s', transformOrigin: '20px 80px' }} />
                        <circle cx="60" cy="20" r="4" fill="currentColor" style={{ animation: 'starPulse 2s infinite 0.4s', transformOrigin: '60px 20px' }} />
                        <circle cx="110" cy="50" r="5" fill="currentColor" style={{ animation: 'starPulse 2s infinite 0.8s', transformOrigin: '110px 50px' }} />
                        <circle cx="160" cy="15" r="3.5" fill="currentColor" style={{ animation: 'starPulse 2s infinite 1.2s', transformOrigin: '160px 15px' }} />
                        <circle cx="180" cy="70" r="4.5" fill="currentColor" style={{ animation: 'starPulse 2s infinite 1.6s', transformOrigin: '180px 70px' }} />
                      </svg>
                      <p
                        className="mt-6 text-[13px] font-bold tracking-widest text-blue-600 dark:text-sky-300"
                        style={{ animation: 'textGlow 1.2s ease-in-out infinite alternate' }}
                      >
                        데이터 간 연결망 분석 중...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 입력 컴포저 */}
            <div
              className={`w-full shrink-0 px-6 transition-all duration-500 ${
                started ? 'border-t border-slate-200 py-4 dark:border-white/[0.06]' : 'pb-2'
              }`}
            >
              <div className="mx-auto max-w-3xl">
                <div className="mb-2 flex justify-end">
                  <div className="relative inline-flex select-none rounded-full border border-slate-200 bg-white/70 p-0.5 text-[11px] font-medium backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                    <span
                      className="absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-blue-600 shadow-sm shadow-blue-600/30 transition-transform duration-300 ease-out"
                      style={{ transform: level === 'expert' ? 'translateX(100%)' : 'translateX(0)' }}
                    />
                    <button
                      onClick={() => setLevel('beginner')}
                      className={`relative z-10 w-12 rounded-full py-1 transition-colors ${
                        level === 'beginner' ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      초보
                    </button>
                    <button
                      onClick={() => setLevel('expert')}
                      className={`relative z-10 w-12 rounded-full py-1 transition-colors ${
                        level === 'expert' ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      전문가
                    </button>
                  </div>
                </div>

                <div className={`polaris-glow ${inputFocused || loading ? 'is-active' : ''}`}>
                  <div className="polaris-glow-inner flex items-end gap-2 bg-white p-2 dark:bg-[#0E0A24]">
                    <textarea
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder="공시나 종목에 대해 물어보세요…  (Shift+Enter 줄바꿈)"
                      className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || loading}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-center text-[11px] text-slate-400">
                  POLARIS는 공시 기반 정보를 제공하며 투자 판단의 책임은 본인에게 있습니다.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* ───────── 우측 DART 대시보드 ───────── */}
        <aside
          className={`shrink-0 overflow-hidden border-slate-200 bg-slate-50/70 backdrop-blur-xl transition-all duration-500 ease-out dark:border-white/[0.06] dark:bg-[#0B0820]/40 ${
            showRight ? 'w-2/5 border-l opacity-100' : 'w-0 border-l-0 opacity-0'
          }`}
        >
          <div className="flex h-full w-full min-w-[340px] flex-col">
            <div className="flex items-center border-b border-slate-200 px-3 pt-3 dark:border-white/[0.06]">
              <div className="flex flex-1">
                {TABS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`relative flex items-center gap-1.5 px-3 pb-3 text-sm font-medium transition ${
                      tab === key
                        ? 'text-blue-600 dark:text-sky-300'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                    {tab === key && (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500 dark:bg-sky-300" />
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setRightOpen(false)}
                className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="대시보드 접기"
                title="대시보드 접기"
              >
                <PanelRightClose size={17} />
              </button>
            </div>

            <div
              key={tab}
              style={{ animation: 'polarisFade 0.35s ease both' }}
              className="min-h-0 flex-1 overflow-y-auto p-5"
            >
              {tab === 'summary' && (
                <div className="space-y-2">
                  {DISCLOSURE_SUMMARIES.map((d, i) => (
                    <button
                      key={i}
                      className="block w-full rounded-xl border border-slate-200 bg-white/60 p-3 text-left transition hover:border-blue-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{d.company}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{d.date}</span>
                      </div>
                      <div className="mb-1 truncate text-xs font-medium text-blue-600 dark:text-sky-300">
                        {d.title}
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {d.summary}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'finance' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex gap-1 rounded-lg bg-slate-200/50 p-1 dark:bg-white/[0.04]">
                      {(['매출액', '영업이익'] as const).map((acc) => (
                        <button
                          key={acc}
                          onClick={() => setMetric(acc)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            metric === acc
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          {acc}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">단위: 억원</span>
                  </div>

                  <div className="mb-4 flex h-36 items-end justify-between gap-2 rounded-xl border border-slate-200 bg-white/60 px-3 pb-2 pt-3 dark:border-white/10 dark:bg-white/[0.03]">
                    {financeRows.map((r) => (
                      <div key={r.year} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-300">
                          {r.value.toLocaleString()}
                        </span>
                        <div className="flex w-full flex-1 items-end">
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400 transition-all duration-500"
                            style={{ height: `${(r.value / financeMax) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">{r.year}</span>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100/70 text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
                          <th className="px-3 py-2 text-left font-medium">사업연도</th>
                          <th className="px-3 py-2 text-left font-medium">계정</th>
                          <th className="px-3 py-2 text-right font-medium">값</th>
                          <th className="px-3 py-2 text-right font-medium">단위</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financeRows.map((r, i) => (
                          <tr
                            key={r.year}
                            className={
                              i % 2 ? 'bg-white/40 dark:bg-transparent' : 'bg-white/70 dark:bg-white/[0.02]'
                            }
                          >
                            <td className="px-3 py-2 tabular-nums">{r.year}</td>
                            <td className="px-3 py-2">{r.account}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              {r.value.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-400">{r.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ───── 기업 관계도 (Network Graph) ───── */}
              {tab === 'graph' && (
                <div>
                  <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    노드는 기업, 선은 공시에서 추출한 관계입니다. <span className="font-medium text-blue-600 dark:text-sky-300">연결선을 클릭</span>하면 해당 관계의 공시 원문 근거가 아래에 표시됩니다.
                  </p>

                  {/* 그래프 캔버스 */}
                  <div className="rounded-xl border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.02]">
                    <svg viewBox="0 0 360 290" className="h-[290px] w-full">
                      <defs>
                        <radialGradient id="nodeGrad" cx="35%" cy="30%" r="75%">
                          <stop offset="0%" stopColor="#bfdbfe" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </radialGradient>
                        {Object.entries(EDGE_STYLE).map(([type, { stroke }]) => (
                          <marker
                            key={type}
                            id={`arrow-${type}`}
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6.5"
                            markerHeight="6.5"
                            orient="auto-start-reverse"
                          >
                            <path d="M0,0 L10,5 L0,10 z" fill={stroke} />
                          </marker>
                        ))}
                      </defs>

                      {/* 배경 클릭 → 선택 해제 */}
                      <rect x="0" y="0" width="360" height="290" fill="transparent" onClick={() => setSelectedEdge(null)} />

                      {/* 엣지 */}
                      {GRAPH_DATA.edges.map((e, i) => {
                        const s = nodeById[e.source]
                        const t = nodeById[e.target]
                        const { x1, y1, x2, y2 } = trimLine(s, t)
                        const mx = (x1 + x2) / 2
                        const my = (y1 + y2) / 2
                        const st = EDGE_STYLE[e.type]
                        const active = selectedEdge === i
                        const len = Math.hypot(x2 - x1, y2 - y1)
                        const w = st.ko.length * 11 + 12
                        return (
                          <g key={i} className="cursor-pointer" onClick={() => setSelectedEdge(i)}>
                            {/* 넓은 투명 히트영역 */}
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
                            {/* 실제 선 (그리기 애니메이션) */}
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={st.stroke}
                              strokeWidth={active ? 3 : 1.6}
                              strokeOpacity={active ? 1 : selectedEdge === null ? 0.7 : 0.3}
                              strokeLinecap="round"
                              markerEnd={`url(#arrow-${e.type})`}
                              style={
                                {
                                  strokeDasharray: len,
                                  '--len': len,
                                  animation: `edgeDraw .9s ${0.15 * i + 0.1}s ease forwards`,
                                } as React.CSSProperties
                              }
                            />
                            {/* 라벨 */}
                            <g style={{ animation: `nodePop .4s ${0.6 + 0.1 * i}s both` }}>
                              <rect
                                x={mx - w / 2}
                                y={my - 9}
                                width={w}
                                height={18}
                                rx={9}
                                fill={st.stroke}
                                opacity={active ? 1 : 0.92}
                              />
                              <text x={mx} y={my + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#fff">
                                {st.ko}
                              </text>
                            </g>
                          </g>
                        )
                      })}

                      {/* 노드 */}
                      {GRAPH_DATA.nodes.map((n, i) => {
                        const r = NODE_R(n)
                        return (
                          <g key={n.id} style={{ animation: `nodePop .5s ${0.05 * i}s both`, transformOrigin: `${n.x}px ${n.y}px` }}>
                            {n.size === 'large' && (
                              <circle cx={n.x} cy={n.y} r={r + 9} fill="#60a5fa" opacity={0.18} />
                            )}
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={r}
                              fill="url(#nodeGrad)"
                              className="stroke-white/70 dark:stroke-white/30"
                              strokeWidth={1.5}
                            />
                            <text
                              x={n.x}
                              y={n.y + r + 13}
                              textAnchor="middle"
                              fontSize="10.5"
                              fontWeight="600"
                              className="fill-slate-700 dark:fill-slate-100"
                            >
                              {n.label}
                            </text>
                            <text
                              x={n.x}
                              y={n.y + r + 25}
                              textAnchor="middle"
                              fontSize="8.5"
                              className="fill-slate-400"
                            >
                              {n.category}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  </div>

                  {/* 범례 */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {Object.entries(EDGE_STYLE).map(([type, { ko, stroke }]) => (
                      <span key={type} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: stroke }} />
                        {ko}
                      </span>
                    ))}
                  </div>

                  {/* 인터랙티브 근거 패널 */}
                  <div className="mt-4">
                    {selectedEdge === null ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 p-4 text-center text-xs text-slate-400 dark:border-white/15 dark:bg-white/[0.02]">
                        그래프의 연결선을 클릭하면 해당 관계의 공시 원문 근거가 여기에 표시됩니다.
                      </div>
                    ) : (
                      (() => {
                        const e = GRAPH_DATA.edges[selectedEdge]
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/[0.03]" style={{ animation: 'polarisFade .3s ease both' }}>
                            <div className="mb-2 flex items-center gap-2">
                              <Link2 size={14} className="shrink-0 text-blue-500" />
                              <span className="text-sm font-semibold">
                                {e.source} <span className="text-slate-400">→</span> {e.target}
                              </span>
                            </div>
                            <div className="mb-2 flex items-center gap-1.5">
                              <span
                                className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
                                style={{ background: EDGE_STYLE[e.type].stroke }}
                              >
                                {EDGE_STYLE[e.type].ko}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">{e.type}</span>
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">· {e.label}</span>
                            </div>
                            <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-xs italic leading-relaxed text-slate-600 dark:border-white/20 dark:text-slate-300">
                              {e.evidence}
                            </blockquote>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                                  style={{ width: `${e.confidence * 100}%` }}
                                />
                              </div>
                              <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-300">
                                신뢰도 {Math.round(e.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}