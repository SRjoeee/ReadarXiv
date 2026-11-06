// A document made by hand for the back half's tests: each page a list of lines, each line its text set left to right from
// x 72 at 6 pt a glyph, 12 pt apart from the top, one font unless a glyph says otherwise; boxes placed between glyphs.
import type { Doc, DocGlyph, DocPage } from '../../src/doc.ts'

export interface LineSpec {
  text: string
  /** the font's name (default CMR10) and the code offset of its glyphs (another font program's codes) */
  font?: string
  codeShift?: number
  x?: number
  y?: number
  size?: number
  /** its glyphs are shown inside a form XObject (an included figure's) */
  form?: boolean
}
export interface PageSpec {
  lines: (string | LineSpec)[]
  /** boxes: [after glyph index (the boxes before glyph `at`), kind, x0, y0, x1, y1] */
  boxes?: [at: number, kind: number, x0: number, y0: number, x1: number, y1: number][]
  points?: [name: string, glyph: number][]
  view?: [number, number, number, number]
}

export function docOf(pages: PageSpec[]): Doc {
  return {
    pages: pages.map((p): DocPage => {
      const glyphs: DocGlyph[] = []
      p.lines.forEach((l0, li) => {
        const l = typeof l0 === 'string' ? { text: l0 } : l0
        const size = l.size ?? 10
        const y = l.y ?? 700 - 12 * li
        let x = l.x ?? 72
        for (const ch of l.text) {
          const font = l.font ?? 'ABCDEF+CMR10'
          glyphs.push({
            u: ch,
            code: (ch.codePointAt(0) as number) + (l.codeShift ?? 0),
            font,
            base: font.replace(/^[A-Z]{6}\+/, ''),
            x0: x,
            x1: x + 0.6 * size,
            y,
            top: y + 0.7 * size,
            bottom: y - 0.2 * size,
            size,
            ix0: x,
            ix1: x + 0.6 * size,
            n: li,
            k: glyphs.length,
            form: !!l.form,
            blank: !/\S/.test(ch),
            fill: 0,
          })
          x += 0.6 * size
        }
      })
      const boxes: number[] = []
      const kinds: number[] = []
      const boxAt = new Array(glyphs.length).fill(0)
      const sorted = [...(p.boxes ?? [])].sort((a, b) => a[0] - b[0])
      for (const [at, kind, x0, y0, x1, y1] of sorted) {
        boxes.push(x0, y0, x1, y1)
        kinds.push(kind)
        for (let q = at; q < glyphs.length; q++) boxAt[q]++
      }
      return {
        glyphs,
        boxes,
        kinds,
        boxAt,
        points: (p.points ?? []).map(([name, glyph]) => ({ name, glyph, box: boxAt[glyph] ?? kinds.length })),
        view: p.view ?? [0, 0, 612, 792],
        rotate: 0,
        unread: null,
      }
    }),
  }
}
