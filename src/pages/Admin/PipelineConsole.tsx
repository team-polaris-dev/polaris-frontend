import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'

import CompanyMultiSelect from '../../components/admin/CompanyMultiSelect'
import StepToggleList from '../../components/admin/StepToggleList'
import ExtractStepConfig from '../../components/admin/ExtractStepConfig'
import DateRangePicker from '../../components/admin/DateRangePicker'
import { useCreateJob } from '../../lib/hooks/useJob'
import type { StepConfig } from '../../lib/api/types'

const DEFAULT_STEPS: StepConfig[] = [
  { id: 'fetch',        enabled: true,  params: {} },
  { id: 'chunk',        enabled: true,  params: {} },
  { id: 'mariadb',      enabled: true,  params: {} },
  { id: 'qdrant',       enabled: true,  params: {} },
  { id: 'neo4j_struct', enabled: true,  params: {} },
  { id: 'extract',      enabled: false, params: { provider: 'ollama', model: 'qwen2.5:7b' } },
]

export default function PipelineConsole() {
  const navigate = useNavigate()
  const [corps, setCorps] = useState<string[]>([])
  const [steps, setSteps] = useState<StepConfig[]>(DEFAULT_STEPS)
  const [label, setLabel] = useState('')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)

  const createJob = useCreateJob()

  const extractStep = steps.find((s) => s.id === 'extract')
  const extractEnabled = extractStep?.enabled === true

  function updateExtract(next: StepConfig) {
    setSteps((prev) => prev.map((s) => (s.id === 'extract' ? next : s)))
  }

  async function submit() {
    if (corps.length === 0) {
      alert('회사를 1개 이상 선택하세요.')
      return
    }
    try {
      const job = await createJob.mutateAsync({
        corp_codes: corps,
        steps,
        from_date: from,
        to_date: to,
        label: label || null,
      })
      navigate(`/admin/jobs/${job.job_id}`)
    } catch (e) {
      alert(`잡 생성 실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">파이프라인 콘솔</h1>
      <p className="text-sm text-slate-500 mb-6">
        회사·단계를 선택하고 [실행]을 누르면 잡 화면으로 이동합니다.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-5">
          <Card title="회사 선택">
            <CompanyMultiSelect value={corps} onChange={setCorps} />
          </Card>

          <Card title="수집 기간">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
          </Card>

          <Card title="잡 라벨 (선택)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 한미반도체 증분 적재"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </Card>
        </section>

        <section className="space-y-5">
          <Card title="실행 단계">
            <StepToggleList value={steps} onChange={setSteps} />
          </Card>

          {extractEnabled && (
            <Card title="KG 추출 설정">
              <ExtractStepConfig value={extractStep} onChange={updateExtract} />
            </Card>
          )}
        </section>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={submit}
          disabled={createJob.isPending || corps.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <PlayCircle className="w-5 h-5" />
          {createJob.isPending ? '생성 중…' : '잡 실행'}
        </button>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
        {title}
      </div>
      {children}
    </div>
  )
}
