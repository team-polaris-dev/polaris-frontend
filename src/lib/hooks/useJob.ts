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
