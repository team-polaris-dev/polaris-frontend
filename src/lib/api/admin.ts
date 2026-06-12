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
  CorpInfo,
  DBStatus,
  IntentCount,
  JobCreateRequest,
  JobResponse,
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
  dbStatus: () => request<DBStatus>('/db/status'),
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
