import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'

/** 적재 파이프라인 — 가로 스텝퍼(운영용, 설명 없음). 누르면 순서대로 실행되는 고정 흐름.
 *  KG 추출(6)·엔티티 통합(7)은 추출 포함 시에만. */
const STAGES = ['수집', '청킹', 'MariaDB', 'Qdrant', 'Neo4j', 'KG 추출', '통합'] as const
const EXTRACT_FROM = 5 // 인덱스 5(KG 추출)부터 추출 의존

type Props = { includeExtract: boolean; extractOnly?: boolean }

export default function PipelineStages({ includeExtract, extractOnly = false }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {STAGES.map((label, i) => {
        // 추출만 모드: 적재 단계(0~4) 흐림 / 일반 모드: 추출 끄면 추출 단계(5~6) 흐림
        const dim = extractOnly ? i < EXTRACT_FROM : i >= EXTRACT_FROM && !includeExtract
        return (
          <Fragment key={label}>
            <div
              className={
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ' +
                (dim
                  ? 'border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 line-through'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200')
              }
            >
              <span className="text-slate-400">{i + 1}</span>
              {label}
            </div>
            {i < STAGES.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
