import { useMemo, useState } from 'react'
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
import { ChevronDown, BarChart2 } from 'lucide-react'

export interface FinancialMetric {
  label: string
  value: number
  unit: string
}

export interface FinancialGroup {
  corp_name: string
  year: number | null
  unit: string
  metrics: FinancialMetric[]
}

/* ─── 표시할 지표 + 색상 ─── */
const INCOME_KEYS  = ['매출액', '매출총이익', '영업이익', '세전순이익', '당기순이익']
const BALANCE_KEYS = ['총자산', '유동자산', '자본총계', '현금및현금성자산', '총부채', '유동부채']

const INCOME_COLORS  = ['#22c55e', '#86efac', '#f87171', '#fb923c', '#818cf8']
const BALANCE_COLORS = ['#f59e0b', '#fcd34d', '#84cc16', '#06b6d4', '#ef4444', '#f472b6']

// 연도별(최신→과거) 막대 색 — 비교 차트용
const YEAR_COLORS = ['#22c55e', '#60a5fa', '#a78bfa', '#fb923c']

/* ─── 답변 본문의 마크다운 표 → 연도별 FinancialGroup[] ───
   표 헤더에서 연도 열(예: "2025년(조원)")을 찾아 각 연도를 그룹으로 만든다.
   연도 열이 2개 이상이고, 알려진 재무 지표 행이 있을 때만 반환(아니면 null). */
const KNOWN_LABELS = new Set([...INCOME_KEYS, ...BALANCE_KEYS])

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
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
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
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
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
              style={{ fontSize: 10, fill: '#94a3b8' }}
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
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={42} />
        <Tooltip content={<CmpTooltip unit={unit} />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
        {years.map((y, yi) => (
          <Bar key={y} dataKey={`y${y}`} name={`${y}년`} radius={[5, 5, 0, 0]}
            fill={YEAR_COLORS[yi % YEAR_COLORS.length]} fillOpacity={0.9} maxBarSize={46}>
            <LabelList
              dataKey={`y${y}`}
              position="top"
              style={{ fontSize: 9, fill: '#94a3b8' }}
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

/* ─── 메인 컴포넌트 ─── */
interface Props {
  financials: FinancialGroup[]
  // 답변 본문 — 안에 다년도 표가 있으면 그걸 우선해 비교 차트로 그린다
  sourceText?: string
}

export default function FinancialChart({ financials, sourceText }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  // 본문 표에서 다년도 데이터를 파싱 (있으면 비교 차트 우선)
  const comparison = useMemo(() => {
    if (!sourceText) return null
    return parseFinancialTable(sourceText, financials?.[0]?.corp_name || '')
  }, [sourceText, financials])

  if (!financials?.length && !comparison) return null

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
            {comparison ? (
              <span className="ml-1.5 font-normal text-slate-400">
                — {comparison[0].corp_name || financials?.[0]?.corp_name || ''}{' '}
                {comparison.map((g) => g.year).sort((a, b) => (b as number) - (a as number)).join('·')}년 비교
                &nbsp;(단위:&nbsp;{comparison.find((g) => g.unit)?.unit || '조원'})
              </span>
            ) : financials.length === 1 ? (
              <span className="ml-1.5 font-normal text-slate-400">
                — {financials[0].corp_name} {financials[0].year}년&nbsp;(단위:&nbsp;{financials[0].unit})
              </span>
            ) : null}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-slate-400 transition-transform duration-200 ${
              collapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        {/* 차트 본문 */}
        {!collapsed && comparison && (
          <div className="border-t border-slate-200 px-4 pb-5 pt-3 dark:border-white/10">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              연도별 비교
            </p>
            <ComparisonChart groups={comparison} />
          </div>
        )}

        {/* 차트 본문 — 단년도(백엔드 구조화 데이터) */}
        {!collapsed && !comparison && (
          <div className="border-t border-slate-200 px-4 pb-5 pt-3 dark:border-white/10">
            {financials.map((group, gi) => {
              const map = Object.fromEntries(group.metrics.map((m) => [m.label, m.value]))
              const unit = group.unit

              const incomeData = INCOME_KEYS
                .filter((k) => map[k] !== undefined)
                .map((k) => ({ name: k, value: map[k] }))

              const balanceData = BALANCE_KEYS
                .filter((k) => map[k] !== undefined)
                .map((k) => ({ name: k, value: map[k] }))

              return (
                <div
                  key={gi}
                  className={
                    gi > 0
                      ? 'mt-5 border-t border-slate-200 pt-4 dark:border-white/10'
                      : ''
                  }
                >
                  {financials.length > 1 && (
                    <p className="mb-3 text-[12px] font-semibold text-slate-600 dark:text-slate-200">
                      {group.corp_name} · {group.year}년
                      <span className="ml-1.5 font-normal text-slate-400">
                        (단위: {unit})
                      </span>
                    </p>
                  )}

                  <div className="grid gap-6 sm:grid-cols-2">
                    <SectionBarChart
                      title="손익 현황"
                      data={incomeData}
                      colors={INCOME_COLORS}
                      unit={unit}
                    />
                    <SectionBarChart
                      title="재무 상태"
                      data={balanceData}
                      colors={BALANCE_COLORS}
                      unit={unit}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
