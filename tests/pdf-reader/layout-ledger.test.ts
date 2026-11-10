import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { type LedgerPage, ledgerOf, ledgerSummary, ORPHAN_LINES_MAX, orphanRows } from '@/pdf-reader/engine/layout/ledger.mjs'
import { pageInk } from '@readarxiv/engine'
import { CLASS_CODE, CLASS_IDS, CLASSES, classesOn, shownTranslated, TOGGLE_DEFAULTS, TOGGLES, UNIT_CLASS, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The content classes and the ledger of our final pass (docs/route/orphan-text.md, stage 1): every glyph one class, by TeX's
// facts — its owner, its region, the babel names' points, stream order — and its own font

describe('the content classes', () => {
  it('maps every class onto one of the owner\'s toggles (2026-10-25)', () => {
    for (const id of CLASS_IDS) expect(TOGGLES).toContain(CLASSES[id].toggle)
    const toggleOf = Object.fromEntries(CLASS_IDS.map(id => [id, CLASSES[id].toggle]))
    expect(toggleOf).toEqual({
      body: 'always', generated: 'always', contents: 'always', notes: 'always', orphan: 'always',
      heads: 'heads', tables: 'tables', figures: 'figures', ocr: 'figures', references: 'references', index: 'references', names: 'names',
      math: 'never', code: 'never', symbols: 'never',
    })
  })

  it('keeps never-translated classes never, and OCR the one class no glyph holds', () => {
    for (const id of CLASS_IDS) expect(CLASSES[id].state === 'never').toBe(CLASSES[id].toggle === 'never')
    expect(CLASS_IDS.filter(id => !CLASSES[id].glyphs)).toEqual(['ocr'])
    // (a code is an index: a page's codes fit in a Uint8Array)
    expect(CLASS_IDS.length).toBeLessThan(256)
    expect(CLASS_IDS.map(id => CLASS_CODE[id])).toEqual(CLASS_IDS.map((_, i) => i))
  })

  it('marks built every class a unit is made of, and none of the others: the lab\'s built share (ledger.mjs builtShare) reads it', () => {
    // (a class some kind of unit belongs to is translated and drawn: the source's units and the ink units, layout/ink-units.mjs
    // and layout/figure-text.mjs; the index and OCR have no unit yet, the never-translated classes none by design)
    const made = new Set(Object.values(UNIT_CLASS))
    expect(CLASS_IDS.filter(id => CLASSES[id].state === 'built')).toEqual(CLASS_IDS.filter(id => made.has(id)))
    expect(CLASS_IDS.filter(id => CLASSES[id].state === 'planned')).toEqual(['ocr', 'index'])
  })

  it('gives a unit its class by its kind, the front end\'s and the bundle\'s alike', () => {
    expect(unitClass({ kind: 'para' })).toBe('body')
    expect(unitClass({ kind: 'heading' })).toBe('body')
    expect(unitClass({ kind: 'caption' })).toBe('body')
    expect(unitClass({ kind: 'footnote' })).toBe('body')
    expect(unitClass({ kind: 'cell' })).toBe('tables')
    expect(unitClass({ kind: 'author' })).toBe('names')
    expect(unitClass({ kind: 'figure' })).toBe('figures')
    expect(unitClass(['cell', 0, []])).toBe('tables')
    expect(unitClass('author')).toBe('names')
    // (a bibliography's entry, one unit, whole, the references': latex-front.mjs bibliography; PIPELINE 29's `refnames`, an entry's
    // names cut apart, which a bundle of 29 still holds, the references' too: "names" is the author block's alone, 2026-10-28)
    expect(unitClass({ kind: 'reference' })).toBe('references')
    expect(unitClass(['refnames', 0, null, null, null, []])).toBe('references')
    // (an author block's places, the names' with its names: the whole block one toggle, the owner's ruling of 2026-10-30)
    expect(unitClass({ kind: 'affiliation' })).toBe('names')
    // (a kind the table does not name is the body's; no kind, no class)
    expect(unitClass({ kind: 'list' })).toBe('body')
    expect(unitClass(null)).toBeNull()
    expect(unitClass({})).toBeNull()
    for (const cls of Object.values(UNIT_CLASS)) expect(CLASS_IDS).toContain(cls)
  })

  it('turns references and names on only where a reader\'s classes say so (an entry whole under references, the author block whole under names)', () => {
    expect(TOGGLE_DEFAULTS.references).toBe(false)
    expect(TOGGLE_DEFAULTS.names).toBe(false)
    expect([...classesOn(null)].sort()).toEqual(Object.keys(TOGGLE_DEFAULTS).filter(t => TOGGLE_DEFAULTS[t as keyof typeof TOGGLE_DEFAULTS]).sort())
    // (a unit by its class: the body always, a cell under tables, an entry (and a 29's entry's names) under references, the
    // author block, its names and its places, under names)
    const on = classesOn({ references: true, tables: false })
    expect(['para', 'affiliation', 'cell', 'reference', 'refnames', 'author'].map(kind => unitShown({ kind }, on))).toEqual([true, false, false, true, true, false])
    expect(['reference', 'refnames', 'author', 'affiliation'].map(kind => unitShown({ kind }, classesOn({ names: true })))).toEqual([false, false, true, true])
    expect(unitShown(null, on)).toBe(false)
  })

  it('shows a class translated under the toggles turned on', () => {
    const on = new Set(['tables'])
    expect(shownTranslated('body', on)).toBe(true)
    expect(shownTranslated('contents', null)).toBe(true)
    expect(shownTranslated('tables', on)).toBe(true)
    expect(shownTranslated('heads', on)).toBe(false)
    expect(shownTranslated('math', new Set(['never']))).toBe(false)
    expect(shownTranslated('nothing', on)).toBe(false)
  })
})

// ---- pages as ownOf reads them: glyphs in stream order, points by the glyph they stand before
type G = LedgerPage['glyphs'][number]
/** a run of glyphs: a word's letters left to right on one baseline, 5 pt each, a space before the next word */
function run(text: string, x: number, y: number, { font = 'CMR10', size = 10, form = false }: { font?: string; size?: number; form?: boolean } = {}): G[] {
  const out: G[] = []
  for (const ch of text) {
    if (ch !== ' ') out.push({ u: ch, x0: x, x1: x + 5, y, size, font, ...(form ? { form: true } : {}) })
    x += 5
  }
  return out
}
/** a page from its parts in stream order: glyph runs, each with its owner (null for none), and points */
type Part = { glyphs: G[]; owner?: string | null } | { point: string }
function page(...parts: Part[]): { page: LedgerPage; own: (string | null)[] } {
  const glyphs: G[] = [], own: (string | null)[] = [], points: { name: string; glyph: number; box: number }[] = []
  for (const p of parts) {
    if ('point' in p) points.push({ name: p.point, glyph: glyphs.length, box: 0 })
    else for (const g of p.glyphs) { glyphs.push(g); own.push(p.owner ?? null) }
  }
  return { page: { glyphs, boxes: [], points }, own }
}
const ledger = (pages: { page: LedgerPage; own: (string | null)[] }[], units: unknown[] | null = null) => ledgerOf(pages.map(p => p.page), { glyphs: pages.map(p => p.own) }, { units })
const classAt = (l: ReturnType<typeof ledgerOf>, p: number, g: number) => CLASS_IDS[l.classes[p - 1]?.[g] ?? -1]
const at = (pg: { page: LedgerPage }, u: string) => pg.page.glyphs.findIndex(g => g.u === u)

describe('ledgerOf', () => {
  it('gives an owned glyph its owner\'s class: a unit\'s by its kind, a babel name\'s generated', () => {
    const pg = page({ point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u0' }, { glyphs: run('Cell', 100, 580), owner: 'u1' }, { glyphs: run('Ada', 100, 560), owner: 'u2.l' }, { glyphs: run('Refs', 100, 540), owner: 'n3' }, { point: 'be1' })
    const l = ledger([pg], [{ kind: 'para' }, { kind: 'cell' }, { kind: 'author' }])
    expect(classAt(l, 1, at(pg, 'B'))).toBe('body')
    expect(classAt(l, 1, at(pg, 'C'))).toBe('tables')
    expect(classAt(l, 1, at(pg, 'A'))).toBe('names')
    expect(classAt(l, 1, at(pg, 'R'))).toBe('generated')
    // (no units: every unit's class the body's)
    expect(classAt(ledger([pg]), 1, at(pg, 'C'))).toBe('body')
    expect(l.orphanLetters).toBe(0)
    expect(l.counts.body).toEqual({ glyphs: 4, letters: 4 })
  })

  it('reads the head before the page\'s first mark, the foot after its last, a note between', () => {
    const pg = page(
      { point: 'c1-1' },
      { glyphs: run('Journal of Things', 100, 760) },
      { point: 'bs1' }, { point: '0s' }, { glyphs: run('Body text', 100, 600), owner: 'u0' }, { point: '0e' }, { point: 'be1' },
      { glyphs: run('Funded by nobody', 100, 120, { size: 8 }) },
      { glyphs: run('page 2 of 9', 280, 60) },
    )
    const l = ledger([pg], [{ kind: 'para' }])
    expect(classAt(l, 1, at(pg, 'J'))).toBe('heads')
    expect(classAt(l, 1, at(pg, 'F'))).toBe('notes')
    expect(classAt(l, 1, at(pg, 'p'))).toBe('heads')
    expect(l.orphanLetters).toBe(0)
  })

  it('does not read a last line as the foot where it is no lower than the rest by the foot\'s gap', () => {
    const pg = page({ point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u0' }, { point: 'be1' }, { glyphs: run('Note one', 100, 130, { size: 8 }) }, { glyphs: run('Note two', 100, 122, { size: 8 }) })
    const l = ledger([pg], [{ kind: 'para' }])
    expect(classAt(l, 1, at(pg, 'N'))).toBe('notes')
    expect(classAt(l, 1, pg.page.glyphs.length - 1)).toBe('notes')
  })

  it('reads a page with no column body as a body: its lines are no head', () => {
    const pg = page({ glyphs: run('Stray words here', 100, 760) })
    const l = ledger([pg])
    expect(classAt(l, 1, 0)).toBe('orphan')
    expect(l.orphanLetters).toBe(14)
    expect(l.orphans).toEqual([{ page: 1, text: 'Stray words here', letters: 14, x0: 100, x1: 180, y: 760 }])
  })

  it('reads a float\'s text no unit owns, and an included PDF\'s anywhere, as figures', () => {
    const pg = page(
      { point: 'fs1' }, { glyphs: run('Outer loop', 100, 700) }, { point: 'fe1' },
      { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u0' }, { glyphs: run('Axis label', 100, 580, { form: true }) }, { point: 'be1' },
    )
    const l = ledger([pg], [{ kind: 'para' }])
    expect(classAt(l, 1, at(pg, 'O'))).toBe('figures')
    expect(classAt(l, 1, at(pg, 'A'))).toBe('figures')
  })

  it('reads a list between its name and the next unit, across pages, and the bibliography so', () => {
    const p1 = page(
      { point: 'bs1' }, { point: 'n1.contents.s' }, { glyphs: run('Contents', 100, 700), owner: 'n1' }, { point: 'n1.contents.e' },
      { glyphs: run('1 Introduction . . . 3', 100, 680) }, { point: 'be1' },
    )
    const p2 = page(
      { point: 'bs2' }, { glyphs: run('2 Methods . . . 5', 100, 700) },
      { point: 'h0s' }, { glyphs: run('Introduction', 100, 600), owner: 'u0' }, { point: 'h0e' },
      { point: 'n2.ref.s' }, { glyphs: run('References', 100, 400), owner: 'n2' }, { point: 'n2.ref.e' },
      { glyphs: run('A. Author. A title. 2020.', 100, 380) }, { point: 'be2' },
    )
    const l = ledger([p1, p2], [{ kind: 'heading' }])
    expect(classAt(l, 1, at(p1, 'I'))).toBe('contents')
    expect(classAt(l, 2, at(p2, 'M'))).toBe('contents')
    expect(classAt(l, 2, at(p2, 'A'))).toBe('references')
    expect(l.orphanLetters).toBe(0)
  })

  it('ends a zone at the next unit\'s start, so that text after it no list holds is an orphan', () => {
    const pg = page({ point: 'bs1' }, { point: 'n1.ref.e' }, { glyphs: run('Smith 2020', 100, 700) }, { point: '4s' }, { glyphs: run('Appendix text', 100, 600), owner: 'u4' }, { point: '4e' }, { glyphs: run('Theorem 1 (Main)', 100, 580) }, { point: 'be1' })
    const l = ledger([pg])
    expect(classAt(l, 1, at(pg, 'S'))).toBe('references')
    expect(classAt(l, 1, at(pg, 'T'))).toBe('orphan')
  })

  it('opens the references\' zone at a bibliography entry\'s start, a name before it or none: the text between entries is theirs, a unit after them ends it', () => {
    // (REVTeX's bibliography, which no babel name opens: two entries, the first's label its own (own.mjs's u<id>.l), both owned,
    // the style's own words after them; the next entry's alpha label no unit owns; then an appendix's paragraph and a line no
    // unit owns)
    const units = [{ kind: 'reference' }, { kind: 'reference' }, { kind: 'reference' }, { kind: 'para' }]
    const pg = page(
      { point: 'bs1' },
      { glyphs: run('[Ab17]', 60, 700), owner: 'u0.l' }, { point: '0s' }, { glyphs: run('Bee.', 100, 700), owner: 'u0' }, { point: '0e' },
      { point: '1s' }, { glyphs: run('Title.', 160, 700), owner: 'u1' }, { point: '1e' }, { glyphs: run('Online only', 100, 690) },
      { glyphs: run('[Cd18]', 60, 680) }, { point: '2s' }, { glyphs: run('Dee.', 100, 680), owner: 'u2' }, { point: '2e' },
      { point: '3s' }, { glyphs: run('Appendix text', 100, 600), owner: 'u3' }, { point: '3e' }, { glyphs: run('Wonder 1 (Main)', 100, 580) }, { point: 'be1' },
    )
    const l = ledger([pg], units)
    expect(['A', 'B', 'T', 'O', 'C', 'D', 'p', 'W'].map(ch => classAt(l, 1, at(pg, ch)))).toEqual(['references', 'references', 'references', 'references', 'references', 'references', 'body', 'orphan'])
    expect(l.counts.references.letters).toBe(['Ab', 'Bee', 'Title', 'Onlineonly', 'Cd', 'Dee'].join('').length)
  })

  it('ends the references\' zone with the bibliography\'s last entry\'s last line, not at the next unit\'s start (2610.42112v1 p16)', () => {
    // (a numbered bibliography, two entries, the style's words after the first between them; the last entry's closing stop after
    // its end mark on its line; then, before any unit starts, what TeX sets after the bibliography: an appendix's own title and
    // contents list (titletoc's \printcontents), each line no unit's; then the appendix's first heading)
    const units = [{ kind: 'heading' }, { kind: 'reference' }, { kind: 'reference' }]
    const p1 = page(
      { point: 'n1.ref.s' }, { glyphs: run('References', 100, 760), owner: 'n1' }, { point: 'n1.ref.e' },
      { glyphs: run('[1]', 60, 740) }, { point: '1s' }, { glyphs: run('Bee.', 100, 740), owner: 'u1' }, { point: '1e' }, { glyphs: run('Online only', 100, 730) },
      { glyphs: run('[2]', 60, 720) }, { point: '2s' }, { glyphs: run('Dee', 100, 720), owner: 'u2' }, { point: '2e' }, { glyphs: run('.', 120, 720) },
      // (the last entry's part TeX set past its mark on the line below, at the entry's leading: a DOI)
      { glyphs: run('doi 10.1/x', 100, 708) },
      // (an author's address after the bibliography, past the skip before it)
      { glyphs: run('Email address', 100, 680) },
    )
    const p2 = page(
      { glyphs: run('Appendix', 280, 760) },
      { glyphs: run('Appendix A: Scaling by Layer 16', 50, 740) },
      { glyphs: run('A-A Dense Sets . . . 16', 50, 728) },
      { point: '0s' }, { glyphs: run('Scaling', 100, 600), owner: 'u0' }, { point: '0e' },
    )
    const l = ledger([p1, p2], units)
    // (on the bibliography's page every line no unit holds is the zone's: the labels, the style's words, the last entry's stop)
    expect(l.lines.filter(x => x.page === 1).map(x => x.zone)).toEqual(['references', 'references', 'references', 'references', 'references', null])
    expect(classAt(l, 1, at(p1, 'E'))).toBe('orphan')
    expect(classAt(l, 1, at(p1, 'O'))).toBe('references')
    // (the title and an entry's line of no leaders orphans; a line that ends in leaders and a page number a list's, no list's name over it)
    expect([at(p2, 'p'), at(p2, 'S'), at(p2, 'D')].map(g => classAt(l, 2, g))).toEqual(['orphan', 'orphan', 'contents'])
    expect(l.lines.filter(x => x.page === 2).map(x => x.zone)).toEqual([null, null, null])
  })

  it('reads a list\'s line by the last word of its baseline: a page number set far right on a segment of its own (2610.37668v1 p15)', () => {
    // (a contents list no name heads: a section's line, its page number at the column's edge; a sub-entry's, leaders between; a
    // prose line no unit holds that ends in a number in its own words; a line whose number is no page number)
    const pg = page(
      { glyphs: run('Hexel Parameterization', 100, 700) }, { glyphs: run('15', 300, 700) }, { glyphs: run('right column text', 360, 700), owner: 'u0' },
      { glyphs: run('Appearance . . . . . . 15', 120, 688) },
      { glyphs: run('we trained it for 20', 100, 660) },
      { glyphs: run('Spatial Color?', 100, 640) }, { glyphs: run('22b', 400, 640) },
      // (an author line: an affiliation's mark raised before "and", the next author's mark far right on the line: no page number)
      { glyphs: run('1', 100, 623, { size: 7 }) }, { glyphs: run('Hank', 110, 620) }, { glyphs: run('2', 300, 623, { size: 7 }) },
    )
    const l = ledger([pg], [{ kind: 'para' }])
    expect(['H', 'A', 'w', 'S', 'k'].map(ch => classAt(l, 1, at(pg, ch)))).toEqual(['contents', 'contents', 'orphan', 'orphan', 'orphan'])
  })

  it("reads no line's number in the margin as a list's page number: a paper numbered by lineno, its numbers past the units' lines too", () => {
    // (each line numbered at one place in the right margin, a unit's paragraph's and an orphan's alike: the orphan's lines no list's)
    const pg = page(
      { glyphs: run('Owned prose line one', 100, 700), owner: 'u0' }, { glyphs: run('12', 480, 700) },
      { glyphs: run('Owned prose line two', 100, 688), owner: 'u0' }, { glyphs: run('13', 480, 688) },
      { glyphs: run('Owned prose', 100, 676), owner: 'u0' }, { glyphs: run('14', 480, 676) },
      { glyphs: run('orphan words here', 100, 664) }, { glyphs: run('15', 480, 664) },
      { glyphs: run('more of it', 100, 652) }, { glyphs: run('16', 480, 652) },
    )
    const l = ledger([pg], [{ kind: 'para' }])
    expect(['h', 'f'].map(ch => classAt(l, 1, at(pg, ch)))).toEqual(['orphan', 'orphan'])
    // (the same lines, no unit's line numbered: a list's, its page numbers at the column's edge)
    const list = page({ glyphs: run('orphan words here', 100, 664) }, { glyphs: run('15', 480, 664) }, { glyphs: run('more of it', 100, 652) }, { glyphs: run('16', 480, 652) })
    expect(['h', 'f'].map(ch => classAt(ledger([list], [{ kind: 'para' }]), 1, at(list, ch)))).toEqual(['contents', 'contents'])
  })

  it("reads a list's page number in the line's own column: the other column's number past the gutter is none (stream.mjs columnsAt)", () => {
    const two = page({ point: 'c2-1' }, { glyphs: run('left column words', 60, 700) }, { glyphs: run('12', 330, 700), owner: 'u1' })
    two.page.view = [0, 0, 612, 792]
    expect(classAt(ledger([two], [{ kind: 'para' }, { kind: 'cell' }]), 1, at(two, 'w'))).toBe('orphan')
    // (on a page of one column, the same number the line's)
    const one = page({ glyphs: run('left column words', 60, 700) }, { glyphs: run('12', 330, 700), owner: 'u1' })
    expect(classAt(ledger([one], [{ kind: 'para' }, { kind: 'cell' }]), 1, at(one, 'w'))).toBe('contents')
  })

  it("ends the bibliography's last entry at a list set right under it at its own leading: a line that ends as a list's entry is none of it", () => {
    const units = [{ kind: 'reference' }, { kind: 'reference' }]
    const pg = page(
      { point: '0s' }, { glyphs: run('Bee', 100, 760), owner: 'u0' }, { point: '0e' }, { point: '1s' }, { glyphs: run('Dee', 100, 748), owner: 'u1' }, { point: '1e' },
      { glyphs: run('Scaling by Layer . . . . 16', 100, 736) }, { glyphs: run('Dense Sets . . . . 17', 100, 724) },
    )
    const l = ledger([pg], units)
    expect([at(pg, 'L'), at(pg, 'n')].map(g => classAt(l, 1, g))).toEqual(['contents', 'contents'])
  })

  it('keeps a double-spaced bibliography\'s last entry\'s lines past its mark in its zone, by the bibliography\'s own pitch (2610.11256v1 p42)', () => {
    const units = [{ kind: 'reference' }, { kind: 'reference' }]
    const pg = page(
      { point: '0s' }, { glyphs: run('Bee and Cee', 100, 760), owner: 'u0' }, { glyphs: run('Journal', 120, 736), owner: 'u0' }, { point: '0e' },
      { point: '1s' }, { glyphs: run('Dee and Eff', 100, 712), owner: 'u1' }, { point: '1e' },
      // (the last entry's place TeX set past its mark, a line below at the style's double spacing; then an address past a skip)
      { glyphs: run('Dusseldorf Institute', 100, 688) },
      { glyphs: run('Mail address', 100, 640) },
    )
    const l = ledger([pg], units)
    expect([at(pg, 'I'), at(pg, 'M')].map(g => classAt(l, 1, g))).toEqual(['references', 'orphan'])
  })

  it('reads a formula\'s line, a code line and a line of no word as never translated', () => {
    const pg = page(
      { point: 'bs1' },
      { glyphs: [...run('softmax', 100, 700), ...run('x', 140, 700, { font: 'CMMI10' }), ...run('=', 150, 700), ...run('y', 160, 700, { font: 'CMMI10' })] },
      { glyphs: run('print hello world', 100, 680, { font: 'CMTT10' }) },
      { glyphs: run('(B.1)', 300, 660) },
      { glyphs: run('12 34 56', 100, 640) },
      { point: 'be1' },
    )
    const l = ledger([pg])
    expect(classAt(l, 1, at(pg, 's'))).toBe('math')
    expect(classAt(l, 1, at(pg, 'p'))).toBe('code')
    expect(classAt(l, 1, at(pg, 'B'))).toBe('symbols')
    expect(classAt(l, 1, at(pg, '1'))).toBe('symbols')
    expect(l.orphanLetters).toBe(0)
  })

  it('reads a line TeX set in a code region as code, by its points, whatever its face and wherever it stands (#63)', () => {
    // (a listing in roman type, as listings sets one by default, and terminal output: lines no face tells, which the region's
    // points do; prose beside them stays an orphan)
    const pg = page(
      { point: 'bs1' },
      { glyphs: run('echo stray processes done', 100, 700) },
      { glyphs: run('Agent Message here', 100, 680) },
      { point: 'q9' }, { glyphs: run('grep the log for errors', 100, 660) },
      { point: 'be1' },
    )
    const regions = [{ kind: 'code', from: 0, to: run('echo stray processes done', 0, 0).length }, { kind: 'code', from: pg.page.points!.find(x => x.name === 'q9')!.glyph, to: pg.page.glyphs.length }]
    const l = ledgerOf([{ ...pg.page, regions }], { glyphs: [pg.own] }, { units: null })
    const grep = pg.page.points!.find(x => x.name === 'q9')!.glyph
    expect([at(pg, 'e'), at(pg, 'A'), grep].map(g => classAt(l, 1, g))).toEqual(['code', 'orphan', 'code'])
    // (the same lines without the regions: orphans, translated)
    expect([at(pg, 'e'), grep].map(g => classAt(ledger([pg]), 1, g))).toEqual(['orphan', 'orphan'])
  })

  it('keeps prose with inline math an orphan, not a formula', () => {
    const pg = page({ point: 'bs1' }, { glyphs: [...run('Assume that there exist', 100, 700), ...run('x', 220, 700, { font: 'CMMI10' }), ...run('in the closed set', 230, 700)] }, { point: 'be1' })
    const l = ledger([pg])
    expect(classAt(l, 1, 0)).toBe('orphan')
  })

  it('cuts lines at an owned glyph, a baseline, a region and a gap', () => {
    const pg = page({ point: 'bs1' }, { glyphs: run('left', 100, 700) }, { glyphs: run('mid', 125, 700), owner: 'u0' }, { glyphs: run('right', 145, 700) }, { glyphs: run('far away', 400, 700) }, { glyphs: run('next line', 100, 688) }, { point: 'be1' })
    const l = ledger([pg], [{ kind: 'para' }])
    expect(l.orphans.map(o => o.text)).toEqual(['left', 'right', 'far away', 'next line'])
  })

  it('counts a ligature\'s letters each, one character or two (Devin on #467)', () => {
    const pg = page({ point: 'bs1' }, { glyphs: run('ﬁnd', 100, 700) }, { glyphs: run('ﬁ', 100, 680) }, { glyphs: [{ u: 'fi', x0: 100, x1: 105, y: 660, size: 10, font: 'CMR10' }, ...run('nd', 105, 660)] }, { point: 'be1' })
    const l = ledger([pg])
    expect(l.orphans.map(o => o.letters)).toEqual([4, 2, 4])
    expect(l.counts.orphan.letters).toBe(10)
    expect(classAt(l, 1, at(pg, 'n'))).toBe('orphan')
  })

  it("gives each line its paragraph, TeX's (the page's paragraph points), one going on from the page before", () => {
    const p1 = page({ point: 'bs1' }, { glyphs: run('First words here', 100, 700) }, { glyphs: run('more of them', 100, 688) }, { point: 'be1' })
    p1.page.paras = [{ name: 'q4', glyph: 0, box: 0 }, { name: 'q5', glyph: p1.page.glyphs.length - 3, box: 0 }]
    const p2 = page({ point: 'bs2' }, { glyphs: run('going on', 100, 700) }, { point: 'be2' })
    const l = ledger([p1, p2])
    expect(l.lines.map(x => [x.page, x.para])).toEqual([[1, 4], [1, 4], [2, 5]])
  })

  it('lists ORPHAN_LINES_MAX orphan lines at most, and counts them all', () => {
    const parts: Part[] = [{ point: 'bs1' }]
    for (let i = 0; i < ORPHAN_LINES_MAX + 5; i++) parts.push({ glyphs: run('word', 100, 700 - 12 * i) })
    parts.push({ point: 'be1' })
    const l = ledger([page(...parts)])
    expect(l.orphans).toHaveLength(ORPHAN_LINES_MAX)
    expect(l.orphanLetters).toBe(4 * (ORPHAN_LINES_MAX + 5))
  })

  it('summarizes as integers and gives the sweep\'s rows', () => {
    const pg = page({ point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u0' }, { glyphs: run('Lost words', 100, 580) }, { point: 'be1' })
    const l = ledger([pg], [{ kind: 'para' }])
    expect(ledgerSummary(l)).toEqual({ classes: ['body', 4, 4, 'orphan', 9, 9], letters: 13, orphanLetters: 9, orphans: [1, 9, 'Lost words'] })
    expect(orphanRows(l, { paper: '2610.00001v1' })).toEqual([{ inv: 'o', sev: 'violation', paper: '2610.00001v1', page: 1, unit: null, what: 'orphan text', text: 'Lost words', detail: { letters: 9, x0: 100, x1: 150, y: 580 } }])
  })
})

describe('pageInk with indices', () => {
  const FONTS: Record<string, unknown> = { f1: { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false } }
  const commonObjs = { get: (id: string) => FONTS[id] }
  const g = (unicode: string) => ({ unicode, width: 500, isSpace: false, fontChar: unicode, vmetric: null })
  const text = (x: number, ch: string): [number, unknown[]][] => [[OPS.beginText, []], [OPS.setFont, ['f1', 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, x, 700]]], [OPS.showText, [[g(ch)]]], [OPS.endText, []]]
  it('marks a glyph shown inside a form XObject, and none outside it', () => {
    const ops: [number, unknown[]][] = [...text(72, 'a'), [OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 0, 0]), Float32Array.from([0, 0, 600, 800])]], ...text(100, 'b'), [OPS.paintFormXObjectEnd, []], ...text(130, 'c')]
    const { glyphs } = pageInk(OPS, { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }, commonObjs, { rotate: 0, indices: true })
    expect(glyphs.map(x => [x.u, !!x.form])).toEqual([['a', false], ['b', true], ['c', false]])
  })
})
