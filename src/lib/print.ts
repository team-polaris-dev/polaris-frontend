import type { FinancialGroup } from '../components/FinancialChart'
import { parseFinancialTable } from '../components/FinancialChart'

/* ──────────────────────────────────────────────────────────────
   '원본 문서'를 인쇄용 보고서로 새 창에 열고 window.print() 를 호출한다.
   브라우저의 'PDF로 저장'으로 받으면 한글 폰트 그대로, 의존성 없이 PDF가 된다.
   구성: 제목 · 질문 · AI 정리 원문 · 재무 데이터 표 · 출처(DART 링크)
   ────────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface DigestSection {
  title: string // 보고서명(링크 텍스트). 머리말 구간이면 ''
  url?: string // DART 원문 링크
  body: string // 해당 보고서의 정리된 본문(마크다운, 제목줄 제외)
}

/* 정리 원문(마크다운)을 '## 회사 · 보고서명' 제목 기준으로 보고서별 구간으로 쪼갠다.
   제목이 [텍스트](링크)면 텍스트/URL 을 분리한다. 제목이 없으면 통째로 한 구간. */
export function splitDigestByReport(digest: string): DigestSection[] {
  const lines = (digest || '').replace(/\r\n/g, '\n').split('\n')
  const sections: DigestSection[] = []
  let cur: DigestSection | null = null
  const push = () => {
    if (cur && (cur.title || cur.body.trim())) sections.push({ ...cur, body: cur.body.trim() })
  }
  for (const line of lines) {
    const m = line.match(/^##\s+(.*\S)\s*$/)
    if (m) {
      push()
      let title = m[1].trim()
      let url: string | undefined
      const link = title.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) {
        title = link[1].trim()
        url = link[2]
      }
      cur = { title, url, body: '' }
    } else {
      if (!cur) cur = { title: '', body: '' }
      cur.body += line + '\n'
    }
  }
  push()
  return sections.length ? sections : [{ title: '', body: (digest || '').trim() }]
}

// 한 줄 인라인 서식: **굵게**, [텍스트](http링크)
function inlineHtml(text: string): string {
  let t = esc(text)
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_m, label, url) => `<a href="${url}">${label}</a>`,
  )
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return t
}

const splitRow = (l: string) =>
  l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

