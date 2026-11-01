// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { followsOf, INK_ANY } from '@/pdf-reader/engine/layout/marks.mjs'
import { isLabelForm, labelFormOf, lineRulesOf, ownOf, spellOf } from '@/pdf-reader/engine/layout/own.mjs'

// Each unit's own ink by its marks in stream order (layout/own.mjs; design docs/route/ocg-erasure.md §1): the rules MR 1–6 on
// pages written as a stream of points and glyphs, the spell check and the label kept

type Item = string | { pt: string } | { rule: [number, number, number, number] } | { dx: number }
/** a page of a stream: a string a glyph a character (on the baseline `y`, one unit wide, from x), `{ pt }` a point, `{ rule }` a
 *  painted path's box, `{ dx }` a gap of dx before the next glyph; `\n` moves to the next line */
function page(items: Item[]) {
  const glyphs: { n: number; k: number; u: string; x0: number; x1: number; y: number; size: number; top: number; bottom: number }[] = []
  const points: { name: string; glyph: number; box: number }[] = [], boxes: number[] = [], paths: number[] = [], boxAt: number[] = []
  let x = 10, y = 700, n = 0
  for (const it of items) {
    if (typeof it === 'string') {
      for (const c of it) {
        if (c === '\n') { y -= 12; x = 10; continue }
        glyphs.push({ n, k: 0, u: c, x0: x, x1: x + 5, y, size: 10, top: y + 7, bottom: y - 2 })
        boxAt.push(boxes.length / 4)
        n++
        x += 5
      }
    } else if ('dx' in it) x += it.dx
    else if ('pt' in it) points.push({ name: it.pt, glyph: glyphs.length, box: boxes.length / 4 })
    else { boxes.push(...it.rule); paths.push(paths.length) }
  }
  return { glyphs, points, boxes, paths, boxAt, view: [0, 0, 612, 792] }
}
const units = (...texts: string[]) => texts.map(t => ({ src: t }))
/** the text of each group on the pages */
function groupsOf(r: ReturnType<typeof ownOf>, pages: ReturnType<typeof page>[]) {
  const out: Record<string, string> = {}
  r.glyphs.forEach((G, p) => { G.forEach((g, i) => { if (g) out[g] = (out[g] ?? '') + pages[p]!.glyphs[i]!.u }) })
  return out
}

describe('the text of a unit (MR 2, 3)', () => {
  it('is what lies between its start and end marks, in its region', () => {
    const pages = [page(['x', { pt: 'bs1' }, { pt: '0s' }, 'Hello', { pt: '0e' }, { pt: 'fs1' }, 'Fig', { pt: 'fe1' }, { pt: 'be1' }, 'foot'])]
    const r = ownOf(pages, { units: units('Hello') })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Hello' })
    expect(r.stats.unhidden.spell).toBe(0)
  })
  it('crosses a page inside the bodies, leaving the foot and head outside them', () => {
    const pages = [page([{ pt: 'bs1' }, { pt: '0s' }, 'Hel', { pt: 'be1' }, '3']), page(['head', { pt: 'bs2' }, 'lo', { pt: '0e' }, { pt: 'be2' }])]
    expect(groupsOf(ownOf(pages, { units: units('Hello') }), pages)).toEqual({ u0: 'Hello' })
  })
  it('crosses outside the bodies only from a page to the next (2a), to the next unit there; over three pages: across', () => {
    const two = [page([{ pt: 'bs1' }, 'body', { pt: 'be1' }, { pt: '0s' }, 'Foot', { pt: '1s' }, 'other', { pt: '1e' }]), page([{ pt: 'bs2' }, 'b', { pt: 'be2' }, 'note', { pt: '0e' }, '7'])]
    expect(groupsOf(ownOf(two, { units: units('Footnote', 'other') }), two)).toEqual({ u0: 'Footnote', u1: 'other' })
    const three = [page([{ pt: '0s' }, 'a']), page(['b']), page(['c', { pt: '0e' }])]
    const r = ownOf(three, { units: units('abc') })
    expect(r.units.get(0)?.unhidden).toBe('across')
    expect(groupsOf(r, three)).toEqual({})
  })
  it('of a unit with an end mark alone is from the point before it (a title)', () => {
    const pages = [page([{ pt: '5e' }, { pt: 'bs1' }, 'Title', { pt: '0e' }])]
    expect(groupsOf(ownOf(pages, { units: units('Title') }), pages)).toEqual({ u0: 'Title' })
  })
  it('of marks twice, out of order or a start alone owns nothing: marks', () => {
    const pages = [page([{ pt: '0s' }, 'a', { pt: '0e' }, { pt: '0e' }, { pt: '1e' }, 'b', { pt: '1s' }, { pt: '2s' }, 'c'])]
    const r = ownOf(pages, { units: units('a', 'b', 'c', 'd') })
    expect([0, 1, 2, 3].map(i => r.units.get(i)?.unhidden)).toEqual(['marks', 'marks', 'marks', 'marks'])
    expect(r.stats.unhidden.marks).toBe(4)
  })
})

