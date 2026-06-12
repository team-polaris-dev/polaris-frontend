type Props = {
  title: string
  icon: React.ReactNode
  rows: { label: string; value: number | string }[]
}

export default function DBStatusCard({ title, icon, rows }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-blue-600 dark:text-blue-400">{icon}</div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">
              {r.label}
            </span>
            <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
              {typeof r.value === 'number' ? r.value.toLocaleString() : r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
