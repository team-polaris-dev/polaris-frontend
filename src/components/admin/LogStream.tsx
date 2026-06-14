import { useEffect, useRef, useState } from 'react'
import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { useJobStream } from '../../lib/hooks/useJobStream'
import type { SSEEvent } from '../../lib/api/types'

type Props = { jobId: string }

export default function LogStream({ jobId }: Props) {
  const [lines, setLines] = useState<{ ts: number; text: string; tone: string }[]>([])
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useJobStream(jobId, handleEvent, { paused })

  function handleEvent(e: SSEEvent) {
    let text = ''
    let tone = 'text-slate-200'
    if (e.type === 'log') {
      text = `[${e.corp_code} ${e.step}] ${e.line}`
      if (e.line.startsWith('POLARIS_PIPELINE')) tone = 'text-blue-400'
      else if (/error|fail/i.test(e.line)) tone = 'text-rose-400'
    } else if (e.type === 'step_start') {
      text = `▶ [${e.corp_code} ${e.step}] start`
      tone = 'text-emerald-400'
    } else if (e.type === 'step_end') {
      text = `■ [${e.corp_code} ${e.step}] ${e.state}`
      tone = e.state === 'succeeded' ? 'text-emerald-400' : 'text-rose-400'
    } else if (e.type === 'job_end') {
      text = `### job ${e.state} ###`
      tone = e.state === 'succeeded' ? 'text-emerald-300' : 'text-rose-300'
    }
    setLines((prev) => {
      const next = [...prev, { ts: e.ts, text, tone }]
      // 최대 5000줄 유지(메모리 보호)
      return next.length > 5000 ? next.slice(-5000) : next
    })
  }

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, autoScroll])

  function downloadLog() {
    const blob = new Blob(
      lines.map((l) => `${new Date(l.ts * 1000).toISOString()} ${l.text}\n`),
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `job-${jobId}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950">
        <button
          onClick={() => setPaused((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-800"
          aria-label={paused ? '재개' : '일시정지'}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? '재개' : '일시정지'}
        </button>
        <button
          onClick={() => setLines([])}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-800"
          aria-label="지우기"
        >
          <Trash2 className="w-3.5 h-3.5" /> 지우기
        </button>
        <button
          onClick={downloadLog}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-800"
          aria-label="다운로드"
        >
          <Download className="w-3.5 h-3.5" /> 다운로드
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-blue-500"
          />
          자동 스크롤
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 && (
          <div className="text-slate-500">로그 없음. 잡이 시작되면 여기에 흐릅니다.</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={l.tone}>
            {l.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
