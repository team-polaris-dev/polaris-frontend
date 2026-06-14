import { useState, useEffect } from 'react'

/* ──────────────────────────────────────────────────────────────
   데이터 로딩 — 별이 은은히 빛나는 밤하늘에 별자리 선이 스스로 그려졌다
   사라지길 반복하며 "연결을 분석하는" 느낌을 준다. 아래 문구는 처리 단계처럼
   순차로 바뀐다. (결과 화면의 별자리와 동일한 글로우·반짝임 톤)
   ────────────────────────────────────────────────────────────── */

const STEPS = [
  '질문 의도 파악 중',
  '공시·재무 데이터 검색 중',
  '기업 관계망 추적 중',
  '원본 문서 살펴보는 중',
  '답변 작성 중',
]

// 흐르는 듯한 별자리 좌표 + 잇는 선(순서대로 그려짐)
const STARS = [
  { x: 28, y: 78, r: 2.8, spike: false },
  { x: 66, y: 40, r: 3, spike: false },
  { x: 104, y: 58, r: 4.6, spike: true }, // 으뜸별
  { x: 142, y: 26, r: 3.4, spike: true },
  { x: 178, y: 60, r: 2.8, spike: false },
  { x: 120, y: 92, r: 2.4, spike: false },
]
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [2, 5],
]

export default function LoadingConstellation() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1700)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      style={{ animation: 'polarisRise .4s ease both' }}
      className="flex w-full flex-col items-center justify-center py-10 text-blue-500 dark:text-sky-300"
    >
      <style>{`
        @keyframes ldcTwinkle { 0%,100% { opacity:1; transform:scale(1);} 50% { opacity:.45; transform:scale(.75);} }
        @keyframes ldcSpark { 0%,100% { opacity:.5; transform:scale(1);} 50% { opacity:.95; transform:scale(1.18);} }
        @keyframes ldcDraw {
          0% { stroke-dashoffset: var(--len); opacity:0; }
          8% { opacity:1; }
          35% { stroke-dashoffset: 0; opacity:1; }
          70% { stroke-dashoffset: 0; opacity:1; }
          90% { stroke-dashoffset: 0; opacity:0; }
          100% { stroke-dashoffset: 0; opacity:0; }
        }
        @keyframes ldcStep { 0% { opacity:0; transform:translateY(4px);} 15%,85% { opacity:1; transform:translateY(0);} 100% { opacity:0; transform:translateY(-4px);} }
        .ldc-star { transform-box: fill-box; transform-origin:center; animation: ldcTwinkle 2.6s ease-in-out infinite; }
        .ldc-spike { transform-box: fill-box; transform-origin:center; animation: ldcSpark 2.6s ease-in-out infinite; }
        .ldc-line { animation: ldcDraw 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ldc-star,.ldc-spike { animation: none !important; }
          .ldc-line { animation: none !important; stroke-dashoffset: 0 !important; opacity:.8 !important; }
        }
      `}</style>

      <svg viewBox="0 0 206 116" className="h-28 w-56 overflow-visible drop-shadow-xl sm:h-32 sm:w-64">
        <defs>
          <radialGradient id="ldcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#bcd6ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7ab0ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ldcSpkH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ldcSpkV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 별자리 선 — 순서대로 그려졌다 사라지며 반복 */}
        {LINKS.map(([a, b], i) => {
          const s = STARS[a]
          const t = STARS[b]
          const len = Math.hypot(t.x - s.x, t.y - s.y)
          return (
            <line
              key={i}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="currentColor" strokeWidth={1} strokeLinecap="round"
              className="ldc-line"
              style={{
                ['--len' as string]: `${len}`,
                strokeDasharray: len,
                animationDelay: `${i * 0.28}s`,
              }}
            />
          )
        })}

        {/* 별 — glow + 十자 반짝임 + twinkle 코어 */}
        {STARS.map((s, i) => (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r={s.r * 2.4} fill="url(#ldcGlow)" />
            {s.spike && (
              <g className="ldc-spike" style={{ animationDelay: `${i * 0.3}s` }}>
                <rect x={s.x - 13} y={s.y - 0.5} width={26} height={1} fill="url(#ldcSpkH)" />
                <rect x={s.x - 0.5} y={s.y - 13} width={1} height={26} fill="url(#ldcSpkV)" />
              </g>
            )}
            <circle
              cx={s.x} cy={s.y} r={s.r} fill="#fff"
              className="ldc-star"
              style={{ animationDelay: `${i * 0.3}s`, filter: `drop-shadow(0 0 ${s.spike ? 6 : 4}px rgba(122,176,255,.95))` }}
            />
          </g>
        ))}
      </svg>

      {/* 순환하는 단계 문구 */}
      <p
        key={step}
        className="mt-5 text-[13px] font-bold tracking-widest"
        style={{ animation: 'ldcStep 1.7s ease-in-out both' }}
      >
        {STEPS[step]}…
      </p>
    </div>
  )
}
