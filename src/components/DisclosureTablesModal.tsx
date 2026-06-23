import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Loader2, Table2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { API_BASE } from '../lib/auth'

/* DART pont AI 식 '공시 표 → 엑셀' 모달 (전체화면).
   왼쪽: 목차(섹션) — 섹션 체크박스로 그 섹션 표 일괄 선택/해제 + 네비게이션,
   오른쪽: 선택 섹션의 표 미리보기 — 표마다 체크박스로 개별 선택,
   상단: 전체 저장 / 선택 저장 (.xlsx, 섹션마다 시트 분리). */

export interface DTable {
  caption: string
  unit: string
  columns: string[]
  rows: string[][]
}
export interface DSection {
  section_path: string
  tables: DTable[]
}
export interface DiscTablesData {
  rcept_no: string
  corp_name: string
  title: string
  date: string
  sections: DSection[]
}

interface Props {
  rcept_no: string
  corpName?: string
  title?: string
  onClose: () => void
  // 테스트용 — 주입하면 fetch 대신 이 데이터를 쓴다.
  initialData?: DiscTablesData
}

const tableKey = (si: number, ti: number) => `${si}:${ti}`
const allTableKeys = (sections: DSection[]) =>
  sections.flatMap((s, si) => s.tables.map((_, ti) => tableKey(si, ti)))

/* 엑셀 시트명 규칙: ≤31자, [ ] : * ? / \ 금지, 중복 회피 */
function sheetName(sp: string, used: Set<string>): string {
  const base = (sp.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 28)
  let name = base
  let i = 2
  while (used.has(name)) {
    name = `${base.slice(0, 24)} (${i})`
    i++
  }
  used.add(name)
  return name
}

/* 섹션들(표 부분집합) → .xlsx (섹션마다 시트, 표는 캡션·헤더·행으로 쌓는다) */
function exportXlsx(sections: DSection[], fileBase: string) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const sec of sections) {
    if (!sec.tables.length) continue
    const aoa: (string | number)[][] = []
    for (const t of sec.tables) {
      aoa.push([t.unit ? `${t.caption}  ${t.unit}` : t.caption])
      aoa.push(t.columns)
      for (const r of t.rows) aoa.push(r)
      aoa.push([])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sheetName(sec.section_path, used))
  }
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${fileBase}_${date}.xlsx`)
}

function TablePreview({
  t,
  checked,
  onToggle,
}: {
  t: DTable
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-emerald-600"
          title="이 표를 선택 저장에 포함"
        />
        <span className="text-[12px] font-semibold text-slate-700">{t.caption}</span>
        {t.unit && <span className="text-[10px] text-slate-400">{t.unit}</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              {t.columns.map((c, i) => (
                <th key={i} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-600">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri} className="even:bg-slate-50">
                {t.columns.map((_, ci) => (
                  <td key={ci} className="border border-slate-200 px-2 py-1 tabular-nums text-slate-700">
                    {r[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DisclosureTablesModal({ rcept_no, corpName, title, onClose, initialData }: Props) {
  const [data, setData] = useState<DiscTablesData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  // 선택된 표 키 집합 (`섹션idx:표idx`). 기본 전체 선택(initialData 면 즉시, fetch 면 .then 에서).
  const [selected, setSelected] = useState<Set<string>>(
    () => (initialData ? new Set(allTableKeys(initialData.sections)) : new Set()),
  )

  useEffect(() => {
    if (initialData) return
    let alive = true
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/disclosure/${encodeURIComponent(rcept_no)}/tables`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: DiscTablesData) => {
        if (!alive) return
        setData(d)
        setSelected(new Set(allTableKeys(d.sections)))
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [rcept_no, initialData])

  const heading = useMemo(() => {
    const c = data?.corp_name || corpName || ''
    const t = data?.title || title || '공시'
    const d = data?.date ? `(${data.date})` : ''
    return `${c} ${t}${d} 엑셀 다운로드`.trim()
  }, [data, corpName, title])

  const sections = data?.sections ?? []

  const toggleTable = (si: number, ti: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const k = tableKey(si, ti)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  // 섹션 체크박스: 그 섹션 표를 일괄 선택/해제 (하나라도 빠지면 전체 선택)
  const toggleSection = (si: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const keys = sections[si].tables.map((_, ti) => tableKey(si, ti))
      const allOn = keys.every((k) => next.has(k))
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)))
      return next
    })

  const sectionState = (si: number) => {
    const total = sections[si].tables.length
    const sel = sections[si].tables.reduce((n, _, ti) => n + (selected.has(tableKey(si, ti)) ? 1 : 0), 0)
    return { all: total > 0 && sel === total, some: sel > 0 && sel < total, sel, total }
  }

  const fileBase = `${data?.corp_name || corpName || 'POLARIS'}_${(data?.title || '공시').replace(/\s/g, '')}`
  const saveAll = () => data && exportXlsx(data.sections, fileBase)
  const saveSelected = () => {
    if (!data) return
    const picked = data.sections.map((s, si) => ({
      section_path: s.section_path,
      tables: s.tables.filter((_, ti) => selected.has(tableKey(si, ti))),
    }))
    exportXlsx(picked, fileBase)
  }

  const totalTables = sections.reduce((n, s) => n + s.tables.length, 0)
  const allSelected = totalTables > 0 && selected.size >= totalTables
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allTableKeys(sections)))

  // body 로 포털 렌더 — 오른쪽 패널(<aside>)의 backdrop-blur 가 fixed 의 기준(containing
  // block)이 되어 모달이 패널 안에 갇히는 문제를 피한다. body 직속이라 화면 가운데 창으로
  // 뜨며(전체화면 아님) 채팅창 위까지 자유롭게 덮는다.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <Table2 size={18} className="shrink-0 text-emerald-600" />
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-800">{heading}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> 표를 불러오는 중…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-sm text-rose-500">
            표를 불러오지 못했습니다. ({error})
          </div>
        ) : !sections.length ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            이 보고서에는 추출할 표가 없습니다.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* 왼쪽: 목차 + 섹션 체크박스 + 저장 버튼 */}
            <div className="flex w-80 shrink-0 flex-col border-r border-slate-200">
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <button
                  onClick={saveAll}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  <Download size={12} /> 전체 저장
                </button>
                <button
                  onClick={saveSelected}
                  disabled={!selected.size}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <Download size={12} /> 선택 저장 ({selected.size})
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">목차</span>
                  <button
                    onClick={toggleAll}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50"
                    title={allSelected ? '모든 표 선택 해제' : '모든 표 선택'}
                  >
                    {allSelected ? '모두 해제' : '모두 선택'}
                  </button>
                </div>
                {sections.map((s, i) => {
                  const st = sectionState(i)
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-1.5 text-[12px] transition ${
                        active === i ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={st.all}
                        ref={(el) => {
                          if (el) el.indeterminate = st.some
                        }}
                        onChange={() => toggleSection(i)}
                        className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                        title="이 섹션의 표 전체 선택/해제"
                      />
                      <button onClick={() => setActive(i)} className="min-w-0 flex-1 truncate text-left">
                        {s.section_path}
                        <span className="ml-1 text-slate-400">
                          ({st.sel}/{st.total})
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 오른쪽: 선택 섹션 표 미리보기 (표마다 체크박스) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {sections[active] && (
                <>
                  <h3 className="mb-3 text-[14px] font-bold text-slate-800">{sections[active].section_path}</h3>
                  {sections[active].tables.map((t, ti) => (
                    <TablePreview
                      key={ti}
                      t={t}
                      checked={selected.has(tableKey(active, ti))}
                      onToggle={() => toggleTable(active, ti)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
