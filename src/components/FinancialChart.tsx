import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
  Legend,
} from 'recharts'
import { ChevronDown, BarChart2, Download } from 'lucide-react'
import { exportNodeToPng } from '../lib/export'

/* 차트 하나를 감싸 우상단에 PNG 저장 버튼을 붙인다. 버튼은 캡처 영역(ref) 밖이라
   이미지에 찍히지 않는다. 차트별로 따로 내려받을 수 있게 각 차트를 이걸로 감싼다. */
function ChartCapture({ fileName, children }: { fileName: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="relative">
      <button
        onClick={() =>
          exportNodeToPng(ref.current, fileName).catch((e) =>
            console.error('차트 이미지 저장 실패:', e),
          )
        }
        className="absolute right-1 top-1 z-10 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 shadow-sm transition hover:bg-blue-100"
        title="이 차트를 PNG 이미지로 저장"
      >
        <Download size={10} /> 이미지
      </button>
      {/* 흰 카드 위에 진한 글자 — 화면·내보낸 PNG 모두 또렷하게 (다크 패널에선
          정리 원문 카드와 같은 밝은 카드 패턴) */}
      <div ref={ref} className="rounded-lg border border-slate-200 bg-white p-3">
        {children}
      </div>
    </div>
  )
}

export interface FinancialMetric {
  label: string
  value: number
  unit: string
  // 표(테이블)용 정확 표기(예: "3.7조원") — 백엔드가 값마다 조/억을 붙여 보낸다.
  // 차트는 value(그룹 단일 단위로 반올림)를, 표는 display 를 쓴다.
  display?: string
  // 엑셀 추출용 원본 금액(원) — 반올림 없는 정확한 숫자. 없으면 표시값으로 폴백.
  raw?: number
}

export interface FinancialGroup {
  corp_name: string
  year: number | null
  unit: string
  metrics: FinancialMetric[]
}

// DART 원본 정형 — 재무비율(주요지표). 재무지표 탭 하단에 표로 보여준다.
export interface RatioItem {
  name: string
  value: string
  category: string
}
export interface RatioGroup {
  corp_name: string
  year: number | string | null
  items: RatioItem[]
}

/* ─── 표시할 지표 + 색상 ─── */
const INCOME_KEYS  = ['매출액', '매출총이익', '영업이익', '금융수익', '금융비용', '세전순이익', '법인세비용', '당기순이익']
const BALANCE_KEYS = ['총자산', '유동자산', '비유동자산', '유형자산', '총부채', '유동부채', '비유동부채', '자본총계', '자본금', '이익잉여금', '현금및현금성자산']
const CASHFLOW_KEYS = ['영업활동현금흐름', '투자활동현금흐름', '재무활동현금흐름']

const INCOME_COLORS  = ['#22c55e', '#86efac', '#16a34a', '#34d399', '#f87171', '#fb923c', '#fca5a5', '#818cf8']
const BALANCE_COLORS = ['#f59e0b', '#fcd34d', '#fbbf24', '#06b6d4', '#ef4444', '#f472b6', '#fda4af', '#84cc16', '#a3e635', '#22d3ee', '#38bdf8']
const CASHFLOW_COLORS = ['#0ea5e9', '#a78bfa', '#f43f5e']

// 연도별(최신→과거) 막대 색 — 비교 차트용
const YEAR_COLORS = ['#22c55e', '#60a5fa', '#a78bfa', '#fb923c']

/* ─── 답변 본문의 마크다운 표 → 연도별 FinancialGroup[] ───
   표 헤더에서 연도 열(예: "2025년(조원)")을 찾아 각 연도를 그룹으로 만든다.
   연도 열이 2개 이상이고, 알려진 재무 지표 행이 있을 때만 반환(아니면 null). */
const KNOWN_LABELS = new Set([...INCOME_KEYS, ...BALANCE_KEYS, ...CASHFLOW_KEYS])

