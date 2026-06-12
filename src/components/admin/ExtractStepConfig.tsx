import type { ExtractProvider, StepConfig } from '../../lib/api/types'

type Props = {
  value: StepConfig | undefined
  onChange: (next: StepConfig) => void
}

const PROVIDERS: { id: ExtractProvider; label: string; defaultModel: string }[] = [
  { id: 'ollama', label: 'Ollama (qwen2.5)', defaultModel: 'qwen2.5:7b' },
  { id: 'claude', label: 'Claude (haiku-4-5)', defaultModel: 'claude-haiku-4-5' },
]

export default function ExtractStepConfig({ value, onChange }: Props) {
  const params = value?.params ?? {}
  const provider = (params.provider ?? 'ollama') as ExtractProvider
  const model = params.model ?? PROVIDERS.find((p) => p.id === provider)!.defaultModel
  const window = params.chunk_window ?? [0, 200]
  const positiveOnly = params.positive_only ?? false

  function update(patch: Partial<StepConfig['params']>) {
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
        <div className="text-xs text-slate-500 mb-1">모델명</div>
        <input
          value={model}
          onChange={(e) => update({ model: e.target.value })}
          className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-slate-500 mb-1">청크 시작</div>
          <input
            type="number"
            min={0}
            value={window[0]}
            onChange={(e) => update({ chunk_window: [Number(e.target.value), window[1]] })}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">청크 끝</div>
          <input
            type="number"
            min={0}
            value={window[1]}
            onChange={(e) => update({ chunk_window: [window[0], Number(e.target.value)] })}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={positiveOnly}
          onChange={(e) => update({ positive_only: e.target.checked })}
          className="accent-blue-600"
        />
        positive-only 모드 (anchor 청크만 추출)
      </label>

      {provider === 'claude' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ANTHROPIC_API_KEY 환경변수 설정 필요
        </p>
      )}
    </div>
  )
}
