type Props = {
  from: string | null
  to: string | null
  onChange: (from: string | null, to: string | null) => void
}

export default function DateRangePicker({ from, to, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
        DART 수집 기간 (fetch 단계에만 적용)
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={from ?? ''}
          onChange={(e) => onChange(e.target.value || null, to)}
          className="px-2 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
        <input
          type="date"
          value={to ?? ''}
          onChange={(e) => onChange(from, e.target.value || null)}
          className="px-2 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>
      <p className="text-xs text-slate-400">
        비워두면 스크립트 기본값(2024-01-01 ~ 2026-06-01) 사용
      </p>
    </div>
  )
}
