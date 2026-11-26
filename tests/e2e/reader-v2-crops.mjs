// The crops of a laid page past PDF.js's canvas cap (docs/PDF-READER.md §11.8), as the extension's reader draws them: zoomed
// where the page view's own canvas is limited (min(2^25, 3 screens of pixels), halved again for its detail canvas), the crops in
// view are cut at the detail canvas's resolution, over their own box within its area, the page's own crops cut away under the whole area; zoomed back
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
  // (the base's crops cut away under the detail canvas's whole area, PDF.js's own shares: the hole's corners are its corners)
  const hole = (m.clip.match(/(-?[\d.]+)% (-?[\d.]+)%/g) ?? []).slice(5, 9).map((p) => p.split(' ').map(Number.parseFloat))
  const [pl, pt, pw, ph] = (m.pdfArea ?? []).map(Number.parseFloat)
  const corners = [[pl, pt], [pl + pw, pt], [pl + pw, pt + ph], [pl, pt + ph]]
  check(
    'past the cap, the page\'s own crops cut away under the detail canvas\'s whole area, not the box of the crops in it',
    hole.length === 4 && hole.every(([x, y], i) => Math.abs(x - corners[i][0]) < 0.001 && Math.abs(y - corners[i][1]) < 0.001),
    JSON.stringify({ hole, corners }),
  )
  // (a ring one base pixel wide round the detail crops' box, within the area and the pane's view: what the crops draw there,
  // the page's own pixels; the crops hidden and shown, the ring the same, the base's coarser copy of a crop past the box gone.
  // The box brought into the view first: PDF.js's area reaches past it, and the crops are cut again for the area drawn then)
  await page.evaluate(() =>
    document
      .querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
      ?.scrollIntoView({ block: 'center', inline: 'center' }),
  )
  await sleep(1500)
  await page
    .waitForFunction(() => {
      const det = document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
      const pane = det?.closest('section.pane')
      if (!det || !pane) return false
      const b = det.getBoundingClientRect(),
        v = pane.getBoundingClientRect()
      return b.left > v.left && b.right < v.right && b.top > v.top && b.bottom < v.bottom
    }, null, { timeout: 15_000 })
    .catch(() => {})
  const ring = await page.evaluate(() => {
    const det = document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
    const slot = det?.closest('.axt-slot')
    const base = slot?.querySelector('.axt-over > canvas.axt-crops')
    const pdf = [...(slot?.querySelectorAll('.canvasWrapper > canvas') ?? [])].find((c) => c.style.left.endsWith('%'))
    const pane = det?.closest('section.pane')
    if (!det || !base || !pdf || !pane) return null
    const b = det.getBoundingClientRect(),
      a = pdf.getBoundingClientRect(),
      v = pane.getBoundingClientRect()
    // (one of the base's pixels, CSS px, whole device pixels out from the box)
    const n = Math.ceil(base.getBoundingClientRect().width / base.width) + 1
    const [L, T, R, B] = [Math.floor(b.left), Math.floor(b.top), Math.ceil(b.right), Math.ceil(b.bottom)]
    const [x0, y0] = [Math.ceil(Math.max(a.left, v.left)), Math.ceil(Math.max(a.top, v.top))]
    const [x1, y1] = [Math.floor(Math.min(a.right, v.right)), Math.floor(Math.min(a.bottom, v.bottom))]
    const cut = ([l, t, r, bt]) => {
      const [cl, ct, cr, cb] = [Math.max(l, x0), Math.max(t, y0), Math.min(r, x1), Math.min(bt, y1)]
      return cr > cl && cb > ct ? { x: cl, y: ct, width: cr - cl, height: cb - ct } : null
    }
    return [
      cut([L - n, T - n, R + n, T]),
      cut([L - n, B, R + n, B + n]),
      cut([L - n, T, L, B]),
      cut([R, T, R + n, B]),
    ].filter(Boolean)
  })
  const shot = async () => Promise.all((ring ?? []).map((clip) => page.screenshot({ clip })))
  const shown = await shot()
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops, section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail'))
      c.style.visibility = 'hidden'
  })
  const hidden = await shot()
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops, section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail'))
      c.style.removeProperty('visibility')
  })
  const differ = shown.filter((s, i) => !s.equals(hidden[i])).length
  check(
    'past the cap, a ring one base pixel wide round the detail crops, within the area: the page\'s own pixels, nothing of the base\'s crops',
    !!ring?.length && differ === 0,
    JSON.stringify({ strips: ring, differ }),
  )
  // (back under the cap: no detail canvas, no crops of one, the page's own crops whole)
  await page.evaluate(() => window.__reader.controller.zoomTo(1))
  const gone = await page
    .waitForFunction(() => !document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail') && [...document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops')].every((c) => !c.style.clipPath), null, { timeout: 15_000 })
    .then(() => true, () => false)
  check('zoomed back under the cap: no detail crops left, the page\'s own crops whole', gone)
  await page.close()
}
