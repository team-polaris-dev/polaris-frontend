import { CheckCircle2, Circle, RefreshCw, SkipForward, XCircle } from 'lucide-react'
import type { JobResponse, StepStatus } from '../../lib/api/types'

const STEP_LABELS: Record<string, string> = {
  fetch: '수집',
  chunk: '청킹',
  mariadb: 'MariaDB',
  qdrant: 'Qdrant',
  neo4j_struct: 'Neo4j 정형',
  extract: 'KG 추출',
  qc: '추출 QC',
  canon: '엔티티 통합',
  cleanup: '원본 정리',
}

type Props = { job: JobResponse }

export default function JobProgressBar({ job }: Props) {
  // corp 단위로 step 묶기
  const byCorp = job.corp_codes.map((code) => ({
    code,
    steps: job.steps.filter((s) => s.corp_code === code),
  }))

  return (
    <div className="space-y-4">
      {byCorp.map(({ code, steps }) => (
        <div key={code} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            {code}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {steps.map((step, i) => (
              <div key={step.step_id} className="flex items-center gap-2 min-w-fit">
                <StepCell step={step} />
                {i < steps.length - 1 && (
                  <div className="w-6 h-px bg-slate-300 dark:bg-slate-700" />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepCell({ step }: { step: StepStatus }) {
  const icon = iconFor(step.state)
  const color = colorFor(step.state)
  return (
    <div className="flex flex-col items-center gap-1 min-w-[80px]">
      <div className={'flex items-center gap-1 ' + color}>
        {icon}
        <span className="text-xs font-medium">{STEP_LABELS[step.step_id] ?? step.step_id}</span>
      </div>
      <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={'h-full rounded-full ' + bgFor(step.state)}
          style={{ width: `${Math.round(step.progress * 100)}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-400 font-mono">
        {Math.round(step.progress * 100)}%
      </div>
    </div>
  )
}

function iconFor(state: StepStatus['state']) {
  const sz = 'w-4 h-4'
  switch (state) {
    case 'succeeded': return <CheckCircle2 className={sz} />
    case 'failed':    return <XCircle className={sz} />
    case 'cancelled': return <XCircle className={sz} />
    case 'skipped':   return <SkipForward className={sz} />
    case 'running':   return <RefreshCw className={sz + ' animate-spin'} />
    default:          return <Circle className={sz} />
  }
}

function colorFor(state: StepStatus['state']): string {
  switch (state) {
    case 'succeeded': return 'text-emerald-500'
    case 'failed':    return 'text-rose-500'
    case 'cancelled': return 'text-rose-400'
    case 'skipped':   return 'text-slate-400'
    case 'running':   return 'text-blue-500'
    default:          return 'text-slate-400'
  }
}

function bgFor(state: StepStatus['state']): string {
  switch (state) {
    case 'succeeded': return 'bg-emerald-500'
    case 'failed':    return 'bg-rose-500'
    case 'cancelled': return 'bg-rose-400'
    case 'skipped':   return 'bg-slate-400'
    case 'running':   return 'bg-blue-500'
    default:          return 'bg-slate-300'
  }
}
