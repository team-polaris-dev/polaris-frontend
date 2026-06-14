import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu,
  X,
  Plus,
  Search,
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  ExternalLink,
  LogOut,
} from 'lucide-react'
import StarField from '../components/StarField'
import ThemeToggle from '../components/ThemeToggle'
import type { GNode, GEdge } from '../components/NetworkGraph'
import Constellation from '../components/Constellation'
import LoadingConstellation from '../components/LoadingConstellation'
import Markdown from '../components/Markdown'
import { API_BASE, getUser, clearUser } from '../lib/auth'

/* ──────────────────────────────────────────────────────────────
   /app — POLARIS 워크스페이스
   · 가운데: 채팅 (응답 안의 표는 Markdown 컴포넌트가 직접 렌더링)
   · 오른쪽: 접히는 패널 — 관계도(Neo4j) / 원본 문서(MariaDB)
     두 데이터가 모두 없으면 패널·탭을 표시하지 않는다.
   ────────────────────────────────────────────────────────────── */

type Role = 'user' | 'assistant'
// 우측 패널은 '원본 문서'만 — 관계도는 채팅 중앙에 별자리로 인라인 표시한다.
type PanelKey = 'documents'
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
interface SessionItem {
  session_id: string
  title: string
  preview: string
  message_count: number
  last_at: string
}

const hasGraph = (m?: { graph?: GraphData }) => !!m?.graph?.edges?.length
const hasDocs = (m?: { documents?: DocItem[] }) => !!m?.documents?.length