describe('placeholders, labels and names (MR 4–6)', () => {
  it('gives a placeholder pair its own group, an opening alone to the next point in its region', () => {
    const pages = [page([{ pt: '0s' }, 'see', { pt: 'p0.1a' }, '[1]', { pt: 'p0.1b' }, 'and', { pt: 'p0.3a' }, 'E=mc', { pt: '0e' }])]
    const r = ownOf(pages, { units: [{ pieces: [{ t: 'text', s: 'see' }, { t: 'ph', src: '\\cite{a}' }, { t: 'text', s: 'and' }, { t: 'ph', src: '$E$' }] }] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'seeand', 'u0.p': '[1]E=mc' })
    expect(r.units.get(0)?.unhidden).toBe(null)
  })
  it('takes a label on the start\'s baseline after the previous unit\'s end, passing over a placeholder\'s range', () => {
    const pages = [page([{ pt: '3e' }, 'zz\n', '2.1', { pt: 'p9.1a' }, '*', { pt: 'p9.1b' }, { pt: '0s' }, 'Intro', { pt: '0e' }])]
    const r = ownOf(pages, { units: units('Intro') })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Intro', 'u0.l': '2.1', 'u9.p': '*' })
  })
  it('leaves a label that is no label\'s form the original\'s ink where it stands apart (labelKept)', () => {
    const pages = [page([{ pt: '3e' }, '211', { pt: '0s' }, 'cell', { pt: '0e' }])]
    const r = ownOf(pages, { units: units('cell') })
    expect(groupsOf(r, pages)).toEqual({ u0: 'cell', 'u0.l': '211' })
    const kept = [page([{ pt: '3e' }, 'JOUR', { pt: '0s' }, 'cell', { pt: '0e' }])]
    const k = ownOf(kept, { units: units('cell') })
    expect(groupsOf(k, kept)).toEqual({ u0: 'cell' })
    expect(k.units.get(0)?.labelKept).toBe(true)
    expect(k.stats.labelKept).toBe(1)
  })
  it('gives a babel name its own group over the text it lies in', () => {
    const pages = [page([{ pt: '0s' }, { pt: 'n2.proof.s' }, 'Proof', { pt: 'n2.proof.e' }, 'Easy', { pt: '0e' }])]
    expect(groupsOf(ownOf(pages, { units: units('Easy') }), pages)).toEqual({ n2: 'Proof', u0: 'Easy' })
  })
  it('gives a footnote\'s call after the last word that TeX gave no mark its raised mark right after the end mark (2610.35877v1\'s abstract)', () => {
    const pages = [page([{ pt: '0s' }, 'Hello.', { pt: '0e' }, '1', '\n', { pt: '1s' }, 'Next', { pt: '1e' }])]
    const mark = pages[0]!.glyphs[6]!
    Object.assign(mark, { y: 703.5, size: 7, top: 708.5, bottom: 702.5 })
    const r = ownOf(pages, { units: [{ pieces: [{ t: 'text', s: 'Hello.' }, { t: 'ph', src: '\\footnotemark' }] }, ...units('Next')] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Hello.', 'u0.p': '1', u1: 'Next' })
    // (a glyph on the line's baseline there is no mark: the page's)
    const level = [page([{ pt: '0s' }, 'Hello.', { pt: '0e' }, '1', '\n', { pt: '1s' }, 'Next', { pt: '1e' }])]
    expect(groupsOf(ownOf(level, { units: [{ pieces: [{ t: 'text', s: 'Hello.' }, { t: 'ph', src: '\\footnotemark' }] }, ...units('Next')] }), level)).toEqual({ u0: 'Hello.', u1: 'Next' })
  })
  it('leaves a rule in a unit\'s text range the page\'s, and gives its placeholders\' rules theirs', () => {
    const pages = [page([{ pt: '0s' }, 'ab', { rule: [10, 600, 60, 600.4] }, { pt: 'p0.1a' }, { rule: [10, 590, 60, 590.4] }, { pt: 'p0.1b' }, { pt: '0e' }, { rule: [10, 580, 60, 580.4] }])]
    const r = ownOf(pages, { units: units('ab') })
    expect(r.boxes[0]).toEqual([null, 'u0.p', null])
  })
  it('gives a rule TeX painted on a line of a unit\'s text to that text: OT1\'s \\_, an underline (#117: 1512.03385v1\'s Table 1 caption)', () => {
    // (OT1 has no underscore: \\_ is \\vbox{\\hrule width.3em} on the baseline, between the text's glyphs; an underline below them)
    const pages = [page([{ pt: '0s' }, 'conv3', { rule: [36, 700, 39, 700.4] }, '1 and', { rule: [40, 698.2, 65, 698.6] }, ' x', { pt: '0e' }])]
    const r = ownOf(pages, { units: [{ pieces: [{ t: 'text', s: 'conv3' }, { t: 'ph', src: '\\_' }, { t: 'text', s: '1 and x' }] }] })
    expect(r.boxes[0]).toEqual(['u0', 'u0'])
    expect(r.units.get(0)?.unhidden).toBe(null)
  })
  it('gives a fraction\'s bar on a text line to the placeholder whose range holds it, not to the text (review of #502)', () => {
    // ("ratio x/y here": the formula's points around its numerator, its bar on the line's band and its denominator)
    const pages = [page([{ pt: '0s' }, 'ratio', { pt: 'p0.1a' }, 'x', { rule: [36, 700.3, 41, 700.7] }, 'y', { pt: 'p0.1b' }, 'here', { pt: '0e' }])]
    const r = ownOf(pages, { units: [{ pieces: [{ t: 'text', s: 'ratio' }, { t: 'ph', src: '\\frac{x}{y}' }, { t: 'text', s: 'here' }] }] })
    expect(r.boxes[0]).toEqual(['u0.p'])
  })
  it('leaves the page\'s what is no rule of the text\'s lines: a box as tall as a letter (an icon), a rule off them, a footnote\'s separator', () => {
    // (an ORCID mark after a name, its circle 6 pt; a rule between two of its lines, half a pitch from each; a rule past its line's end)
    const pages = [page([{ pt: '0s' }, 'Name', { rule: [32, 699, 38, 705] }, '\n', { rule: [10, 694, 30, 694.4] }, 'more', { rule: [70, 688, 200, 688.4] }, { pt: '0e' }])]
    const r = ownOf(pages, { units: units('Namemore') })
    expect(r.boxes[0]).toEqual([null, null, null])
    // (a footnote continued on the next page: the separator TeX sets above it, in its range there, stays the page's)
    const two = [page([{ pt: 'bs1' }, 'body', { pt: 'be1' }, '\n', { pt: '0s' }, 'Foot']), page([{ pt: 'bs2' }, 'b', { pt: 'be2' }, '\n', { rule: [10, 691.5, 60, 691.9] }, '\n', 'note', { pt: '0e' }])]
    const f = ownOf(two, { units: units('Footnote') })
    expect(f.boxes[1]).toEqual([null])
    expect(groupsOf(f, two)).toEqual({ u0: 'Footnote' })
    // (amsthm's \openbox at a proof's end, four rules: its top and bottom thin, but sides meet them, a frame; a dot of a logo)
    const qed = [page([{ pt: '0s' }, 'Proof done', { rule: [60, 700, 65, 700.4] }, { rule: [60, 700, 60.4, 706.4] }, { rule: [64.6, 700, 65, 706.4] }, { rule: [60, 706, 65, 706.4] }, { rule: [20, 702, 20.1, 702.09] }, { pt: '0e' }])]
    expect(ownOf(qed, { units: units('Proof done') }).boxes[0]).toEqual([null, null, null, null, null])
  })
})

describe('the rules of a text\'s lines (lineRulesOf, MR 2b)', () => {
  /** one line of text and `n` rules on it, then `m` thin upright boxes off it (no frame of a rule): [page, index] lists */
  const lineOf = (n: number, m: number) => {
    const items: Item[] = ['abcdefghij']
    for (let i = 0; i < n; i++) items.push({ rule: [10 + (i % 10) * 4, 700, 13 + (i % 10) * 4, 700.4] })
    for (let i = 0; i < m; i++) items.push({ rule: [300, 100 + i * 0.01, 300.4, 140 + i * 0.01] })
    const pg = page(items)
    return { pages: [pg], glyphs: pg.glyphs.map((_, g) => [1, g] as [number, number]), boxes: Array.from({ length: n + m }, (_, b) => [1, b] as [number, number]) }
  }
  it('reads 20,000 rules of one line in work linear in them, every one the text\'s', () => {
    const { pages, glyphs, boxes } = lineOf(20_000, 0)
    const r = lineRulesOf(pages, glyphs, boxes)
    expect(r.over).toBe(false)
    expect(r.rules).toHaveLength(20_000)
    expect(r.work).toBeLessThan(100_000)
  })
  it('stops past its budget with no rule: 2,000 rules beside 2,000 other thin boxes are 4 million comparisons', () => {
    const { pages, glyphs, boxes } = lineOf(2_000, 2_000)
    const r = lineRulesOf(pages, glyphs, boxes, 100_000)
    expect(r.over).toBe(true)
    expect(r.rules).toEqual([])
    expect(r.work).toBeLessThan(110_000)
    // (with the budget for it, the same reading: none of the upright boxes meets a rule)
    const all = lineRulesOf(pages, glyphs, boxes)
    expect([all.over, all.rules.length]).toEqual([false, 2_000])
  })
})

describe('the spell check (§1.3)', () => {
  it('accepts the unit\'s letters and digits whatever its accents, ligatures, hyphens and punctuation', () => {
    expect(spellOf('naïve ﬁne co-op, 3')).toBe(spellOf('naive fine coop 3'))
    const pages = [page([{ pt: '0s' }, 'ﬁne-\ntuned.', { pt: '0e' }])]
    expect(ownOf(pages, { units: units('fine tuned') }).units.get(0)?.unhidden).toBe(null)
  })
  it('refuses a unit whose glyphs take more or fewer letters than its source: spell, its groups still written', () => {
    const over = [page([{ pt: '0s' }, 'JOUR Title', { pt: '0e' }])]
    const r = ownOf(over, { units: units('Title') })
    expect(r.units.get(0)?.unhidden).toBe('spell')
    expect(r.stats.spell).toEqual([0])
    expect(groupsOf(r, over)).toEqual({ u0: 'JOUR Title' })
    const under = [page([{ pt: '0s' }, 'Tit', { pt: '0e' }])]
    expect(ownOf(under, { units: units('Title') }).units.get(0)?.unhidden).toBe('spell')
  })
  it('knows a label\'s forms', () => {
    for (const t of ['1', '3.2.', '(a)', 'Figure 1.1 –', 'Table 10:', 'iv.', '•', 'Remark.', '']) expect(isLabelForm(t), t).toBe(true)
    for (const t of ['BERT', '2 1 1 ×', 'JOUR', 'LOC']) expect(isLabelForm(t), t).toBe(false)
  })
  it('knows a supplement\'s and an appendix\'s numbers after a label\'s name (2610.21924\'s "Table S3:", 2610.16663\'s "Figure S5:")', () => {
    // (read as no label, the caption's label was left the original's ink (labelKept): the layer could not move it, and a centred
    // caption's text was centred apart from it, the line drawn left)
    for (const t of ['Table S3:', 'Figure S5:', 'Fig. A1.', 'Table B.2:', 'Algorithm S1']) expect(isLabelForm(t), t).toBe(true)
    // (a number with a letter before it alone is no label: a model's name, a placeholder's text at a unit's start)
    for (const t of ['A100', 'S3', 'GPT4']) expect(isLabelForm(t), t).toBe(false)
    // (the letter stands before a number alone: two letters after a name are no number, CodeRabbit's review of #460)
    for (const t of ['Figure AB', 'Table SS', 'Figure SII:']) expect(isLabelForm(t), t).toBe(false)
  })
})

// ---- the sweep of 2026-10-24 (staging 5fb92292, pin dd56fcc5): units left English whose ink could be owned
describe('coverage: what the 2026-10-24 sweep left English', () => {
  it('reads a title with an end mark alone back past its own placeholders\' points, never past another unit\'s (2610.20848v1 p1u1)', () => {
    // "Study of pulse jitter characteristics of PSR J1744{−}1134{:} Towards …": the point before the end mark is the title's own
    // placeholder's closing point; the author before it (u0) keeps its own ink
    const pages = [page([{ pt: '0s' }, 'Jose', { pt: '0e' }, { pt: 'bs1' }, 'Study J1744', { pt: 'p1.1a' }, '-', { pt: 'p1.1b' }, '1134', { pt: 'p1.3a' }, ':', { pt: 'p1.3b' }, 'Towards', { pt: 'h1e' }])]
    const title = { kind: 'heading', pieces: [{ t: 'text', s: 'Study J1744' }, { t: 'ph', src: '$-$' }, { t: 'text', s: '1134' }, { t: 'ph', src: '$:$' }, { t: 'text', s: ' Towards' }] }
    const r = ownOf(pages, { units: [{ src: 'Jose' }, title] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Jose', u1: 'Study J17441134Towards', 'u1.p': '-:' })
    expect(r.units.get(1)?.unhidden).toBe(null)
  })
  it('leaves what TeX set before a title on lines of its own the page\'s, where the title\'s source ends its range (2610.20581v1 p1u0)', () => {
    // amsart sets the date before the title in the stream; the title's end mark alone, read from the column's start
    const pages = [page([{ pt: 'bs2' }, 'October 15, 2026\n', 'ALL SERRIN BANDS', { pt: '0e' }])]
    const r = ownOf(pages, { units: [{ kind: 'heading', src: 'All Serrin bands' }] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'ALL SERRIN BANDS' })
    expect(r.units.get(0)?.unhidden).toBe(null)
    // (a title that opens with a placeholder of no mark of its own, \\sysname: its ink is that lead: never released, the title
    // the original's — the review of b479095e)
    const lead = [page([{ pt: 'bs2' }, 'LLAMA-X:\n', 'Fast tuning', { pt: '0e' }])]
    expect(ownOf(lead, { units: [{ kind: 'heading', pieces: [{ t: 'ph', src: '\\sysname' }, { t: 'text', s: ': Fast tuning' }] }] }).units.get(0)?.unhidden).toBe('spell')
    // (one that opens with a macro TeX said sets no ink, JCAP's title in \\boldmath: no placeholder of ink, as the maker reads
    // it, so the header line TeX set before it is released, the title its own, 2609.20976v1 u0; not said, the original's as
    // before)
    const bold = [page([{ pt: 'bs2' }, 'Prepared for submission to JCAP\n', 'Comparing the Detectability', { pt: '0e' }])]
    const boldmath = [{ kind: 'heading', pieces: [{ t: 'ph', src: '\\boldmath' }, { t: 'text', s: 'Comparing the Detectability' }] }]
    const released = ownOf(bold, { units: boldmath, inkless: new Set(['\\boldmath']) })
    expect(groupsOf(released, bold)).toEqual({ u0: 'Comparing the Detectability' })
    expect(released.units.get(0)?.unhidden).toBe(null)
    expect(ownOf(bold, { units: boldmath }).units.get(0)?.unhidden).toBe('spell')
    // (on the title's own line: what stands before it cannot be told from it, the title the original's)
    const one = [page([{ pt: 'bs2' }, 'JOUR ALL SERRIN BANDS', { pt: '0e' }])]
    expect(ownOf(one, { units: [{ kind: 'heading', src: 'All Serrin bands' }] }).units.get(0)?.unhidden).toBe('spell')
  })
  it('spells a spacing accent and a dotless i as the letters they set (2610.20595v1 p13u114, 2610.20581v1 p1u4)', () => {
    expect(spellOf('Ciˆencia e Tecnologia')).toBe(spellOf('Ciência e Tecnologia'))
    expect(spellOf('Estad´ısticas')).toBe(spellOf('Estadísticas'))
    expect(spellOf('Jo˜ao')).toBe(spellOf('João'))
    // (only TeX's spacing accents: a modifier letter of a script, CJK's prolonged sound mark, is spelled)
    expect(spellOf('\u30c7\u30fc\u30bf')).not.toBe(spellOf('\u30c7\u30bf'))
    // (a letter still differs)
    expect(spellOf('Ciencia')).not.toBe(spellOf('Ciancia'))
  })
  it('owns a cell\'s lead macro set before its start mark as its placeholder, by the text the probe showed it sets (2610.21098v1 p13u136)', () => {
    // "Completion cap | \\CompletionTokenCap{} tokens per request": TeX set the macro's "1,024" after the cell before's end and
    // before this cell's start mark; the marking's probe said the macro sets "1,024" (marks.mjs readInkTexts)
    const pages = [page([{ pt: 't0s' }, 'Completion cap', { pt: 't0e' }, { dx: 30 }, '1,024 ', { pt: 't1s' }, 'tokens per request', { pt: 't1e' }])]
    const cells = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Completion cap' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\CompletionTokenCap{}' }, { t: 'text', s: ' tokens per request ' }] }]
    const r = ownOf(pages, { units: cells, texts: new Map([['\\CompletionTokenCap{}', '1,024']]) })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Completion cap', u1: 'tokens per request', 'u1.p': '1,024 ' })
    expect([r.units.get(0)?.unhidden, r.units.get(1)?.unhidden]).toEqual([null, null])
    expect(r.stats.leaks).toEqual({ count: 0, units: [] })
    // (a text symbol's text is known without the probe: \\# sets "#"; the layer draws a text symbol as its character in the
    // translation, never from a crop, so its ink is hidden with the text: in `.p`, which the reader hides only for a found
    // placeholder, the original "#" stood under the drawn one — the pixel tier's overlap, 1512.03385v1 p7, 1810.04805v2 p7)
    const hash = [page([{ pt: 't0s' }, 'Model', { pt: 't0e' }, { dx: 30 }, '#', { pt: 't1s' }, 'Steps', { pt: 't1e' }])]
    const h = ownOf(hash, { units: [{ kind: 'cell', pieces: [{ t: 'text', s: 'Model' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\#' }, { t: 'text', s: ' Steps' }] }] })
    expect(groupsOf(h, hash)).toEqual({ u0: 'Model', u1: '#Steps' })
    // (the macro's text not known: the cell the original's, as before)
    expect(ownOf(pages, { units: cells }).units.get(1)?.unhidden).toBe('marks')
  })
  it('splits a cell\'s lead of a macro and a text symbol: the symbol with the text, the macro\'s ink its placeholder (Codex on #456)', () => {
    // \\bert\\# Steps: the layer draws the "#" as its character; the macro's ink is cropped where the maker found it
    const pages = [page([{ pt: 't0s' }, 'Model', { pt: 't0e' }, { dx: 30 }, 'BERT#', { pt: 't1s' }, 'Steps', { pt: 't1e' }])]
    const cells = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Model' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\bert' }, { t: 'ph', src: '\\#' }, { t: 'text', s: ' Steps' }] }]
    const r = ownOf(pages, { units: cells, texts: new Map([['\\bert', 'BERT']]) })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Model', u1: '#Steps', 'u1.p': 'BERT' })
    expect(r.units.get(1)?.unhidden).toBe(null)
  })
  it('owns a cell\'s lead of inline code or a formula by the text the probe read (MARKS_SCHEMA 10: 2610.21098v1 p13u138, 2610.21176v1 p13u88)', () => {
    // "Cap parameter | \\texttt{max\\_tokens} on Chat Completions routes", T1's underscore a glyph of its own
    const code = [page([{ pt: 't0s' }, 'Cap parameter', { pt: 't0e' }, { dx: 30 }, 'max_tokens', { pt: 't1s' }, 'on Chat routes', { pt: 't1e' }])]
    const codeCells = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Cap parameter' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\texttt{max\\_tokens}' }, { t: 'text', s: ' on Chat routes' }] }]
    const c = ownOf(code, { units: codeCells, texts: new Map([['\\texttt{max\\_tokens}', 'max_tokens']]) })
    expect(groupsOf(c, code)).toEqual({ u0: 'Cap parameter', u1: 'on Chat routes', 'u1.p': 'max_tokens' })
    expect(c.units.get(1)?.unhidden).toBe(null)
    // "Prop. 1 | \\dprime{} tracks the gap": $d'$, a math italic d and a prime the probe spells as no character (INK_ANY, one glyph)
    const prime = [page([{ pt: 't0s' }, 'Prop. 1', { pt: 't0e' }, { dx: 30 }, 'd\u2032', { pt: 't1s' }, 'tracks the gap', { pt: 't1e' }])]
    const lead = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Prop. 1' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\dprime{}' }, { t: 'text', s: ' tracks the gap' }] }]
    const texts = new Map([['\\dprime{}', `d${INK_ANY}`]])
    const p = ownOf(prime, { units: lead, texts })
    expect(groupsOf(p, prime)).toEqual({ u0: 'Prop. 1', u1: 'tracks the gap', 'u1.p': 'd\u2032' })
    expect(p.units.get(1)?.unhidden).toBe(null)
    // (its spelled letter is the glyphs' own: another letter there, the cell the original's)
    const other = [page([{ pt: 't0s' }, 'Prop. 1', { pt: 't0e' }, { dx: 30 }, 'x\u2032', { pt: 't1s' }, 'tracks the gap', { pt: 't1e' }])]
    expect(ownOf(other, { units: lead, texts }).units.get(1)?.unhidden).toBe('marks')
    // (a formula's glyph is no blank one: a blank glyph where it stands, the cell the original's)
    const blank = [page([{ pt: 't0s' }, 'Prop. 1', { pt: 't0e' }, { dx: 30 }, 'd ', { pt: 't1s' }, 'tracks the gap', { pt: 't1e' }])]
    expect(ownOf(blank, { units: lead, texts }).units.get(1)?.unhidden).toBe('marks')
    // (a footnote's call among the lead's pieces sets its mark between them and the start: a glyph read as the formula's would be
    // that mark's, so the cell is the original's — here the call's "1" would spell the prime)
    const call = [page([{ pt: 't0s' }, 'Prop. 1', { pt: 't0e' }, { dx: 30 }, 'd1', { pt: 't1s' }, 'tracks the gap', { pt: 't1e' }])]
    const noted = [lead[0]!, { kind: 'cell', pieces: [{ t: 'ph', src: '\\dprime{}' }, { t: 'ph', src: '\\footnotemark' }, { t: 'text', s: ' tracks the gap' }] }]
    expect(ownOf(call, { units: noted, texts }).units.get(1)?.unhidden).toBe('marks')
  })
  it('spells a cell whose lead is a letter symbol with the letter it sets (\\O, \\ss: Devin on #456)', () => {
    const pages = [page([{ pt: 't0s' }, 'Name', { pt: 't0e' }, { dx: 30 }, '\u00d8', { pt: 't1s' }, 'stergaard', { pt: 't1e' }])]
    const cells = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Name' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\O' }, { t: 'text', s: 'stergaard' }] }]
    const r = ownOf(pages, { units: cells })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Name', u1: '\u00d8stergaard' })
    expect(r.units.get(1)?.unhidden).toBe(null)
  })
  it('never takes a neighbour cell\'s ink for a cell\'s lead, however close the columns (the neighbour check; the review of b479095e)', () => {
    // an unmarked number cell ("80.8") 0.4 em before the macro's ink (\\tabcolsep 2pt): the macro's text ends the run
    const cells = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Ours' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\bert' }, { t: 'text', s: ' (Single)' }] }]
    const texts = new Map([['\\bert', 'BERT']])
    const near = [page([{ pt: 't0s' }, 'Ours', { pt: 't0e' }, { dx: 4 }, '80.8', { dx: 4 }, 'BERT ', { pt: 't1s' }, '(Single)', { pt: 't1e' }])]
    const n = ownOf(near, { units: cells, texts })
    expect(groupsOf(n, near)).toEqual({ u0: 'Ours', u1: '(Single)', 'u1.p': 'BERT ' })
    // (no gap at all, @{}: the same)
    const glued = [page([{ pt: 't0s' }, 'Ours', { pt: 't0e' }, '80.8BERT ', { pt: 't1s' }, '(Single)', { pt: 't1e' }])]
    expect(groupsOf(ownOf(glued, { units: cells, texts }), glued)).toEqual({ u0: 'Ours', u1: '(Single)', 'u1.p': 'BERT ' })
    // (what stands before the start is not the macro's text: none taken, the cell the original's)
    const other = [page([{ pt: 't0s' }, 'Ours', { pt: 't0e' }, { dx: 20 }, '80.8', { pt: 't1s' }, '(Single)', { pt: 't1e' }])]
    const o = ownOf(other, { units: cells, texts })
    expect(o.units.get(1)?.unhidden).toBe('marks')
    expect(groupsOf(o, other)).toEqual({ u0: 'Ours', u1: '(Single)' })
  })
})

