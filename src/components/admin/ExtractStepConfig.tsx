import type { ExtractProvider, StepConfig } from '../../lib/api/types'
import { useExtractPending } from '../../lib/hooks/useJob'

type Props = {
  value: StepConfig | undefined
  onChange: (next: StepConfig) => void
  corpCodes: string[]
}

const PROVIDERS: { id: ExtractProvider; label: string; defaultModel: string }[] = [
  { id: 'ollama', label: 'Ollama (로컬·기본)', defaultModel: 'qwen3.5:9b' },
  { id: 'apimaker', label: 'apimaker (Gemini CLI)', defaultModel: '' },
]

export default function ExtractStepConfig({ value, onChange, corpCodes }: Props) {
  const params = value?.params ?? {}
  const provider = (params.provider ?? 'ollama') as ExtractProvider
  const model = params.model ?? PROVIDERS.find((p) => p.id === provider)!.defaultModel
  const limit = params.limit ?? null // null = pending 전부 (기본)
  const positiveOnly = params.positive_only ?? false

  const pending = useExtractPending(corpCodes, positiveOnly)
  const totalPending = (pending.data ?? []).reduce((acc, p) => acc + p.pending, 0)

  function update(patch: Partial<NonNullable<StepConfig['params']>>) {
    onChange({
      id: 'extract',
      enabled: value?.enabled ?? true,
      params: { ...params, ...patch },
    })
  }

  return (
    <div className="space-y-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
        KG 추출 (extract) 설정
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1">추출 대상 (회사 선택 기준, 원장 반영)</div>
        {corpCodes.length === 0 && (
          <p className="text-xs text-slate-400">왼쪽에서 회사를 선택하면 남은 청크 수를 보여줍니다.</p>
        )}
        {pending.isLoading && corpCodes.length > 0 && (
          <p className="text-xs text-slate-400">대상 청크 집계 중…</p>
        )}
        {pending.error != null && (
          <p className="text-xs text-rose-500">집계 실패: {(pending.error as Error).message}</p>
        )}
        {pending.data && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">회사</th>
                  <th className="px-2 py-1.5 text-right font-medium">대상</th>
                  <th className="px-2 py-1.5 text-right font-medium">처리됨</th>
                  <th className="px-2 py-1.5 text-right font-medium">남음</th>
                </tr>
              </thead>
              <tbody>
                {pending.data.map((p) => (
                  <tr key={p.corp_code} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5">{p.corp_name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.eligible.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{p.done.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{p.pending.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1">추출 범위</div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => update({ limit: null })}
            className={
              'px-3 py-1.5 text-xs rounded-md border ' +
              (limit == null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200')
            }
          >
            전부{pending.data ? ` (${totalPending.toLocaleString()}개)` : ''}
          </button>
          <button
            type="button"
            onClick={() => update({ limit: limit ?? 200 })}
            className={
              'px-3 py-1.5 text-xs rounded-md border ' +
              (limit != null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200')
            }
          >
            상한 지정
          </button>
          {limit != null && (
            <input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => update({ limit: Math.max(1, Number(e.target.value)) })}
              className="w-24 px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          )}
          {limit != null && <span className="text-xs text-slate-500">개 (회사당)</span>}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1">LLM 제공자</div>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ provider: p.id, model: p.defaultModel })}
              className={
                'flex-1 px-3 py-1.5 text-xs rounded-md border ' +
                (provider === p.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-1">
          모델명 {provider === 'apimaker' && '(비우면 Gemini CLI 기본 모델)'}
        </div>
        <input
          value={model}
          onChange={(e) => update({ model: e.target.value })}
          className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={positiveOnly}
          onChange={(e) => update({ positive_only: e.target.checked })}
          className="accent-blue-600"
        />
        positive-only 모드 (anchor 청크만 추출 — 위 집계도 함께 바뀜)
      </label>

      {provider === 'apimaker' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Gemini CLI 구독 쿼터를 소모합니다 — 대량 추출은 Ollama, 소량 QC용으로만 권장
        </p>
      )}
    </div>
  )
}
