import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Menu,
  X,
  Plus,
  Search,
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  Network,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import StarField from '../components/StarField'
import ThemeToggle from '../components/ThemeToggle'
import NetworkGraph, { edgeKey } from '../components/NetworkGraph'
import type { GNode, GEdge } from '../components/NetworkGraph'
import Markdown from '../components/Markdown'

/* ──────────────────────────────────────────────────────────────
   /app — POLARIS 워크스페이스
   · 가운데: 채팅 (응답 안의 표는 Markdown 컴포넌트가 직접 렌더링)
   · 오른쪽: 접히는 패널 — 관계도(Neo4j) / 원본 문서(MariaDB)
     두 데이터가 모두 없으면 패널·탭을 표시하지 않는다.
   ────────────────────────────────────────────────────────────── */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '/api'

type Role = 'user' | 'assistant'
type PanelKey = 'graph' | 'documents'
type Level = 'beginner' | 'expert'

interface GraphData {
  nodes: GNode[]
  edges: GEdge[]
}
interface DocItem {
  rcept_no: string
  chunk_id: string
  corp_name: string
  title: string
  doc_type: string
  date: string
  summary: string
  section_path: string
  year: number | null
  score: number | null
  text: string
  source_kind: string
}
interface Message {
  id: number
  role: Role
  content: string
  panel?: string
  graph?: GraphData
  documents?: DocItem[]
}
interface ChatItem {
  id: number
  title: string
  preview: string
  date: string
}

const REL_COLOR: Record<string, string> = {
  IS_SUBSIDIARY_OF: '#60a5fa',
  EXECUTIVE_OF: '#f472b6',
  IS_MAJOR_SHAREHOLDER_OF: '#34d399',
  SUPPLIES_TO: '#60a5fa',
  ACQUIRES: '#f472b6',
  INVESTS: '#34d399',
}
const relColor = (t: string) => REL_COLOR[t] || '#94a3b8'

const hasGraph = (m?: { graph?: GraphData }) => !!m?.graph?.edges?.length
const hasDocs = (m?: { documents?: DocItem[] }) => !!m?.documents?.length

