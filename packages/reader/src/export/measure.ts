// Where each character of a run stands, as the browser sets the run (the reader draws a run whole, its kerning and its
// shaping the browser's): the offset of each UTF-16 index from the run's start, in the measure's units, for a run laid without
// per-character places (`dx`). The chain places each glyph at its offset (chain.ts).

/** a text's width in a font string, as the browser sets it (kerned) */
export type Measure = (font: string, text: string) => number

/**
 * Each UTF-16 index's offset in `text` set in `face`: a character stands where the run set whole up to it ends less its own
 * advance — the width of the run through it, its kerning with the character before it included, less its width alone (#685:
 * the width of the run before it left out that pair's kerning: in `AV`, V stood at A's width). A character beyond the BMP is
 * placed by its code point, both its halves at its place. A ligature the browser forms (`fi`) ends where its last character
 * would: the chain draws a ligature glyph at its first character's place, which is this rule's
 */
export function offsetsOf(measure: Measure, face: string, text: string): number[] {
  const alone = new Map<string, number>()
  const out: number[] = new Array(text.length)
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number
    const n = cp > 0xffff ? 2 : 1
    const ch = text.slice(i, i + n)
    let w = alone.get(ch)
    if (w === undefined) {
      w = measure(face, ch)
      alone.set(ch, w)
    }
    const at = i === 0 ? 0 : measure(face, text.slice(0, i + n)) - w
    for (let k = 0; k < n; k++) out[i + k] = at
    i += n
  }
  return out
}

/** the browser's measure: a canvas's, in the font string given (its small capitals the caller's: run.ts glyphsFor asks them
 *  only of a face that has its own, where the canvas sets the face's smcp glyphs as the class draws them), in `lang` (the
 *  target's, as the reader draws the translation: a face's language system shapes its glyphs) */
export function canvasMeasure(lang = ''): Measure {
  let ctx: CanvasRenderingContext2D | null = null
  return (font, text) => {
    if (!ctx) {
      const c = document.createElement('canvas')
      if (lang) c.lang = lang
      ctx = c.getContext('2d') as CanvasRenderingContext2D
      if (lang && 'lang' in ctx) (ctx as { lang: string }).lang = lang
    }
    ctx.font = font
    ctx.fontKerning = 'normal'
    return ctx.measureText(text).width
  }
}
