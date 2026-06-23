import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu,
  X,
  Plus,
  Search,
  Trash2,
  Send,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  ExternalLink,
  GripVertical,
  LogOut,
  Network,
  BarChart2,
} from 'lucide-react'
import StarField from '../components/StarField'
import PolarisStar from '../components/PolarisStar'
import ThemeToggle from '../components/ThemeToggle'
import SettingsMenu from '../components/SettingsMenu'
import type { GNode, GEdge } from '../components/NetworkGraph'
import Constellation from '../components/Constellation'
import LoadingConstellation from '../components/LoadingConstellation'
import Markdown from '../components/Markdown'
import TypingMarkdown from '../components/TypingMarkdown'
import FinancialChart, { type FinancialGroup, stripFinancialTable, parseFinancialTable } from '../components/FinancialChart'
import { SourceList, dedupSources } from '../components/DocDrawer'
import { printReport, splitDigestByReport } from '../lib/print'
import { API_BASE, getUser, clearUser } from '../lib/auth'

/* ──────────────────────────────────────────────────────────────
   /app — POLARIS 워크스페이스
   · 가운데: 채팅 (응답 안의 표는 Markdown 컴포넌트가 직접 렌더링)
   · 오른쪽: 접히는 패널 — 관계도(Neo4j) / 원본 문서(MariaDB)
     두 데이터가 모두 없으면 패널·탭을 표시하지 않는다.
   ────────────────────────────────────────────────────────────── */

type Role = 'user' | 'assistant'
// 우측 패널 탭: 별자리(관계도) + 원본 문서 + 재무지표 차트
type PanelKey = 'constellation' | 'documents' | 'financials'

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
  financials?: FinancialGroup[]
  digest?: string
  // 답변 표시 후 별도 호출로 채우는 '핵심 사실 정리' — 받아오는 동안 true
  digestLoading?: boolean
  // 저장된 메시지 id (digest 후속 호출에 사용)
  serverId?: number
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
// 원본 문서 버튼에 표시할 건수 — 패널 '출처'(SourceList)와 동일하게 보고서 단위로
// 중복 제거한 수. 두 곳이 같은 dedupSources 기준을 쓰므로 숫자가 항상 일치한다.
const sourceCount = (m?: { documents?: DocItem[] }) => dedupSources(m?.documents ?? []).length
// 재무지표 차트: 백엔드 구조화 데이터(financials)나 답변 본문의 다년도 표 중 하나라도 있으면
const hasFinancials = (m?: { financials?: FinancialGroup[]; content?: string }) =>
  !!m?.financials?.length || !!(m?.content && parseFinancialTable(m.content))

// 새로고침해도 현재 대화를 유지하기 위해 활성 세션 ID 를 사용자별로 보관한다.
const sessionStorageKey = (uid?: string) => `polaris_session:${uid || 'anon'}`

