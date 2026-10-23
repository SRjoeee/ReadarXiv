// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isLabelForm, ownOf, spellOf } from '@/pdf-reader/engine/layout/own.mjs'

// Each unit's own ink by its marks in stream order (layout/own.mjs; design docs/route/ocg-erasure.md §1): the rules MR 1–6 on
// pages written as a stream of points and glyphs, the spell check and the label kept

type Item = string | { pt: string } | { rule: [number, number, number, number] }
/** a page of a stream: a string a glyph a character (on the baseline `y`, one unit wide, from x), `{ pt }` a point, `{ rule }` a
 *  painted path's box; `\n` moves to the next line */
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
    } else if ('pt' in it) points.push({ name: it.pt, glyph: glyphs.length, box: boxes.length / 4 })
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
