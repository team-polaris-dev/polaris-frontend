import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import StarField from '../components/StarField'
import ThemeToggle from '../components/ThemeToggle'

// 진입화면 — 나브/검색/알림 제거. 배경(별)+문구+테마토글(아이콘)+시작하기 버튼+소년 일러스트.
// 시작하기 클릭 → 북극성으로 빨려드는 워프 전환 후 /app 으로 이동.
export default function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  const handleStart = () => {
    if (leaving) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      navigate('/app')
      return
    }
    setLeaving(true)
    window.setTimeout(() => navigate('/app'), 820)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 transition-colors duration-500 dark:bg-[#0B0820] dark:text-white">
      {/* 전환 애니메이션 키프레임 */}
      <style>{`
        @keyframes polarisContentOut{to{opacity:0;transform:translateY(-14px) scale(1.05);filter:blur(2px)}}
        @keyframes polarisStarWarp{
          0%{transform:translate(-50%,-50%) scale(1);opacity:1}
          60%{opacity:1}
          100%{transform:translate(-50%,-50%) scale(11);opacity:.92}
        }
        @keyframes polarisVeil{0%{opacity:0}100%{opacity:1}}
      `}</style>

      {/* 별 배경 (다크에서 또렷) */}
      <StarField />

      {/* POLARIS 별 + halo — 원본 cliff.svg radialGradient 재현 (좌상단 36%·30%) */}
      <div
        className="pointer-events-none absolute left-[36%] top-[30%] -translate-x-1/2 -translate-y-1/2"
        style={{
          animation: leaving
            ? 'polarisStarWarp 0.85s cubic-bezier(0.66,0,0.84,0) forwards'
            : undefined,
          transformOrigin: 'center',
        }}
      >
        <div
          className="h-[420px] w-[420px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(232,240,255,0.45) 0%, rgba(122,176,255,0.16) 40%, rgba(122,176,255,0) 72%)',
          }}
        />
        {/* 별 코어 (라이트=파랑, 다크=흰 + 발광) */}
        <div
          className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 transition-colors duration-500 dark:bg-white"
          style={{ boxShadow: '0 0 22px 9px rgba(122,176,255,0.45)' }}
        />
      </div>

      {/* 우상단: 로고 워드마크 + 테마 토글(아이콘) */}
      <div className="absolute left-6 top-5 z-20 font-bold tracking-tight">POLARIS</div>
      <div className="absolute right-5 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* 중앙 콘텐츠 */}
      <div
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ animation: leaving ? 'polarisContentOut 0.5s ease forwards' : undefined }}
      >
        <p className="mb-5 text-xs tracking-[0.4em] text-slate-400 dark:text-slate-500">
          POLARIS · 89°15&#39;
        </p>
        <h1 className="mb-12 text-4xl font-bold sm:text-5xl">언제나 같은 자리.</h1>
        <button
          onClick={handleStart}
          disabled={leaving}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-9 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700 active:scale-95 disabled:cursor-default"
        >
          시작하기 <ArrowRight size={18} />
        </button>
      </div>

      {/* 소년 일러스트 (public/cliff.png 넣으면 표시. 없으면 자동 숨김) */}
      <img
        src="/cliff.png"
        alt=""
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
        className="pointer-events-none absolute bottom-0 right-0 z-0 w-[38%] max-w-xl select-none opacity-95 transition duration-500 dark:invert"
        style={{ animation: leaving ? 'polarisContentOut 0.5s ease forwards' : undefined }}
      />

      {/* 워프 베일 — 별빛이 화면을 채우며 다음 화면으로 전환 */}
      {leaving && (
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            animation: 'polarisVeil 0.82s ease-in forwards',
            background:
              'radial-gradient(circle at 36% 30%, rgba(255,255,255,0.95) 0%, rgba(232,240,255,0.9) 18%, rgba(122,176,255,0.55) 42%, rgba(122,176,255,0) 78%)',
          }}
        />
      )}
    </div>
  )
}