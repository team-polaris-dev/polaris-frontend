import { useEffect, useRef, useState } from 'react'
import { Play, Volume2 } from 'lucide-react'

/* ──────────────────────────────────────────────────────────────
   랜딩 진입 전 스플래시 영상(public/video2.mp4).
   브라우저가 소리 자동재생을 막으므로, 화면을 클릭하면 소리와 함께
   재생되도록 한다. 영상이 끝날 무렵 미리 페이드를 시작해 랜딩과
   자연스럽게 겹쳐(crossfade) 이어진다.
   ────────────────────────────────────────────────────────────── */
interface Props {
  onDone: () => void
}

const FADE_MS = 1000 // 페이드 시간
const TAIL_S = 0.8 // 끝나기 몇 초 전부터 전환 시작(겹침)

export default function Splash({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const audioFadeRef = useRef<number | null>(null)

  // 소리를 부드럽게 줄이며 페이드아웃 → 종료 (중복 호출 방지)
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setLeaving(true)

    // 오디오 페이드아웃 (음악이 뚝 끊기지 않게)
    const v = videoRef.current
    if (v && !v.muted && v.volume > 0) {
      const startVol = v.volume
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / FADE_MS)
        v.volume = Math.max(0, startVol * (1 - p))
        if (p < 1) audioFadeRef.current = requestAnimationFrame(tick)
      }
      audioFadeRef.current = requestAnimationFrame(tick)
    }

    window.setTimeout(onDone, FADE_MS)
  }

  // 영상 꼬리 감지 → 끝나기 직전부터 전환 시작(랜딩과 겹침)
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || doneRef.current || !v.duration || !isFinite(v.duration)) return
    if (v.currentTime >= v.duration - TAIL_S) finish()
  }

  // 모션 최소화 선호 시 영상 건너뛰고 즉시 진입
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) onDone()
    return () => {
      if (audioFadeRef.current != null) cancelAnimationFrame(audioFadeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 화면 클릭 → 소리와 함께 재생 시작
  const start = () => {
    if (started || doneRef.current) return
    const v = videoRef.current
    if (!v) {
      finish()
      return
    }
    v.muted = false
    v.volume = 1
    setStarted(true)
    const p = v.play()
    if (p) {
      p.catch(() => {
        // 소리 재생이 막히면 음소거로라도 재생, 그것도 실패하면 종료
        v.muted = true
        v.play().catch(() => finish())
      })
    }
  }

  return (
    <div
      onClick={start}
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black"
      style={{ animation: leaving ? `splashFade ${FADE_MS}ms ease-in-out forwards` : undefined }}
    >
      <style>{`
        @keyframes splashFade{to{opacity:0}}
        @keyframes splashHint{0%,100%{opacity:.85}50%{opacity:.4}}
        @keyframes splashZoom{from{transform:scale(1)}to{transform:scale(1.06)}}
      `}</style>

      <video
        ref={videoRef}
        src="/video2.mp4"
        playsInline
        preload="auto"
        onEnded={finish}
        onTimeUpdate={onTimeUpdate}
        className="h-full w-full object-cover"
        style={{
          // 재생 내내 아주 천천히 줌인 → 끝에서 부드럽게 빠져나가는 느낌
          animation: started ? 'splashZoom 14s ease-out forwards' : undefined,
        }}
      />

      {/* 시작 전 안내 — 화면 아무 곳이나 클릭 */}
      {!started && (
        <div className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/45 text-white">
          <span className="grid h-16 w-16 place-items-center rounded-full border border-white/40 bg-white/10 backdrop-blur-sm">
            <Play size={26} className="translate-x-0.5" fill="currentColor" />
          </span>
          <p
            className="flex items-center gap-1.5 text-sm font-medium tracking-wide"
            style={{ animation: 'splashHint 2s ease-in-out infinite' }}
          >
            <Volume2 size={15} /> 화면을 클릭하면 소리와 함께 시작합니다
          </p>
        </div>
      )}

      {/* 건너뛰기 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
        className="absolute bottom-6 right-6 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:bg-black/60"
      >
        건너뛰기 ›
      </button>
    </div>
  )
}
