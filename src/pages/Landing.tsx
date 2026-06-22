import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, Move3d, User, X } from 'lucide-react'
import StarField from '../components/StarField'
import GraphExplorer, { type Mode } from '../components/GraphExplorer'
import ThemeToggle from '../components/ThemeToggle'
import SettingsMenu from '../components/SettingsMenu'
import { login } from '../lib/auth'

// 스크롤 카메라 투어 단계 — 각 단계가 화면 중앙에 오면 그래프 카메라가 이동한다.
// mode/focusId 는 GraphExplorer 가 받아 카메라/하이라이트를 제어한다.
type Step = {
  mode: Mode
  focusId?: string
  free?: boolean
  kicker: string
  title: string
  body: string
}
const STEPS: Step[] = [
  {
    mode: 'overview',
    kicker: '공시 네트워크',
    title: '흩어진 공시를 하나의 관계망으로',
    body: '수천 건의 전자공시를 기업·인물·제품·기술 노드와 그 관계로 구조화합니다. 표로는 안 보이던 연결이 한눈에 드러납니다.',
  },
  {
    mode: 'node',
    focusId: 'hub:0',
    kicker: '기업 중심',
    title: '기업을 누르면 주변이 살아난다',
    body: '선택한 기업과 그 이웃만 밝게 남아 맥락이 또렷해집니다. 나머지는 흐려지며 한 회사의 관계가 또렷이 드러납니다.',
  },
  {
    mode: 'node',
    focusId: 'hub:1',
    kicker: '숨은 연결',
    title: '기업 간 지분·계열 관계까지',
    body: '기업과 기업을 잇는 지분·계열 관계를 따라가며, 표면에 드러나지 않던 지배구조의 흐름을 추적합니다.',
  },
  {
    mode: 'free',
    free: true,
    kicker: '직접 탐색',
    title: '이제 직접 둘러보세요',
    body: '드래그로 회전, 휠로 확대/축소, 노드 클릭으로 집중. 관계망을 자유롭게 탐험할 수 있습니다.',
  },
]

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

  // 스크롤 카메라 투어 — 현재 활성 단계
  const [activeStep, setActiveStep] = useState(0)
  const stepRefs = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveStep(Number((e.target as HTMLElement).dataset.step))
        })
      },
      { threshold: 0.55 },
    )
    stepRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])
  const step = STEPS[activeStep]
  const freeMode = step.free === true

  // 그래프 레이어는 히어로 구간에선 숨고, 투어로 들어오면 별 위로 서서히 나타난다.
  const [graphOpacity, setGraphOpacity] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight || 1
      setGraphOpacity(Math.min(1, Math.max(0, (window.scrollY - vh * 0.45) / (vh * 0.5))))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 그래프 조작 토글 — 화면 우하단 고정 버튼이 제어한다(스크롤해도 위치/표시 유지).
  // 자유 단계(맨 아래)로 들어오면 기본 ON, 투어로 돌아가면 OFF(스크롤 우선).
  const [manip, setManip] = useState(false)
  useEffect(() => {
    setManip(freeMode)
  }, [freeMode])

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
    <div className="relative bg-white text-slate-900 transition-colors duration-500 dark:bg-[#0B0820] dark:text-white">
      {/* 전역 별 배경 — 히어로부터 그래프 투어까지 끊김 없이 유지 */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <StarField />
      </div>

      {/* ───────── 히어로 (기존 진입화면 그대로) ───────── */}
      <section className="relative z-10 min-h-screen overflow-hidden">
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
      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <SettingsMenu />
        <ThemeToggle />
      </div>

      {/* 중앙 콘텐츠 */}
      <div
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{
          animation: leaving ? 'polarisContentOut 0.5s ease forwards' : undefined,
        }}
      >
        <p className="mb-5 text-xs tracking-[0.4em] text-slate-400 dark:text-slate-500">
          POLARIS · 89°15&#39;
        </p>
        <h1 className="mb-4 text-4xl font-bold sm:text-5xl">언제나 같은 자리.</h1>
        <p className="mb-12 text-sm tracking-wide text-slate-400 dark:text-slate-500">
          오늘은 잠깐, 별멍 어때요?
        </p>
        <button
          onClick={handleStart}
          disabled={leaving}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-9 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700 active:scale-95 disabled:cursor-default"
        >
          시작하기 <ArrowRight size={18} />
        </button>
      </div>

      {/* 아래로 스크롤 안내 — 그래프 탐색 창으로 이동 */}
      {!leaving && (
        <button
          onClick={() =>
            document.getElementById('graph-explorer')?.scrollIntoView({ behavior: 'smooth' })
          }
          className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="그래프 탐색으로 이동"
        >
          <span className="text-[11px] tracking-wide">더 둘러보기</span>
          <ChevronDown size={20} className="animate-bounce" />
        </button>
      )}

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
      </section>

      {/* 소년 일러스트 — 화면 우하단에 고정. 히어로부터 그래프 투어까지 계속 유지된다.
          z-10: 그래프(z-0) 위, 단계 텍스트(DOM 뒤라 위에 그려짐) 아래. 없으면 자동 숨김. */}
      <img
        src="/cliff.png"
        alt=""
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
        className="pointer-events-none fixed bottom-0 right-0 z-10 w-[34%] max-w-lg select-none opacity-95 transition duration-500 dark:invert"
        style={{
          animation: leaving ? 'polarisContentOut 0.5s ease forwards' : undefined,
        }}
      />

      {/* ───────── 스크롤 카메라 투어 (그래프 고정 배경 + 단계별 텍스트) ───────── */}
      <div id="graph-explorer" className="relative">
        {/* 고정 그래프 레이어 — 스크롤 내내 뒤에서 카메라가 움직인다.
            투어 중엔 pointer-events:none 으로 페이지 스크롤을 막지 않고,
            마지막 자유모드에서만 마우스 조작을 받는다. */}
        <div
          className="fixed inset-0 z-0"
          style={{ pointerEvents: graphOpacity > 0.05 ? 'auto' : 'none', opacity: graphOpacity }}
        >
          <GraphExplorer
            className="h-full w-full"
            mode={step.mode}
            focusId={step.focusId ?? null}
            interactive={freeMode}
            manip={manip}
          />
          {/* 가독성용 비네팅 — 자유모드에선 사라진다 */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: freeMode ? 0 : 1,
              background:
                'linear-gradient(90deg, rgba(5,3,15,0.78) 0%, rgba(5,3,15,0.35) 42%, rgba(5,3,15,0) 70%)',
            }}
          />
        </div>

        {/* 단계별 텍스트 오버레이 — 래퍼는 클릭/휠을 그래프로 통과시킨다(버튼만 예외) */}
        <div className="pointer-events-none relative z-10">
          {STEPS.map((s, i) => (
            <section
              key={i}
              ref={(el) => {
                stepRefs.current[i] = el
              }}
              data-step={i}
              className="pointer-events-none flex min-h-screen items-center px-6 sm:px-16"
            >
              <div
                className="max-w-md transition-all duration-500"
                style={{
                  opacity: activeStep === i ? 1 : 0.18,
                  transform: activeStep === i ? 'translateY(0)' : 'translateY(16px)',
                }}
              >
                {/* 자유 단계(맨 아래)는 비네팅이 꺼져 배경이 페이지색이 된다.
                    라이트 모드에선 흰 배경 위 흰 글씨가 안 보이므로 그 단계만 어두운 글씨로. */}
                <p
                  className={`mb-3 text-xs tracking-[0.35em] ${
                    s.free ? 'text-sky-600 dark:text-sky-300/80' : 'text-sky-300/80'
                  }`}
                >
                  {s.kicker}
                </p>
                <h2
                  className={`mb-4 text-3xl font-bold sm:text-4xl ${
                    s.free ? 'text-slate-900 dark:text-white' : 'text-white'
                  }`}
                >
                  {s.title}
                </h2>
                <p
                  className={`text-sm leading-relaxed sm:text-base ${
                    s.free ? 'text-slate-600 dark:text-white/70' : 'text-white/70'
                  }`}
                >
                  {s.body}
                </p>
                {s.free && (
                  <button
                    onClick={() => setShowLogin(true)}
                    className="pointer-events-auto mt-7 inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700 active:scale-95"
                  >
                    시작하기 <ArrowRight size={16} />
                  </button>
                )}
                <p className="mt-8 text-xs tracking-[0.3em] text-white/25">
                  0{i + 1} / 0{STEPS.length}
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* 그래프 조작 토글 — 화면 우상단 고정(우하단 소년 일러스트와 겹치지 않게). */}
      {graphOpacity > 0.05 && (
        <button
          onClick={() => setManip((m) => !m)}
          className={`fixed right-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur transition ${
            manip
              ? 'border-sky-400/60 bg-sky-500/25 text-sky-100 shadow-lg shadow-sky-500/20'
              : 'border-white/15 bg-black/45 text-white/80 hover:bg-black/65'
          }`}
        >
          <Move3d size={14} />
          {manip ? '조작 끄기' : '그래프 직접 조작'}
        </button>
      )}
    </div>
  )
}