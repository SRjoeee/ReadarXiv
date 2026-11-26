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
  // (the state the checks read, on the page: PDF.js's detail canvas, the crops cut for it, the base's hole. The crops follow
  // PDF.js's newest detail canvas a cut's time later (#691's hosted run read the hole of the area before), so each check waits
  // until the hole is that canvas's area, and a measure is taken again where the state moved under it)
  await page.evaluate(() => {
    window.__axtCrops = () => {
      const det = document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
      const slot = det?.closest('.axt-slot')
      const base = slot?.querySelector('.axt-over > canvas.axt-crops')
      const pdfs = [...(slot?.querySelectorAll('.canvasWrapper > canvas') ?? [])].filter((c) => c.style.left.endsWith('%'))
      const pane = det?.closest('section.pane')
      if (!det || !base || !pdfs.length || !pane) return null
      const pdf = pdfs[0]
      const ratio = (c) => c.width / c.getBoundingClientRect().width
      const clip = base.style.clipPath
      const hole = (clip.match(/(-?[\d.]+)% (-?[\d.]+)%/g) ?? []).slice(5, 9).map((p) => p.split(' ').map(Number.parseFloat))
      const pdfArea = [pdf.style.left, pdf.style.top, pdf.style.width, pdf.style.height]
      const [pl, pt, pw, ph] = pdfArea.map(Number.parseFloat)
      const corners = [[pl, pt], [pl + pw, pt], [pl + pw, pt + ph], [pl, pt + ph]]
      const match = pdfs.length === 1 && hole.length === 4 && hole.every(([x, y], i) => Math.abs(x - corners[i][0]) < 0.001 && Math.abs(y - corners[i][1]) < 0.001)
      const b = det.getBoundingClientRect(),
        a = pdf.getBoundingClientRect(),
        v = pane.getBoundingClientRect()
      return {
        match,
        inView: b.left > v.left && b.right < v.right && b.top > v.top && b.bottom < v.bottom,
        key: `${pdfArea.join(',')}|${[det.style.left, det.style.top, det.style.width, det.style.height].join(',')}|${clip}`,
        detail: ratio(det),
        pdfDetail: ratio(pdf),
        base: ratio(base),
        baseRect: base.getBoundingClientRect().width / base.width,
        clip,
        hole,
        corners,
        area: [det.style.left, det.style.top, det.style.width, det.style.height],
        pdfArea,
        box: [b.left, b.top, b.right, b.bottom],
        pdfRect: [a.left, a.top, a.right, a.bottom],
        paneRect: [v.left, v.top, v.right, v.bottom],
      }
    }
  })
  const state = () => page.evaluate(() => window.__axtCrops())
  const settled = (inView) =>
    page
      .waitForFunction((inView) => { const s = window.__axtCrops(); return !!s && s.match && (!inView || s.inView) }, inView, { timeout: 15_000, polling: 25 })
      .then(() => true, () => false)
  const first = await page
    .waitForFunction(() => !!document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail'), null, { timeout: 15_000 })
    .then(() => true, () => false)
  const before = await state()
  const t0 = Date.now()
  const seen = first && (await settled(false))
  const waited = Date.now() - t0
  const m = (await state()) ?? {}
  check(
    'past the cap, the crops in view are cut at the detail canvas\'s pixels a CSS px, within its area; the page\'s own cut away under them',
    seen && !!m.detail && !!m.pdfDetail && Math.abs(m.detail / m.pdfDetail - 1) < 0.01 && m.base < m.detail && /^polygon\(evenodd/.test(m.clip) && within(m.area, m.pdfArea),
    JSON.stringify({ detail: m.detail, pdfDetail: m.pdfDetail, base: m.base, area: m.area, pdfArea: m.pdfArea }),
  )
  // (the base's crops cut away under the detail canvas's whole area, PDF.js's own shares: the hole's corners are its corners)
  check(
    'past the cap, the page\'s own crops cut away under the detail canvas\'s whole area, not the box of the crops in it',
    seen && !!m.match,
    JSON.stringify({ hole: m.hole, corners: m.corners, before: before && { match: before.match, hole: before.hole, corners: before.corners }, waitedMs: waited }),
  )
  // (with the detail crops' box in view, the area's hole standing for PDF.js's canvas: a ring one base pixel wide round the box,
  // within the area and the pane's view, the page's own pixels (the crops hidden and shown the same: the base's coarser copy
  // of a crop past the box gone); and the box itself, within them, the crops' ink (hidden and shown not the same: a detail
  // canvas left blank, its crops cut away from the base under the whole area, would show none of them))
  await page.evaluate(() =>
    document
      .querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
      ?.scrollIntoView({ block: 'center', inline: 'center' }),
  )
  const inView = await settled(true)
  const regions = (s) => {
    if (!s) return { ring: [], box: null }
    const [bl, bt, br, bb] = s.box,
      [al, at, ar, ab] = s.pdfRect,
      [vl, vt, vr, vb] = s.paneRect
    // (one of the base's pixels, CSS px, whole device pixels out from the box)
    const n = Math.ceil(s.baseRect) + 1
    const [L, T, R, B] = [Math.floor(bl), Math.floor(bt), Math.ceil(br), Math.ceil(bb)]
    const [x0, y0] = [Math.ceil(Math.max(al, vl)), Math.ceil(Math.max(at, vt))]
    const [x1, y1] = [Math.floor(Math.min(ar, vr)), Math.floor(Math.min(ab, vb))]
    const cut = ([l, t, r, b]) => {
      const [cl, ct, cr, cb] = [Math.max(l, x0), Math.max(t, y0), Math.min(r, x1), Math.min(b, y1)]
      return cr > cl && cb > ct ? { x: cl, y: ct, width: cr - cl, height: cb - ct } : null
    }
    const ring = [cut([L - n, T - n, R + n, T]), cut([L - n, B, R + n, B + n]), cut([L - n, T, L, B]), cut([R, T, R + n, B])]
    return { ring: ring.filter(Boolean), box: cut([L, T, R, B]) }
  }
  const visible = (on) =>
    page.evaluate((on) => {
      for (const c of document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops, section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail'))
        if (on) c.style.removeProperty('visibility')
        else c.style.visibility = 'hidden'
    }, on)
  /** the ring's strips and the box, shot with the crops shown and hidden, the state the same before and after (else again) */
  const measure = async () => {
    for (let i = 0; i < 5; i++) {
      const s = await state()
      const r = regions(s)
      const clips = [...r.ring, ...(r.box ? [r.box] : [])]
      const shown = await Promise.all(clips.map((clip) => page.screenshot({ clip })))
      await visible(false)
      const hidden = await Promise.all(clips.map((clip) => page.screenshot({ clip })))
      await visible(true)
      const after = await state()
      if (!s || !after || !s.match || after.key !== s.key) {
        await settled(true)
        continue
      }
      const same = shown.map((b, k) => b.equals(hidden[k]))
      return { ring: r.ring, box: r.box, ringDiffer: same.slice(0, r.ring.length).filter((x) => !x).length, boxDiffers: !!r.box && !same[r.ring.length], tries: i + 1 }
    }
    return null
  }
  const got = inView ? await measure() : null
  check(
    'past the cap, a ring one base pixel wide round the detail crops, within the area: the page\'s own pixels, nothing of the base\'s crops',
    !!got?.ring.length && got.ringDiffer === 0,
    JSON.stringify({ inView, strips: got?.ring, differ: got?.ringDiffer, tries: got?.tries }),
  )
  check(
    'past the cap, the detail crops\' box, within the area: the crops\' ink, not the page\'s alone',
    !!got?.box && got.boxDiffers,
    JSON.stringify({ box: got?.box, differs: got?.boxDiffers }),
  )
  // (the control: the detail canvas left blank, the same box shows nothing of the crops: the check above would fail)
  await page.evaluate(() => {
    const det = document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail')
    det?.getContext('2d')?.clearRect(0, 0, det.width, det.height)
  })
  const blank = got ? await measure() : null
  check(
    'control: a detail canvas left blank, the box within the area shows none of the crops\' ink (the check above fails on it)',
    !!blank?.box && !blank.boxDiffers,
    JSON.stringify({ box: blank?.box, differs: blank?.boxDiffers }),
  )
  // (back under the cap: no detail canvas, no crops of one, the page's own crops whole)
  await page.evaluate(() => window.__reader.controller.zoomTo(1))
  const gone = await page
    .waitForFunction(() => !document.querySelector('section.pane[data-side="right"] .axt-over > canvas.axt-crops-detail') && [...document.querySelectorAll('section.pane[data-side="right"] .axt-over > canvas.axt-crops')].every((c) => !c.style.clipPath), null, { timeout: 15_000 })
    .then(() => true, () => false)
  check('zoomed back under the cap: no detail crops left, the page\'s own crops whole', gone)
  await page.close()
}
