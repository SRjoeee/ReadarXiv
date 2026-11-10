// lab/typeset/parity/measure-dom.mjs: what a laid page's SVG drew, read back in the browser, the same way for both readers
// (today's door's SVG, `g[data-u]`; the reader package's, `g[data-axt-ord]`): every character where the browser placed it
// (SVGTextContentElement's extent of each character: its advance box at its place), in the face weight, style and size it
// was set in (the computed style of its run, so a weight a class names counts as one an attribute names), drawn or not (a
// crop's transparent stand-in), and slanted or not (italic, or a run skewed by its own transform). The lines of a group are
// its characters by baseline; each line is told in PDF units (y up): its baseline, the ink extent of its drawn characters,
// its size, how many of its characters are bold and slanted (and each one's face), and the widest word space and letter gap between its drawn
// characters (in ems of the line's size), the places a crop stands taken out (a crop is a formula's ink, no gap). A character
// is placed through its <text>'s own transform into the SVG's user space (a figure text turned by `rotate`, an oblique run
// skewed about its baseline); a turned <text> is one line of its own, told `rot`, with the box its characters cover and its
// band as a level line's is read (`band`: each character's advance along its run, from 0.2 of its size under its baseline to
// 0.8 over it across, turned with it: the browser's own box across a character is its first face's ascent and descent rounded
// to the pixel, which no layout of either side is made from).

const SPACE = /\s/u
/** a character of the CJK scripts (a boundary between one and a Latin letter is a word boundary, not a letter gap) */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\u30fc]/u
const OBJ = '￼'
const r2 = (v) => Math.round(v * 100) / 100

