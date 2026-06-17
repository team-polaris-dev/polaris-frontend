import { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown'

/* ──────────────────────────────────────────────────────────────
   타자기 효과로 마크다운을 점진 노출한다.
   이미 받은 전체 텍스트(full)를 화면에서만 글자씩 드러내고,
   드러난 부분을 Markdown 으로 렌더한다.
   · onTick: 노출 길이가 늘 때마다 호출(자동 스크롤 용)
   · onDone: 끝까지 노출되면 1회 호출
   ────────────────────────────────────────────────────────────── */
interface Props {
  text: string
  speed?: number       // 틱당 노출할 글자 수
  intervalMs?: number  // 틱 간격(ms)
  onTick?: () => void
  onDone?: () => void
}

export default function TypingMarkdown({
  text,
  speed = 3,
  intervalMs = 16,
  onTick,
  onDone,
}: Props) {
  const [count, setCount] = useState(0)
  const doneRef = useRef(false)
  // 콜백을 ref 로 잡아 effect 재실행 없이 최신값 사용
  const onTickRef = useRef(onTick)
  const onDoneRef = useRef(onDone)
  onTickRef.current = onTick
  onDoneRef.current = onDone

  useEffect(() => {
    setCount(0)
    doneRef.current = false
    const total = text.length
    if (total === 0) {
      onDoneRef.current?.()
      return
    }
    const id = setInterval(() => {
      setCount((c) => {
        const next = Math.min(c + speed, total)
        onTickRef.current?.()
        if (next >= total) {
          clearInterval(id)
          if (!doneRef.current) {
            doneRef.current = true
            onDoneRef.current?.()
          }
        }
        return next
      })
    }, intervalMs)
    return () => clearInterval(id)
  }, [text, speed, intervalMs])

  const shown = text.slice(0, count)
  const typing = count < text.length

  return (
    <span className="relative">
      <Markdown text={shown} />
      {typing && (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-sky-500 align-middle dark:bg-sky-300" />
      )}
    </span>
  )
}
