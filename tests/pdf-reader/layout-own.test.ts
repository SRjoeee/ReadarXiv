// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isLabelForm, ownOf, spellOf } from '@/pdf-reader/engine/layout/own.mjs'

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
  it('leaves a rule in a unit\'s text range the page\'s, and gives its placeholders\' rules theirs', () => {
    const pages = [page([{ pt: '0s' }, 'ab', { rule: [10, 600, 60, 600.4] }, { pt: 'p0.1a' }, { rule: [10, 590, 60, 590.4] }, { pt: 'p0.1b' }, { pt: '0e' }, { rule: [10, 580, 60, 580.4] }])]
    const r = ownOf(pages, { units: units('ab') })
    expect(r.boxes[0]).toEqual([null, 'u0.p', null])
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
