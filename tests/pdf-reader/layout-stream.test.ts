import { describe, expect, it } from 'vitest'
import { type Follow, OWNED, OWNED_HOW, ownedOf, type StreamPage } from '@/pdf-reader/engine/layout/stream.mjs'

// Each placeholder's own ink in the marked compile by content-stream order: a page here is what pageInk reads of one,
// its glyphs and boxes in the order shown and its points among them. A glyph is written as its character and place,
// every glyph 5 pt wide at 10 pt

type Item = string | { u: string; x: number; y: number; size?: number } | { rule: [number, number, number, number] } | { at: string }
/** a page from the items in stream order: a string is a run of glyphs on the current line, `{ at }` a point */
function pageOf(items: Item[], view = [0, 0, 612, 792]): StreamPage {
  const glyphs: StreamPage['glyphs'] = [], boxes: number[] = [], points: StreamPage['points'] = [], boxAt: number[] = []
  let x = 72, y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') { x += 3; continue }
        if (u === '\n') { x = 72; y -= 12; continue }
        glyphs.push({ u, x0: x, x1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'F' })
        boxAt.push(boxes.length / 4)
        x += 5
      }
    } else if ('at' in it) points.push({ name: it.at, glyph: glyphs.length, box: boxes.length / 4 })
    else if ('rule' in it) boxes.push(...it.rule)
    else {
      const size = it.size ?? 10
      glyphs.push({ u: it.u, x0: it.x, x1: it.x + 0.5 * size, y: it.y, top: it.y + 0.7 * size, bottom: it.y - 0.2 * size, size, font: 'F' })
      boxAt.push(boxes.length / 4)
      x = it.x + 0.5 * size
      y = it.y
    }
  }
  return { glyphs, boxes, points, boxAt, view }
}
const closed: Follow = { closing: true, want: '', ends: [], blocked: false }
const open = (want: string, ends: string[] = [], blocked = false): Follow => ({ closing: false, want, ends, blocked })
const how = (name: string) => OWNED_HOW.indexOf(name)
/** each owned piece's glyphs as a string and its rule count, or its how where it is not owned */
function owned(pages: StreamPage[], follows: Record<string, Follow>, dropped: string[] = []) {
  const out: Record<string, string | [string, number]> = {}
  for (const [name, e] of ownedOf(pages, { follows: n => follows[n] ?? null, dropped })) {
    out[name] = e.how < OWNED ? [e.glyphs.map(([p, g]) => pages[p - 1]?.glyphs[g]?.u).join(''), e.boxes.length] : OWNED_HOW[e.how] as string
  }
  return out
}

describe('ownedOf', () => {
  it('a closed piece owns the glyphs and rules between its two points, in stream order, scripts, limits and bars alike', () => {
    // a fraction's numerator, its bar and its denominator; a sum's limits above and below
    const page = pageOf(['the sum ', { at: 'p0.1a' }, { u: 'n', x: 120, y: 708, size: 7 }, { u: '∑', x: 118, y: 700 }, { u: 'i', x: 119, y: 693, size: 7 }, { at: 'p0.1b' }, ' and ', { at: 'p0.3a' }, '1', { rule: [150, 703, 160, 703.4] }, { u: 'd', x: 152, y: 695 }, { at: 'p0.3b' }, ' more'])
    expect(owned([page], { 'p0.1a': closed, 'p0.3a': closed })).toEqual({ 'p0.1a': ['n∑i', 0], 'p0.3a': ['1d', 1] })
    expect(OWNED_HOW[OWNED - 1]).toBe("open, to its unit's next mark")
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
    // the next mark an earlier unit's start: none
    const earlier = pageOf(['define', { at: 'p3.1a' }, '\na=b(1)', { at: '2s' }, 'text'])
    expect(owned([earlier], { 'p3.1a': open('', ['3e']) })).toEqual({ 'p3.1a': "open, the next mark not its unit's" })
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
