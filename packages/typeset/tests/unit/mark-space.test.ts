// B.tokens: no space beside a full-width mark's blank side. A full-width closing mark (the ideographic comma and full stop, the
// full-width comma, colon, semicolon, closing brackets and quotes: script.ts PUNCT_CLOSE) carries its white after its ink, an
// opening mark (PUNCT_OPEN) before it; a translator's ordinary space there doubles it (2611.03953v2-zh's references, the owner's
// staging case of 2026-11-10: each name followed by U+FF0C and a space, about 1 em of white where the original's comma and space
// held 0.3 em, every name list a name short a line). xeCJK sets no space after a closing mark, whatever stands after it
// (\xeCJK_FullRight_and_Boundary: ignores the spaces after it). Laid through layPage over hand-made parts, a metric of whole
// ems: a CJK character 1 em, a space, a full stop or a comma 0.25 em, any other character 0.5 em.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/u
const em = (size: number, t: string) =>
  [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : /[\s.,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'c'.repeat(64)
/** a reference entry of five lines on a measure of `width` pt from x 72, at 10 pt on a 12 pt pitch */
const entry = (width: number, kind: Placed['kind'] = 'reference'): Placed => ({
  ord: 0,
  kind,
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [0, 1, 2, 3, 4].map((k) => [
    1,
    0,
    72,
    72 + width,
    700 - 12 * k,
    707 - 12 * k,
    698 - 12 * k,
    72,
    72 + width,
    0,
    10,
  ]),
  room: { below: 40, next: 44 },
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (s: string): Rows => {
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** the member's laid lines, each its runs' text */
const linesOf = (s: string, width: number, tag = 'zh') =>
  layPage(part(entry(width)), rowsOf(s), rulesFor(tag), metrics).members[0]!.lines.map((l) =>
    l[3].map((it) => it.s).join(''),
  )
describe('B.tokens: no space beside a full-width mark’s blank side (xeCJK)', () => {
  // (each first line as xeCJK sets the row at its punctuation's natural width: no space after a closing mark, a comma 1 em, the
  // blank of the one ending the line in the margin; xeCJK's shrinking of that blank, which would take more, is not this rule's.
  // On a measure of 150 pt: the four shapes of 2611.03953v2's entries, names only (Fu), the next initial missed (Kim), the
  // title's first characters (Yu), surnames in CJK (Zhao))
  it('sets a name list on its first line as xeCJK does: no space after its full-width commas', () => {
    expect(linesOf('Ab， C.， De， F.， Gh， I.， Jk， L.， Mn， O.， Pq， R.， 等 al. 一种新的方法。', 150)[0]).toBe(
      'Ab，C.，De，F.，Gh，I.，Jk，L.，',
    )
    expect(linesOf('Ka， B.， Cd， E.， Fg， H.， Ij， K. 和 Lm， N. 一种新的方法与它的应用。', 150)[0]!.trim()).toBe(
      'Ka，B.，Cd，E.，Fg，H.，Ij，K.',
    )
    expect(linesOf('Ab， C.， Ab， D.， Ab， E.，中， F. 和 Gh， I. 语言模型的一种新方法。', 150)[0]!.trim()).toBe(
      'Ab，C.，Ab，D.，Ab，E.，中，F.',
    )
    expect(linesOf('Abc， D.，中， E.，王 F.，李， G.，张 H.，陈， I. 和 Jkl， M. 自我提炼的一种方法。', 150)[0]).toBe(
      'Abc，D.，中，E.，王 F.，李，G.，',
    )
  })
  it('sets no space after a full stop before a Latin word, nor before an opening mark after one', () => {
    expect(linesOf('这是第一句。 Transformer 很好。', 300)[0]).toBe('这是第一句。Transformer 很好。')
    expect(linesOf('使用 Transformer （变换器） 模型。', 300)[0]).toBe('使用 Transformer（变换器）模型。')
  })
  it('keeps a space between two Latin words, and one between a Latin word and a CJK character that is no mark', () => {
    expect(linesOf('模型 Big Model 很好。', 300)[0]).toBe('模型 Big Model 很好。')
    expect(linesOf('一个 GPU，两个 GPU。', 300)[0]).toBe('一个 GPU，两个 GPU。')
  })
  it('sets no space beside a curly quote the target sets in its CJK face, and keeps one where an alphabet sets it (de)', () => {
    // (a curly quote is of ambiguous width: an em in a CJK face, proportional in a Latin one; German sets it in its Latin face)
    expect(linesOf('他说“你好” Transformer 很好。', 300)[0]).toBe('他说“你好”Transformer 很好。')
    expect(linesOf('Der Satz „eins” umfasst zwei Wörter.', 300, 'de')[0]!.trim()).toBe(
      'Der Satz „eins” umfasst zwei Wörter.',
    )
  })
  it('sets no space after a mark the target sets in its em’s middle (zh-TW: centred marks)', () => {
    expect(linesOf('這是一句。 Transformer 很好。', 300, 'zh-TW')[0]).toBe('這是一句。Transformer 很好。')
  })
})
