/** 백엔드 schemas/pipeline.py 의 Pydantic 모델과 1:1 대응. */

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type StepState =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
export type StepId =
  | 'fetch'
  | 'chunk'
  | 'mariadb'
  | 'qdrant'
  | 'neo4j_struct'
  | 'extract'
  | 'qc'
  | 'canon'
  | 'cleanup'
export type ExtractProvider = 'ollama' | 'apimaker'

export interface StepConfig {
  id: StepId
  enabled?: boolean
  params?: {
    provider?: ExtractProvider
    model?: string
    /** 추출 청크 수 상한 — null/생략 = pending 전부 (기본) */
    limit?: number | null
    positive_only?: boolean
  }
}

/** GET /api/admin/corps/search — 전체 상장사(corp_master)에서 검색, 보유/미보유 구분 */
export interface CorpSearchResult {
  corp_code: string
  corp_name: string
  stock_code: string | null
  doc_count: number
  has_data: boolean
}

/** GET /api/admin/qc/batch/status — 서버 백그라운드 일괄 판정 진행 상태 */
export interface QcBatchStatus {
  running: boolean
  done: number
  total: number
  errors: number
  stop_requested: boolean
  started_at: string | null
  finished_at: string | null
}

/** GET /api/admin/qc/entity-batch/status — 비회사 후보 LLM 판정 진행 상태 */
export interface QcEntityBatchStatus {
  running: boolean
  done: number
  total: number
  errors: number
  stop_requested: boolean
  started_at: string | null
  finished_at: string | null
}

/** POST /api/admin/qc/entity-judge — 미해소 끝점 1개 타입 판정 요청 */
export interface QcEntityJudgeRequest {
  entity_key: string
  name: string
  chunk_id?: string | null
}

/** GET /api/admin/extract/pending — 회사별 추출 대상 규모 (실행 전 미리보기) */
export interface ExtractPendingInfo {
  corp_code: string
  corp_name: string
  eligible: number
  done: number
  pending: number
}

/** AI(apimaker) 방향 판정 — 표시용 제안. 적용은 사람이 confirm 후 resolve 호출 */
export interface QcJudgment {
  direction: 'a_to_b' | 'b_to_a' | 'uncertain'
  reason: string
  judged_at: string
  a?: string
  b?: string
}

/** GET /api/admin/qc/report — qc/extract 스텝 산출물 뷰어 */
export interface QcConflict {
  kind:
    | 'bidirectional_supplies'
    | 'self_loop'
    | 'ledger_graph_direction_conflict'
    | 'non_company_supplies'
    | string
  judgment?: QcJudgment
  [key: string]: unknown
}

export interface QcResolveRequest {
  kind: 'self_loop' | 'bidirectional_supplies' | 'non_company_supplies'
  org?: string
  rel?: string
  chunk_id?: string | null
  from_id?: string
  to_id?: string
}

/** GET /api/admin/qc/chunk — 청크 원문 (방향 판정 근거 확인용) */
export interface QcChunk {
  chunk_id: string
  found: boolean
  corp_name?: string
  title?: string
  section_path?: string
  text?: string
}

/** GET /api/admin/qc/disabled — QC 로 비활성화된(되돌리기 가능) SUPPLIES_TO 엣지 */
export interface QcDisabledEdge {
  from_name: string
  to_name: string
  from_id: string
  to_id: string
  disabled_at: string
  reason: string
  chunk_id: string | null
}

export interface QcJudgeRequest {
  a: string
  b: string
  a_id: string
  b_id: string
  fwd_chunk?: string | null
  rev_chunk?: string | null
}

export interface QcSuspect {
  kind: string
  corp_code?: string
  chunk_id?: string
  reason?: string
  flags?: string[]
  preview?: string
  edge?: { subject?: string; predicate?: string; object?: string }
  [key: string]: unknown
}

