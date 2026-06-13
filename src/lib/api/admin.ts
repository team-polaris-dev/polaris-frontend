/**
 * 관리자 API 래퍼 — X-Admin-Token 헤더 자동 부착, 401 시 토큰 무효화.
 *
 * 사용:
 *   import { adminApi } from '@/lib/api/admin'
 *   const jobs = await adminApi.listJobs()
 */
import type {
  AnalyticsOverview,
  CancelResponse,
  ConnectionsResponse,
  CorpInfo,
  CorpSearchResult,
  ExtractPendingInfo,
  QcBatchStatus,
  QcChunk,
  QcEntityBatchStatus,
  QcEntityJudgeRequest,
  QcDisabledEdge,
  DBStatus,
  IntentCount,
  JobCreateRequest,
  JobResponse,
  QcJudgeRequest,
  QcJudgment,
  QcReport,
  QcResolveRequest,
  RecentSession,
  ToolCount,
  TopUser,
  VolumePoint,
} from './types'

const BASE = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '/api'

export function getAdminToken(): string {
  return localStorage.getItem('adminToken') ?? ''
}

export function setAdminToken(t: string): void {
  localStorage.setItem('adminToken', t)
}

export function clearAdminToken(): void {
  localStorage.removeItem('adminToken')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': getAdminToken(),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    clearAdminToken()
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${body}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export const adminApi = {
  health: () => request<{ ok: boolean }>('/health'),
  connections: () => request<ConnectionsResponse>('/connections'),
  dbStatus: () => request<DBStatus>('/db/status'),
  extractPending: (corpCodes: string[], positive = false) =>
    request<ExtractPendingInfo[]>(
      `/extract/pending?corp_codes=${corpCodes.join(',')}&positive=${positive}`,
    ),
  corpsSearch: (q: string, limit = 20) =>
    request<CorpSearchResult[]>(`/corps/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  qcReport: () => request<QcReport>('/qc/report'),
  qcRescan: () =>
    request<{ ok: boolean; conflicts: number }>('/qc/rescan', { method: 'POST' }),
  qcJudge: (body: QcJudgeRequest) =>
    request<QcJudgment>('/qc/judge', { method: 'POST', body: JSON.stringify(body) }),
  qcAcknowledge: (body: QcJudgeRequest) =>
    request<{ ok: boolean }>('/qc/acknowledge', { method: 'POST', body: JSON.stringify(body) }),
  qcJudgeAll: () => request<{ ok: boolean }>('/qc/judge-all', { method: 'POST' }),
  qcJudgeAllStop: () => request<{ ok: boolean }>('/qc/judge-all/stop', { method: 'POST' }),
  qcBatchStatus: () => request<QcBatchStatus>('/qc/batch/status'),
  qcApplyAll: () =>
    request<{ ok: boolean; applied: number; disabled: number }>('/qc/apply-all', {
      method: 'POST',
    }),
  qcResolve: (body: QcResolveRequest) =>
    request<{ ok: boolean; disabled: number }>('/qc/resolve', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  qcRestore: (body: QcResolveRequest) =>
    request<{ ok: boolean; restored: number }>('/qc/restore', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  qcDisabled: () => request<QcDisabledEdge[]>('/qc/disabled'),
  qcChunk: (ids: string[]) =>
    request<QcChunk[]>(`/qc/chunk?ids=${ids.map(encodeURIComponent).join(',')}`),
  qcEntityJudge: (body: QcEntityJudgeRequest) =>
    request<{ verdict: string; reason: string }>('/qc/entity-judge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  qcEntityJudgeAll: () => request<{ ok: boolean }>('/qc/entity-judge-all', { method: 'POST' }),
  qcEntityJudgeAllStop: () =>
    request<{ ok: boolean }>('/qc/entity-judge-all/stop', { method: 'POST' }),
  qcEntityBatchStatus: () => request<QcEntityBatchStatus>('/qc/entity-batch/status'),
  corps: () => request<CorpInfo[]>('/corps'),
  createJob: (body: JobCreateRequest) =>
    request<JobResponse>('/pipeline/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listJobs: (limit = 20, offset = 0) =>
    request<JobResponse[]>(`/pipeline/jobs?limit=${limit}&offset=${offset}`),
  getJob: (jobId: string) => request<JobResponse>(`/pipeline/jobs/${jobId}`),
  cancelJob: (jobId: string) =>
    request<CancelResponse>(`/pipeline/jobs/${jobId}/cancel`, { method: 'POST' }),
  streamUrl: (jobId: string) => {
    const token = encodeURIComponent(getAdminToken())
    return `${BASE}/admin/pipeline/jobs/${jobId}/stream?token=${token}`
  },

  // ===== 챗봇 통계 =====
  analyticsOverview: () => request<AnalyticsOverview>('/analytics/overview'),
  analyticsVolume: (days = 30) => request<VolumePoint[]>(`/analytics/volume?days=${days}`),
  analyticsIntents: (limit = 12) => request<IntentCount[]>(`/analytics/intents?limit=${limit}`),
  analyticsTools: () => request<ToolCount[]>('/analytics/tools'),
  analyticsUsers: (limit = 10) => request<TopUser[]>(`/analytics/users?limit=${limit}`),
  analyticsSessions: (limit = 15) => request<RecentSession[]>(`/analytics/sessions?limit=${limit}`),
}
