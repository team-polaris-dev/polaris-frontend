import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, User, X } from 'lucide-react'
import StarField from '../components/StarField'
import ThemeToggle from '../components/ThemeToggle'
import { login } from '../lib/auth'

// 진입화면 — 나브/검색/알림 제거. 배경(별)+문구+테마토글(아이콘)+시작하기 버튼+소년 일러스트.
// 시작하기 클릭 → 가운데 작은 창에서 사용자이름 입력(처음이면 회원가입) →
// 북극성으로 빨려드는 워프 전환 후 /app 으로 이동.
export default function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  // 로그인 모달 상태
  const [showLogin, setShowLogin] = useState(false)
  const [username, setUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // '시작하기' → 로그인 창 열기
  const handleStart = () => {
    if (leaving) return
    setError('')
    setShowLogin(true)
  }

  // 로그인/회원가입 제출 → 성공 시 워프 전환 후 /app
  const handleLogin = async () => {
    const name = username.trim()
    if (!name || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await login(name)
      setShowLogin(false)

      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        navigate('/app')
        return
      }
      setLeaving(true)
      window.setTimeout(() => navigate('/app'), 820)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
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
        @keyframes polarisContentIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
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

      {/* ───────── 로그인 / 회원가입 모달 (가운데 작은 창) ───────── */}
      {showLogin && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-6"
          onClick={() => !submitting && setShowLogin(false)}
        >
          {/* 어둡게 깔리는 백드롭 */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" />

          {/* 카드 */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'polarisContentIn 0.35s ease both' }}
            className="relative w-full max-w-xs rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0E0A24]/95"
          >
            <button
              onClick={() => !submitting && setShowLogin(false)}
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="닫기"
            >
              <X size={16} />
            </button>

            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-blue-600 text-white shadow-md shadow-blue-500/30">
                <User size={16} />
              </span>
              <h2 className="text-lg font-bold">시작하기</h2>
            </div>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              사용자 이름을 입력하세요. 처음이라면 자동으로 가입됩니다.
            </p>

            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleLogin()
                }
              }}
              placeholder="사용자 이름"
              maxLength={64}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/10 dark:bg-white/[0.04]"
            />

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={!username.trim() || submitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
            >
              {submitting ? '입장하는 중…' : '입장하기'}
              {!submitting && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}