/* ── 데모용 사이드바 기록 (대화 목록은 별도 백엔드 연동 전까지 정적) ── */
const CHAT_HISTORY: ChatItem[] = [
  { id: 1, title: '한빛전자 공급계약 영향 분석', preview: '단일판매·공급계약 체결 공시…', date: '오늘' },
  { id: 2, title: '서연바이오 유상증자 해석', preview: '주주배정 후 실권주 일반공모…', date: '오늘' },
  { id: 3, title: '누리소프트 최대주주 변경', preview: '경영권 양수도 계약 체결로…', date: '어제' },
  { id: 4, title: '반도체 밸류체인 정리', preview: '소부장 공급망 2-hop 추적…', date: '3일 전' },
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
  const [level, setLevel] = useState<Level>('beginner')

  // 우측 패널 상태
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<PanelKey>('graph')
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null)
  const [openDoc, setOpenDoc] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const threadId = useRef(`session_${Date.now()}`)

  const started = messages.some((m) => m.role === 'user')

  // 현재 패널이 보여줄 데이터(특정 메시지 기준)
  const activeData = useMemo(
    () => messages.find((m) => m.id === activeMsgId) ?? null,
    [messages, activeMsgId],
  )
  const availableTabs = useMemo<PanelKey[]>(() => {
    const tabs: PanelKey[] = []
    if (hasGraph(activeData ?? undefined)) tabs.push('graph')
    if (hasDocs(activeData ?? undefined)) tabs.push('documents')
    return tabs
  }, [activeData])

  // 사용 가능한 탭이 바뀌면 activePanel 보정
  useEffect(() => {
    if (availableTabs.length && !availableTabs.includes(activePanel)) {
      setActivePanel(availableTabs[0])
    }
  }, [availableTabs, activePanel])

  const showRight = started && rightOpen && availableTabs.length > 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const openPanel = (msgId: number, panel: PanelKey) => {
    setActiveMsgId(msgId)
    setActivePanel(panel)
    setSelectedEdgeKey(null)
    setOpenDoc(null)
    setRightOpen(true)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'user_123',
          message: text,
          thread_id: threadId.current,
          level,
        }),
      })
      if (!response.ok) throw new Error(`API 오류: ${response.status}`)

      const data = await response.json()
      // data: { response, intent, panel, graph:{nodes,edges}, documents:[...] }
      const msgId = Date.now() + 1
      const graph: GraphData = data.graph || { nodes: [], edges: [] }
      const documents: DocItem[] = data.documents || []

      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'assistant',
          content: data.response ?? '',
          panel: data.panel,
          graph,
          documents,
        },
      ])

      // 데이터가 있으면 우측 패널 자동 오픈
      const gOk = graph.edges.length > 0
      const dOk = documents.length > 0
      if (gOk || dOk) {
        const target: PanelKey = data.panel === 'documents' ? 'documents' : gOk ? 'graph' : 'documents'
        openPanel(msgId, target)
      }
    } catch (error) {
      console.error('API 통신 실패:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: '서버와 연결하는 중 오류가 발생했습니다. 백엔드가 켜져 있는지 확인해 주세요.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const PANEL_META: Record<PanelKey, { label: string; icon: typeof FileText }> = {
    graph: { label: '기업 관계도', icon: Network },
    documents: { label: '원본 문서', icon: FileText },
  }

  // 그래프 탭에서 선택된 엣지 → 근거 문서 매칭
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeKey || !activeData?.graph) return null
    const idx = activeData.graph.edges.findIndex((e, i) => edgeKey(e, i) === selectedEdgeKey)
    return idx >= 0 ? activeData.graph.edges[idx] : null
  }, [selectedEdgeKey, activeData])

  const evidenceDoc = useMemo(() => {
    if (!selectedEdge?.rcept_no || !activeData?.documents) return null
    return activeData.documents.find((d) => d.rcept_no === selectedEdge.rcept_no) ?? null
  }, [selectedEdge, activeData])

  return (
    <div className="relative h-screen overflow-hidden bg-white text-slate-900 transition-colors duration-500 dark:bg-[#0B0820] dark:text-white">
      <style>{`
        @keyframes polarisFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes polarisRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes polarisSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}
        @keyframes lineDrawBig { 0% { stroke-dashoffset: 350; } 100% { stroke-dashoffset: 0; } }
        @keyframes starPulse { 0%,100% { opacity:.3; transform:scale(.8); } 50% { opacity:1; transform:scale(1.4); } }
        @keyframes textGlow { 0% { opacity:.5; filter:drop-shadow(0 0 2px currentColor); } 100% { opacity:1; filter:drop-shadow(0 0 8px currentColor); } }

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
          <button
            onClick={() => {
              setMessages([GREETING])
              setActiveMsgId(null)
              setRightOpen(false)
              setDrawerOpen(false)
              threadId.current = `session_${Date.now()}`
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700"
          >
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

      {/* ───────── 메인 화면 (중앙 + 우측 패널) ───────── */}
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
            <div className="ml-auto flex items-center gap-1.5">
              {started && !rightOpen && availableTabs.length > 0 && (
                <button
                  onClick={() => setRightOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="패널 열기"
                  title="분석 패널 열기"
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
                        <div className="flex w-full min-w-0 max-w-[85%] flex-col items-start gap-2">
                          <div className="w-full rounded-2xl rounded-tl-sm border border-slate-200 bg-white/70 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                            <Markdown text={m.content} />
                          </div>
                          {(hasGraph(m) || hasDocs(m)) && (
                            <div className="flex flex-wrap gap-2">
                              {hasGraph(m) && (
                                <button
                                  onClick={() => openPanel(m.id, 'graph')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-300 dark:hover:bg-sky-300/20"
                                >
                                  <Network size={13} /> 관계도 보기
                                </button>
                              )}
                              {hasDocs(m) && (
                                <button
                                  onClick={() => openPanel(m.id, 'documents')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-300 dark:hover:bg-sky-300/20"
                                >
                                  <FileText size={13} /> 원본 문서 {m.documents!.length}건
                                </button>
                              )}
                            </div>
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

        {/* ───────── 우측 분석 패널 ───────── */}
        <aside
          className={`shrink-0 overflow-hidden border-slate-200 bg-slate-50/70 backdrop-blur-xl transition-all duration-500 ease-out dark:border-white/[0.06] dark:bg-[#0B0820]/40 ${
            showRight ? 'w-2/5 border-l opacity-100' : 'w-0 border-l-0 opacity-0'
          }`}
        >
          <div className="flex h-full w-full min-w-[360px] flex-col">
            <div className="flex items-center border-b border-slate-200 px-3 pt-3 dark:border-white/[0.06]">
              <div className="flex flex-1">
                {availableTabs.map((key) => {
                  const { label, icon: Icon } = PANEL_META[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setActivePanel(key)}
                      className={`relative flex items-center gap-1.5 px-3 pb-3 text-sm font-medium transition ${
                        activePanel === key
                          ? 'text-blue-600 dark:text-sky-300'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                      {key === 'documents' && activeData?.documents && (
                        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          {activeData.documents.length}
                        </span>
                      )}
                      {activePanel === key && (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500 dark:bg-sky-300" />
                      )}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setRightOpen(false)}
                className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="패널 접기"
                title="패널 접기"
              >
                <PanelRightClose size={17} />
              </button>
            </div>

            <div
              key={activePanel}
              style={{ animation: 'polarisFade 0.35s ease both' }}
              className="min-h-0 flex-1 overflow-y-auto p-5"
            >
              {/* ───── 기업 관계도 ───── */}
              {activePanel === 'graph' && activeData?.graph && (
                <div>
                  <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    노드는 기업, 선은 공시에서 추출한 관계입니다.{' '}
                    <span className="font-medium text-blue-600 dark:text-sky-300">연결선을 클릭</span>하면
                    해당 관계의 근거 공시가 아래에 표시됩니다.
                  </p>

                  <div className="rounded-xl border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.02]">
                    <NetworkGraph
                      nodes={activeData.graph.nodes}
                      edges={activeData.graph.edges}
                      selectedKey={selectedEdgeKey}
                      onSelectEdge={setSelectedEdgeKey}
                    />
                  </div>

                  {/* 범례 */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {Array.from(new Set(activeData.graph.edges.map((e) => e.type))).map((type) => {
                      const e = activeData.graph!.edges.find((x) => x.type === type)
                      return (
                        <span key={type} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: relColor(type) }} />
                          {e?.label || type}
                        </span>
                      )
                    })}
                  </div>

                  {/* 선택된 엣지 근거 */}
                  <div className="mt-4">
                    {!selectedEdge ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 p-4 text-center text-xs text-slate-400 dark:border-white/15 dark:bg-white/[0.02]">
                        그래프의 연결선을 클릭하면 해당 관계의 근거 공시가 여기에 표시됩니다.
                      </div>
                    ) : (
                      <div
                        className="rounded-xl border border-slate-200 bg-white/60 p-3.5 dark:border-white/10 dark:bg-white/[0.03]"
                        style={{ animation: 'polarisFade .3s ease both' }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Link2 size={14} className="shrink-0 text-blue-500" />
                          <span className="text-sm font-semibold">
                            {selectedEdge.source} <span className="text-slate-400">→</span> {selectedEdge.target}
                          </span>
                        </div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <span
                            className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
                            style={{ background: relColor(selectedEdge.type) }}
                          >
                            {selectedEdge.label}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{selectedEdge.type}</span>
                        </div>
                        {selectedEdge.rcept_no ? (
                          evidenceDoc ? (
                            <button
                              onClick={() => {
                                setActivePanel('documents')
                                setOpenDoc(evidenceDoc.chunk_id || evidenceDoc.rcept_no)
                              }}
                              className="mt-1 flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 text-left transition hover:border-blue-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
                            >
                              <FileText size={14} className="mt-0.5 shrink-0 text-blue-500" />
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-medium">
                                  {evidenceDoc.title || evidenceDoc.doc_type || '근거 공시'}
                                </span>
                                <span className="block truncate text-[10px] text-slate-400">
                                  {evidenceDoc.corp_name} · 접수번호 {selectedEdge.rcept_no} · 원본 보기 →
                                </span>
                              </span>
                            </button>
                          ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              근거 공시 접수번호: <span className="font-mono">{selectedEdge.rcept_no}</span>
                            </p>
                          )
                        ) : (
                          <p className="text-xs text-slate-400">이 관계에는 연결된 근거 공시가 없습니다.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ───── 원본 문서 ───── */}
              {activePanel === 'documents' && activeData?.documents && (
                <div className="space-y-2">
                  {activeData.documents.length === 0 && (
                    <p className="text-xs text-slate-400">조회된 원본 문서가 없습니다.</p>
                  )}
                  {activeData.documents.map((d, i) => {
                    const id = d.chunk_id || d.rcept_no || String(i)
                    const expanded = openDoc === id
                    return (
                      <div
                        key={id}
                        className="rounded-xl border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <button
                          onClick={() => setOpenDoc(expanded ? null : id)}
                          className="flex w-full items-start gap-2 p-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="mb-1 flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold">{d.corp_name || '기업'}</span>
                              {d.date && (
                                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{d.date}</span>
                              )}
                            </span>
                            {(d.title || d.doc_type) && (
                              <span className="mb-1 block truncate text-xs font-medium text-blue-600 dark:text-sky-300">
                                {d.title || d.doc_type}
                              </span>
                            )}
                            {d.summary && (
                              <span className="line-clamp-2 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                {d.summary}
                              </span>
                            )}
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {d.section_path && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                  {d.section_path}
                                </span>
                              )}
                              {d.rcept_no && (
                                <span className="font-mono text-[10px] text-slate-400">#{d.rcept_no}</span>
                              )}
                              {typeof d.score === 'number' && (
                                <span className="text-[10px] text-slate-400">
                                  유사도 {(d.score * 100).toFixed(0)}
                                </span>
                              )}
                            </span>
                          </span>
                          {d.text && (
                            <ChevronDown
                              size={16}
                              className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${
                                expanded ? 'rotate-180' : ''
                              }`}
                            />
                          )}
                        </button>
                        {expanded && d.text && (
                          <div
                            className="border-t border-slate-200 px-3 py-3 dark:border-white/10"
                            style={{ animation: 'polarisFade .25s ease both' }}
                          >
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                              <ExternalLink size={12} /> 원본 본문
                            </p>
                            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              {d.text}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
