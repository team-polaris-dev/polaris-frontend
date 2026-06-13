import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useCorps, useCorpsSearch } from '../../lib/hooks/useJob'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
}

export default function CompanyMultiSelect({ value, onChange }: Props) {
  const { data: corps = [], isLoading } = useCorps()
  const [query, setQuery] = useState('')
  // 전체 상장사(corp_master) 검색 — 보유 목록에 없는 신규 회사도 선택 가능
  const search = useCorpsSearch(query.trim())
  // 선택한 신규 회사의 이름 표시용 (보유 목록엔 없으므로 직접 기억)
  const nameByCode = useRef<Record<string, string>>({})

  const heldFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return corps
    return corps.filter(
      (c) =>
        c.corp_name.toLowerCase().includes(q) ||
        c.corp_code.includes(q),
    )
  }, [corps, query])

  const heldCodes = useMemo(() => new Set(corps.map((c) => c.corp_code)), [corps])
  // 검색 결과 중 미보유(신규)만 — 보유 회사는 위 목록에서 이미 노출
  const newResults = (search.data ?? []).filter((r) => !heldCodes.has(r.corp_code))

  function toggle(code: string, name?: string) {
    if (name) nameByCode.current[code] = name
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code))
    } else {
      onChange([...value, code])
    }
  }

  // 선택됐지만 현재 목록(보유+검색결과)에 안 보이는 회사 — 칩으로 유지 표시
  const visibleCodes = new Set([
    ...heldFiltered.map((c) => c.corp_code),
    ...newResults.map((r) => r.corp_code),
  ])
  const hiddenSelected = value.filter((code) => !visibleCodes.has(code))
  const labelOf = (code: string) =>
    corps.find((c) => c.corp_code === code)?.corp_name ?? nameByCode.current[code] ?? code

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="회사명·코드·종목코드 검색 (전체 상장사 — corp_master 기준)"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>

      {hiddenSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hiddenSelected.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              title="클릭하면 선택 해제"
              className="px-2 py-0.5 rounded-full text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
            >
              {labelOf(code)} ✕
            </button>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading && (
          <div className="px-3 py-2 text-sm text-slate-400">불러오는 중…</div>
        )}
        {!isLoading &&
          heldFiltered.map((c) => (
            <label
              key={c.corp_code + c.corp_name}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={value.includes(c.corp_code)}
                onChange={() => toggle(c.corp_code, c.corp_name)}
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

        {query.trim().length > 0 && newResults.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/60">
            전체 상장사 검색 결과 — 미보유 (선택하면 파이프라인이 새로 수집)
          </div>
        )}
        {query.trim().length > 0 &&
          newResults.map((r) => (
            <label
              key={r.corp_code}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={value.includes(r.corp_code)}
                onChange={() => toggle(r.corp_code, r.corp_name)}
                className="accent-blue-600"
              />
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {r.corp_name}
              </span>
              <span className="text-xs text-slate-400 font-mono">{r.corp_code}</span>
              {r.stock_code && (
                <span className="text-xs text-slate-400 font-mono">{r.stock_code}</span>
              )}
              <span className="ml-auto px-1.5 py-0.5 rounded text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                신규
              </span>
            </label>
          ))}

        {!isLoading && heldFiltered.length === 0 && newResults.length === 0 && (
          <div className="px-3 py-2 text-sm text-slate-400">
            {search.isFetching ? '전체 상장사 검색 중…' : '결과 없음'}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-slate-500">{value.length}개 회사 선택됨</p>
      )}
    </div>
  )
}
