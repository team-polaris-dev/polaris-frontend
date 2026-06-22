import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../api/admin'
import type { JobCreateRequest } from '../api/types'

export function useJobs(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['admin', 'jobs', { limit, offset }],
    queryFn: () => adminApi.listJobs(limit, offset),
    refetchInterval: 5_000,
  })
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'job', jobId],
    queryFn: () => adminApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 2_000,  // SSE 가 실패해도 폴링으로 백업
  })
}

export function useDBStatus() {
  return useQuery({
    queryKey: ['admin', 'db-status'],
    queryFn: () => adminApi.dbStatus(),
    refetchInterval: 30_000,
  })
}

export function useConnections() {
  return useQuery({
    queryKey: ['admin', 'connections'],
    queryFn: () => adminApi.connections(),
    refetchInterval: 30_000,
  })
}

export function useQcReport() {
  return useQuery({
    queryKey: ['admin', 'qc-report'],
    queryFn: () => adminApi.qcReport(),
    refetchInterval: 30_000,
  })
}

export function useCorpsSearch(q: string) {
  return useQuery({
    queryKey: ['admin', 'corps-search', q],
    queryFn: () => adminApi.corpsSearch(q),
    enabled: q.trim().length >= 1,
    staleTime: 60_000,
  })
}

export function useQcBatchStatus() {
  return useQuery({
    queryKey: ['admin', 'qc-batch'],
    queryFn: () => adminApi.qcBatchStatus(),
    refetchInterval: (query) => (query.state.data?.running ? 2_500 : 15_000),
  })
}

export function useQcJudgeAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcJudgeAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-batch'] }),
  })
}

export function useQcJudgeAllStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcJudgeAllStop(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-batch'] }),
  })
}

export function useQcApplyAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcApplyAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] })
      qc.invalidateQueries({ queryKey: ['admin', 'qc-batch'] })
    },
  })
}

export function useQcEntityBatchStatus() {
  return useQuery({
    queryKey: ['admin', 'qc-entity-batch'],
    queryFn: () => adminApi.qcEntityBatchStatus(),
    refetchInterval: (query) => (query.state.data?.running ? 2_500 : 20_000),
  })
}

export function useQcEntityJudgeAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcEntityJudgeAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-entity-batch'] }),
  })
}

export function useQcEntityJudgeAllStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcEntityJudgeAllStop(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-entity-batch'] }),
  })
}

export function useQcRescan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.qcRescan(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] }),
  })
}

export function useQcJudge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.qcJudge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] }),
  })
}

export function useQcResolve() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.qcResolve,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] })
      qc.invalidateQueries({ queryKey: ['admin', 'qc-disabled'] })
    },
  })
}

export function useQcAcknowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.qcAcknowledge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] }),
  })
}

export function useQcDisabled() {
  return useQuery({
    queryKey: ['admin', 'qc-disabled'],
    queryFn: () => adminApi.qcDisabled(),
    refetchInterval: 30_000,
  })
}

export function useQcRestore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.qcRestore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'qc-report'] })
      qc.invalidateQueries({ queryKey: ['admin', 'qc-disabled'] })
    },
  })
}

export function useExtractPending(corpCodes: string[], positive: boolean) {
  return useQuery({
    queryKey: ['admin', 'extract-pending', [...corpCodes].sort().join(','), positive],
    queryFn: () => adminApi.extractPending(corpCodes, positive),
    enabled: corpCodes.length > 0,
    staleTime: 30_000,  // REGEXP 스캔이라 과도한 재조회 방지
  })
}

export function useCorps() {
  return useQuery({
    queryKey: ['admin', 'corps'],
    queryFn: () => adminApi.corps(),
    staleTime: 60_000,
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: JobCreateRequest) => adminApi.createJob(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] })
    },
  })
}

export function useCancelJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => adminApi.cancelJob(jobId),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['admin', 'job', jobId] })
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] })
    },
  })
}

// ===== 챗봇 통계 =====

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => adminApi.analyticsOverview(),
    refetchInterval: 30_000,
  })
}

export function useAnalyticsVolume(days = 30) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'volume', days],
    queryFn: () => adminApi.analyticsVolume(days),
    refetchInterval: 60_000,
  })
}

export function useAnalyticsIntents(limit = 12) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'intents', limit],
    queryFn: () => adminApi.analyticsIntents(limit),
    refetchInterval: 60_000,
  })
}

export function useAnalyticsTools() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'tools'],
    queryFn: () => adminApi.analyticsTools(),
    refetchInterval: 60_000,
  })
}

export function useAnalyticsUsers(limit = 10) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'users', limit],
    queryFn: () => adminApi.analyticsUsers(limit),
    refetchInterval: 60_000,
  })
}

export function useAnalyticsSessions(limit = 15) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'sessions', limit],
    queryFn: () => adminApi.analyticsSessions(limit),
    refetchInterval: 30_000,
  })
}

export function useAnalyticsLatency() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'latency'],
    queryFn: () => adminApi.analyticsLatency(),
    refetchInterval: 60_000,
  })
}

export function useAnalyticsSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'session', sessionId],
    queryFn: () => adminApi.analyticsSession(sessionId!),
    enabled: !!sessionId,
  })
}
