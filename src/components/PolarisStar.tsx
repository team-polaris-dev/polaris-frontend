import { useId } from 'react'

// 북두칠성 마크 — 실제 밤하늘 느낌. 손잡이(왼) + 국자(오른), 별 밝기(크기) 차등 + 푸른 글로우.
// 색은 currentColor 를 따르므로(별·선·글로우 모두) 어디에 놓든 부모 text 색으로 물든다.
// 국자 끝 두 별을 이으면 북극성이 나온다 — POLARIS 테마의 길잡이 별자리.
type Props = {
  size?: number
  className?: string
}

// [x, y, 반지름(밝기)] — Alkaid·Mizar·Alioth(손잡이) / Megrez·Dubhe·Merak·Phecda(국자)
// 손잡이는 아래 곡선 path 위에 별이 놓이도록 좌표를 샘플링했다.
const STARS: [number, number, number][] = [
  [3.5, 17, 1.5],
  [7.1, 12.4, 1.05],
  [10.7, 10.2, 1.05],
  [14, 9.5, 0.85],
  [20.5, 6.5, 1.6],
  [21.5, 12.5, 1.45],
  [15, 15.5, 1.1],
]

export default function PolarisStar({ size = 16, className }: Props) {
  const glow = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glow})`} fill="currentColor">
        {/* 손잡이 — 부드러운 곡선 */}
        <path
          d="M3.5 17 C6 12.5 10 9.5 14 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* 국자 — 평행사변형 */}
        <path
          d="M14 9.5 L20.5 6.5 L21.5 12.5 L15 15.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.55}
        />
        {/* 7개 별 — 밝은 별일수록 크게 */}
        {STARS.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  )
}
