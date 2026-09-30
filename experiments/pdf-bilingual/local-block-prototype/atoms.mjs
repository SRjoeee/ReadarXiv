// Native-item provenance only. Reject ambiguity instead of reconstructing a citation or formula from TeX.
import { glyphTape } from './glyphs.mjs'
export function nativeIndex(text, tokenize) {
  const items = text.items.map((it, id) => {
    if (!it.str || it.transform[1] || it.transform[2]) return null
    const size = Math.abs(it.transform[0]), style = text.styles[it.fontName]
    return { id, font: it.fontName, text: it.str, words: tokenize(it.str), x0: it.transform[4], x1: it.transform[4] + it.width,
      base: it.transform[5], size, y0: it.transform[5] + (style?.descent < 0 ? style.descent : -0.22) * size,
      y1: it.transform[5] + (style?.ascent > 0 ? style.ascent : 0.75) * size }
  })
  return { items, tokenize }
}

export function verifyGlyphs(glyphs, native) {
  const verified = new Set()
  const normalize = s => s.normalize('NFKC').replace(/\s/g, '')
  const rows = new Map()
  for (const g of glyphs) {
    const key = `${g.font}:${Math.floor(g.base)}`
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push(g)
  }
  for (const item of native.items.filter(Boolean)) {
    const row = Math.floor(item.base)
    const near = [row - 1, row, row + 1].flatMap(y => rows.get(`${item.font}:${y}`) ?? [])
    const group = near.filter(g => Math.abs(g.base - item.base) < 0.05 && Math.abs(g.size - item.size) < 0.05 && g.x0 >= item.x0 - 0.05 && g.x1 <= item.x1 + 0.05).sort((a, b) => a.id - b.id)
    if (group.length && normalize(group.map(g => g.text).join('')) === normalize(item.text) && Math.abs(group[0].x0 - item.x0) < 0.1 && Math.abs(group.at(-1).x1 - item.x1) < 0.2) group.forEach(g => verified.add(g.id))
  }
  return verified
}

export function resolveGlyphAtoms(unit, anchor, native, glyphs, verified) {
  const tape = glyphTape(glyphs, anchor), words = native.tokenize(tape.text)
  const find = context => {
    const hits = []
    for (let n = 0; n + context.length <= words.length; n++) if (context.every((w, j) => words[n + j].t === w.t)) hits.push(words.slice(n, n + context.length))
    return hits.length === 1 ? hits[0] : null
  }
  const atoms = []
  for (let n = 0; n < unit.sourceRuns.length; n++) {
    const run = unit.sourceRuns[n]
    if (run.atom === undefined) continue
    const left = unit.sourceRuns[n - 1]?.text, right = unit.sourceRuns[n + 1]?.text
    if (!left || !right) return { reason: 'atom-no-two-sided-context' }
    const L = native.tokenize(left), R = native.tokenize(right)
    if (L.length < 3 || R.length < 3) return { reason: 'atom-short-context' }
    const a = find(L.slice(-3)), b = find(R.slice(0, 3))
    if (!a || !b) return { reason: 'atom-ambiguous-context' }
    let start = a.at(-1).at + a.at(-1).len, end = b[0].at
    const suffix = left.slice(L.at(-1).at + L.at(-1).len).trim(), prefix = right.slice(0, R[0].at).trim()
    if (suffix && !tape.text.slice(start).trimStart().startsWith(suffix) || prefix && !tape.text.slice(0, end).trimEnd().endsWith(prefix)) return { reason: 'atom-boundary-punctuation' }
    while (/\s/.test(tape.text[start] ?? '') && start < end) start++
    start += suffix.length
    while (/\s/.test(tape.text[end - 1] ?? '') && end > start) end--
    end -= prefix.length
    const ids = [...new Set(tape.map.slice(start, end).filter(id => id !== null))]
    const group = ids.map(id => glyphs[id]).filter(g => g.text.trim())
    if (!group.length || group.length > 160) return { reason: 'atom-glyph-budget-or-empty' }
    const l = glyphs[tape.map[a.at(-1).at + a.at(-1).len - 1]], r = glyphs[tape.map[b[0].at]]
    if (!l || !r || Math.abs(l.base - r.base) > l.size * 0.12 || group.some(g => Math.abs(g.base - l.base) > l.size * 0.65)) return { reason: 'atom-cross-line' }
    if (group.some(g => !verified.has(g.id) || g.accent)) return { reason: 'atom-glyph-text-layer-mismatch' }
    // The nearest excluded glyph can be a comma/period before the next contextual word.
    const previous = [...tape.map.slice(0, start)].reverse().find(id => id !== null && !ids.includes(id))
    const following = tape.map.slice(end).find(id => id !== null && !ids.includes(id))
    const leftEdge = previous === undefined ? l.x1 : glyphs[previous].x1
    const rightEdge = following === undefined ? r.x0 : glyphs[following].x0
    const x0 = Math.max(leftEdge, Math.min(...group.map(g => g.x0)) - 0.25), x1 = Math.min(rightEdge, Math.max(...group.map(g => g.x1)) + 0.25)
    const y0 = Math.min(...group.map(g => g.y0)) - 0.4, y1 = Math.max(...group.map(g => g.y1)) + 0.4
    if (x1 <= x0 || y1 - y0 > l.size * 2 || x1 - x0 > l.size * 35 || group.some(g => g.x0 < x0 - 0.01 || g.x1 > x1 + 0.01)) return { reason: 'atom-crop-budget-or-collision' }
    if (atoms.some(atom => atom.glyphIds.some(id => ids.includes(id)))) return { reason: 'atom-overlapping-provenance' }
    const chunks = [[]]
    for (const g of group) {
      const last = chunks.at(-1).at(-1)
      if (unit.atoms[run.atom].kind === 'citation' && last && g.x0 - last.x1 > Math.min(g.size, last.size) * 0.12) chunks.push([])
      chunks.at(-1).push(g)
    }
    const parts = chunks.map((chunk, i) => ({ id: i, x0: Math.max(x0, Math.min(...chunk.map(g => g.x0)) - 0.25), x1: Math.min(x1, Math.max(...chunk.map(g => g.x1)) + 0.25),
      y0, y1, base: l.base, glyphIds: chunk.map(g => g.id), nativeText: chunk.map(g => g.text).join('') }))
    atoms.push({ ...unit.atoms[run.atom], x0, x1, y0, y1, base: l.base, bodySize: l.size, glyphIds: ids, parts, font: group[0].font,
      operators: [...new Set(group.map(g => g.op))], nativeText: tape.text.slice(start, end).trim(), provenance: 'verified-PDF-glyph-advances' })
  }
  return atoms.length === unit.atoms.length ? { atoms } : { reason: 'atom-count-mismatch' }
}
