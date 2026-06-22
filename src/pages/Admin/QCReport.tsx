import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { adminApi } from '../../lib/api/admin'
import type { QcChunk } from '../../lib/api/types'
import {
  useQcAcknowledge,
  useQcApplyAll,
  useQcBatchStatus,
  useQcDisabled,
  useQcEntityBatchStatus,
  useQcEntityJudgeAll,
  useQcEntityJudgeAllStop,
  useQcJudge,
  useQcJudgeAll,
  useQcJudgeAllStop,
  useQcReport,
  useQcRescan,
  useQcResolve,
  useQcRestore,
} from '../../lib/hooks/useJob'
import type { QcConflict, QcSuspect } from '../../lib/api/types'

const SUSPECT_LABEL: Record<string, string> = {
  zero_zero_high_signal: '키워드 있는데 추출 0건',
  edge_manual_check: '엣지 수동 확인 필요',
  model_error: '모델/파싱 에러',
  empty_review_file: '빈 review 파일',
}

// LLM 엔티티 판정 verdict → 표시 라벨 + 쓰레기 여부
const VERDICT_LABEL: Record<string, string> = {
  company: '회사',
  country_region: '국가/지역',
  product: '제품',
  generic: '일반어',
  person: '인물',
  uncertain: '불확실',
}
const JUNK_VERDICTS = new Set(['country_region', 'product', 'generic', 'person'])

/** 비회사 항목의 분류 라벨(geo 결정론 / LLM verdict) */
function ncLabel(c: QcConflict): string {
  if (c.decision === 'geo') return '국가/지역'
  return VERDICT_LABEL[String(c.verdict)] ?? '비회사'
}

const pairKey = (c: QcConflict) => `${c.a_id}|${c.b_id}`

function suspectText(s: QcSuspect): string {
  if (s.edge) return `${s.edge.subject ?? ''} -[${s.edge.predicate ?? ''}]-> ${s.edge.object ?? ''}`
  return s.reason ?? ''
}

