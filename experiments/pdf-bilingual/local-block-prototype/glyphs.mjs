// Experiment-only reader of PDF.js 6.3 CanvasGraphics' horizontal text-state/advance semantics.
// Actual PDF glyph advances replace the text layer's proportional character-width approximation.
const identity = () => [1, 0, 0, 1, 0, 0]
const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
const point = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]

export function readGlyphs(list, OPS, fonts, styles) {
  let s = { ctm: identity(), tm: identity(), x: 0, y: 0, lx: 0, ly: 0, size: 0, font: null, char: 0, word: 0, hs: 1, rise: 0, leading: 0, mode: 0, unsafe: false }
  const stack = [], glyphs = [], rejected = {}
  const reject = reason => { rejected[reason] = (rejected[reason] ?? 0) + 1 }
  const move = (x, y) => { s.x = s.lx += x; s.y = s.ly += y }
  const show = (run, op) => {
    const font = fonts.get(s.font), fm = font?.fontMatrix?.[0] ?? 0.001, m = multiply(s.ctm, s.tm)
    const unsafe = s.unsafe || s.mode !== 0 || !font || font.isType3Font || font.vertical || font.isInvalidPDFjsFont || font.missingFile ||
      Math.abs(m[1]) > 1e-7 || Math.abs(m[2]) > 1e-7 || m[0] <= 0 || m[3] <= 0 || s.size <= 0 || s.hs <= 0 || fm !== 0.001
    if (unsafe) reject('unsupported-text-state')
    const style = styles[s.font], ascent = style?.ascent > 0 ? style.ascent : 0.75, descent = style?.descent < 0 ? style.descent : -0.22
    let advance = 0
    run.forEach((g, at) => {
      if (typeof g === 'number') { advance -= g * s.size / 1000; return }
      const width = g.width * s.size * fm
      if (!unsafe && g.unicode) {
        const [x, base] = point(m, s.x + advance * s.hs, s.y + s.rise)
        const size = s.size * m[3]
        glyphs.push({ id: glyphs.length, op, at, text: g.unicode, font: s.font, x0: x, x1: x + width * s.hs * m[0], base, size,
          y0: base + descent * size, y1: base + ascent * size, accent: !!g.accent })
      }
      advance += width + s.char + (g.isSpace ? s.word : 0)
    })
    s.x += advance * s.hs
  }
  for (let n = 0; n < list.fnArray.length; n++) {
    const op = list.fnArray[n], a = list.argsArray[n] ?? []
    switch (op) {
      case OPS.save: stack.push({ ...s }); break
      case OPS.restore: s = stack.pop() ?? { ...s, unsafe: true }; break
      case OPS.transform: s.ctm = multiply(s.ctm, a); break
      case OPS.paintFormXObjectBegin: stack.push({ ...s }); if (a[0]) s.ctm = multiply(s.ctm, a[0]); break
      case OPS.paintFormXObjectEnd: s = stack.pop() ?? { ...s, unsafe: true }; break
      case OPS.beginText: s.tm = identity(); s.x = s.y = s.lx = s.ly = 0; break
      case OPS.setFont: [s.font, s.size] = a; break
      case OPS.setTextMatrix: s.tm = a; s.x = s.y = s.lx = s.ly = 0; break
      case OPS.moveText: move(...a); break
      case OPS.setLeadingMoveText: s.leading = a[1]; move(...a); break
      case OPS.setLeading: s.leading = -a[0]; break
      case OPS.nextLine: move(0, s.leading); break
      case OPS.setCharSpacing: s.char = a[0]; break
      case OPS.setWordSpacing: s.word = a[0]; break
      case OPS.setHScale: s.hs = a[0] / 100; break
      case OPS.setTextRise: s.rise = a[0]; break
      case OPS.setTextRenderingMode: s.mode = a[0]; break
      case OPS.showText: case OPS.showSpacedText: show(a[0], n); break
      case OPS.nextLineShowText: move(0, s.leading); show(a[0], n); break
      case OPS.nextLineSetSpacingShowText: s.word = a[0]; s.char = a[1]; move(0, s.leading); show(a[2], n); break
      case OPS.setGState:
        for (const [key, value] of a[0]) {
          if (key === 'Font') [s.font, s.size] = value
          else if (['SMask','TR','ca','CA','BM'].includes(key)) s.unsafe = true
        }
        break
      case OPS.beginGroup: case OPS.beginAnnotation: s.unsafe = true; break
    }
  }
  return { glyphs, rejected }
}

export function glyphTape(glyphs, anchor) {
  const chosen = glyphs.filter(g => anchor.rects.some(r => g.base >= r.y0 - g.size * 0.15 && g.base <= r.y1 && g.x1 >= r.x0 - 0.5 && g.x0 <= r.x1 + 0.5))
  let text = '', map = [], prev = null
  for (const g of chosen) {
    const nextLine = prev && (Math.abs(g.base - prev.base) > Math.max(g.size, prev.size) * 0.7 || g.x0 < prev.x0 - prev.size)
    if (nextLine && text.endsWith('-')) { text = text.slice(0, -1); map.pop() }
    else if (prev && (nextLine || g.x0 - prev.x1 > Math.min(g.size, prev.size) * 0.12) && !/\s$/.test(text) && !/^\s/.test(g.text)) { text += ' '; map.push(null) }
    text += g.text; map.push(...Array(g.text.length).fill(g.id)); prev = g
  }
  return { text, map, chosen }
}
