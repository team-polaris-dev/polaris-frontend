import React from 'react'

/* ──────────────────────────────────────────────────────────────
   경량 마크다운 렌더러.
   에이전트 응답에 표(GFM table)가 있으면 실제 <table> 로 렌더링하고,
   제목/굵게/글머리표/문단 등 기본 서식만 처리한다(외부 라이브러리 없이).
   ────────────────────────────────────────────────────────────── */

function inline(text: string, keyBase: string): React.ReactNode[] {
  // **굵게** 와 일반 텍스트 분리
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>
    return <React.Fragment key={`${keyBase}-${i}`}>{p}</React.Fragment>
  })
}

interface ParsedTable {
  headerCells: string[]
  rows: string[][]
  end: number
}

function tryParseTable(lines: string[], start: number): ParsedTable | null {
  const header = lines[start]
  if (!header || header.indexOf('|') === -1) return null
  const sep = lines[start + 1]
  if (!sep || sep.indexOf('-') === -1) return null
  if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(sep)) return null

  const split = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

  const headerCells = split(header)
  const rows: string[][] = []
  let i = start + 2
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (!l || l.trim() === '' || l.indexOf('|') === -1) break
    rows.push(split(l))
  }
  return { headerCells, rows, end: i }
}

export default function Markdown({ text }: { text: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let para: string[] = []
  let list: string[] = []

  const flushPara = () => {
    if (!para.length) return
    const key = `p-${blocks.length}`
    blocks.push(
      <p key={key} className="whitespace-pre-line">
        {inline(para.join('\n'), key)}
      </p>,
    )
    para = []
  }
  const flushList = () => {
    if (!list.length) return
    const key = `ul-${blocks.length}`
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    const table = tryParseTable(lines, i)
    if (table) {
      flushPara()
      flushList()
      const key = `t-${blocks.length}`
      blocks.push(
        <div
          key={key}
          className="my-1 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100/70 text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
                {table.headerCells.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium">
                    {inline(c, `${key}-h-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={ri % 2 ? 'bg-white/40 dark:bg-transparent' : 'bg-white/70 dark:bg-white/[0.02]'}
                >
                  {row.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 align-top tabular-nums">
                      {inline(c, `${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      i = table.end
      continue
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      const key = `h-${blocks.length}`
      const lvl = heading[1].length
      blocks.push(
        <p
          key={key}
          className={`font-semibold ${lvl <= 2 ? 'text-[15px]' : 'text-sm'}`}
        >
          {inline(heading[2], key)}
        </p>,
      )
      i++
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushPara()
      list.push(line.replace(/^\s*[-*]\s+/, ''))
      i++
      continue
    }

    if (line.trim() === '') {
      flushPara()
      flushList()
      i++
      continue
    }

    flushList()
    para.push(line)
    i++
  }
  flushPara()
  flushList()

  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>
}
