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
export type ExtractProvider = 'ollama' | 'claude'

export interface StepConfig {
  id: StepId
  enabled?: boolean
  params?: {
    provider?: ExtractProvider
    model?: string
    chunk_window?: [number, number] | null
    positive_only?: boolean
  }
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
