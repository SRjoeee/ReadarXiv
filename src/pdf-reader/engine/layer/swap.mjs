// The swap of the text-removed PDF (layout/remove.mjs; the instant layer's text removal): where the reader puts the
// removed page's pixels in for a drawn unit. The reader shows arXiv's page (O); its removed page (R) differs from it only
// where the removed glyphs' ink is. Every pixel where the two differ is the unit's whose removed glyph or rule it lies in,
// or reaches first over differing pixels (a big operator's tail below its glyph's box), and each unit's share grows a
// pixel into what does not differ; so a unit's swap never reaches another unit's glyphs (one not drawn yet stays the
// original's), and a swap anywhere it reaches is exact, R being O there. Drawn at a higher resolution than it was worked
// out at, its rectangles scaled: their edges lie where O and R are the same.
//
// Pure: no DOM, no clock. An original module (no port statement), importing nothing, so that the reader's bundle holds it.

/**
 * Each unit's share of where the original page (O) and its removed page (Rm) differ, at v0's own device pixels (W x H,
 * RGBA): every differing pixel goes to the unit whose removed glyph or rule it lies in or reaches first over differing
 * pixels (a big operator's tail below its box), and each unit's share grows by a pixel into what does not differ. `slots`:
 * per unit, its glyphs' and rules' boxes in device pixels ([x0, y0, x1, y1]). Returns per slot the rectangles [x, y, w, h]
 * the removed page's pixels go into, and how many differing pixels no unit reaches (`unclaimed`).
 */
export function swapMasks(O, Rm, W, H, slots) {
  const N = W * H
  const label = new Int32Array(N).fill(-1)
  const diff = new Uint8Array(N)
  for (let i = 0, q = 0; i < N; i++, q += 4) if (O[q] !== Rm[q] || O[q + 1] !== Rm[q + 1] || O[q + 2] !== Rm[q + 2]) diff[i] = 1
  // seeds: the differing pixels inside each unit's own boxes (the smaller box first where two meet)
  const seeds = []
  slots.forEach((s, si) => { for (const b of s.boxes) seeds.push([si, b, (b[2] - b[0]) * (b[3] - b[1])]) })
  seeds.sort((a, b) => a[2] - b[2])
  let queue = new Int32Array(1024), qn = 0
  const enqueue = i => { if (qn === queue.length) { const q2 = new Int32Array(queue.length * 2); q2.set(queue); queue = q2 } queue[qn++] = i }
  for (const [si, b] of seeds) {
    const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (diff[i] && label[i] < 0) { label[i] = si; enqueue(i) } }
  }
  // grown over the differing pixels, breadth first (8-connected): each pixel the unit's that reaches it first
  for (let h = 0; h < qn; h++) {
    const i = queue[h], x = i % W, s = label[i]
    for (let dy = -1; dy <= 1; dy++) {
      const yy = (i - x) / W + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= W) continue
        const j = yy * W + xx
        if (diff[j] && label[j] < 0) { label[j] = s; enqueue(j) }
      }
    }
  }
  // what no seed reaches over differing pixels is a part of a glyph apart from its body (an i's dot, an accent above its
  // glyph's declared box): each such run of pixels the unit's whose box is nearest to it, within its box's height
  const CELL = 32, gw = Math.ceil(W / CELL), grid = new Map()
  for (const [si, b] of seeds) {
    const gx0 = Math.max(0, Math.floor(b[0] / CELL) - 1), gx1 = Math.min(gw - 1, Math.floor(b[2] / CELL) + 1), gy0 = Math.max(0, Math.floor(b[1] / CELL) - 1), gy1 = Math.floor(b[3] / CELL) + 1
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) { const k = gy * gw + gx; (grid.get(k) ?? grid.set(k, []).get(k)).push([si, b]) }
  }
  const stack = []
  for (let s0 = 0; s0 < N; s0++) {
    if (!diff[s0] || label[s0] !== -1) continue
    // the run (8-connected), its box
    const run = [s0]
    label[s0] = -2
    let x0 = W, y0 = H, x1 = -1, y1 = -1
    stack.push(s0)
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const j = yy * W + xx
        if (diff[j] && label[j] === -1) { label[j] = -2; run.push(j); stack.push(j) }
      }
    }
    let best = -1, gap = Infinity
    const cx = Math.floor((x0 + x1) / 2 / CELL), cy = Math.floor((y0 + y1) / 2 / CELL)
    for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (const [si, b] of grid.get(gy * gw + gx) ?? []) {
        const dx = Math.max(0, b[0] - x1, x0 - b[2]), dy = Math.max(0, b[1] - y1, y0 - b[3]), d = Math.hypot(dx, dy)
        if (d <= b[3] - b[1] && d < gap) { gap = d; best = si }
      }
    }
    // (-3: no unit's: left as it is, counted)
    for (const i of run) label[i] = best >= 0 ? best : -3
  }
  let unclaimed = 0
  for (let i = 0; i < N; i++) if (diff[i] && label[i] < 0) unclaimed++
  // each unit's pixels, a pixel more into what does not differ (each such pixel the first labelled neighbour's), as
  // rectangles: runs by row, a run alike on the row below joined to it
  const out = slots.map(() => [])
  const dil = new Int32Array(N).fill(-1)
  let ylo = H, yhi = -1
  for (let i = 0; i < N; i++) {
    const s = label[i]
    if (s < 0) continue
    dil[i] = s
    const x = i % W, y = (i - x) / W
    if (y < ylo) ylo = y
    if (y > yhi) yhi = y
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= W) continue
        const j = yy * W + xx
        if (!diff[j] && dil[j] === -1) dil[j] = s
      }
    }
  }
  let open = new Map()
  for (let y = Math.max(0, ylo - 1); y <= Math.min(H - 1, yhi + 1) + 1; y++) {
    const next = new Map()
    if (y < H) {
      let x = 0
      while (x < W) {
        const s = dil[y * W + x]
        if (s < 0) { x++; continue }
        let e = x + 1
        while (e < W && dil[y * W + e] === s) e++
        const key = `${s}|${x}|${e}`, o = open.get(key)
        if (o) { o[1][3]++; next.set(key, o) } else next.set(key, [s, [x, y, e - x, 1]])
        x = e
      }
    }
    for (const [key, o] of open) if (!next.has(key)) out[o[0]].push(o[1])
    open = next
  }
  for (const o of open.values()) out[o[0]].push(o[1])
  return { rects: out, unclaimed, differing: diff.reduce((a, v) => a + v, 0) }
}
