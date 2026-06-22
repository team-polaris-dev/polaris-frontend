import { useParams } from 'react-router-dom'
import { XCircle } from 'lucide-react'

import JobProgressBar from '../../components/admin/JobProgressBar'
import LogStream from '../../components/admin/LogStream'
import { useCancelJob, useJob } from '../../lib/hooks/useJob'

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const { data: job, isLoading } = useJob(jobId)
  const cancelJob = useCancelJob()

  if (isLoading || !job) {
    return <div className="p-6 text-slate-400">잡 로딩 중…</div>
  }

  const canCancel = job.state === 'running' || job.state === 'queued'

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen flex flex-col">
      <header className="flex items-baseline gap-4 mb-6">
        <h1 className="text-xl font-semibold">잡 상세</h1>
        <span className="text-xs font-mono text-slate-500">{job.job_id}</span>
        {job.label && (
          <span className="text-sm text-slate-600 dark:text-slate-400">— {job.label}</span>
        )}
        <div className="ml-auto">
          {canCancel && (
            <button
              onClick={() => cancelJob.mutate(job.job_id)}
              disabled={cancelJob.isPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> 취소
            </button>
          )}
        </div>
      </header>

      <section className="mb-6">
        <JobProgressBar job={job} />
      </section>

      <section className="flex-1 min-h-0">
        <LogStream jobId={job.job_id} />
      </section>
    </div>
  )
}
