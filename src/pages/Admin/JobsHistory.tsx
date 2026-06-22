import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useJobs } from '../../lib/hooks/useJob'
import type { JobResponse, JobState } from '../../lib/api/types'

const PAGE = 20

const STATE_LABELS: Record<JobState | 'all', string> = {
  all: '전체',
  queued: '대기',
  running: '실행중',
  succeeded: '성공',
  failed: '실패',
  cancelled: '취소',
}

const FILTERS: (JobState | 'all')[] = [
  'all',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]

export default function JobsHistory() {
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<JobState | 'all'>('all')
  const { data: jobs = [], isLoading } = useJobs(PAGE, offset)

  // 현재 페이지 기준 상태별 건수 (서버 페이지네이션이라 페이지 한정 집계)
  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.state] = (acc[j.state] ?? 0) + 1
    return acc
  }, {})
  const shown = filter === 'all' ? jobs : jobs.filter((j) => j.state === filter)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-xl font-semibold">잡 목록</h1>
        <span className="text-xs text-slate-500">페이지당 {PAGE}건</span>
      </div>

      {/* 상태 필터 칩 (현재 페이지 건수 표시) */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((s) => {
          const n = s === 'all' ? jobs.length : counts[s] ?? 0
          const active = filter === s
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                'px-3 py-1 text-xs rounded-full border ' +
                (active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300')
              }
            >
              {STATE_LABELS[s]} {n}
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">상태</th>
              <th className="text-left px-4 py-2.5 font-medium">잡 ID</th>
              <th className="text-left px-4 py-2.5 font-medium">라벨</th>
              <th className="text-left px-4 py-2.5 font-medium">회사</th>
              <th className="text-left px-4 py-2.5 font-medium">단계</th>
              <th className="text-left px-4 py-2.5 font-medium">소요</th>
              <th className="text-left px-4 py-2.5 font-medium">시작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">불러오는 중…</td></tr>
            )}
            {!isLoading && shown.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">잡 없음</td></tr>
            )}
            {shown.map((j) => (
              <JobRow key={j.job_id} job={j} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 — 서버 limit/offset */}
      <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE))}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          이전
        </button>
        <span className="tabular-nums">
          {jobs.length === 0 ? '—' : `${offset + 1}–${offset + jobs.length}`}
        </span>
        <button
          type="button"
          disabled={jobs.length < PAGE}
          onClick={() => setOffset(offset + PAGE)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  )
}

function jobDuration(job: JobResponse): string {
  const start = new Date(job.created_at).getTime()
  const end = new Date(job.updated_at).getTime()
  const ms = end - start
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 ${s % 60}초`
  const h = Math.floor(m / 60)
  return `${h}시간 ${m % 60}분`
}

function JobRow({ job }: { job: JobResponse }) {
  const totalSteps = job.steps.length
  const doneSteps = job.steps.filter((s) =>
    ['succeeded', 'failed', 'cancelled', 'skipped'].includes(s.state),
  ).length
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-900">
      <td className="px-4 py-3"><StateBadge state={job.state} /></td>
      <td className="px-4 py-3 font-mono text-xs">
        <Link to={`/admin/jobs/${job.job_id}`} className="text-blue-600 hover:underline">
          {job.job_id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{job.label ?? '—'}</td>
      <td className="px-4 py-3 text-xs font-mono">{job.corp_codes.join(', ')}</td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {doneSteps}/{totalSteps}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">{jobDuration(job)}</td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {new Date(job.created_at).toLocaleString('ko-KR')}
      </td>
    </tr>
  )
}

function StateBadge({ state }: { state: JobState }) {
  const cfg: Record<JobState, { bg: string; text: string; label: string }> = {
    queued:    { bg: 'bg-slate-100 dark:bg-slate-800',     text: 'text-slate-600 dark:text-slate-300', label: '대기'   },
    running:   { bg: 'bg-blue-50 dark:bg-blue-950',        text: 'text-blue-700 dark:text-blue-300',   label: '실행중' },
    succeeded: { bg: 'bg-emerald-50 dark:bg-emerald-950',  text: 'text-emerald-700 dark:text-emerald-300', label: '성공' },
    failed:    { bg: 'bg-rose-50 dark:bg-rose-950',        text: 'text-rose-700 dark:text-rose-300',   label: '실패'   },
    cancelled: { bg: 'bg-slate-100 dark:bg-slate-800',     text: 'text-slate-500',                     label: '취소'   },
  }
  const c = cfg[state]
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}