// ---- the release sweep of 2026-10-24 (staging d74bd1cf against production 699b4aea): units newly English, all `unhidden`
describe('coverage: what the release sweep of 2026-10-24 left English', () => {
  it('spells a letter symbol, whatever its font maps it to, and accepts correct text (OT1 accents, dotless i, ligatures)', () => {
    // (Unicode decomposes none of ø æ œ ł: each is its base letters on both sides, the source's symbol or the font's glyph)
    for (const [ink, src] of [['Følner', 'Folner'], ['Łukasz', 'Lukasz'], ['Encyclopædia', 'Encyclopaedia'], ['Œuvre', 'Oeuvre'], ['Straße', 'Strasse'], ['l\u0337odz', 'łodz'], ['Gödel', 'Go\u0308del'], ['Estad´ısticas', 'Estadísticas'], ['ﬁ ﬂ ﬀ ﬃ', 'fi fl ff ffi']] as const) expect(spellOf(ink), ink).toBe(spellOf(src))
    // (a letter still differs)
    for (const [a, b] of [['Følner', 'Fulner'], ['Łukasz', 'Kukasz']] as const) expect(spellOf(a)).not.toBe(spellOf(b))
    // (a text spelled a glyph at a time spells as it does whole: a final sigma lowers by what follows it — Codex on #462)
    for (const t of ['ΟΣ', 'ΛΟΓΟΣ ΚΑΙ', 'λόγος']) expect([...t].map(spellOf).join(''), t).toBe(spellOf(t))
    const greek = [page([{ pt: '0s' }, 'ΟΣ', { pt: '0e' }])]
    expect(ownOf(greek, { units: units('ΟΣ') }).units.get(0)?.unhidden).toBe(null)
  })
  it('reads a text symbol of no mark of its own as its character in the source (2610.21037v1 p3u28: F\\o lner)', () => {
    const pages = [page([{ pt: '0s' }, 'a Følner sequence', { pt: '0e' }])]
    const unit = { pieces: [{ t: 'text', s: 'a F' }, { t: 'ph', src: '\\o' }, { t: 'text', s: ' lner sequence' }] }
    const r = ownOf(pages, { units: [unit] })
    expect(r.units.get(0)?.unhidden).toBe(null)
    // (one with marks of its own is its placeholder's ink, never the text's)
    const marked = [page([{ pt: '0s' }, 'a F', { pt: 'p0.1a' }, 'ø', { pt: 'p0.1b' }, 'lner sequence', { pt: '0e' }])]
    const m = ownOf(marked, { units: [unit] })
    expect(groupsOf(m, marked)).toEqual({ u0: 'a Flner sequence', 'u0.p': 'ø' })
    expect(m.units.get(0)?.unhidden).toBe(null)
  })
  it('lets a wrapper set words of its own before its argument (2610.20266v1 p1u0: siamart\'s \\funding)', () => {
    const unit = { kind: 'footnote', pieces: [{ t: 'text', s: 'Submitted 10/2026.\n' }, { t: 'open', id: 1, src: '\\funding{' }, { t: 'text', s: 'Funded by the DFG.' }, { t: 'close', id: 1, src: '}' }] }
    const pages = [page([{ pt: '0s' }, 'Submitted 10/2026. Funding: Funded by the DFG.', { pt: '0e' }])]
    expect(ownOf(pages, { units: [unit] }).units.get(0)?.unhidden).toBe(null)
    // (words past a wrapper's, or anywhere else, are still refused)
    const long = [page([{ pt: '0s' }, 'Submitted 10/2026. Funding of the twenty research councils: Funded by the DFG.', { pt: '0e' }])]
    expect(ownOf(long, { units: [unit] }).units.get(0)?.unhidden).toBe('spell')
    const elsewhere = [page([{ pt: '0s' }, 'Submitted JOUR 10/2026. Funded by the DFG.', { pt: '0e' }])]
    expect(ownOf(elsewhere, { units: [unit] }).units.get(0)?.unhidden).toBe('spell')
    // (the slots are read a part at a time, never by a backtracking search: seven \emph{a} and a "z" against fifty a's and an
    // "x" are refused at once — a regular expression took over a second, Codex on #462)
    const pieces = [...Array.from({ length: 7 }, (_, i) => [{ t: 'open', id: i + 1, src: '\\emph{' }, { t: 'text', s: 'a' }, { t: 'close', id: i + 1, src: '}' }]).flat(), { t: 'text', s: 'z' }]
    const many = [page([{ pt: '0s' }, `${'a'.repeat(50)}x`, { pt: '0e' }])]
    const t0 = performance.now()
    expect(ownOf(many, { units: [{ pieces }] }).units.get(0)?.unhidden).toBe('spell')
    expect(performance.now() - t0).toBeLessThan(200)
  })
  it("owns its lines up to TeX's skip before another block for a piece no display alone at its unit's end (2609.20976v1 u3.p)", () => {
    // JCAP's last author, "Surhud More,^{c,d}", her \\orcidlink marked open alone after her end mark; the affiliations and the
    // e-mail TeX set below after a skip, no unit's, then the abstract: the piece ran to the abstract's label over them all, and
    // no ink unit was made of them
    const pages = [page([{ pt: '0s' }, 'Surhud More,', { pt: '0e' }, { pt: 'p0.1a' }, 'cd\n', 'Department of Physics\n', 'surhud at iucaa\n', 'Abstract. ', { pt: '1s' }, 'The amplitude', { pt: '1e' }, '\nand more of it here\nand its last line'])]
    // (the skip: the names' line apart from the lines below by two of the page's pitches)
    pages[0]!.glyphs.forEach(g => { if (g.y < 700) { g.y -= 12; g.top -= 12; g.bottom -= 12 } })
    const authors = [{ kind: 'author', pieces: [{ t: 'text', s: 'Surhud More,' }, { t: 'ph', src: '\\orcidlink{0000-0002-2986-2371}' }] }, { kind: 'abstract', pieces: [{ t: 'text', s: 'The amplitude' }] }]
    // (the marking's follows, as the wrap makes them of the units and the points read)
    const marked = (pgs: ReturnType<typeof page>[], us: unknown[]) => ownOf(pgs, { units: us, follows: followsOf(us as never, new Set(pgs.flatMap(p => p.points.map(x => x.name)))) })
    const g = groupsOf(marked(pages, authors), pages)
    expect(g['u0.p']).toBe('cd')
    expect([g.u0, g.u1]).toEqual(['Surhud More,', 'The amplitude'])
    expect(Object.values(g).join('')).not.toMatch(/Department|iucaa/)
    // (an indented or centred block after a short line is a line apart all the same: its drop, not where it starts — Devin on #482)
    const centred = [page([{ pt: '0s' }, 'Surhud More,', { pt: '0e' }, { pt: 'p0.1a' }, 'cd\n', { dx: 120 }, 'Department of Physics\n', 'surhud at iucaa\n', 'Abstract. ', { pt: '1s' }, 'The amplitude', { pt: '1e' }, '\nand more of it here\nand its last line'])]
    centred[0]!.glyphs.forEach(gl => { if (gl.y < 700) { gl.y -= 12; gl.top -= 12; gl.bottom -= 12 } })
    expect(groupsOf(marked(centred, authors), centred)['u0.p']).toBe('cd')
    // (at the page's leading the lines are still its, whatever they hold: a reference's \\Eprint wrapped over two lines, its
    // entry's full stop on a third, and an entry TeX gave no unit, 2307.16209v1 p138 u487 and p147 u777: none left no one's)
    const wrapped = [page([{ pt: '0s' }, 'See the paper', { pt: '0e' }, { pt: 'p0.1a' }, 'arXiv:gr-qc/0511111\n', '[gr-qc]\n', '.\n', '[167] https://github.com/strings\n', { pt: '1s' }, 'Next one', { pt: '1e' }, '\nand a line\nand another'])]
    const eprint = [{ kind: 'reference', pieces: [{ t: 'text', s: 'See the paper' }, { t: 'ph', src: '\\Eprint {http://arxiv.org/abs/gr-qc/0511111} {arXiv:gr-qc/0511111 [gr-qc]}' }] }, { pieces: [{ t: 'text', s: 'Next one' }] }]
    expect(groupsOf(marked(wrapped, eprint), wrapped)['u0.p']).toBe('arXiv:gr-qc/0511111[gr-qc].[167] https://github.com/strings')
    // (a display there owns its lines, as before: TeX sets one over many)
    const display = [page([{ pt: '0s' }, 'We have', { pt: '0e' }, { pt: 'p0.1a' }, 'E = mc\n', '+ more\n', { pt: '1s' }, 'Next one', { pt: '1e' }])]
    const shown = groupsOf(marked(display, [{ pieces: [{ t: 'text', s: 'We have' }, { t: 'ph', src: '\\[E = mc + more\\]' }] }, { pieces: [{ t: 'text', s: 'Next one' }] }]), display)
    expect(shown['u0.p']).toBe('E = mc+ more')
  })
  it('leaves the lines of their own its source does not spell the page\'s (2610.21765v1 p1u13: REVTeX\'s e-mail notes; 2610.10069v1 p7u53: a folio)', () => {
    // the paragraph's first column, the column's e-mail note at its foot, its second column
    const pages = [page([{ pt: '0s' }, 'This is a very\n', 'hard thing\n', '\n*d25062@iitmandi.ac.in\n', { dx: 300 }, 'to achieve.', { pt: '0e' }])]
    const r = ownOf(pages, { units: units('This is a very hard thing to achieve.') })
    expect(r.units.get(0)?.unhidden).toBe(null)
    expect(groupsOf(r, pages)).toEqual({ u0: 'This is a veryhard thingto achieve.' })
    // (a line on a baseline of another of the unit's lines, its extent meeting theirs, is never released: the original's)
    const shared = [page([{ pt: '0s' }, 'This is a very\n', 'hard\n', 'JOUR\n', 'thing', { pt: '0e' }])]
    shared[0]!.glyphs.forEach(g => { if (g.y === 676) { g.y = 700; g.top = 707; g.bottom = 698 } })
    expect(ownOf(shared, { units: units('This is a very hard thing') }).units.get(0)?.unhidden).toBe('spell')
    // (nor one above a line kept in its column: words TeX set among the unit's own, which the layout's frame may hold)
    const among = [page([{ pt: '0s' }, 'This is a very\n', 'JOURNAL\n', 'hard thing', { pt: '0e' }])]
    expect(ownOf(among, { units: units('This is a very hard thing') }).units.get(0)?.unhidden).toBe('spell')
    // (nor any line of a unit with a visible placeholder of no mark of its own, whose ink that line may be)
    const unmarked = [page([{ pt: '0s' }, 'We have\n', 'E = mc2\n', 'here.', { pt: '0e' }])]
    expect(ownOf(unmarked, { units: [{ pieces: [{ t: 'text', s: 'We have ' }, { t: 'ph', src: '\\[E=mc^2\\]' }, { t: 'text', s: ' here.' }] }] }).units.get(0)?.unhidden).toBe('spell')
    // (a macro TeX said sets no ink, \\boldmath, is no such placeholder: the note's line released, as the maker reads it)
    const bold = [page([{ pt: '0s' }, 'This is a very\n', 'hard thing\n', '\n*d25062@iitmandi.ac.in\n', { dx: 300 }, 'to achieve.', { pt: '0e' }])]
    const boldUnit = [{ pieces: [{ t: 'text', s: 'This is a very ' }, { t: 'ph', src: '\\boldmath' }, { t: 'text', s: 'hard thing to achieve.' }] }]
    expect(ownOf(bold, { units: boldUnit, inkless: new Set(['\\boldmath']) }).units.get(0)?.unhidden).toBe(null)
    expect(ownOf(bold, { units: boldUnit }).units.get(0)?.unhidden).toBe('spell')
    // (a page's folio after a footnote run on to the next page (2a): released)
    const foot = [page([{ pt: 'bs1' }, 'body', { pt: 'be1' }, { pt: '0s' }, 'Neither estimator\n', '\n\n7']), page([{ pt: 'bs2' }, 'b', { pt: 'be2' }, 'enforces it.', { pt: '0e' }])]
    const f = ownOf(foot, { units: units('Neither estimator enforces it.') })
    expect(f.units.get(0)?.unhidden).toBe(null)
    expect(groupsOf(f, foot)).toEqual({ u0: 'Neither estimatorenforces it.' })
  })
  it('owns nothing of another unit\'s range for a placeholder whose opening point TeX set there (2610.21085v1 p5u43: a run-in heading)', () => {
    // \paragraph{What $\cand$ is.} $\cand(q)$ rest: the heading is set at the paragraph's start, after its lead placeholder's
    // opening mark
    const pages = [page([{ pt: 'h0s' }, 'What ', { pt: 'p0.1a' }, { pt: 'p1.0a' }, 'V', { pt: 'p0.1b' }, ' is.', { pt: 'h0e' }, { pt: '1s' }, 'V(q)', { pt: 'p1.0b' }, ' rest', { pt: '1e' }])]
    const us = [{ kind: 'heading', pieces: [{ t: 'text', s: 'What ' }, { t: 'ph', src: '$V$' }, { t: 'text', s: ' is.' }] }, { pieces: [{ t: 'ph', src: '$V(q)$' }, { t: 'text', s: ' rest' }] }]
    const r = ownOf(pages, { units: us })
    expect(groupsOf(r, pages)).toEqual({ u0: 'What  is.', 'u0.p': 'V', 'u1.p': 'V(q)', u1: ' rest' })
    expect([r.units.get(0)?.unhidden, r.units.get(1)?.unhidden]).toEqual([null, null])
  })
  it('gives the punctuation a theorem\'s head sets after its note to the note, never to the body\'s label (2610.21491v1 p7u71)', () => {
    // amsthm: "Corollary 1 (Minimum detectable PDI). Under …": the note a unit of its own, its ")." set by the head after the
    // note's end mark, before the body's start mark: as the body's label (no label's form) it was left the original's ink,
    // standing under the body's drawing
    const pages = [page(['Corollary 1 (', { pt: 'h0s' }, 'Minimum detectable PDI', { pt: 'h0e' }, ').', { dx: 3 }, { pt: '1s' }, 'Under the assumptions', { pt: '1e' }])]
    const r = ownOf(pages, { units: [{ kind: 'heading', src: 'Minimum detectable PDI' }, { kind: 'theorem', src: 'Under the assumptions' }] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Minimum detectable PDI).', u1: 'Under the assumptions' })
    expect([r.units.get(0)?.unhidden, r.units.get(1)?.unhidden, r.units.get(1)?.labelKept]).toEqual([null, null, false])
    // (a body's own label after it is still its label: "Proof 2.", a word space after the note's end)
    const labelled = [page(['Lemma 2 (', { pt: 'h0s' }, 'Bound', { pt: 'h0e' }, ').', { dx: 3 }, '(i)', { dx: 3 }, { pt: '1s' }, 'Every x', { pt: '1e' }])]
    const l = ownOf(labelled, { units: [{ kind: 'heading', src: 'Bound' }, { kind: 'theorem', src: 'Every x' }] })
    expect(groupsOf(l, labelled)).toEqual({ u0: 'Bound).', u1: 'Every x', 'u1.l': '(i)' })
    // (a note that ends in a placeholder, set after the note's end mark (a heading's marks around its text): the ")." after the
    // placeholder abuts it, not the end mark's glyph, and is the note's all the same. 2610.18513v1 p35's "Lemma A.1 (… [Bobkov and
    // Ledoux, 2009b])." left a stray ")." standing under the drawing)
    const cited = [page(['Lemma A.1 (', { pt: 'h0s' }, 'Inequality', { pt: 'h0e' }, { dx: 3 }, { pt: 'p0.1a' }, '[Bobkov, 2009b]', { pt: 'p0.1b' }, ').', { dx: 3 }, { pt: '1s' }, 'If x', { pt: '1e' }])]
    const c = ownOf(cited, { units: [{ kind: 'heading', bracketed: true, pieces: [{ t: 'text', s: 'Inequality ' }, { t: 'ph', src: '\\citep{bl}' }] }, { kind: 'theorem', src: 'If x' }] })
    expect(groupsOf(c, cited)).toEqual({ 'u0.l': 'Lemma A.1 (', u0: 'Inequality).', 'u0.p': '[Bobkov, 2009b]', u1: 'If x' })
    expect([c.units.get(0)?.unhidden, c.units.get(1)?.unhidden, c.units.get(1)?.labelKept]).toEqual([null, null, false])
    // (punctuation apart from the unit before, by a word's space or more, is no head's: as before, this unit's label)
    const apart = [page([{ pt: 'h0s' }, 'Bound', { pt: 'h0e' }, { dx: 4 }, '1.', { pt: '1s' }, 'Every x', { pt: '1e' }])]
    expect(groupsOf(ownOf(apart, { units: [{ kind: 'heading', src: 'Bound' }, { kind: 'theorem', src: 'Every x' }] }), apart)).toEqual({ u0: 'Bound', u1: 'Every x', 'u1.l': '1.' })
  })
  it('gives the punctuation a head sets after its note to the note where the body starts on a line of its own (2501.14787v1 p10u78)', () => {
    // thmtools' headpunct `\\`: "Recall 7 (Vector Space)", then the body on the next line. The ")" stood on no line of the body's
    // start, so no label walk reached it: in no group, it stayed where it was while the maker's line of the note took it and the
    // layer drew it again after the note's translation
    const pages = [page(['Recall 7 (', { pt: 'h0s' }, 'Vector Space', { pt: 'h0e' }, ')', '\n', { pt: '1s' }, 'Loosely', { pt: '1e' }])]
    const r = ownOf(pages, { units: [{ kind: 'heading', bracketed: true, src: 'Vector Space' }, { kind: 'theorem', src: 'Loosely' }] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'Vector Space)', u1: 'Loosely' })
    expect([r.units.get(0)?.labelKept, r.units.get(1)?.labelKept]).toEqual([true, false])
    // (a head of a label's form keeps its label; a note that ends in a placeholder set before its end mark, the ")" after it)
    const theorem = [page(['Theorem 7 (', { pt: 'h0s' }, 'Bound ', { pt: 'p0.1a' }, 'x', { pt: 'p0.1b' }, { pt: 'h0e' }, ').', '\n', { pt: '1s' }, 'Every x', { pt: '1e' }])]
    const t = ownOf(theorem, { units: [{ kind: 'heading', bracketed: true, pieces: [{ t: 'text', s: 'Bound ' }, { t: 'ph', src: '$x$' }] }, { kind: 'theorem', src: 'Every x' }] })
    expect(groupsOf(t, theorem)).toEqual({ 'u0.l': 'Theorem 7 (', u0: 'Bound ).', 'u0.p': 'x', u1: 'Every x' })
    // (punctuation a word's space or more after the end mark, or what is no closing punctuation, is no head's: the page's, as before)
    const apart = [page([{ pt: 'h0s' }, 'Bound', { pt: 'h0e' }, { dx: 4 }, ')', '\n', { pt: '1s' }, 'Every x', { pt: '1e' }])]
    expect(groupsOf(ownOf(apart, { units: [{ kind: 'heading', src: 'Bound' }, { kind: 'theorem', src: 'Every x' }] }), apart)).toEqual({ u0: 'Bound', u1: 'Every x' })
    const word = [page([{ pt: 'h0s' }, 'Bound', { pt: 'h0e' }, '(', '\n', { pt: '1s' }, 'Every x', { pt: '1e' }])]
    expect(groupsOf(ownOf(word, { units: [{ kind: 'heading', src: 'Bound' }, { kind: 'theorem', src: 'Every x' }] }), word)).toEqual({ u0: 'Bound', u1: 'Every x' })
    // (a mark TeX shows next in the stream but left of the glyph before it, on that baseline, is no mark after the unit: the
    // maker's line takes none left of the end mark — CodeRabbit on #541)
    const back = [page([{ pt: 'h0s' }, 'Bound', { pt: 'h0e' }, { dx: -40 }, ')', '\n', { pt: '1s' }, 'Every x', { pt: '1e' }])]
    expect(groupsOf(ownOf(back, { units: [{ kind: 'heading', src: 'Bound' }, { kind: 'theorem', src: 'Every x' }] }), back)).toEqual({ u0: 'Bound', u1: 'Every x' })
    // (the gap measured at the mark's own size, as the maker's glue is the line's: a placeholder set large before it widens
    // nothing — CodeRabbit on #541)
    const big = page([{ pt: 'h0s' }, 'Bound ', { pt: 'p0.1a' }, 'X', { pt: 'p0.1b' }, { pt: 'h0e' }, { dx: 3 }, ')', '\n', { pt: '1s' }, 'Every x', { pt: '1e' }])
    const X = big.glyphs.find(g => g.u === 'X')!
    Object.assign(X, { size: 30, top: X.y + 21, bottom: X.y - 6 })
    const units2 = [{ kind: 'heading', pieces: [{ t: 'text', s: 'Bound ' }, { t: 'ph', src: '$X$' }] }, { kind: 'theorem', src: 'Every x' }]
    expect(groupsOf(ownOf([big], { units: units2 }), [big])).toEqual({ u0: 'Bound ', 'u0.p': 'X', u1: 'Every x' })
  })
  it('takes a head of a name the paper defines as its unit\'s label, as a standard name\'s (2501.14787v1 p10u78: thmtools\' "Recall")', () => {
    // "Recall 7 (" before the note's start mark was no label's form, left the original's ink in no group (labelKept): inside
    // mdframed's TikZ frame the figure text cut it as a unit of its own, translated alone ("Recall" one way on p10's first box,
    // another on its second), where the paper's name unit gives "Recall" one word for every head
    const pages = [page(['Recall 7 (', { pt: 'h0s' }, 'Vector Space', { pt: 'h0e' }, ')', '\n', { pt: '1s' }, 'Loosely', { pt: '1e' }])]
    const us = [{ kind: 'heading', bracketed: true, src: 'Vector Space' }, { kind: 'theorem', src: 'Loosely' }]
    const named = ownOf(pages, { units: us, names: ['Recall', 'Notation'] })
    expect(groupsOf(named, pages)).toEqual({ 'u0.l': 'Recall 7 (', u0: 'Vector Space)', u1: 'Loosely' })
    expect([named.units.get(0)?.labelKept, named.stats.labelKept]).toEqual([false, 0])
    // (no names given, or none of this one: the original's ink, as before)
    for (const names of [null, ['Notation']]) expect(ownOf(pages, { units: us, names }).units.get(0)?.labelKept).toBe(true)
    // (unnumbered, with a stop, a body's own on its line: "Recall." before the body)
    const plain = [page([{ pt: '3e' }, 'Recall.', { dx: 3 }, { pt: '0s' }, 'Loosely', { pt: '0e' }])]
    expect(groupsOf(ownOf(plain, { units: [{ kind: 'theorem', src: 'Loosely' }], names: ['Recall'] }), plain)).toEqual({ 'u0.l': 'Recall.', u0: 'Loosely' })
    // (a name as a label holds it: case, spaces and a stop in it read as the standard names are)
    const f = labelFormOf(['Open Problem', 'Thm.'])
    for (const t of ['Open Problem 3.', 'OPEN PROBLEM 3', 'Thm. 2:', 'Theorem 7.']) expect(isLabelForm(t, false, f), t).toBe(true)
    for (const t of ['Opening 3', 'Recall 7', 'JOUR']) expect(isLabelForm(t, false, f), t).toBe(false)
    expect(labelFormOf(null)).toBe(labelFormOf([]))
  })
  it('takes a theorem\'s head before its note, the bracket the head opens the note with, as the note\'s label (2610.18513v1 p18u150)', () => {
    // amsthm: "Definition 5.1 (s-conductance). For …": the head's name, number and "(" before the note's start mark were no
    // label's form, left the original's ink in no group, and the head stayed English under the note's translation
    const pages = [page(['Definition 5.1 (', { pt: 'h0s' }, 's-conductance', { pt: 'h0e' }, ').', { dx: 3 }, { pt: '1s' }, 'For s', { pt: '1e' }])]
    const r = ownOf(pages, { units: [{ kind: 'heading', bracketed: true, src: 's-conductance' }, { kind: 'theorem', src: 'For s' }] })
    expect(groupsOf(r, pages)).toEqual({ 'u0.l': 'Definition 5.1 (', u0: 's-conductance).', u1: 'For s' })
    expect([r.units.get(0)?.labelKept, r.stats.labelKept]).toEqual([false, 0])
    // (a unit no head's brackets hold keeps the rule: "Table 1 (" is no label's form)
    const plain = [page(['Table 1 (', { pt: '0s' }, 'note', { pt: '0e' }])]
    expect(ownOf(plain, { units: [{ kind: 'para', src: 'note' }] }).units.get(0)?.labelKept).toBe(true)
    expect(isLabelForm('Definition 5.1 (', true)).toBe(true)
    expect(isLabelForm('Definition 5.1 (', false)).toBe(false)
  })
  it('takes the joint a head sets after the babel name that leads its unit as the unit\'s label (2610.18513v1 p7u51: amsthm\'s "Proof.")', () => {
    // the "." after the name, no label's form, was left the original's ink, so that the name's lead could not be drawn and
    // "Proof." stayed English
    const pages = [page([{ pt: 'n3.proof.s' }, 'Proof', { pt: 'n3.proof.e' }, '.', { dx: 3 }, { pt: '0s' }, 'Easy', { pt: '0e' }])]
    const r = ownOf(pages, { units: units('Easy') })
    expect(groupsOf(r, pages)).toEqual({ n3: 'Proof', 'u0.l': '.', u0: 'Easy' })
    expect(r.units.get(0)?.labelKept).toBe(false)
    // (punctuation alone with no name before it is no label, as before)
    const bare = [page([{ pt: '3e' }, { dx: 6 }, '.', { dx: 3 }, { pt: '0s' }, 'Easy', { pt: '0e' }])]
    expect(ownOf(bare, { units: units('Easy') }).units.get(0)?.labelKept).toBe(true)
  })
  it('owns a title its class sets again by its first occurrence, an end mark alone (2610.22065v1 p1u0: acmart\'s ACM Reference Format)', () => {
    const pages = [page(['ABNAT: Attention', { pt: 'h0e' }, '\n', { pt: '1s' }, 'Abstract text', { pt: '1e' }, '\nRef: ', { pt: 'h0s' }, 'ABNAT: Attention', { pt: 'h0e' }, '. In Proc.'])]
    const r = ownOf(pages, { units: [{ kind: 'heading', src: 'ABNAT: Attention' }, { src: 'Abstract text' }] })
    expect(groupsOf(r, pages)).toEqual({ u0: 'ABNAT: Attention', u1: 'Abstract text' })
    expect(r.units.get(0)?.unhidden).toBe(null)
    // (every occurrence a pair — a heading again in a running head — or the end alone not first: the original's, as before)
    const pairs = [page([{ pt: 'h0s' }, 'Intro', { pt: 'h0e' }, '\n', { pt: 'h0s' }, 'Intro', { pt: 'h0e' }])]
    expect(ownOf(pairs, { units: [{ kind: 'heading', src: 'Intro' }] }).units.get(0)?.unhidden).toBe('marks')
    const later = [page([{ pt: 'h0s' }, 'Intro', { pt: 'h0e' }, '\n', 'Intro', { pt: 'h0e' }])]
    expect(ownOf(later, { units: [{ kind: 'heading', src: 'Intro' }] }).units.get(0)?.unhidden).toBe('marks')
  })
})
