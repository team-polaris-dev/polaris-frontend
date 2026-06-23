import * as XLSX from 'xlsx'
import { Download, Users, Building2 } from 'lucide-react'

/* '지분·관계' 탭 — DART 원본 정형(최대주주 현황 · 타법인 출자현황) 표.
   재무지표 차트와 별개로, 회사의 지분 구조/출자 관계를 표로 보여주고 엑셀로 추출한다. */

export interface ShareholderItem {
  corp_name: string
  holder: string
  relate: string
  qota_rt: string
}
export interface InvestmentItem {
  corp_name: string
  target: string
  qota_rt: string
  book_amount: string
  purpose: string
}
export interface OwnershipData {
  shareholders: ShareholderItem[]
  investments: InvestmentItem[]
}

function exportXlsx(data: OwnershipData) {
  const wb = XLSX.utils.book_new()
  if (data.shareholders.length) {
    const aoa = [
      ['회사', '보유자', '관계', '지분율(%)'],
      ...data.shareholders.map((s) => [s.corp_name, s.holder, s.relate, s.qota_rt]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '최대주주')
  }
  if (data.investments.length) {
    const aoa = [
      ['회사', '피출자사', '지분율(%)', '장부가', '출자목적'],
      ...data.investments.map((v) => [v.corp_name, v.target, v.qota_rt, v.book_amount, v.purpose]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '타법인출자')
  }
  if (!wb.SheetNames.length) return
  XLSX.writeFile(wb, `POLARIS_지분관계_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap border border-slate-200 bg-slate-100 px-2 py-1 text-left font-semibold text-slate-600">
      {children}
    </th>
  )
}
function Td({ children, num = false }: { children: React.ReactNode; num?: boolean }) {
  return (
    <td className={`border border-slate-200 px-2 py-1 text-slate-700 ${num ? 'text-right tabular-nums' : ''}`}>
      {children}
    </td>
  )
}

export default function OwnershipPanel({ data }: { data: OwnershipData }) {
  const { shareholders, investments } = data
  if (!shareholders.length && !investments.length) {
    return <p className="text-xs text-slate-400">표시할 지분·관계 데이터가 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => exportXlsx(data)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300"
        >
          <Download size={12} /> 엑셀
        </button>
      </div>

      {!!shareholders.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            <Users size={13} className="text-sky-500" /> 최대주주 현황
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <Th>회사</Th>
                  <Th>보유자</Th>
                  <Th>관계</Th>
                  <Th>지분율(%)</Th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((s, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <Td>{s.corp_name}</Td>
                    <Td>{s.holder}</Td>
                    <Td>{s.relate}</Td>
                    <Td num>{s.qota_rt}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!investments.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            <Building2 size={13} className="text-amber-500" /> 타법인 출자현황
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <Th>회사</Th>
                  <Th>피출자사</Th>
                  <Th>지분율(%)</Th>
                  <Th>장부가</Th>
                  <Th>출자목적</Th>
                </tr>
              </thead>
              <tbody>
                {investments.map((v, i) => (
                  <tr key={i} className="even:bg-slate-50">
                    <Td>{v.corp_name}</Td>
                    <Td>{v.target}</Td>
                    <Td num>{v.qota_rt}</Td>
                    <Td num>{v.book_amount}</Td>
                    <Td>{v.purpose}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