export interface QcCorpReport {
  corp_code: string
  generated_at: string
  summary: {
    corp_name?: string
    chunks?: number
    clean_edges?: number
    rejected?: number
    zero_zero?: number
    errors?: number
    suspects?: number
    predicates?: Record<string, number>
    reject_reasons?: Record<string, number>
  }
  suspects: QcSuspect[]
}

export interface QcReport {
  conflicts: { generated_at: string; items: QcConflict[] } | null
  corps: QcCorpReport[]
  measured_at: string
}

export interface JobCreateRequest {
  corp_codes: string[]
  steps: StepConfig[]
  from_date?: string | null
  to_date?: string | null
  label?: string | null
}

export interface StepStatus {
  step_id: StepId
  corp_code: string
  state: StepState
  progress: number
  counters: Record<string, unknown>
  started_at: string | null
  ended_at: string | null
  error: string | null
}

export interface JobResponse {
  job_id: string
  state: JobState
  corp_codes: string[]
  label: string | null
  steps: StepStatus[]
  created_at: string
  updated_at: string
}

export interface CorpInfo {
  corp_code: string
  corp_name: string
  raw_dir: string | null
  has_raw: boolean
  doc_count: number
  chunk_count: number
  last_fetch: string | null
}

export interface CancelResponse {
  job_id: string
  cancelled: boolean
  was_running: boolean
}

export interface DBStatus {
  mariadb: Record<string, number>
  qdrant: Record<string, { points_count: number; vectors_count: number }>
  neo4j: { nodes: Record<string, number>; rels: Record<string, number> }
  measured_at: string
}

/** GET /api/admin/connections — 의존 서비스 연결 점검. 주소는 .env 단일 출처(읽기전용). */
export interface ConnectionStatus {
  name: string
  address: string
  ok: boolean
  latency_ms: number
  detail: string
}

export interface ConnectionsResponse {
  services: ConnectionStatus[]
  measured_at: string
}

/** SSE event payload — services/sse.py + pipeline_runner.push_sse 와 일치. */
export type SSEEvent =
  | { type: 'step_start'; corp_code: string; step: StepId; ts: number }
  | {
      type: 'step_end'
      corp_code: string
      step: StepId
      state: StepState
      ts: number
    }
  | {
      type: 'log'
      corp_code: string
      step: StepId
      line: string
      ts: number
    }
  | { type: 'job_end'; state: JobState; ts: number; error?: string }

/* ===== 챗봇 통계 (analytics) — 백엔드 services/chat_analytics.py 와 대응 ===== */

export interface AnalyticsOverview {
  total_users: number
  total_sessions: number
  total_messages: number
  user_messages: number
  assistant_messages: number
  active_users_7d: number
  dau: number
  wau: number
  mau: number
  avg_messages_per_session: number
  avg_sessions_per_user: number
  sufficient_rate: number | null
  avg_latency_ms: number | null
  avg_retry_count: number | null
  single_turn_session_rate: number
}

export interface VolumePoint {
  date: string
  messages: number
  active_users: number
  sessions: number
}

export interface IntentCount {
  intent: string
  count: number
}

export interface ToolCount {
  tool: string
  count: number
}

export interface TopUser {
  user_id: string
  display_name: string | null
  sessions: number
  messages: number
  last_seen_at: string | null
}

export interface RecentSession {
  session_id: string
  user_id: string
  started_at: string | null
  last_at: string | null
  message_count: number
  last_intent: string | null
}

/** GET /api/admin/analytics/latency — assistant 응답 지연 분포 + 히스토그램 */
export interface LatencyBucket {
  label: string
  count: number
}

export interface LatencyStats {
  count: number
  p50: number | null
  p90: number | null
  p95: number | null
  p99: number | null
  buckets: LatencyBucket[]
}

/** GET /api/admin/analytics/sessions/{id} — 세션 대화 원문 (chat_store.list_messages) */
export interface SessionMessage {
  message_id: number
  role: string
  content: string
  intent: string
  created_at: string
}
