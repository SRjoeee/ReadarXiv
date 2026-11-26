// The crops of a laid page past PDF.js's canvas cap (docs/PDF-READER.md §11.8), as the extension's reader draws them: zoomed
// where the page view's own canvas is limited (min(2^25, 3 screens of pixels), halved again for its detail canvas), the crops in
// view are cut at the detail canvas's resolution, over their own box within its area, the page's own crops cut away there; zoomed back
// under the cap, none of them is left. Called by reader-v2.mjs with its context and its reporting.

/** whether a box (shares of the frame: left, top, width, height) lies within another */
const within = (a, b) => {
  if (!a || !b) return false
  const [l, t, w, h] = a.map(Number.parseFloat), [L, T, W, H] = b.map(Number.parseFloat)
  return l >= L - 0.01 && t >= T - 0.01 && l + w <= L + W + 0.01 && t + h <= T + H + 0.01
}

export async function cropsChecks(t) {
  const { openReader, laid, section, check, sleep } = t
  section('crops past the canvas cap: cut at the detail canvas\'s resolution, as sharp as the page around them')
  const page = await openReader({ mode: 'bilingual' })
  await laid(page)
  // (400 %: the page 3,264 x 4,224 CSS px, past the cap of a 1,440 x 900 screen at a ratio of 1: 3.9 million pixels)
  await page.evaluate(() => window.__reader.controller.zoomTo(4))
  await sleep(1500)
  // (the heading "Introduction", its label a crop, brought into the right pane's view)
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('section.pane[data-side="right"] .axt-slot .textLayer span, section.pane[data-side="right"] .axt-slot span')]
    const at = spans.find((s) => /noitcudortnI|Introduction/.test(s.textContent ?? ''))
    at?.scrollIntoView({ block: 'center', inline: 'center' })
  })
  const seen = await page
    .waitForFunction(() => !!document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail'), null, { timeout: 15_000 })
    .then(() => true, () => false)
  const m = await page.evaluate(() => {
    const det = document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
    const slot = det?.closest('.axt-slot')
    const base = slot?.querySelector('.axt-over > canvas.axt-crops')
    // (PDF.js's detail canvas: the page view's canvas that it stands by shares of the frame)
    const pdf = [...(slot?.querySelectorAll('.canvasWrapper > canvas') ?? [])].find((c) => c.style.left.endsWith('%'))
    const ratio = (c) => (c ? c.width / c.getBoundingClientRect().width : null)
    return { detail: ratio(det), pdfDetail: ratio(pdf), base: ratio(base), clip: base?.style.clipPath ?? '', area: det && [det.style.left, det.style.top, det.style.width, det.style.height], pdfArea: pdf && [pdf.style.left, pdf.style.top, pdf.style.width, pdf.style.height] }
  })
  check(
    'past the cap, the crops in view are cut at the detail canvas\'s pixels a CSS px, within its area; the page\'s own cut away under them',
    seen && !!m.detail && !!m.pdfDetail && Math.abs(m.detail / m.pdfDetail - 1) < 0.01 && m.base < m.detail && /^polygon\(evenodd/.test(m.clip) && within(m.area, m.pdfArea),
    JSON.stringify(m),
  )
  // (back under the cap: no detail canvas, no crops of one, the page's own crops whole)
  await page.evaluate(() => window.__reader.controller.zoomTo(1))
  const gone = await page
    .waitForFunction(() => !document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail') && [...document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops')].every((c) => !c.style.clipPath), null, { timeout: 15_000 })
    .then(() => true, () => false)
  check('zoomed back under the cap: no detail crops left, the page\'s own crops whole', gone)
  await page.close()
}
