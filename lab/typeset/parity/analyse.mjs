// lab/typeset/parity/analyse.mjs: the pixels of one page, read in the browser (render.mjs hands this function to the lab's
// blank page: it is sent as its source, so it closes over nothing). Inputs: the five shots as PNG (base64) at the device
// scale: A arXiv's page, T today's pane, Tt today's translated text alone, V v2's pane, Vt v2's translated text alone; the
// page's view box; the boxes of its units (PDF units: the original's lines and each side's drawn lines and crops); `scale`
// device px a point. Every shot is drawn onto a canvas of A's size (a pane one or two device px narrower, the reader's
// whole-pixel box, is not stretched: drawn at its own size from the corner).
//   darkness  over the glyph pixels of the translated text alone (a pixel whose darkness, 1 - luminance, is DARK_MIN or
//             more): their mean darkness, and their count. The text is drawn black on white by both readers but where the
//             original's fill is a colour, so the mean tells the weight and the antialiasing a face is drawn with. The
//             original's own (`originalText`): arXiv's page over the original lines of the units either side lays
//             (`textBoxes`), the ink the translation stands for.
//   diff      today's pane against v2's: the pixels whose luminance differs by DIFF_MIN or more; and each pane against arXiv's
//             page outside every unit's box, where each should be arXiv's page ink for ink (`outside`: v2's, `outsideToday`:
//             today's, whose composed page may be our compile's on a delta's replaced page): a pixel counted where no pixel
//             within one device pixel of it, in either image, matches it (ink, not its sub-pixel phase).
//   rules     the vertical rules of arXiv's page, read off its pixels (the bundle's rules list the horizontal ones alone): a
//             straight run of dark pixels RULE_LONG points long or more, at most RULE_THICK points wide, light on both sides
//             (a glyph's stem is shorter than a line's height; a table's column rule spans a row at least).
//   fidelity  each side's drawing against arXiv's page itself (pixels.mjs, on globalThis.parityPixels: the lab's page holds it):
//             its text drawn over other ink (Tt/Vt against Tc/Vc, its drawing without its text, per drawn group), each drawn
//             group's darkness and each original unit's (and whether its ink is black), the original's glyphs it shows in
//             part inside its translated units' regions (`regions`, its moved crops' places `moved` aside), and how much of
//             each of its elements' ink (`elements`) it shows in place.
// Returns the numbers and the sheet's images (WebP, half the device resolution): the original, today's, v2's, and the
// difference (the original faint, v2's ink alone red, today's alone blue).
export async function analyse({ A, T, Tt, Tc, V, Vt, Vc, view, boxes, textBoxes, figBoxes = [], groups = null, origs = [], regions = null, moved = null, elements = null, scale }) {
  const DARK_MIN = 0.1
  const DIFF_MIN = 0.25
  const RULE_LONG = 12
  const RULE_THICK = 1.5
  const decode = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
  const bmA = await decode(A)
  const W = bmA.width,
    H = bmA.height
  const pixels = async (b64) => {
    const bm = b64 === A ? bmA : await decode(b64)
    const c = new OffscreenCanvas(W, H)
    const x = c.getContext('2d', { willReadFrequently: true })
    x.fillStyle = '#fff'
    x.fillRect(0, 0, W, H)
    x.drawImage(bm, 0, 0)
    return { canvas: c, data: x.getImageData(0, 0, W, H).data, size: [bm.width, bm.height] }
  }
  const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
  const darkness = (d, mask = null) => {
    let sum = 0,
      n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (mask && !mask[i >> 2]) continue
      const k = 1 - lum(d, i)
      if (k >= DARK_MIN) {
        sum += k
        n++
      }
    }
    return { mean: n ? Math.round((sum / n) * 10000) / 10000 : null, pixels: n }
  }
  const [pa, pt, ptt, pv, pvt] = [await pixels(A), await pixels(T), await pixels(Tt), await pixels(V), await pixels(Vt)]
  const [ptc, pvc] = [Tc ? await pixels(Tc) : null, Vc ? await pixels(Vc) : null]
  // (the units' boxes as a mask of device pixels)
  const maskOf = (list) => {
    const m = new Uint8Array(W * H)
    for (const [x0, y0, x1, y1] of list) {
      const c0 = Math.max(0, Math.floor((x0 - view[0]) * scale)),
        c1 = Math.min(W, Math.ceil((x1 - view[0]) * scale))
      const r0 = Math.max(0, Math.floor((view[3] - y1) * scale)),
        r1 = Math.min(H, Math.ceil((view[3] - y0) * scale))
      for (let r = r0; r < r1; r++) if (c1 > c0) m.fill(1, r * W + c0, r * W + c1)
    }
    return m
  }
  const inside = maskOf(boxes)
  const fig = maskOf(figBoxes)
  const notFig = fig.map((v) => (v ? 0 : 1))
  // (a pixel off arXiv's page only where no pixel of either within one device pixel matches it: the same ink drawn a
  // fraction of a pixel elsewhere, as PDF.js's page view does in a box it floors to whole pixels, is no difference of ink)
  const near = (d, p) => {
    const x = p % W,
      y = (p / W) | 0
    const own = lum(d, p * 4),
      orig = lum(pa.data, p * 4)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx,
          Y = y + dy
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue
        const q = (Y * W + X) * 4
        if (Math.abs(own - lum(pa.data, q)) < DIFF_MIN || Math.abs(orig - lum(d, q)) < DIFF_MIN) return true
      }
    return false
  }
  let diff = 0,
    outside = 0,
    outsideToday = 0
  const dc = new OffscreenCanvas(W, H)
  const dx = dc.getContext('2d')
  const img = dx.createImageData(W, H)
  const o = img.data
  for (let i = 0, p = 0; i < pa.data.length; i += 4, p++) {
    const a = lum(pa.data, i),
      t = lum(pt.data, i),
      v = lum(pv.data, i)
    const faint = 255 - Math.round((1 - a) * 60)
    o[i] = o[i + 1] = o[i + 2] = faint
    o[i + 3] = 255
    if (!inside[p]) {
      if (Math.abs(v - a) >= DIFF_MIN && !near(pv.data, p)) outside++
      if (Math.abs(t - a) >= DIFF_MIN && !near(pt.data, p)) outsideToday++
    }
    if (Math.abs(t - v) >= DIFF_MIN) {
      diff++
      if (v < t) {
        o[i] = 220
        o[i + 1] = 30
        o[i + 2] = 30
      } else {
        o[i] = 30
        o[i + 1] = 80
        o[i + 2] = 220
      }
    }
  }
  dx.putImageData(img, 0, 0)
  // (arXiv's vertical rules: per column, each run of dark pixels RULE_LONG pt long; kept where the dark run across it at its
  // middle is RULE_THICK pt wide at most and the pixels just outside it are light on 70 % of its rows; neighbouring columns'
  // runs merged)
  const dark = (r, c) => c >= 0 && c < W && lum(pa.data, (r * W + c) * 4) < 0.5
  const long = Math.ceil(RULE_LONG * scale),
    thick = Math.ceil(RULE_THICK * scale)
  const segs = []
  for (let c = 0; c < W; c++) {
    let r0 = -1
    for (let r = 0; r <= H; r++) {
      const d = r < H && dark(r, c)
      if (d && r0 < 0) r0 = r
      if (!d && r0 >= 0) {
        if (r - r0 >= long) {
          const mid = (r0 + r) >> 1
          let a = c,
            b = c
          while (dark(mid, a - 1) && c - a < thick + 2) a--
          while (dark(mid, b + 1) && b - c < thick + 2) b++
          if (b - a + 1 <= thick) {
            let light = 0
            for (let q = r0; q < r; q++) if (!dark(q, a - 2) && !dark(q, b + 2)) light++
            if (light >= 0.7 * (r - r0)) segs.push([a, r0, b, r - 1])
          }
        }
        r0 = -1
      }
    }
  }
  const rules = []
  for (const s of segs) {
    const m = rules.find((q) => s[0] <= q[2] + 1 && s[2] >= q[0] - 1 && s[1] <= q[3] && s[3] >= q[1])
    if (m) {
      m[0] = Math.min(m[0], s[0])
      m[1] = Math.min(m[1], s[1])
      m[2] = Math.max(m[2], s[2])
      m[3] = Math.max(m[3], s[3])
    } else rules.push([...s])
  }
  const r2 = (v) => Math.round(v * 100) / 100
  // (the drawing against arXiv's page itself, each side's: pixels.mjs)
  const P = globalThis.parityPixels
  let fidelity = null
  if (P && ptc && pvc && groups) {
    const sides = { today: { t: ptt.data, c: ptc.data }, v2: { t: pvt.data, c: pvc.data } }
    fidelity = { over: {}, dark: {}, orig: {}, parts: {}, shown: {} }
    for (const [side, { t, c }] of Object.entries(sides)) {
      const over = {},
        dk = {}
      for (const g of groups[side] ?? []) {
        const px = P.pixelsOf(g.boxes, view, scale, W, H)
        const n = P.overOf(t, c, px)
        if (n) over[g.id] = n
        dk[g.id] = P.darkOf(t, px)
      }
      fidelity.over[side] = over
      fidelity.dark[side] = dk
      // (the original's glyphs shown in part inside the side's translated units' original lines: its moved crops' places aside)
      const region = P.maskOf(regions?.[side] ?? [], view, scale, W, H)
      const skip = P.maskOf(moved?.[side] ?? [], view, scale, W, H)
      fidelity.parts[side] = P.partsOf(pa.data, c, region, skip, W, H).map((x) => ({
        box: [r2(view[0] + x.box[0] / scale), r2(view[3] - x.box[3] / scale), r2(view[0] + x.box[2] / scale), r2(view[3] - x.box[1] / scale)],
        size: x.size,
        shown: x.shown,
      }))
      const sh = {}
      for (const e of elements?.[side] ?? []) sh[e.id] = P.shownOf(pa.data, c, P.pixelsOf(e.boxes, view, scale, W, H), W, H)
      fidelity.shown[side] = sh
    }
    for (const o of origs) {
      const px = P.pixelsOf(o.boxes, view, scale, W, H)
      let lo = 1
      for (const p of px) lo = Math.min(lo, lum(pa.data, p * 4))
      fidelity.orig[o.id] = { ...P.darkOf(pa.data, px), least: r2(lo) }
    }
  }
  const vrules = rules.map(([a, r0, b, r1]) => [r2(view[0] + a / scale), r2(view[3] - (r1 + 1) / scale), r2(view[0] + (b + 1) / scale), r2(view[3] - r0 / scale)])
  const half = async (canvas) => {
    const c = new OffscreenCanvas(Math.round(W / 2), Math.round(H / 2))
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(canvas, 0, 0, c.width, c.height)
    const b = await c.convertToBlob({ type: 'image/webp', quality: 0.82 })
    const bytes = new Uint8Array(await b.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  return {
    size: [W, H],
    sizes: { today: pt.size, v2: pv.size },
    // (each side's translated text outside the figure texts, which its text-alone shot draws: the page's body text)
    darkness: { original: darkness(pa.data), originalText: darkness(pa.data, maskOf(textBoxes)), today: darkness(ptt.data, notFig), v2: darkness(pvt.data, notFig) },
    fidelity,
    rules: vrules,
    diff: { pixels: diff, share: Math.round((diff / (W * H)) * 1e6) / 1e6, outside, outsideToday, insideShare: Math.round((inside.reduce((n, v) => n + v, 0) / (W * H)) * 1e4) / 1e4 },
    images: { a: await half(pa.canvas), t: await half(pt.canvas), v: await half(pv.canvas), d: await half(dc) },
  }
}

/** the boxes of the page's units (analyse's `boxes`), PDF units [x0, y0, x1, y1]: each unit's lines on A (its original ink) and
 *  its label's ink there (a label drawn anew stands at the label's place, the unit's own: TeX set it before the unit's first
 *  line, which begins after it), and each line either side drew; a pixel that differs outside all of them differs where both
 *  should show arXiv's page. Read in Node (render.mjs) from the page's record and v2.mjs's file of the pair */
export function boxesOf(rec, v2, n) {
  const out = []
  for (const m of v2.facts[n]?.members ?? []) {
    for (const l of m.lines) if (l[0] === n) out.push([l[2] - 1, l[6] - 1, l[3] + 1, l[5] + 1])
    const lb = m.label?.ink
    if (lb?.[0] === n) out.push([lb[1] - 1, lb[2] - 1, lb[3] + 1, lb[4] + 1])
  }
  for (const u of [...(rec.today?.units ?? []), ...(rec.today?.figures ?? []), ...(rec.today?.names ?? []), ...(rec.v2?.units ?? [])])
    for (const l of u.lines)
      if (l.x0 !== null) out.push(l.rot ? [l.x0 - 1, l.y0 - 1, l.x1 + 1, l.y1 + 1] : [l.x0 - 1, l.y - 0.3 * l.size, l.x1 + 1, l.y + 1.0 * l.size])
  for (const c of [...(rec.today?.crops ?? []), ...(rec.v2?.crops ?? [])]) out.push([c[1] - 1, c[2] - 1, c[3] + 1, c[4] + 1])
  return out
}
