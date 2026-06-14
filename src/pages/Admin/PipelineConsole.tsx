import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'

import CompanyMultiSelect from '../../components/admin/CompanyMultiSelect'
import PipelineStages from '../../components/admin/PipelineStages'
import ExtractStepConfig from '../../components/admin/ExtractStepConfig'
import DateRangePicker from '../../components/admin/DateRangePicker'
import { useCreateJob } from '../../lib/hooks/useJob'
import type { StepConfig } from '../../lib/api/types'

const INGEST_STEPS: StepConfig['id'][] = ['fetch', 'chunk', 'mariadb', 'qdrant', 'neo4j_struct']

export default function PipelineConsole() {
  const navigate = useNavigate()
  const [corps, setCorps] = useState<string[]>([])
  const [label, setLabel] = useState('')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [includeExtract, setIncludeExtract] = useState(true)
  const [extractOnly, setExtractOnly] = useState(false)
  const [cleanup, setCleanup] = useState(true)
  const [extractParams, setExtractParams] = useState<StepConfig['params']>({
    provider: 'ollama', model: 'qwen3.5:9b', limit: null,
  })

  const createJob = useCreateJob()
  // 추출만 모드면 extract 는 항상 켜짐. 일반 모드면 토글 따름.
  const runExtract = extractOnly || includeExtract

  async function submit() {
    if (corps.length === 0) return
    const steps: StepConfig[] = []
    // 추출만 모드: 적재 5단계(fetch~neo4j_struct) 건너뜀 — 이미 적재된 청크에서 KG만 추출
    if (!extractOnly) {
      steps.push(...INGEST_STEPS.map((id) => ({ id, enabled: true, params: {} })))
    }
    if (runExtract) {
      steps.push({ id: 'extract', enabled: true, params: extractParams })
      // 추출 직후 그래프 전역 통합 (needs_er 병합·재캐논)
      steps.push({ id: 'canon', enabled: true, params: {} })
    }
    if (cleanup) steps.push({ id: 'cleanup', enabled: true, params: {} })
    try {
      const job = await createJob.mutateAsync({
        corp_codes: corps, steps, from_date: from, to_date: to, label: label || null,
      })
      navigate(`/admin/jobs/${job.job_id}`)
    } catch (e) {
      alert(`잡 생성 실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 — 파이프라인 스텝퍼 + 실행 버튼 (운영 바) */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <h1 className="text-xl font-semibold shrink-0">파이프라인</h1>
        <div className="flex-1 min-w-0 overflow-x-auto">
          <PipelineStages includeExtract={runExtract} extractOnly={extractOnly} />
        </div>
        <button
          onClick={submit}
          disabled={createJob.isPending || corps.length === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 shrink-0"
        >
          <PlayCircle className="w-4 h-4" />
          {createJob.isPending ? '실행 중…' : corps.length > 0 ? `실행 (${corps.length})` : '회사 먼저 선택'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 회사 선택 — 주 입력, 2칸 */}
        <Card title="대상 회사" className="lg:col-span-2">
          <CompanyMultiSelect value={corps} onChange={setCorps} />
        </Card>

        {/* 실행 옵션 — 우측 1칸 */}
        <div className="space-y-5">
          <Card title="실행 옵션">
            <div className="space-y-4">
              <Field label="수집 기간">
                <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
              </Field>
              <Field label="라벨">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="선택"
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </Field>
              <div className="flex flex-col gap-2 pt-1">
                <Toggle checked={extractOnly} onChange={setExtractOnly}
                  label="추출만 실행" hint="수집·적재 건너뜀 (이미 적재된 회사)" />
                {!extractOnly && (
                  <Toggle checked={includeExtract} onChange={setIncludeExtract}
                    label="KG 추출 (6단계)" hint="끄면 적재까지만" />
                )}
                <Toggle checked={cleanup} onChange={setCleanup}
                  label="완료 후 원본 정리" hint="raw·청크 삭제 (DB 보존)" />
              </div>
            </div>
          </Card>

          {runExtract && (
            <Card title="추출 설정">
              <ExtractStepConfig
                value={{ id: 'extract', enabled: true, params: extractParams }}
                onChange={(next) => setExtractParams(next.params)}
                corpCodes={corps}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={'rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ' + className}>
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint: string
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          'inline-flex items-center h-5 w-9 shrink-0 rounded-full transition-colors ' +
          (checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700')
        }
      >
        <span
          className={
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ' +
            (checked ? 'translate-x-[18px]' : 'translate-x-0.5')
          }
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </label>
  )
}
