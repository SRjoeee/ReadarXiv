import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '@/pdf-reader/engine/layout/ink.mjs'
import { type Follow, OWNED, OWNED_HOW, ownedOf, ownedPages, STREAM_COLUMNS, type StreamPage } from '@/pdf-reader/engine/layout/stream.mjs'
import { INK_ANY } from '@/pdf-reader/engine/layout/marks.mjs'

// Each placeholder's own ink in the marked compile by content-stream order: a page here is what pageInk reads of one,
// its glyphs and boxes in the order shown and its points among them, its glyphs packed as the marks read keeps them
// (packGlyphs, the columns STREAM_COLUMNS alone: a column ownedOf read and the marks read did not keep would be missing
// here), each glyph's boxes before it as 32-bit integers. A glyph is written as its character and place, every glyph
// 5 pt wide at 10 pt

type Item = string | { u: string; x: number; y: number; size?: number } | { rule: [number, number, number, number] } | { at: string }
/** a page from the items in stream order: a string is a run of glyphs on the current line, `{ at }` a point */
function pageOf(items: Item[], view = [0, 0, 612, 792]): StreamPage {
  const glyphs: Glyph[] = [], boxes: number[] = [], points: StreamPage['points'] = [], boxAt: number[] = []
  let x = 72, y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') { x += 3; continue }
        if (u === '\n') { x = 72; y -= 12; continue }
        glyphs.push({ u, x0: x, x1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'F', ix0: x, ix1: x + 5 })
        boxAt.push(boxes.length / 4)
        x += 5
      }
    } else if ('at' in it) points.push({ name: it.at, glyph: glyphs.length, box: boxes.length / 4 })
    else if ('rule' in it) boxes.push(...it.rule)
    else {
      const size = it.size ?? 10
      glyphs.push({ u: it.u, x0: it.x, x1: it.x + 0.5 * size, y: it.y, top: it.y + 0.7 * size, bottom: it.y - 0.2 * size, size, font: 'F', ix0: it.x, ix1: it.x + 0.5 * size })
      boxAt.push(boxes.length / 4)
      x = it.x + 0.5 * size
      y = it.y
    }
  }
  return { glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }), boxes, points, boxAt: Int32Array.from(boxAt), view }
}
const closed: Follow = { closing: true, want: '', ends: [], blocked: false }
const open = (want: string, ends: string[] = [], blocked = false): Follow => ({ closing: false, want, ends, blocked })
const how = (name: string) => OWNED_HOW.indexOf(name)
/** an entry as the cases read it: its glyphs as a string and its rule count, or its how where it is not owned */
const shown = (pages: readonly StreamPage[], e: { how: number; glyphs: [number, number][]; boxes: unknown[] }) => (e.how < OWNED ? [e.glyphs.map(([p, g]) => pages[p - 1]?.glyphs.u[g]).join(''), e.boxes.length] as [string, number] : OWNED_HOW[e.how] as string)
/** each owned piece's glyphs as a string and its rule count, or its how where it is not owned: ownedOf's over the whole, and
 *  the same a page at a time (ownedPages, the page stream: each case holds both), its closing points' pages as their
 *  destinations would give them, a point read twice told at the end */
function owned(pages: StreamPage[], follows: Record<string, Follow>, dropped: string[] = []) {
  const out: Record<string, string | [string, number]> = {}
  for (const [name, e] of ownedOf(pages, { follows: n => follows[n] ?? null, dropped })) out[name] = shown(pages, e)
  const pageOfPoint = (name: string) => { const i = pages.findIndex(p => p.points.some(pt => pt.name === name)); return i < 0 ? null : i + 1 }
  const paged: Record<string, string | [string, number]> = {}
  const s = ownedPages({ follows: n => follows[n] ?? null, dropped, closing: n => pageOfPoint(`${n.slice(0, -1)}b`) })
  const take = (name: string, e: { how: number; glyphs: [number, number][]; boxes: unknown[] }, W: readonly StreamPage[]) => { paged[name] = shown(W, e) }
  pages.forEach((page, i) => { s.add(i + 1, page, take) })
  s.end(take)
  const twice = s.twice()
  for (const name of Object.keys(paged)) if (/a$/.test(name) && (twice.has(name) || twice.has(`${name.slice(0, -1)}b`))) paged[name] = 'a mark set twice'
  expect(paged).toEqual(out)
  return out
}