// 정리 원문(마크다운) → HTML. 표·제목·굵게·링크·목록·문단 지원(경량).
function markdownToHtml(md: string): string {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: string[] = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inlineHtml).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`)
    list = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 표
    const sep = lines[i + 1]
    if (
      line.indexOf('|') !== -1 &&
      sep &&
      sep.indexOf('-') !== -1 &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(sep)
    ) {
      flushPara()
      flushList()
      const header = splitRow(line)
      const rows: string[][] = []
      let j = i + 2
      for (; j < lines.length; j++) {
        const l = lines[j]
        if (!l || l.trim() === '' || l.indexOf('|') === -1) break
        rows.push(splitRow(l))
      }
      const thead = `<tr>${header.map((c) => `<th>${inlineHtml(c)}</th>`).join('')}</tr>`
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`)
        .join('')
      out.push(`<table>${thead}${tbody}</table>`)
      i = j
      continue
    }
    const h = line.match(/^\s*(#{1,4})\s+(.*)$/)
    if (h) {
      flushPara()
      flushList()
      const lvl = h[1].length
      out.push(`<h${lvl <= 2 ? 3 : 4}>${inlineHtml(h[2])}</h${lvl <= 2 ? 3 : 4}>`)
      i++
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara()
      list.push(line.replace(/^\s*[-*]\s+/, ''))
      i++
      continue
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushPara()
      flushList()
      out.push('<hr>')
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
  return out.join('\n')
}

// 재무 데이터 → 비교 표(항목 행 × 회사·연도 열)
function financialTableHtml(financials: FinancialGroup[], sourceText: string): string {
  const fin = financials.length ? financials : parseFinancialTable(sourceText) || []
  if (!fin.length) return ''
  const labels: string[] = []
  for (const g of fin) for (const m of g.metrics) if (!labels.includes(m.label)) labels.push(m.label)
  const unit = fin.find((g) => g.unit)?.unit || ''
  const head =
    `<tr><th>항목</th>` +
    fin.map((g) => `<th>${esc(g.corp_name || '')}${g.year ? ` ${g.year}` : ''}</th>`).join('') +
    `</tr>`
  const body = labels
    .map((l) => {
      const cells = fin
        .map((g) => {
          const m = g.metrics.find((x) => x.label === l)
          return `<td>${m ? esc(String(m.value)) : ''}</td>`
        })
        .join('')
      return `<tr><th class="rowh">${esc(l)}</th>${cells}</tr>`
    })
    .join('')
  return `<h3>재무 데이터${unit ? ` <span class="unit">(단위: ${esc(unit)})</span>` : ''}</h3><table>${head}${body}</table>`
}

export function printReport(opts: {
  title?: string
  question?: string
  digest?: string
  financials?: FinancialGroup[]
  sourceText?: string
  sources?: { name: string; date?: string; url?: string }[]
}) {
  const {
    title = 'POLARIS 보고서',
    question = '',
    digest = '',
    financials = [],
    sourceText = '',
    sources = [],
  } = opts

  const finHtml = financialTableHtml(financials, sourceText)
  const digestHtml = digest.trim() ? markdownToHtml(digest) : ''
  const sourcesHtml = sources.length
    ? `<h3>출처</h3><ul class="src">${sources
        .map(
          (s) =>
            `<li>${esc(s.name)}${s.date ? ` <span class="date">${esc(s.date)}</span>` : ''}${
              s.url ? ` — <a href="${s.url}">DART 원문</a>` : ''
            }</li>`,
        )
        .join('')}</ul>`
    : ''

  const today = new Date().toLocaleDateString('ko-KR')
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif; color:#1f2937; line-height:1.6; font-size:12px; }
  header { border-bottom:2px solid #2563eb; padding-bottom:10px; margin-bottom:16px; }
  header .brand { color:#2563eb; font-weight:800; letter-spacing:.04em; }
  header h1 { font-size:18px; margin:6px 0 2px; }
  header .meta { color:#6b7280; font-size:11px; }
  .q { background:#eff6ff; border-left:3px solid #2563eb; padding:8px 12px; border-radius:6px; margin:0 0 16px; font-size:12px; }
  h3 { font-size:14px; margin:18px 0 8px; padding-bottom:4px; border-bottom:1px solid #e5e7eb; }
  h4 { font-size:12.5px; margin:12px 0 4px; color:#374151; }
  p { margin:6px 0; }
  ul { margin:6px 0; padding-left:18px; }
  a { color:#2563eb; text-decoration:underline; }
  table { border-collapse:collapse; width:100%; margin:8px 0; font-size:11px; }
  th,td { border:1px solid #d1d5db; padding:5px 8px; text-align:left; vertical-align:top; }
  th { background:#f3f4f6; }
  th.rowh { background:#f9fafb; }
  .unit { font-weight:400; color:#6b7280; font-size:11px; }
  .src .date { color:#9ca3af; font-size:10px; }
  footer { margin-top:20px; padding-top:8px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:10px; }
  @media print { a { color:#1d4ed8; } }
</style></head><body>
<header>
  <div class="brand">POLARIS</div>
  <h1>${esc(title)}</h1>
  <div class="meta">${esc(today)} 생성 · 공시 기반 정보</div>
</header>
${question ? `<div class="q"><strong>질문</strong> &nbsp;${esc(question)}</div>` : ''}
${finHtml}
${digestHtml ? `<h3>AI가 정리한 원문</h3>${digestHtml}` : ''}
${sourcesHtml}
<footer>POLARIS는 공시 기반 정보를 제공하며 투자 판단의 책임은 본인에게 있습니다.</footer>
<script>window.onload=function(){window.focus();setTimeout(function(){window.print()},150)}</script>
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) {
    alert('팝업이 차단되어 PDF 보고서를 열 수 없습니다. 팝업 허용 후 다시 시도해 주세요.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}
