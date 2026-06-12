import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useCorps } from '../../lib/hooks/useJob'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
}

export default function CompanyMultiSelect({ value, onChange }: Props) {
  const { data: corps = [], isLoading } = useCorps()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return corps
    return corps.filter(
      (c) =>
        c.corp_name.toLowerCase().includes(q) ||
        c.corp_code.includes(q),
    )
  }, [corps, query])

  function toggle(code: string) {
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code))
    } else {
      onChange([...value, code])
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="회사명·코드 검색"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading && (
          <div className="px-3 py-2 text-sm text-slate-400">불러오는 중…</div>
        )}
        {!isLoading &&
          filtered.map((c) => (
            <label
              key={c.corp_code + c.corp_name}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={value.includes(c.corp_code)}
                onChange={() => toggle(c.corp_code)}
                className="accent-blue-600"
              />
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {c.corp_name}
              </span>
              <span className="text-xs text-slate-400 font-mono">{c.corp_code}</span>
              <span className="ml-auto text-xs text-slate-500">
                공시 {c.doc_count} / 청크 {c.chunk_count}
              </span>
            </label>
          ))}
        {!isLoading && filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-slate-400">결과 없음</div>
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-slate-500">{value.length}개 회사 선택됨</p>
      )}
    </div>
  )
}