describe('ownedOf', () => {
  it('a closed piece owns the glyphs and rules between its two points, in stream order, scripts, limits and bars alike', () => {
    // a fraction's numerator, its bar and its denominator; a sum's limits above and below
    const page = pageOf(['the sum ', { at: 'p0.1a' }, { u: 'n', x: 120, y: 708, size: 7 }, { u: '∑', x: 118, y: 700 }, { u: 'i', x: 119, y: 693, size: 7 }, { at: 'p0.1b' }, ' and ', { at: 'p0.3a' }, '1', { rule: [150, 703, 160, 703.4] }, { u: 'd', x: 152, y: 695 }, { at: 'p0.3b' }, ' more'])
    expect(owned([page], { 'p0.1a': closed, 'p0.3a': closed })).toEqual({ 'p0.1a': ['n∑i', 0], 'p0.3a': ['1d', 1] })
    expect(OWNED_HOW[OWNED - 1]).toBe('open, with the displays after it')
  })

  it('a closed piece whose command set the punctuation mark after it before its own ink (`moved`, cite.sty\'s ".¹"): that mark is the text\'s, not the piece\'s', () => {
    const moved = (m: string): Follow => ({ ...closed, moved: m })
    const page = pageOf(['in the air', { at: 'p0.1a' }, '.', { u: '1', x: 200, y: 704, size: 7 }, { at: 'p0.1b' }, ' Next, ', { at: 'p0.3a' }, { u: '2', x: 260, y: 704, size: 7 }, { at: 'p0.3b' }, ', more', { at: 'p0.5a' }, '.', { at: 'p0.5b' }])
    expect(owned([page], { 'p0.1a': moved('.'), 'p0.3a': moved(','), 'p0.5a': moved('.') })).toEqual({ 'p0.1a': ['1', 0], 'p0.3a': ['2', 0], 'p0.5a': ['.', 0] })
    // (without it, as before: the mark is the piece's)
    expect(owned([page], { 'p0.1a': closed })).toEqual({ 'p0.1a': ['.1', 0] })
    // (a piece whose own ink opens with that mark, the mark after its closing point as a piece of 0 has it: `\url{../data}.` keeps
    // its first dot, the review of #501, Codex; a blank glyph after the point passed over)
    const url = pageOf(['see', { at: 'p0.1a' }, '../data', { at: 'p0.1b' }, '. Next', { at: '0e' }])
    expect(owned([url], { 'p0.1a': moved('.') })).toEqual({ 'p0.1a': ['../data', 0] })
  })

  it('nothing between its two points: a piece of nothing (EMPTY); the closing point first: out of order', () => {
    const page = pageOf(['one ', { at: 'p0.1a' }, { at: 'p0.1b' }, 'two ', { at: 'p0.3b' }, 'three ', { at: 'p0.3a' }, 'four'])
    expect(owned([page], { 'p0.1a': closed, 'p0.3a': closed })).toEqual({ 'p0.1a': ['', 0], 'p0.3a': 'marks out of order' })
  })

  it('a mark set twice, by the log or in the stream, owns nothing; a closing point not read, nothing either', () => {
    const page = pageOf(['a ', { at: 'p0.1a' }, 'x', { at: 'p0.1b' }, ' b ', { at: 'p0.3a' }, 'y', { at: 'p0.3b' }, ' c ', { at: 'p0.3b' }, ' d ', { at: 'p0.5a' }, 'z'])
    expect(owned([page], { 'p0.1a': closed, 'p0.3a': closed, 'p0.5a': closed }, ['p0.1b'])).toEqual({ 'p0.1a': 'a mark set twice', 'p0.3a': 'a mark set twice', 'p0.5a': 'closing point not read' })
  })

  it('across a page within the column bodies: what TeX shipped between them is not its own', () => {
    // page 1: the body, then its footnote, the rule above it and the running foot; page 2: the running head, a top
    // float, then the body
    const p1 = pageOf([{ at: 'bs1' }, 'words ', { at: 'p0.1a' }, 'k1+k2+', { at: 'be1' }, '\nNote', { rule: [72, 620, 200, 620.4] }, '\n1'])
    const p2 = pageOf(['Head ', { at: 'fs2' }, 'Float', { at: 'fe2' }, { at: 'bs3' }, '\nk3+k4', { at: 'p0.1b' }, ' more', { at: 'be3' }])
    expect(owned([p1, p2], { 'p0.1a': closed })).toEqual({ 'p0.1a': ['k1+k2+k3+k4', 0] })
  })

  it('an [h] float shipped between two lines of a formula is not its own', () => {
    const page = pageOf([{ at: 'bs1' }, 'here ', { at: 'p0.1a' }, 'b1+b2+', { at: 'fs2' }, '\nFloat body', { rule: [100, 600, 200, 650] }, { at: 'fe2' }, '\nb3', { at: 'p0.1b' }, ' and', { at: 'be1' }])
    expect(owned([page], { 'p0.1a': closed })).toEqual({ 'p0.1a': ['b1+b2+b3', 0] })
  })

  it('with no column bodies (an output routine of its own), a range across a page or a column owns nothing', () => {
    const p1 = pageOf(['words ', { at: 'p0.1a' }, 'k1+k2+', '\nNote'])
    const p2 = pageOf(['Head ', '\nk3', { at: 'p0.1b' }, ' more'])
    expect(owned([p1, p2], { 'p0.1a': closed })).toEqual({ 'p0.1a': 'across a page, unbracketed' })
    // a page of two columns: the formula from the foot of the left one to the head of the right one
    const cols = pageOf(['words ', { at: 'p0.1a' }, { u: 'a', x: 250, y: 100 }, { u: 'N', x: 72, y: 80 }, { u: 'b', x: 330, y: 700 }, { at: 'p0.1b' }, { u: 'c', x: 340, y: 700 }])
    expect(owned([cols], { 'p0.1a': closed })).toEqual({ 'p0.1a': 'across a column, unbracketed' })
    // a display's rows going down, and a matrix after its tall delimiter going up a little: its own
    const display = pageOf(['words ', { at: 'p0.1a' }, { u: '(', x: 150, y: 600 }, { u: 'a', x: 160, y: 640 }, { u: 'b', x: 160, y: 620 }, { at: 'p0.1b' }, ' more'])
    expect(owned([display], { 'p0.1a': closed })).toEqual({ 'p0.1a': ['(ab', 0] })
  })

  it('its two points in two regions own nothing: one in a column body, the other outside it', () => {
    const page = pageOf([{ at: 'bs1' }, 'words ', { at: 'p0.1a' }, 'k1', { at: 'be1' }, '\nNote ', { at: 'p0.1b' }])
    expect(owned([page], { 'p0.1a': closed })).toEqual({ 'p0.1a': 'its marks in two regions' })
  })

  it('a piece in a footnote, outside the bodies, owns its range on its page', () => {
    const page = pageOf([{ at: 'bs1' }, 'body text', { at: 'be1' }, '\n1 Note with ', { at: 'p1.1a' }, 'f2', { at: 'p1.1b' }, ' in it'])
    expect(owned([page], { 'p1.1a': closed })).toEqual({ 'p1.1a': ['f2', 0] })
  })

  it('an opening point alone owns to where the text after it begins, a hyphen at a line\'s end passed over', () => {
    const page = pageOf(['a call', { at: 'n0.2a' }, { u: '1', x: 102, y: 703.5, size: 7 }, ' and the text ', { at: 'p0.4a' }, 'BERT', ' con-\nsiderably more ', { at: '0e' }])
    expect(owned([page], { 'n0.2a': open('andthete'), 'p0.4a': open('consider') })).toEqual({ 'n0.2a': ['1', 0], 'p0.4a': ['BERT', 0] })
    // a ligature's glyph past the characters looked for (2307.16209's "with the fi|rst"): it begins them
    const lig = pageOf(['by ', { at: 'p0.1a' }, 'x+y', ' with the ', { u: 'fi', x: 150, y: 700 }, 'rst', { at: '0e' }])
    expect(owned([lig], { 'p0.1a': open('withthef') })).toEqual({ 'p0.1a': ['x+y', 0] })
    // a glyph's variation selector (TeX Live 2026's cmex sets one) is no character of the text after
    const vs = pageOf(['as ', { at: 'p0.1a' }, 'x', { u: '\u2211\ufe01', x: 150, y: 700 }, { u: 'i', x: 155, y: 700 }, 's more', { at: '0e' }])
    expect(owned([vs], { 'p0.1a': open('\u2211ismore') })).toEqual({ 'p0.1a': ['x', 0] })
  })

  it('an opening point alone: nothing before the text after it is LOST, nothing at all before its next point EMPTY', () => {
    // REVTeX's swap: the full stop set before the citation's number; the text after it is found at once
    const swapped = pageOf(['as shown', { at: 'p0.1a' }, '.', { u: '1', x: 120, y: 703.5, size: 7 }, { u: '2', x: 123.5, y: 703.5, size: 7 }, { at: '0e' }])
    expect(owned([swapped], { 'p0.1a': open('.', ['0e']) })).toEqual({ 'p0.1a': 'open, nothing before the text after it' })
    // a macro that sets nothing, at a paragraph's end
    const none = pageOf(['the end', { at: 'p0.1a' }, { at: '0e' }])
    expect(owned([none], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['', 0] })
  })

  it('a display that ends its unit ends at the next unit\'s start mark (its own end mark set before it), the next unit\'s label left out', () => {
    // MARK_DEF sets a unit's end mark before a display that ends it; the next unit a heading, its number on its line
    const page = pageOf(['define', { at: '0e' }, { at: 'p0.1a' }, '\na=b(1)', '\n', { u: '2', x: 72, y: 676 }, { at: 'h1s' }, { u: 'R', x: 85, y: 676 }, 'esults'])
    expect(owned([page], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    // the next unit's start mark after the page's last glyph: nothing after it on its line, nothing left out
    const last = pageOf(['define', { at: '0e' }, { at: 'p0.1a' }, '\na=b(1)', { at: 'h1s' }])
    expect(owned([last], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    // the next mark an earlier unit's start: none
    const earlier = pageOf(['define', { at: 'p3.1a' }, '\na=b(1)', { at: '2s' }, 'text'])
    expect(owned([earlier], { 'p3.1a': open('', ['3e']) })).toEqual({ 'p3.1a': "open, the next mark not its unit's" })
  })

  it('a display that ends its unit at a column\'s foot, a footnote\'s mark next, ends with the column\'s body (2307.16209\'s 200.65)', () => {
    // the footnote's unit an earlier one: its text shipped below the body
    const foot = pageOf([{ at: 'bs1' }, 'words', { at: '7e' }, { at: 'p7.2a' }, '\na=b(3)', { at: 'be1' }, { rule: [72, 120, 200, 120.4] }, '\n7', { at: '6s' }, 'A note'])
    expect(owned([foot], { 'p7.2a': open('', ['7e']) })).toEqual({ 'p7.2a': ['a=b(3)', 0] })
    expect(OWNED_HOW.indexOf("open, to its column's end")).toBeLessThan(OWNED)
    // a body begun again before the next mark (the display may go on in the next column): not so ended
    const next = pageOf([{ at: 'bs1' }, 'words', { at: '7e' }, { at: 'p7.2a' }, '\na=b', { at: 'be1' }, '\n7 A note', { at: 'bs2' }, 'c=d(3)', { at: '6s' }, 'more'])
    expect(owned([next], { 'p7.2a': open('', ['7e']) })).toEqual({ 'p7.2a': "open, the next mark not its unit's" })
  })

  it("a display at its column's foot, the text after it in the next body, owns what its region holds to that text (pastColumn)", () => {
    // 2608.16117's (12): the display the column's last line, its text after it on the next page, the next mark there
    const p1 = pageOf([{ at: 'bs1' }, 'words ', { at: 'p0.1a' }, '\na=b(1)', { at: 'be1' }, '\nNote', { at: '3s' }, ' text'])
    // (the page's column mark set where MARK_DEF sets it, in the shipout's background: outside any body, region 0)
    const p2 = pageOf([{ at: 'c1-2' }, 'Head', { at: 'bs2' }, '\nwhere more words', { at: 'p0.3a' }, 'x', { at: 'p0.3b' }])
    const got = ownedOf([p1, p2], { follows: n => ({ 'p0.1a': open('wheremor'), 'p0.3a': closed })[n] ?? null })
    expect(owned([p1, p2], { 'p0.1a': open('wheremor'), 'p0.3a': closed })['p0.1a']).toEqual(['a=b(1)', 0])
    expect(got.get('p0.1a')?.how).toBe(how("open, past its column's end"))
    expect(how("open, past its column's end")).toBeLessThan(OWNED)
    // its text after it on its own page, no mark before the page breaks (2307.16209's u64.7)
    const mid = pageOf([{ at: 'bs1' }, 'words ', { at: 'p0.1a' }, '\na=b(1)', '\nfor complex', { at: 'be1' }])
    const next = pageOf([{ at: 'bs2' }, 'words', { at: '0e' }])
    expect(owned([mid, next], { 'p0.1a': open('forcompl') })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    // the text after it in neither body: still not known
    expect(owned([p1, p2], { 'p0.1a': open('nowhere') })).toEqual({ 'p0.1a': 'open, the text after it not found' })
  })

  it("a display that ends its unit at its column's foot, the next mark on the next page, ends with the body", () => {
    const p1 = pageOf([{ at: 'bs1' }, 'words', { at: '0e' }, { at: 'p0.1a' }, '\na=b(3)', { at: 'be1' }, '\n7'])
    const p2 = pageOf([{ at: 'c1-2' }, { at: 'bs2' }, 'Next', { at: '1s' }, ' unit'])
    expect(owned([p1, p2], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(3)', 0] })
    // its unit's next piece across the break: through to its mark (a display \allowdisplaybreaks breaks)
    const q2 = pageOf([{ at: 'bs2' }, 'c=d(4)', { at: 'p0.3a' }, 'x', { at: 'p0.3b' }])
    expect(owned([p1, q2], { 'p0.1a': open('', ['p0.3a', '0e']), 'p0.3a': closed })['p0.1a']).toEqual(['a=b(3)c=d(4)', 0])
    // an unmarked piece next: as before
    expect(owned([p1, p2], { 'p0.1a': open('', ['0e'], true) })).toEqual({ 'p0.1a': 'open, the next mark on another page' })
  })

  it('a display group: the first display owns its group, to the text after the last; each later one is in it', () => {
    // two displays, nothing between them: TeX sets no point for the second (the empty paragraph between them)
    const page = pageOf([{ at: 'bs1' }, 'define ', { at: 'p0.1a' }, '\na=b(1)', '\nc=d(2)', '\nwhere x', { at: '0e' }, { at: 'be1' }])
    const group: Follow = { ...open('wherex'), group: ['p0.3a'] }
    const got = ownedOf([page], { follows: n => ({ 'p0.1a': group })[n] ?? null })
    expect(owned([page], { 'p0.1a': group })).toEqual({ 'p0.1a': ['a=b(1)c=d(2)', 0], 'p0.3a': 'in the display before it' })
    expect(got.get('p0.1a')?.how).toBe(how('open, with the displays after it'))
    expect(how('in the display before it')).toBeGreaterThanOrEqual(OWNED)
    // its first not owned: no later one is in it
    expect(owned([page], { 'p0.1a': { ...group, want: 'nowhere' } })).toEqual({ 'p0.1a': 'open, the text after it not found' })
  })

  it("a babel name's points are no piece's next mark, whatever case its key is in (a primitive \\uppercase's capitals)", () => {
    for (const key of ['ref', 'REF']) {
      const page = pageOf(['define ', { at: 'p0.1a' }, '\na=b', { at: `n1.${key}.s` }, { at: `n1.${key}.e` }, '(1)', { at: '0e' }])
      expect(owned([page], { 'p0.1a': open('', ['0e']) }), key).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    }
  })

  it("a display past its unit's end mark ends where a heading's name or a biblatex entry begins after it, and a name before that mark is its unit's own", () => {
    // 2608.08872v1: a proof that ends in a display, its end mark set before the display, and the bibliography after it on the page
    const page = pageOf(['proof ', { at: '0e' }, { at: 'p0.1a' }, '\na=b(1)', '\n', { at: 'n1.ref.s' }, 'References', { at: 'n1.ref.e' }, '\n', { at: 'bi1' }, 'Entry one.', '\n', { at: 'bi2' }, 'Entry two.'])
    expect(owned([page], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    const entries = pageOf(['proof ', { at: '0e' }, { at: 'p0.1a' }, '\na=b(1)', '\n', { at: 'bi1' }, 'Entry one.'])
    expect(owned([entries], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    // (a numeric entry's label, which the list's \item set before its point, is the entry's, as a later unit's label is its own)
    const numeric = pageOf(['proof ', { at: '0e' }, { at: 'p0.1a' }, '\na=b(1)', '\n[1] ', { at: 'bi1' }, 'Entry one.'])
    expect(owned([numeric], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 0] })
    // (a name that begins no block, set inside the display — `\[x=\text{\figurename}\,1\]` —, the display's own text: Codex on #509)
    const inside = pageOf(['text ', { at: '0e' }, { at: 'p0.1a' }, '\nx=', { at: 'n1.figure.s' }, 'Figure', { at: 'n1.figure.e' }, '1', '\n', { at: '1s' }, 'Next unit'])
    expect(owned([inside], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['x=Figure1', 0] })
    // (a piece that is no display, past its unit's end mark — an affiliation's e-mail —, its lines to TeX's skip before another
    // block, as to a later unit's start: the block before "Abstract" no piece's)
    const email = pageOf(['Univ. of X ', { at: '0e' }, { at: 'p0.1a' }, 'a@b.it', '\nmore', '\n\n\nOther block', '\n', { at: 'n1.abstract.s' }, 'Abstract', { at: 'n1.abstract.e' }])
    expect(owned([email], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a@b.itmore', 0] })
  })

  it('an opening point alone with no text after it ends at its unit\'s next mark, and no other', () => {
    const display = pageOf(['define ', { at: 'p0.1a' }, '\na=b(1)', { rule: [100, 680, 110, 680.4] }, { at: '0e' }, '\n', { at: '1s' }, 'Next unit'])
    expect(owned([display], { 'p0.1a': open('', ['0e']) })).toEqual({ 'p0.1a': ['a=b(1)', 1] })
    // the unit's end mark not set where it was looked for: the next mark is another unit's
    expect(owned([display], { 'p0.1a': open('', ['p0.2a']) })).toEqual({ 'p0.1a': "open, the next mark not its unit's" })
    // a display after it with no mark of its own (the empty paragraph between two displays has none)
    expect(owned([display], { 'p0.1a': open('', ['0e'], true) })).toEqual({ 'p0.1a': 'open, an unmarked piece follows' })
  })

  it('an opening point alone: the text after it not found, or its next mark on another page, owns nothing', () => {
    const p1 = pageOf(['words ', { at: 'p0.1a' }, 'x+y', { at: 'p0.3a' }, 'z', ' and'])
    const p2 = pageOf([{ at: '0e' }, 'tail'])
    expect(owned([p1, p2], { 'p0.1a': open('where'), 'p0.3a': open('and') })).toEqual({ 'p0.1a': 'open, the text after it not found', 'p0.3a': 'open, the next mark on another page' })
    expect(how('open, the next mark on another page')).toBeGreaterThanOrEqual(OWNED)
  })

  it('a name the caller does not know, and a bracket, own nothing and are no piece', () => {
    const page = pageOf([{ at: 'bs1' }, { at: 'p9.9a' }, 'x', { at: 'p9.9b' }, { at: '3s' }, { at: 'be1' }])
    expect(owned([page], {})).toEqual({})
  })
})

describe('ownedPages: a piece found once the pages it may read are in, the pages before let go', () => {
  /** the pages added one by one, each piece's page count when it was found and the window's pages it was given */
  function paged(pages: StreamPage[], follows: Record<string, Follow>, closing: Record<string, number> = {}) {
    const found: Record<string, { after: number; held: number[] }> = {}
    let added = 0
    const s = ownedPages({ follows: n => follows[n] ?? null, closing: n => closing[n] ?? null })
    const take = (name: string, _e: unknown, W: readonly StreamPage[]) => { found[name] = { after: added, held: W.flatMap((p, i) => (p.points.length || p.glyphs.n ? [i + 1] : [])) } }
    for (const page of pages) { added++; s.add(added, page, take) }
    s.end(take)
    return found
  }

  it('a piece closed on its page is found with its page; one closed on the next page waits for it, the page before let go', () => {
    const p1 = pageOf([{ at: 'bs1' }, 'one ', { at: 'p0.1a' }, 'x', { at: 'p0.1b' }, ' two ', { at: 'p0.3a' }, 'k1', { at: 'be1' }])
    const p2 = pageOf([{ at: 'bs2' }, 'k2', { at: 'p0.3b' }, ' three', { at: 'be2' }])
    const p3 = pageOf([{ at: 'bs3' }, 'four ', { at: 'p0.5a' }, 'y', { at: 'p0.5b' }, { at: 'be3' }])
    const f = { 'p0.1a': closed, 'p0.3a': closed, 'p0.5a': closed }
    // (both forms agree: owned asserts it)
    expect(owned([p1, p2, p3], f)).toEqual({ 'p0.1a': ['x', 0], 'p0.3a': ['k1k2', 0], 'p0.5a': ['y', 0] })
    const got = paged([p1, p2, p3], f, { 'p0.1a': 1, 'p0.3a': 2, 'p0.5a': 3 })
    // page 1's pieces wait for the piece closed on page 2: all found once page 2 is in, over pages 1 and 2
    expect(got['p0.1a']).toEqual({ after: 2, held: [1, 2] })
    expect(got['p0.3a']).toEqual({ after: 2, held: [1, 2] })
    // page 3's own, its window page 3 alone: pages 1 and 2 let go
    expect(got['p0.5a']).toEqual({ after: 3, held: [3] })
  })

  it('an opening point alone in a body waits for the next point in its region; with none, for the document\'s end', () => {
    const p1 = pageOf([{ at: 'bs1' }, 'words ', { at: 'p0.1a' }, '\na=b(1)', { at: 'be1' }])
    const p2 = pageOf([{ at: 'bs2' }, 'nothing marked here', { at: 'be2' }])
    const p3 = pageOf([{ at: 'bs3' }, 'where more words', { at: '0e' }, { at: 'be3' }])
    const f = { 'p0.1a': open('wheremor') }
    owned([p1, p2, p3], f)
    expect(paged([p1, p2, p3], f)['p0.1a']).toEqual({ after: 3, held: [1, 2, 3] })
    owned([p1, p2], f)
    expect(paged([p1, p2], f)['p0.1a']).toEqual({ after: 2, held: [1, 2] })
  })

  it('a closing point read on a page before its opening point: out of order, as over the whole', () => {
    const p1 = pageOf(['one ', { at: 'p0.1b' }, 'two'])
    const p2 = pageOf(['three ', { at: 'p0.1a' }, 'four'])
    expect(owned([p1, p2], { 'p0.1a': closed })).toEqual({ 'p0.1a': 'marks out of order' })
  })

  it('a point read again on a later page: told by twice(), as the whole tells it', () => {
    const p1 = pageOf(['one ', { at: 'p0.1a' }, 'x', { at: 'p0.1b' }])
    const p2 = pageOf(['two ', { at: 'p0.1a' }, 'y'])
    expect(owned([p1, p2], { 'p0.1a': closed })).toEqual({ 'p0.1a': 'a mark set twice' })
  })

  it('pages come in order', () => {
    const s = ownedPages({ follows: () => null })
    expect(() => s.add(2, pageOf(['x']), () => {})).toThrow(RangeError)
  })
})

// ---- the erasure's reading (own.mjs: `erasure`), the sweep of 2026-10-24: a piece's ink where the maker's reading leaves it
// LOST, found exactly; the maker's reading unchanged
describe('ownedOf for the erasure (erasure: true)', () => {
  const ink = (pages: StreamPage[], follows: Record<string, Follow>, erasure: boolean) => {
    const out: Record<string, string | [string, number]> = {}
    for (const [name, e] of ownedOf(pages, { follows: n => follows[n] ?? null, erasure })) out[name] = shown(pages, e)
    return out
  }
  it('finds the text after a piece where TeX set a straight quote as a curly one (2610.19159v1 p42u845: \\S{}"Held fixed")', () => {
    const page = pageOf(['from ', { at: 'p0.6a' }, '§', '”Held fixed (parity)', { at: '0e' }])
    const f = { 'p0.6a': open('"heldfix') }
    expect(ink([page], f, false)).toEqual({ 'p0.6a': 'open, the text after it not found' })
    expect(ink([page], f, true)).toEqual({ 'p0.6a': ['§', 0] })
  })
  it('reads a closed piece whose command moved the punctuation after it before its ink as the maker does: the mark the text\'s (its group none of it)', () => {
    const page = pageOf(['in the air', { at: 'p0.1a' }, '.', { u: '1', x: 200, y: 704, size: 7 }, { at: 'p0.1b' }, ' Next', { at: '0e' }])
    const f = { 'p0.1a': { ...closed, moved: '.' } }
    expect(ink([page], f, true)).toEqual({ 'p0.1a': ['1', 0] })
    expect(ink([page], f, false)).toEqual(ink([page], f, true))
  })
  it('owns a piece whose ink is a rule alone before the text after it (2610.19159v1 p151u1677: \\_ before \\allowbreak); a swap still none', () => {
    const page = pageOf(['the compute', { at: 'p0.2a' }, { rule: [126, 699, 131, 699.4] }, { u: 's', x: 132, y: 700 }, 'star function', { at: '0e' }])
    const f = { 'p0.2a': open('sstarfun') }
    expect(ink([page], f, false)).toEqual({ 'p0.2a': 'open, nothing before the text after it' })
    expect(ink([page], f, true)).toEqual({ 'p0.2a': ['', 1] })
    // (a rule under the text after it — \uline{sstar} painted before its word — is that text's: none)
    const ul = pageOf(['the compute', { at: 'p0.2a' }, { rule: [127, 697, 160, 697.4] }, 'sstar function', { at: '0e' }])
    expect(ink([ul], f, true)).toEqual({ 'p0.2a': 'open, nothing before the text after it' })
    // (REVTeX's swap, no rule: the text after it at once is not the piece's ink)
    const swapped = pageOf(['as shown', { at: 'p0.1a' }, '.', { u: '1', x: 120, y: 703.5, size: 7 }, { at: '0e' }])
    expect(ink([swapped], { 'p0.1a': open('.', ['0e']) }, true)).toEqual({ 'p0.1a': 'open, nothing before the text after it' })
  })
  it('owns an opening alone over the unmarked placeholders after it to the next marked one\'s opening (2610.21547v1 p17u234)', () => {
    // \cls{circle}$\to$\cls{donut}: the arrow has no mark; nothing but placeholders between the two openings
    const page = pageOf(['flipping (', { at: 'p0.1a' }, 'circle', '→', { at: 'p0.3a' }, 'donut', { at: 'p0.3b' }, ') over', { at: '0e' }])
    const through: Follow = { closing: false, want: '', ends: ['p0.2a', '0e'], blocked: true, through: 'p0.3a' }
    expect(ink([page], { 'p0.1a': through, 'p0.3a': closed }, false)).toEqual({ 'p0.1a': 'open, an unmarked piece follows', 'p0.3a': ['donut', 0] })
    expect(ink([page], { 'p0.1a': through, 'p0.3a': closed }, true)).toEqual({ 'p0.1a': ['circle→', 0], 'p0.3a': ['donut', 0] })
    // (over a line's end: the arrow at the line's end, the next placeholder on the next line)
    const broken = pageOf(['flipping (', { at: 'p0.1a' }, 'circle', '→', '\n', { at: 'p0.3a' }, 'donut', { at: 'p0.3b' }, ') over', { at: '0e' }])
    expect(ink([broken], { 'p0.1a': through, 'p0.3a': closed }, true)).toEqual({ 'p0.1a': ['circle→', 0], 'p0.3a': ['donut', 0] })
    // (text between the unmarked piece and the next mark: where the one ends is not known, none)
    const blocked: Follow = { ...through, through: null }
    expect(ink([page], { 'p0.1a': blocked, 'p0.3a': closed }, true)).toEqual({ 'p0.1a': 'open, an unmarked piece follows', 'p0.3a': ['donut', 0] })
  })
  it('the maker\'s reading parts a macro\'s ink from the one unmarked piece after it by the macro\'s text (2609.20976v1 p5u19: \\lgnrm \\footnote{…}~\\citep{…})', () => {
    // \lgnrm = \texttt{lognormal\_galaxies}\xspace before a footnote's call, which no mark may stand before; the citation after
    // the tie marked: the macro's glyphs spell "lognormalgalaxies", the raised 1 is the call's
    const page = pageOf(['code ', { at: 'p0.1a' }, 'lognormal_galaxies', { u: '1', x: 170, y: 703.5, size: 7 }, ' ', { at: 'p0.5a' }, '[1]', { at: 'p0.5b' }, ', which', { at: '0e' }])
    const split: Follow = { closing: false, want: '', ends: ['n0.3a', '0e'], blocked: true, through: 'p0.5a', split: { name: 'n0.3a', text: 'lognormal_galaxies' } }
    expect(ink([page], { 'p0.1a': split, 'p0.5a': closed }, false)).toEqual({ 'p0.1a': ['lognormal_galaxies', 0], 'n0.3a': ['1', 0], 'p0.5a': ['[1]', 0] })
    // (a page at a time the same: ownedPages takes the call's entry with the macro's)
    expect(owned([page], { 'p0.1a': split, 'p0.5a': closed })).toEqual({ 'p0.1a': ['lognormal_galaxies', 0], 'n0.3a': ['1', 0], 'p0.5a': ['[1]', 0] })
    // (the erasure's reading as before: the two's ink the macro's, its group's alike)
    expect(ink([page], { 'p0.1a': split, 'p0.5a': closed }, true)).toEqual({ 'p0.1a': ['lognormal_galaxies1', 0], 'p0.5a': ['[1]', 0] })
    // (a text the glyphs do not begin with, one they set whole with nothing after it, one they set but for a character — the
    // underscore —, or no split: LOST as before)
    for (const text of ['lognormal_galaxy', 'lognormal_galaxies1', 'xlognormal', 'lognormalgalaxies']) expect(ink([page], { 'p0.1a': { ...split, split: { name: 'n0.3a', text } }, 'p0.5a': closed }, false)['p0.1a']).toBe('open, an unmarked piece follows')
    // (the macro's glyphs running on past its text, a letter on its baseline at its size — the call's ink is not all that is
    // left: the review of #483 — none, where a split by its text's spelling alone gave the call "s1")
    const more = pageOf(['code ', { at: 'p0.1a' }, 'lognormal_galaxiess', { u: '1', x: 175, y: 703.5, size: 7 }, ' ', { at: 'p0.5a' }, '[1]', { at: 'p0.5b' }, ', which', { at: '0e' }])
    expect(ink([more], { 'p0.1a': split, 'p0.5a': closed }, false)['p0.1a']).toBe('open, an unmarked piece follows')
    // (a formula's glyph of a text the probe showed, INK_ANY, is one glyph of any text)
    const sym = pageOf(['code ', { at: 'p0.1a' }, 'd′', { u: '1', x: 120, y: 703.5, size: 7 }, ' ', { at: 'p0.5a' }, '[1]', { at: 'p0.5b' }, '.', { at: '0e' }])
    expect(ink([sym], { 'p0.1a': { ...split, split: { name: 'n0.3a', text: `d${INK_ANY}` } }, 'p0.5a': closed }, false)).toEqual({ 'p0.1a': ['d′', 0], 'n0.3a': ['1', 0], 'p0.5a': ['[1]', 0] })
    expect(ink([page], { 'p0.1a': { ...split, split: undefined }, 'p0.5a': closed }, false)).toEqual({ 'p0.1a': 'open, an unmarked piece follows', 'p0.5a': ['[1]', 0] })
  })
  it('parts a macro\'s ink from an unmarked piece with text after it, to where that text begins (an elsarticle .bbl\'s `\\DOIprefix\\doi{…}.`, 2610.20848v1)', () => {
    // \DOIprefix = "doi:", then \doi{10.1007/978-3} unmarked and the entry's full stop: the DOI's own dots are no text after it
    const page = pageOf(['Radio. ', { at: 'p0.3a' }, 'doi:10.1007/978-3.', { at: '0e' }])
    const split: Follow = { closing: false, want: '', ends: ['p0.4a', '0e'], blocked: true, through: null, split: { name: 'p0.4a', text: 'doi:', want: '.', rest: '', ends: ['0e'] } }
    expect(ink([page], { 'p0.3a': split }, false)).toEqual({ 'p0.3a': ['doi:', 0], 'p0.4a': ['10.1007/978-3', 0] })
    expect(owned([page], { 'p0.3a': split })).toEqual({ 'p0.3a': ['doi:', 0], 'p0.4a': ['10.1007/978-3', 0] })
    // (the erasure's reading: the two's ink the macro's, to the full stop)
    expect(ink([page], { 'p0.3a': split }, true)).toEqual({ 'p0.3a': ['doi:10.1007/978-3', 0] })
    // (text after it, then a marked piece's point: to where that text begins)
    const more = pageOf(['Radio. ', { at: 'p0.3a' }, 'doi:10.1/x, see ', { at: 'p0.7a' }, 'x.org', { at: 'p0.7b' }, '.', { at: '0e' }])
    const seen: Follow = { ...split, split: { name: 'p0.4a', text: 'doi:', want: ',see', rest: 'see', ends: ['p0.7a', '0e'] } }
    expect(ink([more], { 'p0.3a': seen, 'p0.7a': closed }, false)).toEqual({ 'p0.3a': ['doi:', 0], 'p0.4a': ['10.1/x', 0], 'p0.7a': ['x.org', 0] })
    // (its text after it not found, or the next point no piece of its ends: LOST as before)
    expect(ink([page], { 'p0.3a': { ...split, split: { ...(split.split as object), want: ';', rest: '' } as never } }, false)['p0.3a']).toBe('open, an unmarked piece follows')
    expect(ink([more], { 'p0.3a': { ...seen, split: { ...(seen.split as object), ends: ['0e'] } as never }, 'p0.7a': closed }, false)['p0.3a']).toBe('open, an unmarked piece follows')
  })
  it('ends a display after its unit\'s end mark at a later unit\'s opening, that unit\'s label left out (2610.20595v1 p19u153)', () => {
    const page = pageOf(['states follow', { at: '0e' }, { at: 'p0.3a' }, '\nE=mc(G9)', '\n', { u: '2', x: 72, y: 676 }, { u: '.', x: 77, y: 676 }, { at: 'p1.0a' }, { at: 'h1s' }, { u: 'T', x: 90, y: 676 }, 'riangulene', { at: 'p1.0b' }])
    const f = { 'p0.3a': open('', ['0e']), 'p1.0a': closed }
    expect(ink([page], f, false)['p0.3a']).toBe("open, the next mark not its unit's")
    expect(ink([page], f, true)['p0.3a']).toEqual(['E=mc(G9)', 0])
    // (a later unit with no start mark, a title of two lines whose placeholder opens on its second: its first line is the
    // title's, not the display's; none — the review of b479095e)
    const title = pageOf(['states follow', { at: '0e' }, { at: 'p0.3a' }, '\nE=mc', '\nTitle line one', '\nfor ', { at: 'p1.1a' }, 'X', { at: 'p1.1b' }, ' rest', { at: '1e' }])
    expect(ink([title], { 'p0.3a': open('', ['0e']), 'p1.1a': closed }, true)['p0.3a']).toBe("open, the next mark not its unit's")
    // (an earlier unit's opening next: none, as before)
    const earlier = pageOf(['follow', { at: 'p3.1a' }, '\na=b(1)', { at: 'p2.0a' }, 'text', { at: 'p2.0b' }])
    expect(ink([earlier], { 'p3.1a': open('', ['3e']), 'p2.0a': closed }, true)['p3.1a']).toBe("open, the next mark not its unit's")
  })
})

// ---- the release sweep of 2026-10-24 (staging d74bd1cf against production 699b4aea): units newly English, `unhidden`
describe('ownedOf for the erasure: the release sweep of 2026-10-24', () => {
  const ink = (pages: StreamPage[], follows: Record<string, Follow>, erasure: boolean) => {
    const out: Record<string, string | [string, number]> = {}
    for (const [name, e] of ownedOf(pages, { follows: n => follows[n] ?? null, erasure })) out[name] = shown(pages, e)
    return out
  }
  it('tells the text after a piece where it runs to its unit\'s next mark, not where its first characters first stand in the piece (2610.16663v1 p45u229, 2610.21376v1 p9u88)', () => {
    // "Let \[ … \text{for every } y∈ℝ^s (6) \] For $X$, define": the text after the display is "For", whose letters the display's
    // \text holds first; the glyphs from the right "For" to the next mark spell the text after it exactly
    const page = pageOf(['Let ', { at: 'p0.1a' }, '\nf(y)=0 for every y (6)', '\nFor ', { at: 'p0.3a' }, 'X', { at: 'p0.3b' }, ', define', { at: '0e' }])
    const f: Record<string, Follow> = { 'p0.1a': { ...open('for', ['p0.3a', '0e']), rest: 'for' }, 'p0.3a': closed }
    expect(ink([page], f, true)['p0.1a']).toEqual(['f(y)=0foreveryy(6)', 0])
    // (the maker's reading the same: the layout's segment of the display is the erasure's, and the page stream's too)
    expect(owned([page], f)['p0.1a']).toEqual(['f(y)=0foreveryy(6)', 0])
    // (with no `rest`, a marking of before: the first place)
    expect(ink([page], { ...f, 'p0.1a': open('for', ['p0.3a', '0e']) }, true)['p0.1a']).toEqual(['f(y)=0', 0])
    // (a URL's dots before the full stop after it, the unit's end next: 2610.21376v1 p9u88)
    const url = pageOf(['code at ', { at: 'p0.1a' }, 'https://github.com/a/b', '.', { at: '0e' }])
    expect(ink([url], { 'p0.1a': { ...open('.', ['0e']), rest: '' } }, true)['p0.1a']).toEqual(['https://github.com/a/b', 0])
    // (where no place spells it to the end, the first, as before)
    const none = pageOf(['Let ', { at: 'p0.1a' }, 'a for b', ' For it ', { at: 'p0.3a' }, 'X', { at: 'p0.3b' }])
    expect(ink([none], { 'p0.1a': { ...open('for', ['p0.3a', '0e']), rest: 'for' }, 'p0.3a': closed }, true)['p0.1a']).toEqual(['a', 0])
  })
  it('owns a display that ends a footnote to its page\'s stream end, its folio aside (2610.16663v1 p16u58)', () => {
    // the footnote's end mark before its display (MARK_DEF), no mark after it on its page, the folio last and lowest
    const items: Item[] = [{ at: 'bs1' }, 'body text', { at: 'be1' }, { at: '3s' }, '\n\n3 The value satisfying', { at: '3e' }, { at: 'p3.9a' }, '\n          Z y g(y) dy = 0,']
    const f: Record<string, Follow> = { 'p3.9a': { ...open('', ['3e', 't3e', 'h3e']), display: true } }
    const page = pageOf([...items, { u: '1', x: 300, y: 600 }, { u: '6', x: 305, y: 600 }])
    expect(ink([page], f, true)['p3.9a']).toEqual(['Zyg(y)dy=0,', 0])
    // (the maker's reading the same, a page at a time too: the layout holds the display's segments, which the reader shows it
    // again through)
    expect(owned([page], f)['p3.9a']).toEqual(['Zyg(y)dy=0,', 0])
    // (no folio to tell where the display ends — the page's foot is no page number, or it stands near the display: a running
    // foot's text would be hidden with it; none)
    expect(ink([pageOf([...items, { u: 'J', x: 300, y: 600 }, { u: 'x', x: 305, y: 600 }])], f, true)['p3.9a']).toBe('open, the next mark on another page')
    expect(ink([pageOf([...items, '\n16'])], f, true)['p3.9a']).toBe('open, the next mark on another page')
    // (a footnote after it with no mark of its own, starting at the footnote's edge, is no display's ink: none)
    expect(ink([pageOf([...items, '\n4 https://x.org/y', { u: '1', x: 300, y: 600 }, { u: '6', x: 305, y: 600 }])], f, true)['p3.9a']).toBe('open, the next mark on another page')
    // (a line of the page's foot above the folio, centred \footskip below the display: none — Devin on #462)
    expect(ink([pageOf([...items, '\n\n\n          (c) 2026 The Authors', { u: '1', x: 300, y: 600 }, { u: '6', x: 305, y: 600 }])], f, true)['p3.9a']).toBe('open, the next mark on another page')
    // (a piece that is no display — an inline formula or a citation ending the note, its ink its own and what follows it no
    // business of its: none, as before)
    expect(ink([page], { 'p3.9a': open('', ['3e', 't3e', 'h3e']) }, true)['p3.9a']).toBe('open, the next mark on another page')
    // (text after it, or its end mark not before it: as before)
    expect(ink([page], { 'p3.9a': open('and', ['3e']) }, true)['p3.9a']).not.toEqual(['Zyg(y)dy=0,', 0])
  })
})
