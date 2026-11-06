// B.measure (design-b §1.5): each token's width at 100 px in its face, as the breaker reads it: a superscript's at 0.62 of it,
// small capitals' at their share (`sc`), a space's in its face, a lead's last token with the glue its class sets after it.
// Ported from engine 065c1d973: measureTokens L2:2899-2905, fontString fonts.mjs:393 (the face's canvas string, by which the
// host measures it and the tap's metrics tables key it). Its widths come from Metrics: the table adapter in tests and the gate
// (the tap's recorded widths), the canvas adapter in the reader.
import type { Metrics } from '../types.ts'
import type { Face, Token } from './tokens.ts'

/** the canvas font string of a face at `px` (fonts.mjs:393 fontString): a role face's size its correction's share */
export const fontString = (face: Face, px: number): string =>
  face.id
    ? `${face.style === 'italic' ? 'italic ' : ''}${face.caps ? 'small-caps ' : ''}${face.weight} ${px * face.size}px ${face.family}`
    : `${face.style === 'italic' ? 'italic ' : ''}${face.caps ? 'small-caps ' : ''}${face.weight === 700 ? 'bold ' : ''}${px}px ${face.family}`

/** B.measure: the tokens with their widths at 100 px (new tokens; the given ones are not changed) */
export function measure(tokens: readonly Token[], metrics: Metrics): Token[] {
  const w100 = (s: string, face: Face) => metrics.advance(fontString(face, 100), 100, s)
  return tokens.map((t) => {
    if (t.space) return { ...t, w100: w100(' ', t.face!) + (t.leadGap ?? 0) }
    if (typeof t.s === 'string' && t.face)
      return { ...t, w100: w100(t.s, t.face) * (t.sup ? 0.62 : (t.sc ?? 1)) + (t.leadGap ?? 0) }
    return t
  })
}

/** the measures the breaker and the fit read of a run, at 100 px in its face (layer2.mjs w100 L2:2303, ink100 L2:2319,
 *  inkRight100 L2:2347; tokenInk L2:2340 is ink100 of a token's text): from Metrics, the canvas's numbers in the reader and
 *  the tap's recorded ones in the replays and the gate */
export type FitMeasure = {
  w100(s: string, face: Face): number
  ink100(s: string, face: Face): { a: number; d: number }
  /** how far right of its start its ink ends; null where the canvas gives none */
  inkRight100(s: string, face: Face): number | null
}
export function fitMeasure(metrics: Metrics): FitMeasure {
  return {
    w100: (s, face) => metrics.advance(fontString(face, 100), 100, s),
    ink100: (s, face) => {
      const [a, d] = metrics.ink(fontString(face, 100), 100, s)
      return { a, d }
    },
    inkRight100: (s, face) => {
      const r = metrics.ink(fontString(face, 100), 100, s)[2]
      return Number.isNaN(r) ? null : r
    },
  }
}