const splitRow = (l: string) =>
  l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const toNum = (s: string): number | null => {
  const m = (s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

interface FinTableScan {
  start: number // 헤더 줄 인덱스
  end: number // 표 본문 다음 줄 인덱스
  yearCols: { idx: number; year: number; unit: string }[]
  rows: { label: string; cells: string[] }[]
  globalUnit: string
}

/* 본문에서 "다년도 재무 표"(연도 열 ≥2 + 알려진 지표 행)를 한 개 찾아 위치·내용 반환 */
function scanFinancialTable(lines: string[]): FinTableScan | null {
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]
    const sep = lines[i + 1]
    if (header.indexOf('|') === -1) continue
    if (sep.indexOf('-') === -1 || !/^\s*\|?[\s:|-]+\|?\s*$/.test(sep)) continue

    const headerCells = splitRow(header)
    const yearCols: { idx: number; year: number; unit: string }[] = []
    headerCells.forEach((h, ci) => {
      const ym = h.match(/(19|20)\d{2}/)
      if (!ym) return
      const unit = (h.match(/조원|억원|백만원|천원|원/) || [])[0] || ''
      yearCols.push({ idx: ci, year: parseInt(ym[0], 10), unit })
    })
    if (yearCols.length < 2) continue

    const rows: { label: string; cells: string[] }[] = []
    let j = i + 2
    for (; j < lines.length; j++) {
      const l = lines[j]
      if (!l || l.trim() === '' || l.indexOf('|') === -1) break
      rows.push({ label: (splitRow(l)[0] || '').replace(/\*\*/g, '').trim(), cells: splitRow(l) })
    }
    if (!rows.some((r) => KNOWN_LABELS.has(r.label))) continue

    const globalUnit = yearCols.find((y) => y.unit)?.unit || '조원'
    return { start: i, end: j, yearCols, rows, globalUnit }
  }
  return null
}

export function parseFinancialTable(markdown: string, fallbackCorp = ''): FinancialGroup[] | null {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const scan = scanFinancialTable(lines)
  if (!scan) return null

  const groups: FinancialGroup[] = scan.yearCols
    .map((yc) => {
      const metrics: FinancialMetric[] = []
      for (const r of scan.rows) {
        if (!KNOWN_LABELS.has(r.label)) continue
        const v = toNum(r.cells[yc.idx])
        if (v == null) continue
        metrics.push({ label: r.label, value: v, unit: yc.unit || scan.globalUnit })
      }
      return { corp_name: fallbackCorp, year: yc.year, unit: yc.unit || scan.globalUnit, metrics }
    })
    .filter((g) => g.metrics.length > 0)

  return groups.length >= 2 ? groups : null
}

/* 답변 본문에서 재무 표 블록만 제거 (차트로 대체하므로 중복 표시 방지) */
export function stripFinancialTable(markdown: string): string {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const scan = scanFinancialTable(lines)
  if (!scan) return markdown
  const before = lines.slice(0, scan.start)
  const after = lines.slice(scan.end)
  while (before.length && before[before.length - 1].trim() === '') before.pop()
  while (after.length && after[0].trim() === '') after.shift()
  // 표 앞뒤가 모두 본문이면 한 줄 띄워 자연스럽게 잇는다
  const seam = before.length && after.length ? [''] : []
  return [...before, ...seam, ...after].join('\n')
}

/* ─── 커스텀 툴팁 ─── */
const ChartTooltip = ({ active, payload, unit }: { active?: boolean; payload?: { name: string; value: number }[]; unit: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0c2a] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-200">{payload[0].name}</p>
      <p className="text-sky-300">
        {payload[0].value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
        {unit}
      </p>
    </div>
  )
}

