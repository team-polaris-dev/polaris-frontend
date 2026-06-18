import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/* 화면 환경설정(전역) — 배경 별 속도/방향/개수/크기/밝기. localStorage 에 저장. */
interface SettingsCtx {
  starSpeed: number // 0=정지, 1=기본. 회전 속도 배율.
  setStarSpeed: (v: number) => void
  starDirection: number // 0~360°. 별이 도는 방향(각도).
  setStarDirection: (v: number) => void
  starCount: number // 별 개수(변경 시 별 무리를 다시 생성).
  setStarCount: (v: number) => void
  starSize: number // 별 점 크기.
  setStarSize: (v: number) => void
  starBrightness: number // 0~1. 별 불투명도(밝기).
  setStarBrightness: (v: number) => void
  resetStars: () => void // 별 설정 전체를 기본값으로 복원.
}

const KEYS = {
  speed: 'polaris_star_speed',
  dir: 'polaris_star_direction',
  count: 'polaris_star_count',
  size: 'polaris_star_size',
  bright: 'polaris_star_brightness',
}

const DEFAULTS = { speed: 1, dir: 0, count: 20000, size: 1.2, bright: 0.85 }

const Ctx = createContext<SettingsCtx>({
  starSpeed: DEFAULTS.speed,
  setStarSpeed: () => {},
  starDirection: DEFAULTS.dir,
  setStarDirection: () => {},
  starCount: DEFAULTS.count,
  setStarCount: () => {},
  starSize: DEFAULTS.size,
  setStarSize: () => {},
  starBrightness: DEFAULTS.bright,
  setStarBrightness: () => {},
  resetStars: () => {},
})

function readNum(key: string, fallback: number): number {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null
  const n = raw != null ? Number(raw) : NaN
  return Number.isFinite(n) ? n : fallback
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [starSpeed, setStarSpeed] = useState(() => readNum(KEYS.speed, DEFAULTS.speed))
  const [starDirection, setStarDirection] = useState(() => readNum(KEYS.dir, DEFAULTS.dir))
  const [starCount, setStarCount] = useState(() => readNum(KEYS.count, DEFAULTS.count))
  const [starSize, setStarSize] = useState(() => readNum(KEYS.size, DEFAULTS.size))
  const [starBrightness, setStarBrightness] = useState(() => readNum(KEYS.bright, DEFAULTS.bright))

  useEffect(() => void localStorage.setItem(KEYS.speed, String(starSpeed)), [starSpeed])
  useEffect(() => void localStorage.setItem(KEYS.dir, String(starDirection)), [starDirection])
  useEffect(() => void localStorage.setItem(KEYS.count, String(starCount)), [starCount])
  useEffect(() => void localStorage.setItem(KEYS.size, String(starSize)), [starSize])
  useEffect(() => void localStorage.setItem(KEYS.bright, String(starBrightness)), [starBrightness])

  const resetStars = () => {
    setStarSpeed(DEFAULTS.speed)
    setStarDirection(DEFAULTS.dir)
    setStarCount(DEFAULTS.count)
    setStarSize(DEFAULTS.size)
    setStarBrightness(DEFAULTS.bright)
  }

  return (
    <Ctx.Provider
      value={{
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
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => useContext(Ctx)
