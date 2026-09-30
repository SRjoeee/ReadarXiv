// Throwaway local fitting logic: callback measures only the candidate region. No TeX or PDF mutation.
export function boundedFit(measure, { min = 0.9, max = 1, steps = 5 } = {}) {
  let measurements = 1
  const full = measure(max)
  if (full) return { fits: true, scale: max, measurements }
  measurements++
  if (!measure(min)) return { fits: false, scale: min, measurements }
  let lo = min, hi = max
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2
    measurements++
    if (measure(mid)) lo = mid; else hi = mid
  }
  measure(lo)
  return { fits: true, scale: lo, measurements: measurements + 1 }
}

export const percentile = (values, p) => {
  const xs = [...values].sort((a, b) => a - b)
  return xs.length ? xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)] : null
}

export function regionOf(anchor, doc, page) {
  if (!anchor || anchor.coverage < 0.95 || anchor.rects.length < 2) return null
  const r = anchor.rects
  if (r.some(x => x.page !== page)) return null
  const x0 = Math.min(...r.map(x => x.x0)), x1 = Math.max(...r.map(x => x.x1))
  const y0 = Math.min(...r.map(x => x.y0)), y1 = Math.max(...r.map(x => x.y1))
  const sizes = anchor.tokens.map(k => doc[k].h).sort((a, b) => a - b)
  const size = sizes[sizes.length >> 1]
  const gaps = r.slice(1).map((x, i) => r[i].y1 - x.y1)
  if (gaps.some(x => x < size * 0.7 || x > size * 1.8)) return null
  if (x1 - x0 < size * 8 || y1 - y0 < size * 1.5) return null
  return { x0, x1, y0, y1, size, leading: percentile(gaps, 0.5) / size, rects: r }
}
