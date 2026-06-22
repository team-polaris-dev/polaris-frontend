import { useState } from 'react'
import { ChevronDown, FileText, ExternalLink } from 'lucide-react'
import Markdown from './Markdown'

// 원문 본문 — 흰 종이 느낌의 박스 안에 Markdown(표 포함)으로 렌더한다.
function DocBody({ text, full = false }: { text?: string; full?: boolean }) {
  if (!text) return null
  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-700 shadow-sm dark:border-slate-300/30 dark:bg-slate-100 dark:text-slate-800 ${
        full ? '' : 'max-h-44'
      }`}
    >
      <Markdown text={text} />
    </div>
  )
}

export interface DocItem {
  rcept_no?: string
  chunk_id?: string
  corp_name?: string
  title?: string
  doc_type?: string
  date?: string
  year?: string | number | null
  summary?: string
  section_path?: string
  text?: string
  source_kind?: string
  score?: number | null
}

interface Props {
  docs: DocItem[]
  open: boolean
}

const dartUrl = (rcept_no: string) =>
  `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcept_no}`

interface DocGroup {
  key: string
  rep: DocItem
  sections: DocItem[]
}

// 보고서 단위로 통합 그룹핑.
// · 재무수치 카드(rdb)는 보고서 단위가 아니므로 개별 그룹으로 맨 앞에 고정.
// · rdb 공시 원문 + vec 청크는 같은 보고서(rcept_no, 없으면 보고서명)로 묶어 한 번만 표시.
// · 보고서 그룹은 연도·날짜 내림차순, 그룹 안 섹션은 section_path 순.
function groupDocs(docs: DocItem[]): DocGroup[] {
  const fin: DocGroup[] = []
  const groups = new Map<string, DocItem[]>()
  for (const doc of docs) {
    if (doc.source_kind === 'rdb') {
      fin.push({ key: doc.chunk_id || `fin_${fin.length}`, rep: doc, sections: [doc] })
      continue
    }
    const key = doc.rcept_no || doc.title || doc.chunk_id || String(Math.random())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(doc)
  }
  const reports = Array.from(groups.entries()).map(([key, items]) => {
    const sections = [...items].sort((a, b) =>
      (a.section_path || '').localeCompare(b.section_path || ''),
    )
    // rep: rcept_no(→DART링크·날짜)가 채워진 항목 우선
    const rep = sections.find((s) => s.rcept_no) || sections[0]
    const year = Math.max(...sections.map((s) => Number(s.year) || 0))
    return { key, rep, sections, year }
  })
  reports.sort((a, b) => b.year - a.year || (b.rep.date || '').localeCompare(a.rep.date || ''))
  return [...fin, ...reports.map(({ key, rep, sections }) => ({ key, rep, sections }))]
}

export function DocCard({ doc, index }: { doc: DocItem; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const title = doc.title || doc.doc_type || '문서'
  const hasText = !!(doc.text || doc.summary)

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]">
      <button
        onClick={() => hasText && setExpanded(v => !v)}
        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${hasText ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.04]' : 'cursor-default'} rounded-xl transition`}
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <FileText size={11} className="shrink-0 text-slate-400" />
            <span className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">
              {doc.corp_name && <span className="mr-1 text-slate-500 dark:text-slate-400">{doc.corp_name}</span>}
              {title.length > 30 ? title.slice(0, 30) + '…' : title}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {doc.date && (
              <span className="text-[10px] text-slate-400">{doc.date}</span>
            )}
            {doc.section_path && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">· {doc.section_path}</span>
            )}
            {doc.source_kind === 'rdb' && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">정형</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {doc.rcept_no && (
            <a
              href={dartUrl(doc.rcept_no)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center justify-center rounded-lg bg-sky-100 p-1.5 text-sky-600 transition hover:bg-sky-200 dark:bg-sky-400/20 dark:text-sky-300 dark:hover:bg-sky-400/30"
              title="DART 원문 보기"
            >
              <ExternalLink size={12} />
            </a>
          )}
          {hasText && (
            <ChevronDown
              size={14}
              className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-white/[0.06]">
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-6">
              {doc.summary || doc.text}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 그룹 카드: 같은 보고서의 여러 섹션을 하나로 묶음
function GroupedDocCard({ group, index, full = false }: { group: { key: string; rep: DocItem; sections: DocItem[] }; index: number; full?: boolean }) {
  const { rep, sections } = group
  const isFin = rep.source_kind === 'rdb'
  const [expanded, setExpanded] = useState(isFin) // 재무 요약은 기본 펼침
  // 재무 요약 카드는 '(None년)' 같은 잡음을 떼고 보고서명만
  const title = (rep.title || rep.doc_type || '문서').replace(/\s*\(None년\)/, '')
  const hasMultiple = sections.length > 1
  const hasSingleText = !hasMultiple && !!(sections[0].text || sections[0].summary)

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]">
      <button
        onClick={() => (hasMultiple || hasSingleText) && setExpanded(v => !v)}
        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${(hasMultiple || hasSingleText) ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.04]' : 'cursor-default'} rounded-xl transition`}
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <FileText size={11} className="shrink-0 text-slate-400" />
            <span className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">
              {rep.corp_name && <span className="mr-1 text-slate-500 dark:text-slate-400">{rep.corp_name}</span>}
              {title.length > 30 ? title.slice(0, 30) + '…' : title}
            </span>
            {hasMultiple && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 dark:bg-indigo-400/20 dark:text-indigo-300">
                {sections.length}개 섹션
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {rep.date && (
              <span className="text-[10px] text-slate-400">{rep.date}</span>
            )}
            {/* 단일 섹션이면 section_path 표시 */}
            {!hasMultiple && rep.section_path && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">· {rep.section_path}</span>
            )}
            {rep.source_kind === 'rdb' && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">재무 요약</span>
            )}
            {sections.some((s) => s.source_kind === 'rdb_text') && (
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-600 dark:bg-sky-400/10 dark:text-sky-400">원문</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {rep.rcept_no && (
            <a
              href={dartUrl(rep.rcept_no)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center justify-center rounded-lg bg-sky-100 p-1.5 text-sky-600 transition hover:bg-sky-200 dark:bg-sky-400/20 dark:text-sky-300 dark:hover:bg-sky-400/30"
              title="DART 원문 보기"
            >
              <ExternalLink size={12} />
            </a>
          )}
          {(hasMultiple || hasSingleText) && (
            <ChevronDown
              size={14}
              className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {hasMultiple ? (
            // 여러 섹션 목록
            <div className="border-t border-slate-100 divide-y divide-slate-100 dark:border-white/[0.06] dark:divide-white/[0.06]">
              {sections.map((sec, si) => (
                <SectionRow key={sec.chunk_id || si} sec={sec} full={full} />
              ))}
            </div>
          ) : (
            // 단일 섹션 본문
            <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-white/[0.06]">
              <DocBody text={sections[0].summary || sections[0].text} full={full} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionRow({ sec, full = false }: { sec: DocItem; full?: boolean }) {
  const [open, setOpen] = useState(false)
  const hasText = !!(sec.text || sec.summary)
  return (
    <div>
      <button
        onClick={() => hasText && setOpen(v => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left ${hasText ? 'hover:bg-slate-50 dark:hover:bg-white/[0.03]' : ''} transition`}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {sec.section_path || '본문'}
        </span>
        {hasText && (
          <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      <div
        className="grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-2.5">
            <DocBody text={sec.summary || sec.text} full={full} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DocDrawer({ docs, open }: Props) {
  return (
    <div
      className="grid transition-all duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <div className="mt-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 pb-3 pt-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <FileText size={12} />
            원본 문서 ({docs.length}건)
          </div>
          <div className="flex flex-col gap-1.5">
            {docs.map((doc, i) => (
              <DocCard key={doc.chunk_id || doc.rcept_no || i} doc={doc} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// 그룹핑된 원본 문서 목록 — 우측 패널에서 사용. full 이면 본문 전체를 펼쳐 보여준다.
export function GroupedDocList({ docs, full = false }: { docs: DocItem[]; full?: boolean }) {
  const groups = groupDocs(docs)
  // 통합 요약: 보고서 건수(재무 요약 제외) · 섹션 합계
  const reportGroups = groups.filter((g) => g.rep.source_kind !== 'rdb')
  const sectionCount = reportGroups.reduce((n, g) => n + g.sections.length, 0)
  const hasFin = groups.some((g) => g.rep.source_kind === 'rdb')
  return (
    <div className="flex flex-col gap-2">
      <div className="px-0.5 text-[11px] text-slate-400">
        {hasFin && '재무 요약 · '}
        보고서 {reportGroups.length}건 · 섹션 {sectionCount}개
      </div>
      {groups.map((group, i) => (
        <GroupedDocCard key={group.key} group={group} index={i} full={full} />
      ))}
    </div>
  )
}

// 보고서 단위 출처 목록 — rcept_no(없으면 보고서명/chunk_id)로 중복 제거,
// 재무 요약(rdb)은 단일 보고서 출처가 아니라 제외. SourceList 와 채팅 버튼 건수가
// 같은 기준을 쓰도록 공용으로 둔다.
export function dedupSources(docs: DocItem[]): DocItem[] {
  const seen = new Map<string, DocItem>()
  for (const d of docs) {
    if (d.source_kind === 'rdb') continue
    const key = d.rcept_no || d.title || d.chunk_id || ''
    if (!key || seen.has(key)) continue
    seen.set(key, d)
  }
  return Array.from(seen.values())
}

// 간단한 출처 목록 — 보고서명 + DART 링크 버튼만. (사실 나열본 아래에 붙는다)
export function SourceList({ docs }: { docs: DocItem[] }) {
  const sources = dedupSources(docs)
  if (!sources.length) return null

  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((d, i) => {
        const name = (d.title || d.doc_type || '문서').replace(/\s*\(None년\)/, '')
        return (
          <li
            key={d.rcept_no || d.chunk_id || i}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <FileText size={12} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700 dark:text-slate-200">
              {d.corp_name && <span className="mr-1 text-slate-500 dark:text-slate-400">{d.corp_name}</span>}
              {name}
              {d.date && <span className="ml-1 text-[10px] text-slate-400">{d.date}</span>}
            </span>
            {d.rcept_no && (
              <a
                href={dartUrl(d.rcept_no)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-600 transition hover:bg-sky-200 dark:bg-sky-400/20 dark:text-sky-300 dark:hover:bg-sky-400/30"
                title="DART 원문 보기"
              >
                <ExternalLink size={11} /> 원문
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
