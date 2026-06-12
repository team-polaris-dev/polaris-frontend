import { Link } from 'react-router-dom'
import { useJobs } from '../../lib/hooks/useJob'
import type { JobResponse, JobState } from '../../lib/api/types'

export default function JobsHistory() {
  const { data: jobs = [], isLoading } = useJobs()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">잡 목록</h1>
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">상태</th>
              <th className="text-left px-4 py-2.5 font-medium">잡 ID</th>
              <th className="text-left px-4 py-2.5 font-medium">라벨</th>
              <th className="text-left px-4 py-2.5 font-medium">회사</th>
              <th className="text-left px-4 py-2.5 font-medium">단계</th>
              <th className="text-left px-4 py-2.5 font-medium">시작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">불러오는 중…</td></tr>
            )}
            {!isLoading && jobs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">잡 없음</td></tr>
            )}
            {jobs.map((j) => (
              <JobRow key={j.job_id} job={j} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
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