export default function QCReportPage() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching, error, refetch } = useQcReport()
  const rescan = useQcRescan()
  const judge = useQcJudge()
  const resolve = useQcResolve()
  const restore = useQcRestore()
  const acknowledge = useQcAcknowledge()
  const disabled = useQcDisabled()
  const [showDisabled, setShowDisabled] = useState(false)
  const [judgingKey, setJudgingKey] = useState<string | null>(null)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [restoringKey, setRestoringKey] = useState<string | null>(null)
  const [chunkModal, setChunkModal] = useState<
    { title: string; labels: string[]; loading: boolean; chunks: QcChunk[] } | null
  >(null)

  // 근거 청크 모달 — 라벨이 붙은 청크 목록을 받아 입력 순서대로 표시.
  // 양방향(근거①/②)·비회사(근거 본문 1건) 모두 같은 모달을 재사용한다.
  async function openChunks(title: string, items: { id?: string | null; label: string }[]) {
    const valid = items.filter((x) => x.id)
    setChunkModal({ title, labels: valid.map((x) => x.label), loading: true, chunks: [] })
    try {
      const chunks = await adminApi.qcChunk(valid.map((x) => x.id) as string[])
      setChunkModal((m) => (m ? { ...m, loading: false, chunks } : m))
    } catch {
      setChunkModal((m) => (m ? { ...m, loading: false, chunks: [] } : m))
    }
  }
  const [openCorp, setOpenCorp] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  // 일괄 작업은 서버 백그라운드 스레드에서 — 페이지를 떠나도 계속 진행된다.
  const batchStatus = useQcBatchStatus()
  const judgeAll = useQcJudgeAll()
  const judgeAllStop = useQcJudgeAllStop()
  const applyAll = useQcApplyAll()
  const serverBatchRunning = batchStatus.data?.running === true
  // 비회사 후보 LLM 엔티티 판정 (별도 백그라운드 배치)
  const entityBatch = useQcEntityBatchStatus()
  const entityJudgeAll = useQcEntityJudgeAll()
  const entityJudgeAllStop = useQcEntityJudgeAllStop()
  const entityBatchRunning = entityBatch.data?.running === true

  // 서버 일괄 판정(방향/엔티티)이 도는 동안 리포트를 주기적으로 갱신해 판정이 쌓이는 걸 보여준다
  useEffect(() => {
    if (!serverBatchRunning && !entityBatchRunning) return
    const t = setInterval(
      () => qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] }),
      5_000,
    )
    return () => clearInterval(t)
  }, [serverBatchRunning, entityBatchRunning, qc])

  if (isLoading) return <div className="p-6 text-slate-400">QC 리포트 읽는 중…</div>
  if (error || !data)
    return <div className="p-6 text-rose-500">읽기 실패: {(error as Error)?.message ?? 'unknown'}</div>

  const all = data.conflicts?.items ?? []
  const actionable = all.filter((c) => c.kind === 'bidirectional_supplies' || c.kind === 'self_loop')
  const informational = all.filter((c) => c.kind === 'ledger_graph_direction_conflict')
  // 비회사 SUPPLIES_TO — 엔티티 단위. geo=결정론 확정, pending=LLM 판정 대상.
  const ncAll = all.filter((c) => c.kind === 'non_company_supplies')
  // 조치 대상: geo 확정 + LLM이 비회사로 판정(또는 불확실)한 것
  const ncActionable = ncAll.filter(
    (c) =>
      c.decision === 'geo' ||
      (c.decision === 'pending' &&
        (JUNK_VERDICTS.has(String(c.verdict)) || c.verdict === 'uncertain')),
  )
  // 판정 대기: pending 인데 아직 verdict 없음 (verdict==='company' 는 숨김)
  const ncPending = ncAll.filter((c) => c.decision === 'pending' && !c.verdict)
  // 확정 비회사(geo + 쓰레기 verdict) — 전체 비활성화 대상. uncertain 은 수동으로만.
  const ncConfirmed = ncActionable.filter(
    (c) => c.decision === 'geo' || JUNK_VERDICTS.has(String(c.verdict)),
  )
  const hasAnything = data.conflicts != null || data.corps.length > 0
  const busy =
    rescan.isPending || resolve.isPending || judge.isPending ||
    applyAll.isPending || restore.isPending || acknowledge.isPending || serverBatchRunning

  function ackLegit(c: QcConflict, aName: string, bName: string) {
    if (!window.confirm(`${aName} ⇄ ${bName} 를 '실제 양방향 거래'로 인정합니다 (양쪽 다 유지, 모순 목록에서 제외). 진행할까요?`)) return
    acknowledge.mutate(
      { a: aName, b: bName, a_id: String(c.a_id ?? ''), b_id: String(c.b_id ?? '') },
      { onSuccess: () => rescan.mutate() },
    )
  }

  const unjudged = actionable.filter((c) => c.kind === 'bidirectional_supplies' && !c.judgment)
  const judgedApplicable = actionable.filter(
    (c) => c.kind === 'bidirectional_supplies' && c.judgment && c.judgment.direction !== 'uncertain',
  )

  function startJudgeAll() {
    if (unjudged.length === 0) return
    if (!window.confirm(
      `미판정 ${unjudged.length}건을 서버에서 순차 판정합니다 (AI: apimaker/Gemini).\n` +
      `건당 수십 초 — 페이지를 떠나도 서버에서 계속 진행되며 Gemini 쿼터를 소모합니다. 진행할까요?`,
    )) return
    judgeAll.mutate()
  }

  function startApplyAll() {
    if (judgedApplicable.length === 0) return
    if (!window.confirm(
      `AI 판정이 확정된 ${judgedApplicable.length}건을 판정 방향대로 일괄 적용합니다\n` +
      `(각 건의 잘못된 방향 SUPPLIES_TO 엣지를 Neo4j 에서 삭제, uncertain 제외).\n진행할까요?`,
    )) return
    applyAll.mutate()
  }

  function runJudge(c: QcConflict) {
    const key = pairKey(c)
    setJudgingKey(key)
    judge.mutate(
      {
        a: String(c.a ?? ''), b: String(c.b ?? ''),
        a_id: String(c.a_id ?? ''), b_id: String(c.b_id ?? ''),
        fwd_chunk: (c.fwd_chunk as string) ?? null,
        rev_chunk: (c.rev_chunk as string) ?? null,
      },
      { onSettled: () => setJudgingKey(null) },
    )
  }

  function applyBidirectional(c: QcConflict, deleteFrom: string, deleteTo: string, label: string) {
    if (!window.confirm(`${label} 방향의 SUPPLIES_TO 엣지를 비활성화합니다 (되돌리기 가능). 적용할까요?`)) return
    const key = pairKey(c)
    setResolvingKey(key)
    resolve.mutate(
      { kind: 'bidirectional_supplies', from_id: deleteFrom, to_id: deleteTo },
      {
        onSuccess: () => rescan.mutate(),
        onSettled: () => setResolvingKey(null),
      },
    )
  }

  function applySelfLoop(c: QcConflict) {
    if (!window.confirm(`${c.org} 의 자기참조 [${c.rel}] 엣지를 삭제합니다. 적용할까요?`)) return
    const key = `${c.org}|${c.rel}|${c.chunk_id}`
    setResolvingKey(key)
    resolve.mutate(
      { kind: 'self_loop', org: String(c.org ?? ''), rel: String(c.rel ?? ''), chunk_id: (c.chunk_id as string) ?? null },
      {
        onSuccess: () => rescan.mutate(),
        onSettled: () => setResolvingKey(null),
      },
    )
  }

  type NcEdge = { from_id: string; to_id: string; from_name?: string; to_name?: string }

  function applyNonCompanyEntity(c: QcConflict) {
    const edges = (c.edges as NcEdge[] | undefined) ?? []
    const name = String(c.entity_name ?? '')
    if (edges.length === 0) return
    if (!window.confirm(
      `'${name}'(비회사) 관련 SUPPLIES_TO ${edges.length}건을 비활성화합니다. ` +
      `되돌리기 가능합니다. 적용할까요?`,
    )) return
    const key = `nc:${c.entity_key}`
    setResolvingKey(key)
    void (async () => {
      for (const e of edges) {
        try {
          await resolve.mutateAsync({
            kind: 'non_company_supplies',
            from_id: String(e.from_id),
            to_id: String(e.to_id),
          })
        } catch {
          /* 한 엣지 실패해도 계속 */
        }
      }
      setResolvingKey(null)
      rescan.mutate()
    })()
  }

  function startEntityJudgeAll() {
    if (ncPending.length === 0) return
    if (!window.confirm(
      `미해소 끝점 ${ncPending.length}개를 서버에서 LLM(apimaker/Gemini)으로 판정합니다.\n` +
      `회사/국가지역/제품/일반어/인물 분류 — 건당 수십 초, 페이지를 떠나도 서버에서 ` +
      `계속 진행되며 Gemini 쿼터를 소모합니다. 진행할까요?`,
    )) return
    entityJudgeAll.mutate()
  }

  // 확정 비회사(geo + 제품/일반어/인물) 전부 비활성화. '불확실'은 제외(수동 검토).
  function disableAllNonCompany() {
    const items = ncConfirmed
    const totalEdges = items.reduce(
      (n, c) => n + ((c.edges as NcEdge[] | undefined)?.length ?? 0), 0,
    )
    if (totalEdges === 0) return
    if (!window.confirm(
      `확정된 비회사 ${items.length}종(SUPPLIES_TO ${totalEdges}건)을 전부 비활성화합니다.\n` +
      `'불확실' 판정은 제외됩니다(따로 검토). 되돌리기 가능합니다. 진행할까요?`,
    )) return
    setResolvingKey('nc:ALL')
    void (async () => {
      for (const c of items) {
        for (const e of (c.edges as NcEdge[] | undefined) ?? []) {
          try {
            await adminApi.qcResolve({
              kind: 'non_company_supplies',
              from_id: String(e.from_id),
              to_id: String(e.to_id),
            })
          } catch {
            /* 한 엣지 실패해도 계속 */
          }
        }
      }
      setResolvingKey(null)
      rescan.mutate()
    })()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">추출 QC</h1>
          <span className="text-xs text-slate-500">
            AI(apimaker)가 방향 제안 → 사람이 [적용] → 그래프 반영. 모든 적용은 아래 '비활성 이력'에서 되돌릴 수 있습니다
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => rescan.mutate()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={'w-3.5 h-3.5' + (rescan.isPending ? ' animate-spin' : '')} />
            {rescan.isPending ? '재검사 중…' : '재검사 실행'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {!hasAnything && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm text-center">
          <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">아직 QC 실행 기록이 없습니다.</p>
          <p className="text-xs text-slate-400 mt-1">
            [재검사 실행]을 누르거나, 파이프라인 콘솔에서 「6. KG 추출」을 실행하면 결과가 표시됩니다.
          </p>
        </div>
      )}

      {data.conflicts != null && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="text-sm font-semibold">그래프 모순 — 조치 대상</div>
              <span
                className={
                  'px-2 py-0.5 rounded-full text-xs font-medium ' +
                  (actionable.length === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300')
                }
              >
                {actionable.length === 0 ? '모순 없음' : `${actionable.length}건`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!serverBatchRunning && unjudged.length > 0 && (
                <button
                  type="button"
                  onClick={startJudgeAll}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  미판정 전체 AI 판정 ({unjudged.length}건)
                </button>
              )}
              {!serverBatchRunning && judgedApplicable.length > 0 && (
                <button
                  type="button"
                  onClick={startApplyAll}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {applyAll.isPending ? '적용 중…' : `판정대로 일괄 적용 (${judgedApplicable.length}건)`}
                </button>
              )}
              {serverBatchRunning && batchStatus.data && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 tabular-nums">
                    서버에서 일괄 판정 중 {batchStatus.data.done}/{batchStatus.data.total}
                    {batchStatus.data.errors > 0 && ` (실패 ${batchStatus.data.errors})`}
                    {' — 페이지 떠나도 계속됩니다'}
                  </span>
                  <div className="w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{
                        width: `${(batchStatus.data.done / Math.max(1, batchStatus.data.total)) * 100}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => judgeAllStop.mutate()}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Square className="w-3 h-3" /> 중단
                  </button>
                </div>
              )}
              <span className="text-xs text-slate-400">
                검사 시각 {data.conflicts.generated_at.replace('T', ' ')}
              </span>
            </div>
          </div>

          {actionable.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-44">대상</th>
                    <th className="px-3 py-2 text-left font-medium">AI 방향 판정</th>
                    <th className="px-3 py-2 text-right font-medium w-44">적용</th>
                  </tr>
                </thead>
                <tbody>
                  {actionable.map((c, i) => {
                    const key = c.kind === 'self_loop' ? `${c.org}|${c.rel}|${c.chunk_id}` : pairKey(c)
                    const isJudging = judgingKey === key && judge.isPending
                    const isResolving = resolvingKey === key && resolve.isPending
                    const j = c.judgment

                    if (c.kind === 'self_loop') {
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                          <td className="px-3 py-2.5">{String(c.org ?? '?')}</td>
                          <td className="px-3 py-2.5 text-slate-500">
                            자기참조 [{String(c.rel ?? '?')}] — 판정 불필요 (삭제 대상)
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => applySelfLoop(c)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" /> {isResolving ? '적용 중…' : '삭제 적용'}
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    const aName = String(c.a ?? '?')
                    const bName = String(c.b ?? '?')
                    return (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{aName} ⇄ {bName}</div>
                          <button
                            type="button"
                            onClick={() =>
                              openChunks(`${aName} ⇄ ${bName}`, [
                                { id: (c.fwd_chunk as string) ?? null, label: `근거① ${aName}→${bName} 방향` },
                                { id: (c.rev_chunk as string) ?? null, label: `근거② ${bName}→${aName} 방향` },
                              ])
                            }
                            className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <FileText className="w-3 h-3" /> 원문 보기
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          {!j && (
                            <button
                              type="button"
                              onClick={() => runJudge(c)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
                            >
                              <Sparkles className="w-3 h-3" />
                              {isJudging ? '판정 중… (수십 초)' : 'AI 방향 판정'}
                            </button>
                          )}
                          {j && j.direction !== 'uncertain' && (
                            <div>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                {j.direction === 'a_to_b' ? `${aName} → ${bName}` : `${bName} → ${aName}`} 유지
                              </span>
                              <p className="text-slate-500 mt-0.5">{j.reason}</p>
                            </div>
                          )}
                          {j && j.direction === 'uncertain' && (
                            <div>
                              <span className="text-amber-600 dark:text-amber-400 font-medium">판정 불가 — 수동 선택 필요</span>
                              <p className="text-slate-500 mt-0.5">{j.reason}</p>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right space-y-1">
                          {j && j.direction === 'a_to_b' && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.b_id), String(c.a_id), `${bName} → ${aName}`)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {isResolving ? '적용 중…' : `확인 · 적용 (${bName}→${aName} 끄기)`}
                              </button>
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.a_id), String(c.b_id), `${aName} → ${bName}`)}
                                disabled={busy}
                                className="px-2.5 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                              >
                                AI와 반대 ({aName}→{bName} 끄기)
                              </button>
                            </div>
                          )}
                          {j && j.direction === 'b_to_a' && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.a_id), String(c.b_id), `${aName} → ${bName}`)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {isResolving ? '적용 중…' : `확인 · 적용 (${aName}→${bName} 끄기)`}
                              </button>
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.b_id), String(c.a_id), `${bName} → ${aName}`)}
                                disabled={busy}
                                className="px-2.5 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                              >
                                AI와 반대 ({bName}→{aName} 끄기)
                              </button>
                            </div>
                          )}
                          {j && j.direction === 'uncertain' && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.a_id), String(c.b_id), `${aName} → ${bName}`)}
                                disabled={busy}
                                className="px-2.5 py-1 rounded-md text-xs border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50"
                              >
                                {aName}→{bName} 끄기
                              </button>
                              <button
                                type="button"
                                onClick={() => applyBidirectional(c, String(c.b_id), String(c.a_id), `${bName} → ${aName}`)}
                                disabled={busy}
                                className="px-2.5 py-1 rounded-md text-xs border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50"
                              >
                                {bName}→{aName} 끄기
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => ackLegit(c, aName, bName)}
                            disabled={busy}
                            className="mt-1 px-2.5 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          >
                            정상 양방향 (둘 다 유지)
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {informational.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowInfo(!showInfo)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {showInfo ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                정보성 {informational.length}건 — 원장-그래프 방향충돌 (조치 불필요: 원장은 불변 기록, 그래프가 SSOT)
              </button>
              {showInfo && (
                <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {informational.map((c, i) => (
                        <tr key={i} className="border-t first:border-t-0 border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-1.5 text-slate-500">
                            원장 {String(c.ledger ?? '?')} vs 그래프 {String(c.graph ?? '?')}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-400">{String(c.chunk_id ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {ncAll.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div className="text-sm font-semibold">비회사 SUPPLIES_TO — 추출 노이즈</div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                조치 {ncActionable.length}건
              </span>
            </div>
            <div className="flex items-center gap-2">
              {ncConfirmed.length > 0 && (
                <button
                  type="button"
                  onClick={disableAllNonCompany}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {resolvingKey === 'nc:ALL' ? '비활성화 중…' : `전체 비활성화 (${ncConfirmed.length})`}
                </button>
              )}
              {!entityBatchRunning && ncPending.length > 0 && (
                <button
                  type="button"
                  onClick={startEntityJudgeAll}
                  disabled={entityJudgeAll.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  미해소 끝점 LLM 판정 ({ncPending.length}개)
                </button>
              )}
              {entityBatchRunning && entityBatch.data && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 tabular-nums">
                    LLM 엔티티 판정 중 {entityBatch.data.done}/{entityBatch.data.total}
                    {entityBatch.data.errors > 0 && ` (실패 ${entityBatch.data.errors})`}
                    {' — 페이지 떠나도 계속됩니다'}
                  </span>
                  <div className="w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${(entityBatch.data.done / Math.max(1, entityBatch.data.total)) * 100}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => entityJudgeAllStop.mutate()}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Square className="w-3 h-3" /> 중단
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            SUPPLIES_TO 는 회사↔회사여야 합니다. 국가·지역은 결정론으로 확정하고, 나머지 미해소 끝점은
            LLM(apimaker)이 원문 근거로 회사/제품/일반어/인물 판정합니다 — 진짜 외국·자회사(TSMC·지멘스)는 회사로 유지.
          </p>

          {ncActionable.length > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">비회사 엔티티 / 관계</th>
                    <th className="px-3 py-2 text-left font-medium">분류 / 사유</th>
                    <th className="px-3 py-2 text-right font-medium w-28">적용</th>
                  </tr>
                </thead>
                <tbody>
                  {ncActionable.map((c, i) => {
                    const name = String(c.entity_name ?? '')
                    const edges = (c.edges as NcEdge[] | undefined) ?? []
                    const e0 = edges[0]
                    const key = `nc:${c.entity_key}`
                    const isResolving = resolvingKey === key && resolve.isPending
                    const isUncertain = c.verdict === 'uncertain'
                    const reason =
                      c.decision === 'geo' ? String(c.reason ?? '') : String(c.verdict_reason ?? '')
                    return (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                        <td className="px-3 py-2.5">
                          <div className="font-medium">
                            <span className="text-amber-700 dark:text-amber-400">{name}</span>
                            {edges.length === 1 && e0 ? (
                              <span className="text-slate-400"> · {String(e0.from_name)}→{String(e0.to_name)}</span>
                            ) : (
                              <span className="text-slate-400"> · 관련 {edges.length}건</span>
                            )}
                          </div>
                          {c.sample_chunk ? (
                            <button
                              type="button"
                              onClick={() =>
                                openChunks(name, [
                                  { id: c.sample_chunk as string, label: `근거 본문 (${name})` },
                                ])
                              }
                              className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <FileText className="w-3 h-3" /> 원문 보기
                            </button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={
                              'inline-block px-1.5 py-0.5 rounded text-xs font-medium ' +
                              (isUncertain
                                ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300')
                            }
                          >
                            {ncLabel(c)}
                            {c.decision === 'pending' && (
                              <span className="ml-1 font-normal text-slate-400">· LLM</span>
                            )}
                          </span>
                          {reason && <p className="text-slate-500 mt-0.5">{reason}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => applyNonCompanyEntity(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                            {isResolving ? '적용 중…' : `비활성화${edges.length > 1 ? ` (${edges.length})` : ''}`}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3 py-4 text-center">
              {ncPending.length > 0
                ? `결정론으로 확정된 비회사는 없습니다. 미해소 끝점 ${ncPending.length}개를 LLM 판정하면 제품·일반어 노이즈가 여기에 표시됩니다.`
                : '비회사 노이즈 없음'}
            </div>
          )}
        </div>
      )}

      {(disabled.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm mb-6">
          <button
            type="button"
            onClick={() => setShowDisabled(!showDisabled)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showDisabled ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <RotateCcw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold">비활성 이력 (되돌리기 가능)</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {disabled.data!.length}건
            </span>
            <span className="ml-2 text-xs text-slate-400">
              QC 로 끈 SUPPLIES_TO 엣지 — 삭제가 아니라 숨김이라 언제든 복원됩니다
            </span>
          </button>
          {showDisabled && (
            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">비활성된 방향</th>
                    <th className="px-3 py-2 text-left font-medium">사유</th>
                    <th className="px-3 py-2 text-left font-medium">시각</th>
                    <th className="px-3 py-2 text-right font-medium">되돌리기</th>
                  </tr>
                </thead>
                <tbody>
                  {disabled.data!.map((e, i) => {
                    const key = `${e.from_id}|${e.to_id}`
                    const isRestoring = restoringKey === key && restore.isPending
                    return (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{e.from_name} → {e.to_name}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {e.reason === 'recreated_from_audit'
                            ? '이전 삭제분 복구(근거 일부 소실)'
                            : e.reason === 'non_company_supplies'
                              ? '비회사 객체(추출 노이즈)'
                              : e.reason === 'bidirectional_supplies'
                                ? '양방향 모순 해소'
                                : e.reason}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{(e.disabled_at ?? '').replace('T', ' ').slice(0, 19)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`${e.from_name} → ${e.to_name} 관계를 다시 활성화합니다. 되돌릴까요?`)) return
                              setRestoringKey(key)
                              restore.mutate(
                                { kind: 'bidirectional_supplies', from_id: e.from_id, to_id: e.to_id },
                                { onSuccess: () => rescan.mutate(), onSettled: () => setRestoringKey(null) },
                              )
                            }}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" /> {isRestoring ? '복원 중…' : '복원'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {data.corps.map((corp) => {
        const s = corp.summary
        const open = openCorp === corp.corp_code
        return (
          <div
            key={corp.corp_code}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm font-semibold">산출물 QC — {s.corp_name || corp.corp_code}</div>
                <span className="font-mono text-xs text-slate-400">{corp.corp_code}</span>
              </div>
              <span className="text-xs text-slate-400">검사 시각 {corp.generated_at.replace('T', ' ')}</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
              {[
                ['청크', s.chunks],
                ['clean 엣지', s.clean_edges],
                ['거부', s.rejected],
                ['추출 0건', s.zero_zero],
                ['에러', s.errors],
                ['의심', s.suspects],
              ].map(([label, v]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-medium tabular-nums">{Number(v ?? 0).toLocaleString()}</div>
                </div>
              ))}
            </div>

            {corp.suspects.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenCorp(open ? null : corp.corp_code)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2"
                >
                  의심 항목 {corp.suspects.length}건 {open ? '접기' : '펼치기'}
                </button>
                {open && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">종류</th>
                          <th className="px-3 py-2 text-left font-medium">내용</th>
                          <th className="px-3 py-2 text-left font-medium">chunk_id</th>
                          <th className="px-3 py-2 text-left font-medium">본문 미리보기</th>
                        </tr>
                      </thead>
                      <tbody>
                        {corp.suspects.map((sp, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                            <td className="px-3 py-2 whitespace-nowrap">{SUSPECT_LABEL[sp.kind] ?? sp.kind}</td>
                            <td className="px-3 py-2">
                              {suspectText(sp)}
                              {sp.flags && sp.flags.length > 0 && (
                                <span className="ml-1 text-amber-600 dark:text-amber-400">[{sp.flags.join(', ')}]</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-400">{sp.chunk_id ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-md">
                              <span className="line-clamp-2">{sp.preview ?? ''}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {chunkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setChunkModal(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-sm font-semibold">
                근거 원문 — {chunkModal.title}
              </div>
              <button
                type="button"
                onClick={() => setChunkModal(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {chunkModal.loading && <div className="text-sm text-slate-400">원문 불러오는 중…</div>}
              {!chunkModal.loading && chunkModal.chunks.length === 0 && (
                <div className="text-sm text-slate-400">청크를 찾을 수 없습니다 (적재 시 원문이 정리됐을 수 있음).</div>
              )}
              {chunkModal.chunks.map((ch, idx) => (
                <div key={ch.chunk_id} className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {chunkModal.labels[idx] ?? `근거 ${idx + 1}`}
                    </span>
                    {ch.found ? (
                      <span className="ml-2 text-xs text-slate-500">
                        {ch.corp_name} · {ch.title} · {ch.section_path}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-rose-500">원문 없음 ({ch.chunk_id})</span>
                    )}
                  </div>
                  {ch.found && (
                    <pre className="px-3 py-2.5 text-xs whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200 font-sans leading-relaxed max-h-72 overflow-y-auto">
                      {ch.text}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
