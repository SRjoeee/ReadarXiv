// Typographic measurements of a PDF's body text: the font size of CJK runs, the distance between the baselines of
// consecutive lines in a column, their ratio (the leading), the advance of a CJK character over its size, characters
// per line, and the fonts CJK text is set in. Pages 3–12, lines of body size only.
//   node spikes/typo-metrics.mjs <pdf> [<pdf> …]
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }
for (const file of process.argv.slice(2)) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname, cMapPacked: true, standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname })
  const pdf = await task.promise
  const sizes = [], gaps = [], adv = [], perLine = [], fonts = new Map(), latinSizes = []
  for (let p = 3; p <= Math.min(12, pdf.numPages); p++) {
    const tc = await (await pdf.getPage(p)).getTextContent()
    const lines = new Map()
    for (const it of tc.items) {
      if (!it.str.trim()) continue
      const [a, b, , , x, y] = it.transform, size = Math.hypot(a, b)
      const cj = (it.str.match(/[㐀-鿿]/g) ?? []).length
      if (cj) { sizes.push(size); if (cj === it.str.length && it.str.length >= 4) adv.push(it.width / it.str.length / size); const f = tc.styles[it.fontName]?.fontFamily ?? it.fontName; fonts.set(f, (fonts.get(f) ?? 0) + cj) }
      else if (/[a-z]{3}/.test(it.str)) latinSizes.push(size)
      const key = `${Math.round(y * 2) / 2}|${x < 306 ? 'L' : 'R'}`
      const l = lines.get(key) ?? { y, x, size, chars: 0, cjk: 0 }
      l.chars += it.str.length; l.cjk += cj; l.x = Math.min(l.x, x); lines.set(key, l)
    }
    // body lines: the most common size; consecutive in a column, a normal line's distance apart
    const body = med(sizes.length ? sizes : latinSizes)
    const ls = [...lines.values()].filter(l => Math.abs(l.size - body) < 0.6).sort((u, v) => v.y - u.y)
    for (const col of ['L', 'R']) {
      const c = ls.filter(l => (l.x < 306 ? 'L' : 'R') === col)
      for (let k = 1; k < c.length; k++) { const g = c[k - 1].y - c[k].y; if (g > body * 0.9 && g < body * 2.2) gaps.push(g) }
    }
    for (const l of ls) if (l.chars > 25) perLine.push(l.chars)
  }
  const body = med(sizes.length ? sizes : latinSizes), gap = med(gaps)
  console.log(file.split('/').slice(-1)[0].slice(0, 60))
  console.log(`  body size ${body?.toFixed(2)} pt, baseline gap ${gap?.toFixed(2)} pt, leading ${(gap / body).toFixed(2)}× size, CJK advance ${med(adv)?.toFixed(3)}× size, chars per full line ${med(perLine)}, CJK fonts ${[...fonts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${n})`).join(', ')}`)
  await task.destroy()
}
