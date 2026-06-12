import { useState } from 'react'
import {
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
import { MessageSquare, Users, Activity, Gauge, Timer, Repeat } from 'lucide-react'

import {
  useAnalyticsIntents,
  useAnalyticsOverview,
  useAnalyticsSessions,
  useAnalyticsTools,
  useAnalyticsUsers,
  useAnalyticsVolume,
} from '../../lib/hooks/useJob'

const BLUE = '#2563eb'
const EMERALD = '#10b981'
const AMBER = '#f59e0b'
const INTENT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#6366f1', '#14b8a6', '#f97316', '#a855f7']

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const overview = useAnalyticsOverview()
  const volume = useAnalyticsVolume(days)
  const intents = useAnalyticsIntents()
  const tools = useAnalyticsTools()
  const users = useAnalyticsUsers()
  const sessions = useAnalyticsSessions()

  const o = overview.data

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">챗봇 통계</h1>
          <p className="text-sm text-slate-500">대화 사용량·의도 분포·RAG 품질을 한눈에</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
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

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Users className="w-4 h-4" />} label="총 사용자" value={o?.total_users} />
        <Kpi icon={<MessageSquare className="w-4 h-4" />} label="총 대화(세션)" value={o?.total_sessions} />
        <Kpi icon={<MessageSquare className="w-4 h-4" />} label="총 메시지" value={o?.total_messages} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="활성 사용자(7일)" value={o?.active_users_7d} />
        <Kpi
          icon={<Gauge className="w-4 h-4" />}
          label="RAG 충분율"
          value={o?.sufficient_rate != null ? `${Math.round(o.sufficient_rate * 100)}%` : '—'}
        />
        <Kpi
          icon={<Timer className="w-4 h-4" />}
          label="평균 응답(ms)"
          value={o?.avg_latency_ms ?? '—'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi small label="세션당 메시지" value={o?.avg_messages_per_session} />
        <Kpi small label="사용자당 세션" value={o?.avg_sessions_per_user} />
        <Kpi
          small
          icon={<Repeat className="w-4 h-4" />}
          label="평균 재시도"
          value={o?.avg_retry_count ?? '—'}
        />
        <Kpi
          small
          label="단발성 세션률"
          value={o?.single_turn_session_rate != null ? `${Math.round(o.single_turn_session_rate * 100)}%` : '—'}
        />
      </div>

      {/* 볼륨 추이 */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 의도 분포 */}
        <Card title="의도(intent) 분포">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intents.data ?? []} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <YAxis type="category" dataKey="intent" tick={{ fontSize: 11, fill: '#94a3b8' }} width={110} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="건수" radius={[0, 4, 4, 0]}>
                  {(intents.data ?? []).map((_, i) => (
                    <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 도구 사용 */}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 유저 */}
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

        {/* 최근 세션 */}
        <Card title="최근 세션">
          <Table
            head={['세션', '사용자', '메시지', '마지막 의도', '시각']}
            rows={(sessions.data ?? []).map((s) => [
              s.session_id.slice(0, 8),
              s.user_id,
              String(s.message_count),
              s.last_intent || '—',
              s.last_at ? new Date(s.last_at).toLocaleString('ko-KR') : '—',
            ])}
            empty="세션 없음"
          />
        </Card>
      </div>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  small,
}: {
  icon?: React.ReactNode
  label: string
  value: number | string | undefined
  small?: boolean
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
        {icon}
        {label}
      </div>
      <div className={(small ? 'text-xl' : 'text-2xl') + ' font-semibold text-slate-900 dark:text-slate-100 mt-1 tabular-nums'}>
        {value === undefined ? '…' : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-4">{title}</div>
      {children}
    </div>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
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
          <tr><td colSpan={head.length} className="py-4 text-center text-slate-400">{empty}</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j} className="py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