// DART 공식 공시 뷰어 URL — 14자리 접수번호(rcept_no)로 결정적으로 만들 수 있다.
const dartUrl = (rceptNo: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`

const GREETING: Message = {
  id: 0,
  role: 'assistant',
  content:
    '안녕하세요, POLARIS입니다. 기업 공시와 뉴스를 그래프로 연결해 분석해 드려요. 궁금한 종목이나 공시 내용을 물어보세요.',
}

export default function ChatApp() {
  const navigate = useNavigate()
  const user = useMemo(() => getUser(), [])

  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState<Level>('beginner')

  // 우측 패널 상태 (원본 문서 전용)
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<PanelKey>('documents')
  const [openDoc, setOpenDoc] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [sessionId, setSessionId] = useState(() => `session_${Date.now()}`)
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth * 0.4))
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const started = messages.some((m) => m.role === 'user')

  // 로그인 안 했으면 진입 화면으로 돌려보낸다
  useEffect(() => {
    if (!user) navigate('/', { replace: true })
  }, [user, navigate])

  // 사이드바 세션 목록 새로고침
  const refreshSessions = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`${API_BASE}/api/sessions?user_id=${encodeURIComponent(user.user_id)}`)
      if (!res.ok) return
      setSessions((await res.json()) as SessionItem[])
    } catch (e) {
      console.error('세션 목록 조회 실패:', e)
    }
  }, [user])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  // 사이드바에서 과거 세션 선택 → 메시지 기록 복원
  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid)
    setDrawerOpen(false)
    setActiveMsgId(null)
    setRightOpen(false)
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}/messages`)
      if (!res.ok) throw new Error(`${res.status}`)
      const rows = (await res.json()) as {
        message_id: number
        role: Role
        content: string
        panel?: string
        graph?: GraphData
        documents?: DocItem[]
      }[]
      // 패널 데이터(관계도/원본문서)도 함께 복원해 우측 패널 버튼을 되살린다.
      const restored: Message[] = rows.map((r) => ({
        id: r.message_id,
        role: r.role,
        content: r.content,
        panel: r.panel,
        graph: r.graph || { nodes: [], edges: [] },
        documents: r.documents || [],
      }))
      setMessages(restored.length ? [GREETING, ...restored] : [GREETING])
    } catch (e) {
      console.error('대화 복원 실패:', e)
      setMessages([GREETING])
    }
  }, [])

  // 새 대화 시작
  const startNewChat = useCallback(() => {
    setMessages([GREETING])
    setActiveMsgId(null)
    setRightOpen(false)
    setDrawerOpen(false)
    setSessionId(`session_${Date.now()}`)
  }, [])

  const handleLogout = useCallback(() => {
    clearUser()
    navigate('/', { replace: true })
  }, [navigate])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX
      const next = Math.min(Math.max(dragStartWidth.current + delta, 280), window.innerWidth * 0.65)
      setPanelWidth(Math.round(next))
    }
    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // 현재 패널이 보여줄 데이터(특정 메시지 기준)
  const activeData = useMemo(
    () => messages.find((m) => m.id === activeMsgId) ?? null,
    [messages, activeMsgId],
  )
  const availableTabs = useMemo<PanelKey[]>(() => {
    const tabs: PanelKey[] = []
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
    setOpenDoc(null)
    setRightOpen(true)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !user) return

    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.user_id,
          message: text,
          thread_id: sessionId,
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

      // 원본 문서가 있으면 우측 패널 자동 오픈 (관계도는 중앙 별자리로 표시)
      if (documents.length > 0) {
        openPanel(msgId, 'documents')
      }

      // 사이드바 목록 갱신(새 세션이면 새로 나타나고, 제목/시간 최신화)
      refreshSessions()
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
    documents: { label: '원본 문서', icon: FileText },
  }

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
            onClick={startNewChat}
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
        <div className="no-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            최근 대화
          </p>
          {sessions.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-400">아직 대화 기록이 없습니다.</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.session_id}
              onClick={() => loadSession(s.session_id)}
              className={`group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                sessionId === s.session_id
                  ? 'bg-blue-600/10 dark:bg-white/[0.08]'
                  : 'hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <MessageSquare
                size={15}
                className={`mt-0.5 shrink-0 ${
                  sessionId === s.session_id ? 'text-blue-500' : 'text-slate-400'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="block truncate text-xs text-slate-400">{s.preview}</span>
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">{s.message_count}</span>
            </button>
          ))}
        </div>

        {/* 로그인 사용자 + 로그아웃 */}
        {user && (
          <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/[0.08]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-blue-600 text-xs font-bold text-white">
              {user.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.display_name}</span>
            <button
              onClick={handleLogout}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-red-500 dark:hover:bg-white/10"
              title="로그아웃"
              aria-label="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
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
                <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
                  {user ? `${user.display_name}님, 무엇이 궁금하신가요?` : '무엇이 궁금하신가요?'}
                </h1>
                <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                  기업 공시·뉴스를 그래프로 연결해 분석해 드려요. 종목명이나 공시 내용을 입력해 보세요.
                </p>
              </div>
            )}

            {started && (
              <div ref={scrollRef} className="no-scrollbar min-h-0 w-full flex-1 overflow-y-auto px-6 py-8">
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
                          {/* 관계도 결과 → 배경 별과 이어지는 별자리 공급망으로 인라인 표시 */}
                          {hasGraph(m) && (
                            <Constellation nodes={m.graph!.nodes} edges={m.graph!.edges} />
                          )}
                          {hasDocs(m) && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openPanel(m.id, 'documents')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-300 dark:hover:bg-sky-300/20"
                              >
                                <FileText size={13} /> 원본 문서 {m.documents!.length}건
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}

                  {loading && <LoadingConstellation />}
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

        {/* ───────── 드래그 핸들 ───────── */}
        {showRight && (
          <div
            onMouseDown={onResizeStart}
            className="group relative z-20 w-2 shrink-0 cursor-col-resize"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-slate-200 transition-colors group-hover:bg-blue-400 dark:bg-white/10 dark:group-hover:bg-blue-400/50" />
          </div>
        )}

        {/* ───────── 우측 분석 패널 ───────── */}
        <aside
          style={{ width: showRight ? panelWidth : 0 }}
          className={`shrink-0 overflow-hidden border-slate-200 bg-slate-50/70 backdrop-blur-xl transition-opacity duration-500 ease-out dark:border-white/[0.06] dark:bg-[#0B0820]/40 ${
            showRight ? 'border-l opacity-100' : 'border-l-0 opacity-0'
          }`}
        >
          <div className="flex h-full w-full flex-col">
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
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5"
            >
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
                        {/* DART 원문 링크 — 접수번호가 있으면 공식 뷰어로 새 탭 열기 */}
                        {d.rcept_no && (
                          <a
                            href={dartUrl(d.rcept_no)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 border-t border-slate-200 px-3 py-2 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 dark:border-white/10 dark:text-sky-300 dark:hover:bg-white/[0.04]"
                          >
                            <ExternalLink size={12} /> DART 원문 보기
                          </a>
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