/** whether a <text> is slanted by its own transform (a skewX, the readers' oblique run) */
const skewed = (t) => /skewX\(\s*-?[1-9]/.test(t.getAttribute('transform') ?? '')

/**
 * Each group's lines as drawn. `attr` the group's attribute (its unit's number), `view` the page's view box [x0, y0, x1, y1]
 * in PDF units, `k` the SVG's user units a PDF unit (its viewBox's x origin the view's), `crops` [group, x0, y0, x1, y1] the
 * places crops stand (PDF units), which no gap is read across.
 */
export function linesOfSvg(svg, attr, view, k, crops = []) {
  const out = []
  const X = (x) => view[0] + x / k
  const Y = (y) => view[3] - y / k
  const root = svg.getScreenCTM()?.inverse() ?? null
  let tk = 0
  for (const g of svg.querySelectorAll(`g[${attr}]`)) {
    const raw = g.getAttribute(attr) ?? ''
    const id = /^\d+$/.test(raw) ? Number(raw) : raw
    const chars = []
    for (const t of g.querySelectorAll('text')) {
      const slant = skewed(t)
      // (the text's user space into the SVG's: its own transform and its parents')
      const sc = t.getScreenCTM()
      const m = root && sc ? root.multiply(sc) : null
      const at = (x, y) => (m ? [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : [x, y])
      const rot = !!m && Math.abs(m.b) > 1e-3
      const text = tk++
      let i = 0
      for (const span of t.querySelectorAll('tspan')) {
        // (a run placed at its own x: what stands before it is the typesetter's glue, its first character a word's start)
        const run = `${text}:${i}`,
          placed = span.getAttribute('x') !== null
        const n = span.getNumberOfChars()
        const cs = getComputedStyle(span)
        const weight = Number.parseInt(cs.fontWeight, 10) || 400
        const italic = slant || cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique')
        const size = Number.parseFloat(cs.fontSize) / k
        const hidden = span.getAttribute('fill-opacity') === '0' || cs.fillOpacity === '0' || cs.visibility === 'hidden'
        const s = span.textContent ?? ''
        for (let j = 0; j < n; j++) {
          let ext, start
          try {
            ext = t.getExtentOfChar(i + j)
            start = t.getStartPositionOfChar(i + j)
          } catch {
            continue
          }
          const ch = s[j] ?? ''
          const pts = [at(ext.x, ext.y), at(ext.x + ext.width, ext.y), at(ext.x, ext.y + ext.height), at(ext.x + ext.width, ext.y + ext.height)]
          const xs = pts.map((q) => q[0]),
            ys = pts.map((q) => q[1])
          const [, sy] = at(start.x, start.y)
          // (a turned character's band: its advance along, 0.2 of its size under its baseline to 0.8 over, in its own frame)
          const fs = Number.parseFloat(cs.fontSize)
          const bp = rot ? [at(ext.x, start.y - 0.8 * fs), at(ext.x + ext.width, start.y - 0.8 * fs), at(ext.x, start.y + 0.2 * fs), at(ext.x + ext.width, start.y + 0.2 * fs)] : null
          chars.push({
            ch: hidden ? OBJ : ch,
            x0: X(Math.min(...xs)),
            x1: X(Math.max(...xs)),
            y: Y(sy),
            top: Y(Math.min(...ys)),
            bottom: Y(Math.max(...ys)),
            rot,
            ...(bp ? { band: [X(Math.min(...bp.map((q) => q[0]))), Y(Math.max(...bp.map((q) => q[1]))), X(Math.max(...bp.map((q) => q[0]))), Y(Math.min(...bp.map((q) => q[1])))] } : {}),
            text,
            size,
            weight,
            italic,
            hidden,
            fill: cs.fill,
            run,
            placed,
          })
        }
        i += n
      }
    }
    // (the group's characters by baseline: one line a baseline, 0.05 pt apart at most; a turned text one line of its own)
    const byLine = []
    for (const c of chars.sort((a, b) => b.y - a.y || a.x0 - b.x0)) {
      const l = byLine.find((x) => (c.rot ? x.text === c.text : !x.rot && Math.abs(x.y - c.y) < 0.05))
      if (l) l.chars.push(c)
      else byLine.push({ y: c.y, rot: c.rot, text: c.text, chars: [c] })
    }
    const mine = crops.filter((c) => c[0] === id)
    const lines = byLine.map(({ y, rot, chars: cs }) => {
      cs.sort((a, b) => a.x0 - b.x0)
      const ink = cs.filter((c) => !c.hidden && !SPACE.test(c.ch) && c.ch)
      const sizes = ink.map((c) => c.size).sort((a, b) => a - b)
      const size = sizes.length ? sizes[sizes.length >> 1] : (cs[0]?.size ?? 0)
      // (the widest gaps: between consecutive drawn characters, a space between them a word space, and so a run placed at its
      // own x (the typesetter's glue before it: a lead's word, its label, the text after them, set apart with no space
      // character), none a letter gap; a crop standing between them, or a hidden stand-in, no gap at all)
      let word = 0,
        letter = 0,
        prev = null,
        spaced = false
      for (const c of rot ? [] : cs) {
        if (c.hidden) {
          prev = null
          continue
        }
        if (SPACE.test(c.ch) || !c.ch) {
          spaced = true
          continue
        }
        if (prev) {
          const gap = c.x0 - prev.x1
          const cropBetween = mine.some((q) => q[1] < c.x0 && q[3] > prev.x1 && q[2] < y + size && q[4] > y - 0.3 * size)
          if (!cropBetween && size > 0) {
            const em = gap / size
            const boundary = CJK.test(prev.ch) !== CJK.test(c.ch)
            const glue = c.placed && c.run !== prev.run
            if (spaced || boundary || glue) word = Math.max(word, em)
            else letter = Math.max(letter, em)
          }
        }
        prev = c
        spaced = false
      }
      const fills = {}
      for (const c of ink) fills[c.fill] = (fills[c.fill] ?? 0) + 1
      const bands = rot ? ink.filter((c) => c.band).map((c) => c.band) : []
      return {
        ...(rot ? { rot: true } : {}),
        ...(bands.length ? { band: [0, 1, 2, 3].map((q) => r2((q < 2 ? Math.min : Math.max)(...bands.map((b) => b[q])))) } : {}),
        y: r2(y),
        y0: cs.length ? r2(Math.min(...cs.map((c) => c.bottom))) : null,
        y1: cs.length ? r2(Math.max(...cs.map((c) => c.top))) : null,
        x0: ink.length ? r2(ink[0].x0) : null,
        x1: ink.length ? r2(Math.max(...ink.map((c) => c.x1))) : null,
        size: r2(size),
        n: ink.length,
        bold: ink.filter((c) => c.weight >= 600).length,
        italic: ink.filter((c) => c.italic).length,
        weights: [...new Set(ink.map((c) => c.weight))],
        fill: Object.entries(fills).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        word: r2(word),
        letter: r2(letter),
        text: cs.map((c) => c.ch).join(''),
        // (each character's face beside `text`, one digit a character: 1 bold, 2 slanted, 3 both, 0 neither, white space and a
        // crop's stand-in 0; stated where a character is bold or slanted: the verdict leaves a label drawn anew out of the
        // share, as the original's share leaves the label's ink out)
        ...(ink.some((c) => c.weight >= 600 || c.italic)
          ? { st: cs.map((c) => (c.hidden || SPACE.test(c.ch) || !c.ch ? 0 : (c.weight >= 600 ? 1 : 0) + (c.italic ? 2 : 0))).join('') }
          : {}),
      }
    })
    out.push({ id, lines })
  }
  return out
}
