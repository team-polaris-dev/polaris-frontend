/* 차트 등 DOM 노드를 PNG 이미지로 저장. html-to-image 는 무거워 클릭 시 동적 로드.
   배경을 흰색으로 깔아 투명/다크 배경이 그대로 찍히지 않게 한다. */
export async function exportNodeToPng(node: HTMLElement | null, fileBase = 'POLARIS_차트') {
  if (!node) return
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${fileBase}_${new Date().toISOString().slice(0, 10)}.png`
  a.click()
}