// last_at(파이썬 datetime 문자열, 로컬시각) → epoch ms. 못 읽으면 0.
const parseTime = (iso: string): number => {
  const t = new Date((iso || '').replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : 0
}

// 현재 로컬시각을 백엔드 last_at 과 같은 'YYYY-MM-DD HH:MM:SS' 형식으로 — parseTime 이 그대로 읽는다.
// 낙관적으로 사이드바에 추가할 새 세션의 시간 표시(방금/오늘)를 정확히 맞추기 위함.
const nowLocalString = (): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 사이드바 행 우측에 표시할 상대 시간 — 방금 / N분 전 / N시간 전 / N일 전 / M월 D일
const relativeTime = (iso: string): string => {
  const t = parseTime(iso)
  if (!t) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const d = new Date(t)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

// 날짜 그룹 헤더 — 오늘 / 어제 / 지난 7일 / 지난 30일 / 이전
const GROUP_ORDER = ['오늘', '어제', '지난 7일', '지난 30일', '이전'] as const
const dateGroup = (iso: string): (typeof GROUP_ORDER)[number] => {
  const t = parseTime(iso)
  if (!t) return '이전'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 86400000
  if (t >= startToday) return '오늘'
  if (t >= startToday - DAY) return '어제'
  if (t >= startToday - 7 * DAY) return '지난 7일'
  if (t >= startToday - 30 * DAY) return '지난 30일'
  return '이전'
}

const GREETING: Message = {
  id: 0,
  role: 'assistant',
  content:
    '기업 정보를 그래프로 연결해 분석해 드려요. 궁금한 종목이나 공시 내용을 물어보세요.\n답을 기다리는 동안 잠깐 별멍도 좋아요.',
}

export default function ChatApp() {
  const navigate = useNavigate()
  const user = useMemo(() => getUser(), [])

  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  // 응답 대기 중인 세션 id(없으면 null). 전역 boolean 대신 세션별로 추적해야,
  // 로딩 중 다른 대화로 갔다 돌아와도 그 세션의 로딩 표시가 유지된다.
  const [loadingSid, setLoadingSid] = useState<string | null>(null)

  // 우측 패널 상태 (원본 문서 전용)
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<PanelKey>('documents')
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  // 방금 받은 답변만 타자기 효과로 노출 (복원 대화는 제외)
  const [typingId, setTypingId] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem(sessionStorageKey(user?.user_id)) || `session_${Date.now()}`,
  )
  // 항상 현재 세션 id 를 가리키는 ref — 응답이 도착했을 때 "지금 보고 있는 세션"과
  // 비교해 폐기 여부를 판단한다(떠났으면 버리고, 돌아와 있으면 그대로 반영).
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  const [panelWidth, setPanelWidth] = useState(() => Math.round(window.innerWidth * 0.35))
  // 드래그로 크기 조절 중엔 너비 transition 을 꺼서 끊김 없이 따라오게 한다
  const [dragging, setDragging] = useState(false)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const started = messages.some((m) => m.role === 'user')
  // 지금 보고 있는 세션이 응답 대기 중일 때만 로딩 표시
  const loading = loadingSid === sessionId

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
    setTypingId(null)
    // loading 표시는 세션별(loadingSid)이라 여기서 끄지 않는다 — 응답 대기 중인
    // 세션으로 돌아오면 로딩이 다시 보여야 한다.
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
        financials?: FinancialGroup[]
        digest?: string
      }[]
      const restored: Message[] = rows.map((r) => ({
        id: r.message_id,
        role: r.role,
        content: r.content,
        panel: r.panel,
        graph: r.graph || { nodes: [], edges: [] },
        documents: r.documents || [],
        financials: r.financials || [],
        digest: r.digest || '',
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
    setTypingId(null)
    setSessionId(`session_${Date.now()}`)
  }, [])

  // 대화 삭제 — 소유자 본인 것만(백엔드에서 user_id 로 검증). 보던 대화면 새 대화로.
  const deleteSession = useCallback(
    async (sid: string) => {
      if (!user) return
      if (!window.confirm('이 대화를 삭제할까요? 되돌릴 수 없습니다.')) return
      try {
        const res = await fetch(
          `${API_BASE}/api/sessions/${encodeURIComponent(sid)}?user_id=${encodeURIComponent(
            user.user_id,
          )}`,
          { method: 'DELETE' },
        )
        if (!res.ok) throw new Error(`${res.status}`)
        setSessions((prev) => prev.filter((s) => s.session_id !== sid))
        if (sid === sessionId) startNewChat()
      } catch (e) {
        console.error('대화 삭제 실패:', e)
      }
    },
    [user, sessionId, startNewChat],
  )

  // 검색 필터 + 날짜 그룹핑 (sessions 는 백엔드에서 이미 최신순이라 그룹 내 순서 유지)
  const groupedSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? sessions.filter((s) => s.title.toLowerCase().includes(q))
      : sessions
    const map = new Map<string, SessionItem[]>()
    for (const s of filtered) {
      const g = dateGroup(s.last_at)
      const arr = map.get(g)
      if (arr) arr.push(s)
      else map.set(g, [s])
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      items: map.get(g)!,
    }))
  }, [sessions, query])

  // 활성 세션 ID 보관 → 새로고침해도 같은 대화로 돌아온다.
  useEffect(() => {
    if (user) localStorage.setItem(sessionStorageKey(user.user_id), sessionId)
  }, [user, sessionId])

  // 첫 마운트 때 저장된 세션이 있으면 그 대화 기록을 복원(1회만).
  const didRestore = useRef(false)
  useEffect(() => {
    if (didRestore.current || !user) return
    didRestore.current = true
    const saved = localStorage.getItem(sessionStorageKey(user.user_id))
    if (saved) loadSession(saved)
  }, [user, loadSession])

  const handleLogout = useCallback(() => {
    clearUser()
    navigate('/', { replace: true })
  }, [navigate])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    setDragging(true)
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
      setDragging(false)
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
    if (hasGraph(activeData ?? undefined)) tabs.push('constellation')
    if (hasFinancials(activeData ?? undefined)) tabs.push('financials')
    if (hasDocs(activeData ?? undefined)) tabs.push('documents')
    return tabs
  }, [activeData])

  // 현재 탭이 더 이상 유효하지 않으면 첫 번째 가용 탭(별자리 우선)으로 보정.
  // openPanel 이 명시 지정한 탭은 유효하면 그대로 둔다.
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

  // 별자리 버튼: 이미 같은 메시지의 별자리가 열려 있으면 닫고, 아니면 연다
  const toggleConstellation = (msgId: number) => {
    if (rightOpen && activeMsgId === msgId && activePanel === 'constellation') {
      setRightOpen(false)
    } else {
      openPanel(msgId, 'constellation')
    }
  }

  // 원본 문서 버튼: 같은 메시지의 문서 탭이 열려 있으면 닫고, 아니면 연다
  const toggleDocuments = (msgId: number) => {
    if (rightOpen && activeMsgId === msgId && activePanel === 'documents') {
      setRightOpen(false)
    } else {
      openPanel(msgId, 'documents')
    }
  }

  // 재무지표 차트 버튼: 같은 메시지의 차트 탭이 열려 있으면 닫고, 아니면 연다
  const toggleFinancials = (msgId: number) => {
    if (rightOpen && activeMsgId === msgId && activePanel === 'financials') {
      setRightOpen(false)
    } else {
      openPanel(msgId, 'financials')
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !user) return

    // 이 요청이 속한 세션 — 응답 도착 시 같은 세션을 보고 있으면 반영, 떠나 있으면 버린다
    const sid = sessionId

    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: text }])
    setInput('')
    setLoadingSid(sid)

    // 새 채팅이면 응답을 기다리지 않고 사이드바에 즉시 추가한다(생성 중에도 보이도록).
    // 서버는 요청 시작 시점에 세션을 만들지만 목록 갱신은 응답 후라, 그 사이 새 채팅이
    // 사이드바에서 보이지 않던 공백을 메운다. 응답 후 refreshSessions 가 서버값으로 정합화.
    setSessions((prev) => {
      if (prev.some((s) => s.session_id === sid)) return prev // 기존 세션이면 그대로
      const title = text.length > 30 ? `${text.slice(0, 30)}…` : text
      return [
        { session_id: sid, title, preview: text.slice(0, 60), message_count: 1, last_at: nowLocalString() },
        ...prev,
      ]
    })

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.user_id,
          message: text,
          thread_id: sid,
          level: 'beginner',
        }),
      })
      if (!response.ok) throw new Error(`API 오류: ${response.status}`)

      const data = await response.json()
      // 응답을 기다리는 동안 다른 세션을 보고 있으면 이 결과는 버린다(서버엔 저장돼 재방문 시 복원됨)
      if (sessionIdRef.current !== sid) {
        refreshSessions()
        return
      }
      // data: { response, intent, panel, graph:{nodes,edges}, documents:[...], financials:[...], digest }
      const msgId = Date.now() + 1
      const graph: GraphData = data.graph || { nodes: [], edges: [] }
      const documents: DocItem[] = data.documents || []
      const financials: FinancialGroup[] = data.financials || []

      // digest(핵심 사실 정리)는 답변 표시 후 별도로 받아온다. 문서가 있으면 로딩 표시.
      const serverId: number = data.message_id || 0
      const willLoadDigest = !!serverId && documents.length > 0
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'assistant',
          content: data.response ?? '',
          panel: data.panel,
          graph,
          documents,
          financials,
          digest: data.digest || '',
          serverId,
          digestLoading: willLoadDigest,
        },
      ])
      // 이 답변을 타자기 효과 대상으로 지정
      setTypingId(msgId)

      // 관계도 → 별자리 탭, 원본 문서 → 문서 탭으로 우측 패널 자동 오픈
      if (graph.edges.length > 0) {
        openPanel(msgId, 'constellation')
      } else if (documents.length > 0) {
        openPanel(msgId, 'documents')
      }

      // 답변은 이미 표시됨 — 핵심 사실 정리는 백엔드가 LLM 으로 만든 뒤 채운다(비차단).
      if (willLoadDigest) {
        fetch(`${API_BASE}/api/chat/digest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: serverId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (sessionIdRef.current !== sid) return // 다른 세션을 보고 있으면 버린다
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, digest: (d && d.digest) || '', digestLoading: false } : m,
              ),
            )
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, digestLoading: false } : m)),
            )
          })
      }

      // 사이드바 목록 갱신(새 세션이면 새로 나타나고, 제목/시간 최신화)
      refreshSessions()
    } catch (error) {
      console.error('API 통신 실패:', error)
      // 보낸 세션을 떠났으면 에러 메시지를 남기지 않는다
      if (sessionIdRef.current === sid) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: '서버와 연결하는 중 오류가 발생했습니다. 백엔드가 켜져 있는지 확인해 주세요.',
          },
        ])
      }
      // 서버는 요청 시작 시 세션을 만들었을 수 있으니 목록을 서버값으로 맞춘다
      refreshSessions()
    } finally {
      // 이 요청이 끝났으니, 이 세션을 아직 대기 상태로 잡고 있으면 해제한다
      setLoadingSid((cur) => (cur === sid ? null : cur))
    }
  }

  const PANEL_META: Record<PanelKey, { label: string; icon: typeof FileText }> = {
    constellation: { label: '관계도', icon: Network },
    financials: { label: '재무지표 차트', icon: BarChart2 },
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="대화 검색"
              className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
                aria-label="검색어 지우기"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="no-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {sessions.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-400">아직 대화 기록이 없습니다.</p>
          )}
          {sessions.length > 0 && groupedSessions.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-400">검색 결과가 없습니다.</p>
          )}
          {groupedSessions.map(({ group, items }) => (
            <div key={group} className="mb-1">
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-slate-400">{group}</p>
              {items.map((s) => {
                const active = sessionId === s.session_id
                return (
                  <div
                    key={s.session_id}
                    className={`group relative flex w-full items-center rounded-lg transition ${
                      active
                        ? 'bg-blue-600/10 dark:bg-white/[0.08]'
                        : 'hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-500" />
                    )}
                    <button
                      onClick={() => loadSession(s.session_id)}
                      className="flex min-w-0 flex-1 items-center py-2 pl-2.5 pr-1 text-left"
                    >
                      <span className="block min-w-0 flex-1 truncate text-sm font-medium">
                        {s.title}
                      </span>
                    </button>
                    {/* 평소엔 상대시간, hover 시 삭제 버튼으로 교체 */}
                    <span className="shrink-0 pr-2.5 text-[11px] text-slate-400 group-hover:hidden">
                      {relativeTime(s.last_at)}
                    </span>
                    <button
                      onClick={() => deleteSession(s.session_id)}
                      className="hidden shrink-0 place-items-center py-2 pl-1 pr-2.5 text-slate-400 transition hover:text-red-500 group-hover:grid"
                      title="대화 삭제"
                      aria-label="대화 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
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
              <SettingsMenu />
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
                  {messages.map((m) => {
                    if (m.role === 'user') {
                      return (
                        <div key={m.id} style={{ animation: 'polarisRise .4s ease both' }} className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-lg shadow-blue-600/20">
                            {m.content}
                          </div>
                        </div>
                      )
                    }
                    // 재무 표는 아래 차트로 대체하므로 답변 본문에서는 제거
                    const displayText = stripFinancialTable(m.content)
                    return (
                      <div key={m.id} style={{ animation: 'polarisRise .4s ease both' }} className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-blue-600 text-white shadow-md shadow-blue-500/30">
                          <PolarisStar size={18} />
                        </span>
                        <div className="flex w-full min-w-0 max-w-[85%] flex-col items-start gap-2">

                          {/* ── AI 답변 버블 ── */}
                          <div className="w-full rounded-2xl rounded-tl-sm border border-slate-200 bg-white/70 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
                            {typingId === m.id ? (
                              <TypingMarkdown
                                text={displayText}
                                onTick={() =>
                                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
                                }
                                onDone={() => setTypingId(null)}
                              />
                            ) : (
                              <Markdown text={displayText} />
                            )}
                          </div>

                          {/* 근거 버튼들 — 타이핑 끝난 뒤 노출. 우측 패널 탭을 연다 */}
                          {typingId !== m.id && (hasDocs(m) || hasGraph(m) || hasFinancials(m)) && (
                            <div className="flex w-full flex-wrap justify-end gap-1.5">
                              {hasGraph(m) && (
                                <button
                                  onClick={() => toggleConstellation(m.id)}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                                    rightOpen && activeMsgId === m.id && activePanel === 'constellation'
                                      ? 'border-indigo-400 bg-indigo-100 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/20 dark:text-indigo-200'
                                      : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:hover:bg-indigo-400/20'
                                  }`}
                                >
                                  <Network size={12} /> 관계도
                                </button>
                              )}
                              {hasFinancials(m) && (
                                <button
                                  onClick={() => toggleFinancials(m.id)}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                                    rightOpen && activeMsgId === m.id && activePanel === 'financials'
                                      ? 'border-blue-400 bg-blue-100 text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/20 dark:text-blue-200'
                                      : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20'
                                  }`}
                                >
                                  <BarChart2 size={12} /> 재무지표 차트
                                </button>
                              )}
                              {hasDocs(m) && (
                                <button
                                  onClick={() => toggleDocuments(m.id)}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                                    rightOpen && activeMsgId === m.id && activePanel === 'documents'
                                      ? 'border-sky-400 bg-sky-100 text-sky-700 dark:border-sky-400/40 dark:bg-sky-400/20 dark:text-sky-200'
                                      : 'border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-300 dark:hover:bg-sky-300/20'
                                  }`}
                                >
                                  <FileText size={11} /> 원본 문서 {sourceCount(m)}건
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {loading && <LoadingConstellation />}
                </div>
              </div>
            )}

            {/* 입력 컴포저 */}
            <div
              className={`w-full shrink-0 border-t px-6 transition-all duration-500 ${
                started
                  ? 'border-slate-200 py-4 dark:border-white/[0.06]'
                  : 'border-transparent pb-2'
              }`}
            >
              <div className="mx-auto max-w-3xl">
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
                      placeholder="궁금한 기업의 정보에 대해 물어보세요…"
                      className="no-scrollbar max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none"
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
            title="드래그하여 패널 너비 조절"
            className="group relative z-20 w-2 shrink-0 cursor-col-resize"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-slate-200 transition-colors group-hover:bg-blue-400 dark:bg-white/10 dark:group-hover:bg-blue-400/50" />
            {/* 드래그 가능 표시 — 가운데 그립 잡이 */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 grid h-9 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors group-hover:border-blue-400 group-hover:text-blue-500 dark:border-white/10 dark:bg-[#0B0820] dark:text-slate-500 dark:group-hover:border-blue-400/50">
              <GripVertical size={13} />
            </div>
          </div>
        )}

        {/* ───────── 우측 분석 패널 ───────── */}
        <aside
          style={{ width: showRight ? panelWidth : 0 }}
          className={`shrink-0 overflow-hidden border-slate-200 bg-slate-50/70 backdrop-blur-xl ease-out dark:border-white/[0.06] dark:bg-[#0B0820]/40 ${
            dragging ? '' : 'transition-all duration-500'
          } ${showRight ? 'border-l opacity-100' : 'border-l-0 opacity-0'}`}
        >
          <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 pt-3 dark:border-white/[0.06]">
              {/* 탭바 — 가용 탭이 2개 이상일 때만 노출 */}
              <div className="mb-1 flex items-center gap-1">
                {availableTabs.map((tab) => {
                  const Icon = PANEL_META[tab].icon
                  const active = activePanel === tab
                  return (
                    <button
                      key={tab}
                      onClick={() => setActivePanel(tab)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                        active
                          ? 'bg-slate-200/80 text-slate-700 dark:bg-white/10 dark:text-slate-100'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/[0.06] dark:hover:text-slate-300'
                      }`}
                    >
                      <Icon size={13} /> {PANEL_META[tab].label}
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
              className={`no-scrollbar min-h-0 flex-1 ${
                activePanel === 'constellation'
                  ? 'overflow-hidden'
                  : 'overflow-y-auto p-5'
              }`}
            >
              {/* ───── 별자리 (관계도) ───── */}
              {activePanel === 'constellation' && activeData?.graph && (
                hasGraph(activeData) ? (
                  <Constellation
                    nodes={activeData.graph.nodes}
                    edges={activeData.graph.edges}
                    panelMode
                  />
                ) : (
                  <p className="p-5 text-xs text-slate-400">조회된 관계도 데이터가 없습니다.</p>
                )
              )}

              {/* ───── 재무지표 차트 (차트마다 PNG 저장 버튼은 컴포넌트 내부) ───── */}
              {activePanel === 'financials' && (
                hasFinancials(activeData ?? undefined) ? (
                  <FinancialChart
                    financials={activeData?.financials ?? []}
                    sourceText={activeData?.content}
                    panelMode
                  />
                ) : (
                  <p className="text-xs text-slate-400">표시할 재무지표가 없습니다.</p>
                )
              )}

              {/* ───── 원본 문서 ───── */}
              {activePanel === 'documents' && (
                hasDocs(activeData ?? undefined) ? (
                  <>
                    {/* AI가 정리한 원문 — 보고서별 카드, 각 보고서를 개별 PDF로 추출 */}
                    {(!!activeData?.digest || activeData?.digestLoading) && (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                          <PolarisStar size={13} className="text-indigo-500" />
                          AI가 정리한 원문
                        </div>
                        {activeData?.digest ? (
                          <div className="space-y-2.5">
                            {splitDigestByReport(activeData.digest).map((sec, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-700 shadow-sm dark:border-slate-300/30 dark:bg-slate-100 dark:text-slate-800"
                              >
                                <div className="mb-1.5 flex items-start justify-between gap-2">
                                  <span className="min-w-0 flex-1 text-[12.5px] font-semibold">
                                    {sec.title ? (
                                      sec.url ? (
                                        <a
                                          href={sec.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sky-600 underline decoration-sky-300 underline-offset-2 hover:text-sky-700 dark:text-sky-700"
                                        >
                                          {sec.title}
                                        </a>
                                      ) : (
                                        sec.title
                                      )
                                    ) : (
                                      '정리된 원문'
                                    )}
                                  </span>
                                  <button
                                    onClick={() =>
                                      printReport({
                                        title:
                                          sec.title ||
                                          `${activeData?.documents?.[0]?.corp_name || 'POLARIS'} 보고서`,
                                        digest: sec.body,
                                        sources: sec.url ? [{ name: sec.title, url: sec.url }] : [],
                                      })
                                    }
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 transition hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-400/20 dark:text-rose-700"
                                    title="이 보고서의 정리 원문을 PDF로 저장 (인쇄 → PDF)"
                                  >
                                    <FileText size={10} /> PDF
                                  </button>
                                </div>
                                <Markdown text={sec.body} gridTable />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-300/30 dark:bg-slate-100">
                            <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
                              <PolarisStar size={12} className="animate-pulse text-indigo-400" />
                              원문을 정리하는 중…
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* 출처 — 보고서명 + DART 링크 버튼만 간단히 */}
                    <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                      <FileText size={13} className="text-sky-500" />
                      출처
                    </div>
                    <SourceList docs={activeData!.documents!} />
                  </>
                ) : (
                  <p className="text-xs text-slate-400">조회된 원본 문서가 없습니다.</p>
                )
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
