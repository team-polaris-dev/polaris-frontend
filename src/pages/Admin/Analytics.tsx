import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  Clock,
  Gauge,
  MessageSquare,
  Users,
  X,
} from 'lucide-react'

import {
  useAnalyticsIntents,
  useAnalyticsLatency,
  useAnalyticsOverview,
  useAnalyticsSession,
  useAnalyticsSessions,
  useAnalyticsTools,
  useAnalyticsUsers,
  useAnalyticsVolume,
} from '../../lib/hooks/useJob'
import type { RecentSession, VolumePoint } from '../../lib/api/types'

// ===== 표시 상수 =====
const BLUE = '#2563eb'
const EMERALD = '#10b981'
const AMBER = '#f59e0b'
const VIOLET = '#8b5cf6'
const ROSE = '#ef4444'
const INTENT_COLORS = [
  BLUE, EMERALD, AMBER, VIOLET, '#ec4899', '#06b6d4',
  ROSE, '#84cc16', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
]

// intent 코드 → 한국어 라벨. 미정의 값은 원문 그대로(tickFormatter fallback).
const INTENT_LABELS: Record<string, string> = {
  ctx: '정보검색(RAG)',
  direct: '단순응답',
  global: '업계/매크로',
  unknown: '미분류',
  // 과거 호환 (백엔드에서 더 이상 나오지 않더라도 잔존 데이터 가독성용)
  dart_lookup: '공시 조회',
  finance_compare: '재무 비교',
  supply_chain: '공급망',
  graph_query: '관계망 조회',
  company_profile: '기업 개요',
  small_talk: '잡담',
}

