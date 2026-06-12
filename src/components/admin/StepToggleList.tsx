import type { StepConfig, StepId } from '../../lib/api/types'

const STEPS: { id: StepId; label: string; desc: string }[] = [
  { id: 'fetch',        label: '1. DART 수집',     desc: 'fetch_dart.py — raw/{회사}/ 폴더에 원본 저장' },
  { id: 'chunk',        label: '2. 청킹',           desc: 'chunk.py — 정기보고서 본문 청크 JSONL' },
  { id: 'mariadb',      label: '3. MariaDB 적재',  desc: 'load_mariadb.py — dart_raw/document/chunk_index' },
  { id: 'qdrant',       label: '4. Qdrant 임베딩', desc: 'embed_qdrant.py — polaris-chunks 컬렉션' },
  { id: 'neo4j_struct', label: '5. Neo4j 정형',    desc: 'load_structured.py — Org/Person/임원·지분' },
  { id: 'extract',      label: '6. KG 추출 (선택)',desc: 'auto_runner.py — Claude 또는 Ollama' },
]

type Props = {
  value: StepConfig[]
  onChange: (next: StepConfig[]) => void
}

export default function StepToggleList({ value, onChange }: Props) {
  function toggle(id: StepId) {
    const idx = value.findIndex((s) => s.id === id)
    if (idx < 0) {
      onChange([...value, { id, enabled: true, params: {} }])
    } else {
      const next = [...value]
      next[idx] = { ...next[idx], enabled: !next[idx].enabled }
      onChange(next)
    }
  }

  function enabledOf(id: StepId): boolean {
    return value.find((s) => s.id === id)?.enabled !== false
  }

  return (
    <div className="space-y-2">
      {STEPS.map((step) => (
        <label
          key={step.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={enabledOf(step.id)}
            onChange={() => toggle(step.id)}
            className="mt-1 accent-blue-600"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {step.label}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {step.desc}
            </div>
          </div>
        </label>
      ))}
    </div>
  )
}