/* ─── 단일 섹션 막대그래프 ─── */
function SectionBarChart({
  title,
  data,
  colors,
  unit,
}: {
  title: string
  data: { name: string; value: number }[]
  colors: string[]
  unit: string
}) {
  if (!data.length) return null

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={data}
          margin={{ top: 28, right: 4, bottom: 0, left: -8 }}
          barCategoryGap="28%"
        >
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#475569' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#475569' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}`}
            width={42}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} />}
            cursor={{ fill: 'rgba(148,163,184,0.06)' }}
          />
          <Bar dataKey="value" name="value" radius={[5, 5, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.88} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              style={{ fontSize: 10, fill: '#475569' }}
              formatter={(v: unknown) => {
                const n = typeof v === 'number' ? v : parseFloat(String(v))
                return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit}`
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* 표 행 순서(손익→재무상태→현금흐름) + 구간 헤더 위치 */
const TABLE_SECTIONS: { title: string; keys: string[] }[] = [
  { title: '손익', keys: INCOME_KEYS },
  { title: '재무상태', keys: BALANCE_KEYS },
  { title: '현금흐름', keys: CASHFLOW_KEYS },
]

/* 그룹들 컬럼 헤더 — 회사가 모두 같으면 연도만, 아니면 '회사 연도' */
function groupColLabel(g: FinancialGroup, sameCorp: boolean): string {
  if (sameCorp) return `${g.year ?? ''}년`
  return `${g.corp_name || '재무'} ${g.year ?? ''}`.trim()
}

/* 재무지표 → CSV(UTF-8 BOM, 엑셀에서 바로 열림). 셀은 원본 금액(원, raw)을 쓰고
   없으면 표시값으로 폴백. 원문 표처럼 '항목 × (회사·연도)' 피벗 구조로 저장한다. */
function exportFinancialsCsv(groups: FinancialGroup[], fileBase: string) {
  const sameCorp = new Set(groups.map((g) => g.corp_name)).size <= 1
  const labels: string[] = []
  for (const sec of TABLE_SECTIONS)
    for (const k of sec.keys)
      if (groups.some((g) => g.metrics.some((m) => m.label === k)) && !labels.includes(k))
        labels.push(k)

  const rawMaps = groups.map((g) => new Map(g.metrics.map((m) => [m.label, m])))
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const header = ['항목', ...groups.map((g) => `${groupColLabel(g, sameCorp)} (원)`)]
  const rows = labels.map((k) => {
    const cells = rawMaps.map((rm) => {
      const m = rm.get(k)
      if (!m) return ''
      return m.raw != null ? String(m.raw) : (m.display ?? String(m.value))
    })
    return [k, ...cells]
  })
  const csv = [header, ...rows].map((r) => r.map((c) => esc(String(c))).join(',')).join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── 전체 지표 표(피벗) ─── 차트엔 안 들어간 세부 계정까지 값마다 정확 표기로.
   손익/재무상태/현금흐름 3구간으로 묶고, 그룹(회사·연도)이 여럿이면 열로 나란히.
   길어지면 바깥 컨테이너가 스크롤된다. 우상단에 엑셀(CSV) 추출 버튼. */
function MetricPivotTable({ groups }: { groups: FinancialGroup[] }) {
  if (!groups.length) return null
  const sameCorp = new Set(groups.map((g) => g.corp_name)).size <= 1
  const dmaps = groups.map(
    (g) => new Map(g.metrics.map((m) => [m.label, m.display ?? `${m.value}${m.unit}`])),
  )
  const present = TABLE_SECTIONS.map((s) => ({
    title: s.title,
    rows: s.keys.filter((k) => dmaps.some((dm) => dm.has(k))),
  })).filter((s) => s.rows.length > 0)
  if (!present.length) return null

  const corp = groups[0].corp_name || '재무'
  const colSpan = 1 + groups.length

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100/70">
            <th className="px-2 py-1.5 text-left font-semibold text-slate-600">항목</th>
            {groups.map((g, i) => (
              <th key={i} className="px-2 py-1.5 text-right font-semibold text-slate-600">
                {groupColLabel(g, sameCorp)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {present.map((sec) => (
            <Fragment key={sec.title}>
              <tr className="bg-slate-50">
                <td
                  colSpan={colSpan}
                  className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                >
                  {sec.title}
                </td>
              </tr>
              {sec.rows.map((k) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-600">{k}</td>
                  {dmaps.map((dm, i) => (
                    <td
                      key={i}
                      className="px-2 py-1 text-right font-medium tabular-nums text-slate-800"
                    >
                      {dm.get(k) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-slate-200 bg-slate-50/60 px-2 py-1.5">
        <button
          onClick={() => exportFinancialsCsv(groups, `POLARIS_${corp}_재무지표`)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100"
          title="이 표를 엑셀(CSV)로 저장 — 원본 금액(원) 기준"
        >
          <Download size={10} /> 엑셀
        </button>
      </div>
    </div>
  )
}

/* ─── 연도 비교 그룹 막대그래프 ─── */
const CmpTooltip = ({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0c2a] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name} : {p.value?.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}{unit}
        </p>
      ))}
    </div>
  )
}

function ComparisonChart({ groups }: { groups: FinancialGroup[] }) {
  // 최신 연도 먼저
  const years = groups.map((g) => g.year as number).sort((a, b) => b - a)
  const unit = groups.find((g) => g.unit)?.unit || '조원'

  // 지표 순서: 정해진 순서 우선, 표 등장 순 유지
  const order = [...INCOME_KEYS, ...BALANCE_KEYS]
  const labelSet = new Set<string>()
  for (const g of groups) for (const m of g.metrics) labelSet.add(m.label)
  const labels = Array.from(labelSet).sort(
    (a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999),
  )

  const byYear = new Map(groups.map((g) => [g.year as number, new Map(g.metrics.map((m) => [m.label, m.value]))]))
  const data = labels.map((name) => {
    const row: Record<string, number | string | null> = { name }
    for (const y of years) row[`y${y}`] = byYear.get(y)?.get(name) ?? null
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 28, right: 6, bottom: 0, left: -8 }} barCategoryGap="22%">
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} width={42} />
        <Tooltip content={<CmpTooltip unit={unit} />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
        {years.map((y, yi) => (
          <Bar key={y} dataKey={`y${y}`} name={`${y}년`} radius={[5, 5, 0, 0]}
            fill={YEAR_COLORS[yi % YEAR_COLORS.length]} fillOpacity={0.9} maxBarSize={46}>
            <LabelList
              dataKey={`y${y}`}
              position="top"
              style={{ fontSize: 9, fill: '#475569' }}
              formatter={(v: unknown) => {
                const n = typeof v === 'number' ? v : parseFloat(String(v))
                return Number.isFinite(n) ? `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}` : ''
              }}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── 재무비율 표 ─── DART 주요지표(부채비율·ROE 등). 회사별 그룹. */
function RatiosTable({ groups }: { groups: RatioGroup[] }) {
  const present = groups.filter((g) => g.items?.length)
  if (!present.length) return null
  return (
    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">재무비율 (주요지표)</p>
      {present.map((g, gi) => (
        <div key={gi} className="mb-3">
          <p className="mb-1 text-[12px] font-semibold text-slate-700">
            {g.corp_name}
            {g.year ? <span className="ml-1 font-normal text-slate-500">({g.year})</span> : null}
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {g.items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-2 py-1 text-slate-600">{it.name}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums text-slate-800">{it.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── 메인 컴포넌트 ─── */
interface Props {
  financials: FinancialGroup[]
  // 답변 본문 — 안에 다년도 표가 있으면 그걸 우선해 비교 차트로 그린다
  sourceText?: string
  // DART 주요지표(재무비율) — 차트/표 아래에 별도 표로 노출
  ratios?: RatioGroup[]
  // 우측 패널 모드 — 자체 카드 테두리·접기 헤더 없이 차트만 그린다(탭이 제목 역할).
  panelMode?: boolean
}

export default function FinancialChart({ financials, sourceText, ratios, panelMode = false }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  // 차트/표 전환 — 한 화면에 둘 다 쌓지 않고 탭으로 바꿔 본다(기본 차트).
  const [view, setView] = useState<'chart' | 'table'>('chart')

  // 본문 표에서 다년도 데이터를 파싱 (있으면 비교 차트 우선)
  const comparison = useMemo(() => {
    if (!sourceText) return null
    return parseFinancialTable(sourceText, financials?.[0]?.corp_name || '')
  }, [sourceText, financials])

  if (!financials?.length && !comparison && !ratios?.length) return null

  // 헤더/탭에 붙는 부제(회사·연도·단위)
  const subtitle = comparison ? (
    <>
      {comparison[0].corp_name || financials?.[0]?.corp_name || ''}{' '}
      {comparison.map((g) => g.year).sort((a, b) => (b as number) - (a as number)).join('·')}년 비교
      &nbsp;(단위:&nbsp;{comparison.find((g) => g.unit)?.unit || '조원'})
    </>
  ) : financials.length === 1 ? (
    <>
      {financials[0].corp_name} {financials[0].year}년&nbsp;(단위:&nbsp;{financials[0].unit})
    </>
  ) : null

  // 차트 본문 — 비교(다년도) 우선, 없으면 단년도(백엔드 구조화 데이터)
  const bodyClass = panelMode
    ? 'pt-1'
    : 'border-t border-slate-200 px-4 pb-5 pt-3 dark:border-white/10'
  const cmpCorp = comparison?.[0]?.corp_name || financials?.[0]?.corp_name || '재무'
  const tableGroups = comparison ?? financials

  // 차트만(표는 아래 view 토글로 분리). 비교(다년도) 우선, 없으면 단년도 구간 차트.
  const chartContent = comparison ? (
    <ChartCapture fileName={`POLARIS_${cmpCorp}_연도비교`}>
      <p className="text-[12px] font-semibold text-slate-700">{subtitle}</p>
      <p className="mb-2 mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
        연도별 비교
      </p>
      <ComparisonChart groups={comparison} />
    </ChartCapture>
  ) : (
    financials.map((group, gi) => {
      const map = Object.fromEntries(group.metrics.map((m) => [m.label, m.value]))
      const unit = group.unit
      const tag = `${group.corp_name || '재무'}_${group.year ?? ''}`

      const pick = (keys: string[]) =>
        keys.filter((k) => map[k] !== undefined).map((k) => ({ name: k, value: map[k] }))
      const incomeData = pick(INCOME_KEYS)
      const balanceData = pick(BALANCE_KEYS)
      const cashflowData = pick(CASHFLOW_KEYS)

      return (
        <div key={gi} className={gi > 0 ? 'mt-5 border-t border-slate-200 pt-4 dark:border-white/10' : ''}>
          {/* 기업 단위로 한 번에 캡처 — 손익·재무상태·현금흐름 차트를 한 이미지로.
              각 구간을 세로로 쌓아(막대 11개도 가로폭 확보) 가독성을 지킨다. */}
          <ChartCapture fileName={`POLARIS_${tag}`}>
            <p className="mb-3 text-[12px] font-semibold text-slate-700">
              {group.corp_name} · {group.year}년
              <span className="ml-1.5 font-normal text-slate-500">(단위: {unit})</span>
            </p>
            <div className="space-y-5">
              <SectionBarChart title="손익 현황" data={incomeData} colors={INCOME_COLORS} unit={unit} />
              <SectionBarChart title="재무 상태" data={balanceData} colors={BALANCE_COLORS} unit={unit} />
              <SectionBarChart title="현금흐름" data={cashflowData} colors={CASHFLOW_COLORS} unit={unit} />
            </div>
          </ChartCapture>
        </div>
      )
    })
  )

  // 계정이 22종이라 길어진다. 패널 모드에선 바깥 패널이 스크롤하므로 안쪽 스크롤을 두지
  // 않는다(이중 스크롤 + 기본 흰 스크롤바 방지). 인라인 모드에선 자체 스크롤하되 바는 숨긴다.
  const hasFin = !!(comparison || financials.length)
  const scrollCls = panelMode ? '' : 'no-scrollbar max-h-[72vh] overflow-y-auto'
  const body = (
    <div className={`${bodyClass} ${scrollCls}`}>
      {/* 차트 ↔ 표 전환 토글 (재무 수치가 있을 때만) */}
      {hasFin && (
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 transition ${
                view === v ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {v === 'chart' ? '차트' : '표'}
            </button>
          ))}
        </div>
      )}
      {hasFin && (view === 'chart' ? chartContent : <MetricPivotTable groups={tableGroups} />)}
      {ratios?.length ? <RatiosTable groups={ratios} /> : null}
    </div>
  )

  // 패널 모드 — 테두리·접기 없이 차트 카드만 (제목/부제는 캡처 카드 안에 포함).
  if (panelMode) {
    return <div className="w-full">{body}</div>
  }

  return (
    <div
      className="mt-2 w-full"
      style={{
        animation: 'polarisFade .5s ease both',
        animationDelay: '0.15s',
        opacity: 0,
        animationFillMode: 'forwards',
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-white/70 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
        {/* 헤더 */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        >
          <BarChart2 size={14} className="shrink-0 text-blue-500 dark:text-sky-400" />
          <span className="flex-1 text-[12px] font-semibold text-slate-600 dark:text-slate-200">
            재무지표 차트
            {subtitle && <span className="ml-1.5 font-normal text-slate-400">— {subtitle}</span>}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-slate-400 transition-transform duration-200 ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        {/* 차트 본문 */}
        {!collapsed && body}
      </div>
    </div>
  )
}