// ms 가 10초 이상이면 자동으로 초 단위로 바꿔 읽기 쉬움(분위수 카드가 138,379ms 같이 길어지는 걸 방지).
const fmtMs = (v?: number | null) => {
  if (v == null) return '—'
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}s`
  return `${v.toLocaleString()}ms`
}
const fmtPct = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const fmtNum = (v?: number | string | null) =>
  v == null ? '…' : typeof v === 'number' ? v.toLocaleString() : v

// 활성 사용자 추이: volume_series 의 active_users(일별 distinct user) 위에
// 7일/30일 이동평균을 얹어 노이즈를 줄인다. 진짜 WAU/MAU 는 아니지만
// (그건 distinct 윈도우라 raw user_id 가 필요) 추세 인사이트로는 동일하게 동작.
function deriveActiveUsersTrend(volume: VolumePoint[]) {
  if (volume.length === 0) return []
  return volume.map((p, i) => {
    const win7 = volume.slice(Math.max(0, i - 6), i + 1)
    const win30 = volume.slice(Math.max(0, i - 29), i + 1)
    const avg = (arr: VolumePoint[]) =>
      Math.round((arr.reduce((s, v) => s + v.active_users, 0) / arr.length) * 10) / 10
    return {
      date: p.date,
      dau: p.active_users,
      ma7: avg(win7),
      ma30: avg(win30),
    }
  })
}

// 세션 깊이 분포 — message_count 기준 4 버킷. backend overview 가 쓰는
// "단발성 = message_count <= 2" 정의를 따른다(=1턴).
const DEPTH_BUCKETS: { label: string; test: (n: number) => boolean }[] = [
  { label: '1턴 (≤2)',      test: (n) => n <= 2 },
  { label: '2~3턴 (3-6)',   test: (n) => n >= 3 && n <= 6 },
  { label: '4~5턴 (7-10)',  test: (n) => n >= 7 && n <= 10 },
  { label: '6+턴 (11+)',    test: (n) => n >= 11 },
]
function deriveDepthHistogram(sessions: RecentSession[]) {
  return DEPTH_BUCKETS.map((b) => ({
    label: b.label,
    count: sessions.filter((s) => b.test(s.message_count)).length,
  }))
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const overview = useAnalyticsOverview()
  // 메인 추세 — 기간 토글에 반응
  const volume = useAnalyticsVolume(days)
  // 상단 KPI 카드용 스파크라인 — 토글과 무관하게 고정 30일
  const sparkVolume = useAnalyticsVolume(30)
  const intents = useAnalyticsIntents()
  const tools = useAnalyticsTools()
  const users = useAnalyticsUsers()
  // 깊이 분포 + 최근 세션 테이블을 같은 응답에서 뽑는다(쿼리 1번).
  // 백엔드 limit cap = 100. 표본이 더 필요해지면 백엔드 cap 을 같이 올린다.
  const sessions = useAnalyticsSessions(100)
  const latency = useAnalyticsLatency()
  const [openSession, setOpenSession] = useState<string | null>(null)
  const sessionDetail = useAnalyticsSession(openSession)

  const o = overview.data
  const sparkSeries = sparkVolume.data ?? []
  const sparkActive = sparkSeries.map((p) => ({ v: p.active_users }))
  const sparkMessages = sparkSeries.map((p) => ({ v: p.messages }))

  const activeTrend = useMemo(
    () => deriveActiveUsersTrend(volume.data ?? []),
    [volume.data],
  )
  const sessionsList = sessions.data ?? []
  const depthBuckets = useMemo(() => deriveDepthHistogram(sessionsList), [sessionsList])
  const recent15 = sessionsList.slice(0, 15)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* 헤더 — 제목 + 기간 토글 */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">챗봇 통계</h1>
          <p className="text-sm text-slate-500">대화 사용량·의도 분포·RAG 품질을 한눈에</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={
                'px-3 py-1 text-xs rounded-md border ' +
                (days === d
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300')
              }
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* KPI 6장 — 핵심 지표(활성·볼륨)는 스파크라인, 품질·지연은 큰 숫자 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiSparkCard
          icon={<Activity className="w-4 h-4" />}
          label="DAU (1일)"
          value={o?.dau}
          series={sparkActive}
          color={BLUE}
        />
        <KpiSparkCard
          icon={<Activity className="w-4 h-4" />}
          label="WAU (7일)"
          value={o?.wau}
          series={sparkActive}
          color={EMERALD}
        />
        <KpiSparkCard
          icon={<Activity className="w-4 h-4" />}
          label="MAU (30일)"
          value={o?.mau}
          series={sparkActive}
          color={VIOLET}
        />
        <KpiSparkCard
          icon={<MessageSquare className="w-4 h-4" />}
          label="총 메시지"
          value={o?.total_messages}
          series={sparkMessages}
          color={AMBER}
        />
        <KpiBigCard
          icon={<Gauge className="w-4 h-4" />}
          label="RAG 충분율"
          value={fmtPct(o?.sufficient_rate)}
          tone={ratioTone(o?.sufficient_rate)}
        />
        <KpiBigCard
          icon={<Clock className="w-4 h-4" />}
          label="p95 응답"
          value={fmtMs(latency.data?.p95)}
          tone="neutral"
        />
      </div>

      {/* 보조 지표 — 한 줄 압축(스파크라인 없는 부가 카운트) */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 px-1 text-xs text-slate-500">
        <SubStat
          icon={<Users className="w-3.5 h-3.5" />}
          label="총 사용자"
          value={fmtNum(o?.total_users)}
        />
        <SubStat label="총 세션" value={fmtNum(o?.total_sessions)} />
        <SubStat label="세션당 메시지" value={fmtNum(o?.avg_messages_per_session)} />
        <SubStat label="사용자당 세션" value={fmtNum(o?.avg_sessions_per_user)} />
        <SubStat label="평균 재시도" value={fmtNum(o?.avg_retry_count)} />
        <SubStat
          label="단발성 세션률"
          value={fmtPct(o?.single_turn_session_rate)}
        />
        <SubStat label="응답 지연 표본" value={fmtNum(latency.data?.count)} />
      </div>

      {/* 추세 */}
      <Section title="추세">
        <Card title={`대화량 추이 (최근 ${days}일)`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume.data ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="messages" name="메시지" stroke={BLUE} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sessions" name="세션" stroke={EMERALD} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="active_users" name="활성유저" stroke={AMBER} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`활성 사용자 추이 — DAU + 7일·30일 이동평균 (최근 ${days}일)`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeTrend} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="dau" name="DAU" stroke={BLUE} strokeWidth={1.5} dot={false} opacity={0.5} />
                <Line type="monotone" dataKey="ma7" name="7일 이동평균" stroke={EMERALD} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="ma30" name="30일 이동평균" stroke={VIOLET} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* 의도·도구 */}
      <Section title="의도·도구 분포">
        <Card title="의도(intent) 분포">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intents.data ?? []} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="intent"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  width={120}
                  tickFormatter={(v) => INTENT_LABELS[String(v)] ?? String(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={(v) => INTENT_LABELS[String(v)] ?? String(v)}
                />
                <Bar dataKey="count" name="건수" radius={[0, 4, 4, 0]}>
                  {(intents.data ?? []).map((_, i) => (
                    <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="검색 도구 사용 (RDB / Vector / Graph)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tools.data ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="tool" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="사용 횟수" fill={BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* 성능 — 지연 분포 단독 (전폭) */}
      <Section title="성능" cols={1}>
        <Card
          title={`응답 지연 분포 — p50 ${fmtMs(latency.data?.p50)} · p90 ${fmtMs(latency.data?.p90)} · p95 ${fmtMs(latency.data?.p95)} · p99 ${fmtMs(latency.data?.p99)} (n=${latency.data?.count ?? 0})`}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latency.data?.buckets ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="응답 수" fill={EMERALD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* 사용자·세션 */}
      <Section title="사용자·세션">
        <Card title={`세션 깊이 분포 — 최근 ${sessionsList.length}개 세션 표본`}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={depthBuckets} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="세션 수" fill={VIOLET} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top 사용자">
          <Table
            head={['사용자', '세션', '메시지', '마지막 활동']}
            rows={(users.data ?? []).map((u) => [
              u.display_name || u.user_id,
              String(u.sessions),
              String(u.messages),
              u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('ko-KR') : '—',
            ])}
            empty="사용자 없음"
          />
        </Card>

        <Card
          title="최근 세션 (행 클릭 시 대화 원문)"
          className="lg:col-span-2"
        >
          <Table
            head={['세션', '사용자', '메시지', '마지막 의도', '시각']}
            rows={recent15.map((s) => [
              s.session_id.slice(0, 8),
              s.user_id,
              String(s.message_count),
              s.last_intent
                ? (INTENT_LABELS[s.last_intent] ?? s.last_intent)
                : '—',
              s.last_at ? new Date(s.last_at).toLocaleString('ko-KR') : '—',
            ])}
            empty="세션 없음"
            onRowClick={(i) => {
              const s = recent15[i]
              if (s) setOpenSession(s.session_id)
            }}
          />
        </Card>
      </Section>

      {/* 세션 대화 원문 모달 */}
      {openSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpenSession(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-sm font-semibold">
                세션 대화 — {openSession.slice(0, 8)}
              </div>
              <button
                type="button"
                onClick={() => setOpenSession(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              {sessionDetail.isLoading && <div className="text-sm text-slate-400">불러오는 중…</div>}
              {!sessionDetail.isLoading && (sessionDetail.data?.length ?? 0) === 0 && (
                <div className="text-sm text-slate-400">메시지가 없습니다.</div>
              )}
              {(sessionDetail.data ?? []).map((m) => (
                <div
                  key={m.message_id}
                  className={
                    'rounded-lg border p-3 text-sm ' +
                    (m.role === 'user'
                      ? 'border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800')
                  }
                >
                  <div className="flex items-center gap-2 mb-1 text-xs text-slate-500">
                    <span className="font-medium">{m.role === 'user' ? '사용자' : '어시스턴트'}</span>
                    {m.intent && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {INTENT_LABELS[m.intent] ?? m.intent}
                      </span>
                    )}
                    <span className="ml-auto">
                      {m.created_at ? new Date(m.created_at).toLocaleString('ko-KR') : ''}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 보조 컴포넌트 =====

// 충분율 톤 — 80% 이상 emerald, 60% 이상 amber, 미만 rose. 시각적 게이지 역할.
function ratioTone(v: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (v == null) return 'neutral'
  if (v >= 0.8) return 'good'
  if (v >= 0.6) return 'warn'
  return 'bad'
}

function Section({
  title,
  children,
  cols = 2,
}: {
  title: string
  children: React.ReactNode
  cols?: 1 | 2
}) {
  const grid = cols === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title}
      </h2>
      <div className={`grid ${grid} gap-5`}>{children}</div>
    </section>
  )
}

function Card({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={
        'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 ' +
        className
      }
    >
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </div>
      {children}
    </div>
  )
}

// KPI + 스파크라인. 스파크라인은 axis/grid 없이 색조 면적만(48px 높이).
function KpiSparkCard({
  icon,
  label,
  value,
  series,
  color,
}: {
  icon?: React.ReactNode
  label: string
  value: number | string | undefined
  series: { v: number }[]
  color: string
}) {
  const id = useMemo(
    () => `spark-${label.replace(/[^a-z0-9]/gi, '-')}-${Math.random().toString(36).slice(2, 7)}`,
    [label],
  )
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
        {fmtNum(value)}
      </div>
      <div className="h-10 -mx-1 mt-1">
        {series.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// 큰 숫자(스파크라인 없음) KPI — 비율/지연처럼 시리즈가 의미 적은 지표용.
function KpiBigCard({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon?: React.ReactNode
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
        {icon}
        {label}
      </div>
      <div className={`text-3xl font-semibold mt-1 tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}

// 보조 통계 한 줄(라벨 + 값) — 텍스트 strip 용.
function SubStat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
      <b className="text-slate-800 dark:text-slate-100 tabular-nums">{value}</b>
    </span>
  )
}

function Table({
  head,
  rows,
  empty,
  onRowClick,
}: {
  head: string[]
  rows: string[][]
  empty: string
  onRowClick?: (i: number) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-slate-500 text-xs">
        <tr>
          {head.map((h) => (
            <th key={h} className="text-left font-medium pb-2">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="py-4 text-center text-slate-400">{empty}</td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr
            key={i}
            onClick={onRowClick ? () => onRowClick(i) : undefined}
            className={onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}
          >
            {r.map((cell, j) => (
              <td key={j} className="py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
