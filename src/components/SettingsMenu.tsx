import { useEffect, useRef, useState } from 'react'
import { Settings, ArrowRight, RotateCcw } from 'lucide-react'
import { useSettings } from '../theme/SettingsContext'

/* 톱니바퀴 설정 — 클릭하면 작은 팝오버. 배경 별 속도·방향·개수·크기·밝기. */
export default function SettingsMenu() {
  const {
    starSpeed,
    setStarSpeed,
    starDirection,
    setStarDirection,
    starCount,
    setStarCount,
    starSize,
    setStarSize,
    starBrightness,
    setStarBrightness,
    resetStars,
  } = useSettings()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 개수는 변경 시 별 무리를 다시 만들어서, 드래그 중엔 미리보기만 하고 '놓을 때' 적용한다.
  const [countDraft, setCountDraft] = useState(starCount)
  useEffect(() => setCountDraft(starCount), [starCount])

  // 바깥 클릭 / ESC 로 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="별멍 설정"
        aria-label="별멍 설정"
        className="grid h-9 w-9 place-items-center rounded-full border border-slate-300/50 text-slate-600 transition hover:bg-slate-500/10 dark:border-slate-600/50 dark:text-slate-300"
      >
        <Settings size={18} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#0E0A24]">
          {/* 별멍 타이틀 */}
          <div className="mb-3 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">✦ 불멍 말고 별멍</div>
            <div className="mt-0.5 text-[11px] text-slate-400">속도·방향·개수까지 취향대로</div>
          </div>

          {/* 속도 */}
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>별 이동 속도</span>
            <span className="text-xs font-normal text-slate-400">{starSpeed.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.1}
            value={starSpeed}
            onChange={(e) => setStarSpeed(Number(e.target.value))}
            className="w-full accent-blue-600"
            aria-label="별 이동 속도"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>정지</span>
            <span>빠르게</span>
          </div>

          {/* 방향 */}
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1.5">
              별 이동 방향
              {/* 현재 방향 화살표 — 0°=오른쪽, 90°=위(단위원 기준). 화면 Y가 아래라 부호 반전 */}
              <ArrowRight
                size={13}
                className="text-blue-500"
                style={{ transform: `rotate(${-starDirection}deg)` }}
              />
            </span>
            <span className="text-xs font-normal text-slate-400">{Math.round(starDirection)}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={starDirection}
            onChange={(e) => setStarDirection(Number(e.target.value))}
            className="w-full accent-blue-600"
            aria-label="별 이동 방향"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>0°</span>
            <span>360°</span>
          </div>

          {/* 개수 — 드래그는 미리보기, 놓을 때 적용(별 무리 재생성) */}
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>별 개수</span>
            <span className="text-xs font-normal text-slate-400">{countDraft.toLocaleString()}개</span>
          </div>
          <input
            type="range"
            min={500}
            max={80000}
            step={500}
            value={countDraft}
            onChange={(e) => setCountDraft(Number(e.target.value))}
            onPointerUp={() => setStarCount(countDraft)}
            onKeyUp={() => setStarCount(countDraft)}
            className="w-full accent-blue-600"
            aria-label="별 개수"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>적게</span>
            <span>많게</span>
          </div>

          {/* 크기 */}
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>별 크기</span>
            <span className="text-xs font-normal text-slate-400">{starSize.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0.3}
            max={5}
            step={0.1}
            value={starSize}
            onChange={(e) => setStarSize(Number(e.target.value))}
            className="w-full accent-blue-600"
            aria-label="별 크기"
          />

          {/* 밝기 */}
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>별 밝기</span>
            <span className="text-xs font-normal text-slate-400">{Math.round(starBrightness * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={starBrightness}
            onChange={(e) => setStarBrightness(Number(e.target.value))}
            className="w-full accent-blue-600"
            aria-label="별 밝기"
          />

          {/* 기본값 초기화 */}
          <button
            onClick={resetStars}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.06]"
          >
            <RotateCcw size={13} /> 기본값으로 초기화
          </button>
        </div>
      )}
    </div>
  )
}
