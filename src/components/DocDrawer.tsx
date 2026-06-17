import { useState } from 'react'
import { ChevronDown, FileText, ExternalLink } from 'lucide-react'

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

// 같은 보고서(rcept_no 또는 title+date)로 그룹핑
function groupDocs(docs: DocItem[]): { key: string; rep: DocItem; sections: DocItem[] }[] {
  const groups = new Map<string, DocItem[]>()
  for (const doc of docs) {
    // rdb 정형 데이터는 개별 표시
    const key = doc.source_kind === 'rdb'
      ? doc.chunk_id || `rdb_${Math.random()}`
      : doc.rcept_no || `${doc.title}_${doc.date}` || doc.chunk_id || String(Math.random())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(doc)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    rep: items[0],
    sections: items,
  }))
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
function GroupedDocCard({ group, index }: { group: { key: string; rep: DocItem; sections: DocItem[] }; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const { rep, sections } = group
  const title = rep.title || rep.doc_type || '문서'
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
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">정형</span>
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
                <SectionRow key={sec.chunk_id || si} sec={sec} />
              ))}
            </div>
          ) : (
            // 단일 섹션 본문
            <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-white/[0.06]">
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-6">
                {sections[0].summary || sections[0].text}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionRow({ sec }: { sec: DocItem }) {
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
          <p className="px-3 pb-2.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-6">
            {sec.summary || sec.text}
          </p>
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

// 플립 카드 뒷면용 — 그룹핑 적용
export function GroupedDocList({ docs }: { docs: DocItem[] }) {
  const groups = groupDocs(docs)
  return (
    <div className="flex flex-col gap-2">
      {groups.map((group, i) => (
        <GroupedDocCard key={group.key} group={group} index={i} />
      ))}
    </div>
  )
}
