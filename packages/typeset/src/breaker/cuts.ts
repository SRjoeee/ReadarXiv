// B.cuts (design-b §1.5, T23): a unit over its frame breaks cut at its frames' shares (the ruling of 2026-10-30: frames fill
// as TeX does), and the page-break tokens set before the cuts. Today's code (layer2.mjs L2:3881-3974, textless
// L2:4161-4162), moved by lab/typeset/move-fit.mjs.
import { kinsokuOf, noStart } from './script.ts'
import { originalLines } from '../unit/decor.ts'
import type { FitBlock, FitParams, LaidLine, Tokens } from '../fit/types.ts'
import type { Token } from './tokens.ts'

/** a cut: the page and frame a line begins, at a token (pageCutsOf); `share`, a cut of the frames' share only, which a lay keeps
 *  only at a state that holds the share */
export type Cut = { page: number; frame: number; at: number; share?: true }
/** a token as the cuts read and make it: a page-break token (withPageBreaks': `pageBreak` its page, `frame` the unit's block the
 *  frame begins with, `share` a cut of the frames' share) is one */
export type CutToken = Token & { pageBreak?: number; frame?: number; share?: true }
/** a frame of the unit: its consecutive blocks of one run on one page whose columns meet (pageCutsOf) */
type Frame = { after: number; page: number; x0: number; x1: number; first: number; lines: number }

/** a token that sets nothing of the text: a kept region's break, a forced break, a page break, a space */
const textless = (t: CutToken): boolean =>
  t.blockTo !== undefined || t.newline !== undefined || t.pageBreak !== undefined || !!t.space
/**
 * Where the fit's lay of a unit (`lines`, breakLines' at the fit's state, each with its first token `from` and its block)
 * breaks for each later frame: a paragraph's lines go over its frames as its region does, by height. A frame is a column of a
 * page (the unit's consecutive blocks of one run on one page whose columns meet), so a column break is one as a page break
 * is. Each run of the unit (its blocks of one `after`: the text between two displays, set on its own slots) whose source
 * lines (originalLines: a line its rectangles cut in two one) stand in more than one frame is cut before each later frame at
 * the line end of its laid lines nearest that frame's share of the run's height, k of its n lines in the frames before it,
 * k = n × the source's lines before that frame over all of them (half up: the earlier frame the fuller, as TeX fills a
 * column), one line at least on each side. Only a line that opens at a token's start is a place to cut: one a long token's
 * cut opens (a URL cut by its characters, a hyphenated word's tail) begins inside the token the line before ends in. No
 * sentence, no word of the alignment (the owner, 2026-10-30: blocks keep their place, sentences need not, the frame changes at
 * a natural line end). A run laid in one line is cut in it, at the share of its tokens, the one short line a break leaves.
 * Wherever the fit sets that line: in an earlier frame (its frame before holds more than its share) every lay keeps the cut;
 * in that one or later (its frame before holds less, at the fit's state) the cut is the share's (`share`), which a lay keeps
 * only at a state that holds the share (lab option (i)'s frame share, 2026-11-09: 2610.22065v1 p5's column a line short of
 * TeX's where the fit set seven of ten there and the share is eight; the page fill holds it where that costs no frame a
 * leading under its page's band, fillPage). Returns [{ page, frame, at, share? }], `frame` the unit's block the frame begins
 * with, `at` the token its text begins with, rising
 */
export function pageCutsOf(
  lines: readonly LaidLine[],
  blocks: readonly FitBlock[],
  tokens: readonly CutToken[],
  P: FitParams,
): Cut[] {
  const frames: Frame[] = []
  blocks.forEach((b, bi) => {
    const f = frames.at(-1),
      after = b.after ?? 0
    if (f && f.after === after && f.page === b.page && Math.min(f.x1, b.x1) > Math.max(f.x0, b.x0)) {
      f.lines += originalLines(b)
      f.x0 = Math.min(f.x0, b.x0)
      f.x1 = Math.max(f.x1, b.x1)
    } else frames.push({ after, page: b.page, x0: b.x0, x1: b.x1, first: bi, lines: originalLines(b) })
  })
  const kinsoku = kinsokuOf(P.noStart ?? '', P.noEnd ?? '')
  const opens = (t: CutToken) =>
    !textless(t) && !t.glue && !(typeof t.s === 'string' && t.s !== '' && (noStart(t.s) || kinsoku.starts(t.s)))
  const out: Cut[] = []
  for (const after of new Set(frames.map((f) => f.after))) {
    const fs = frames.filter((f) => f.after === after),
      total = fs.reduce((a, f) => a + f.lines, 0)
    if (fs.length < 2 || !(total > 0)) continue
    const rl = lines.filter((l) => (blocks[l.block]?.after ?? 0) === after)
    if (!rl.length) continue
    // (one line: its tokens that set text, each frame's cut at its share of them, past the first, on one a line may open with)
    const l0 = rl[0]!,
      ix: number[] = []
    if (rl.length === 1)
      for (let i = l0.from, end = lines[lines.indexOf(l0) + 1]?.from ?? tokens.length; i < end; i++)
        if (!textless(tokens[i]!)) ix.push(i)
    let before = 0,
      k0 = 0,
      q0 = 0
    for (let f = 1; f < fs.length; f++) {
      before += fs[f - 1]!.lines
      const share = before / total,
        frame = fs[f]!
      if (rl.length === 1) {
        let q = Math.max(q0 + 1, Math.round(ix.length * share))
        while (q < ix.length && !opens(tokens[ix[q]!]!)) q++
        if (q >= ix.length) break
        q0 = q
        out.push({
          page: frame.page,
          frame: frame.first,
          at: ix[q]!,
          ...(l0.block < frame.first ? {} : { share: true }),
        })
        continue
      }
      // (the line ends a cut may stand at: past the last cut, short of the run's last line, each line one a token opens)
      const want = rl.length * share
      let k = -1
      for (let j = k0 + 1; j < rl.length; j++) {
        if (!(rl[j]!.from > rl[j - 1]!.from)) continue
        const d = Math.abs(j - want),
          dk = k < 0 ? Infinity : Math.abs(k - want)
        if (d < dk || (d === dk && j > k)) k = j
      }
      if (k < 0) break
      k0 = k
      // (whichever frame the fit's own flow sets that line in. Where the fit sets it in that frame or later (its frame before
      // not full at its state), the cut is the share's (`share`): a lay honours it only at a state that holds the share (`share`,
      // the page fill's where the share costs no frame a leading under its page's band, fillPage), every other lay as though
      // it were not there, the fit's own flow keeping the line)
      if (rl[k]!.from > 0)
        out.push({
          page: frame.page,
          frame: frame.first,
          at: rl[k]!.from,
          ...(rl[k]!.block < frame.first ? {} : { share: true }),
        })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
/** the tokens with a page-break token (`{ pageBreak: page }`, breakLines') before each cut's token (pageCutsOf's) */
export function withPageBreaks(tokens: Tokens, cuts: readonly Cut[]): Tokens {
  if (!cuts.length) return tokens
  const out: CutToken[] = []
  let c = 0
  tokens.forEach((t, i) => {
    while (c < cuts.length && cuts[c]!.at === i) {
      const { page, frame, share } = cuts[c++]!
      out.push({ pageBreak: page, ...(frame !== undefined ? { frame } : {}), ...(share ? { share } : {}), w100: 0 })
    }
    out.push(t)
  })
  return Object.assign(out, { base: tokens.base })
}

export { textless }
