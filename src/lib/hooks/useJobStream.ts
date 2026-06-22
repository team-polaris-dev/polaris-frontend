import { useEffect, useRef } from 'react'
import { adminApi } from '../api/admin'
import type { SSEEvent } from '../api/types'

/**
 * 잡 SSE 구독 훅.
 *
 * - paused=true 면 연결 끊김
 * - jobId 바뀌면 자동 재연결
 * - EventSource 가 자동 재연결 시도하므로 onerror 에서 close 는 하지 않음
 */
export function useJobStream(
  jobId: string | undefined,
  onEvent: (e: SSEEvent) => void,
  opts: { paused?: boolean } = {},
) {
  const esRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!jobId || opts.paused) {
      esRef.current?.close()
      esRef.current = null
      return
    }
    const es = new EventSource(adminApi.streamUrl(jobId))
    es.onmessage = (e) => {
      try {
        onEventRef.current(JSON.parse(e.data) as SSEEvent)
      } catch {
        // 마커가 아닌 keep-alive 등은 무시
      }
    }
    es.onerror = () => {
      // 자동 재연결에 맡김
    }
    esRef.current = es
    return () => {
      es.close()
      esRef.current = null
    }
  }, [jobId, opts.paused])
}
