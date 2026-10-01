import { describe, expect, it } from 'vitest'
import { atomWidth, type Face, citeStyleOf, facesOf, linesAt, piecesWidth, readSizeProbe, readWidthProbe, SIZE_PROBE, textWidth, WIDTH_PROBE, WIDTH_SAMPLE } from '@/pdf-reader/engine/typeset/density.mjs'
import { alignment, drifts } from '@/pdf-reader/engine/typeset/places.mjs'

// What the typesetting rule measures: a translation's width as TeX sets it, and where a compile put each unit against the
// original. Widths measured 2026-09-30 with the faces and xeCJK settings the reader uses (pdfLaTeX T1/T2A, XeLaTeX + xeCJK,
// 10 pt); the places on synthetic marks

const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps
/** a run of characters' advances in a face, a character it lacks NaN */
const adv = (face: Face, s: string) => [...s].reduce((t, c) => t + (face.w[c] ?? Number.NaN), 0)

describe('the faces and the font probe', () => {
  const times = facesOf({ rm: 'ptm' }), cm = facesOf({ rm: 'cmr' }), libertine = facesOf({ rm: 'LinuxLibertineT-TLF' })

  it('picks a face by family: Times-like, Computer Modern-like, Libertine, and Computer Modern without a probe', () => {
    expect([times.latin.space, cm.latin.space, adv(libertine.latin, 'M')]).toEqual([0.25, 0.3333, 0.839])
    expect(facesOf({ rm: 'ntxtlf' }).latin).toBe(times.latin)
    expect(facesOf({ rm: 'lmr' }).latin).toBe(cm.latin)
    expect(facesOf(null).latin).toBe(cm.latin)
  })
  it('takes the Cyrillic faces as the T2A design gives them', () => {
    expect([times.cyrillic.space, cm.cyrillic.space]).toEqual([0.25, 0.3333])
    expect(facesOf({ rm: 'txr' }).cyrillic).toBe(times.cyrillic)
  })
  it('reads the width probe, which sets the sample in the body face at the body size', () => {
    expect(readWidthProbe('x\nAXT-WIDTH 1071.0pt 12 241.0pt\ny')).toEqual({ wd: 1071, size: 12, columnwidth: 241 })
    expect(WIDTH_PROBE).toMatch(/\\normalfont\\normalsize/)
    expect(WIDTH_PROBE).toContain(WIDTH_SAMPLE.slice(0, 20))
  })
  it('scales the table to the paper\'s own face at its own size, a face 10 % narrower everywhere', () => {
    const sample = textWidth(WIDTH_SAMPLE, cm, { script: 'Latn' })
    const narrow = facesOf({ rm: 'cmr' }, { wd: 0.9 * 12 * sample, size: 12 })
    expect(adv(narrow.latin, 'a')).toBeCloseTo(0.9 * adv(cm.latin, 'a'), 6)
    expect(narrow.latin.space).toBeCloseTo(0.9 * cm.latin.space, 6)
    expect(adv(narrow.cyrillic, 'м')).toBeCloseTo(0.9 * adv(cm.cyrillic, 'м'), 6)
    expect(facesOf({ rm: 'cmr' }, null).latin).toBe(cm.latin)
  })
  it('reads the size probe: Computer Modern at 10.95 pt has 10 pt below it and nothing between', () => {
    const fixed = readSizeProbe('AXT-SIZE 0.9 1307.64119pt 1431.86595pt\nAXT-SIZE 0.93 1307.64119pt 1431.86595pt\nAXT-SIZE 0.96 1431.86595pt 1431.86595pt')
    expect(fixed?.map(p => p.size)).toEqual([0.9, 0.93, 0.96, 1])
    expect(fixed?.[0]?.h).toBeCloseTo(10 / 10.95, 4)
    expect(fixed?.[1]?.h).toBeCloseTo(10 / 10.95, 4)
    expect([fixed?.[2]?.h, fixed?.[3]?.h]).toEqual([1, 1])
  })
  it('reads a scalable face as wide as its size, smallest first, and no probe as none', () => {
    const scalable = readSizeProbe('AXT-SIZE 0.95 1118.9558pt 1177.84836pt\nAXT-SIZE 0.9 1060.06334pt 1177.84836pt')
    expect(scalable?.map(p => p.size)).toEqual([0.9, 0.95, 1])
    expect(scalable?.[0]?.h).toBeCloseTo(0.9, 4)
    expect(readSizeProbe('x\nAXT-WIDTH 1071.0pt 12 241.0pt')).toBeNull()
  })
  it('sets the size probe\'s sample in the body face at each size it asks', () => {
    expect(SIZE_PROBE).toMatch(/\\normalfont\\normalsize/)
    expect(SIZE_PROBE).toMatch(/\\fontsize\{\\fpeval\{0\.9\*/)
    expect(SIZE_PROBE).toMatch(/AXT-SIZE 0\.9 /)
  })
})

describe('the width of text', () => {
  const times = facesOf({ rm: 'ptm' }), cm = facesOf({ rm: 'cmr' })
  const w = (s: string, script: string, faces = times, cjk?: { scale: number; track: number }) => textWidth(s, faces, { script, ...(cjk ? { cjk } : {}) })

  it('sets Latin and Cyrillic at the face\'s advances and interword space', () => {
    expect(w('abc', 'Latn')).toBeCloseTo(adv(times.latin, 'abc'), 3)
    expect(w('a b', 'Latn', cm)).toBeCloseTo(adv(cm.latin, 'ab') + 0.3333, 3)
    expect(w('мир', 'Cyrl', cm)).toBeCloseTo(adv(cm.cyrillic, 'мир'), 3)
    expect(w('м р', 'Cyrl')).toBeCloseTo(adv(times.cyrillic, 'мр') + 0.25, 3)
  })
  it.each([
    ['Han, Latin and the glue between them', '中文ABC中文', 'Hans', 6.556],
    ['a space between Han characters dropped', '中文 中文', 'Hans', 4],
    ['an isolated fullwidth mark at an em', '中，中', 'Hans', 3],
    ['adjacent marks closed up', '中。）中', 'Hans', 3.5],
    ['brackets', '中（中）中', 'Hans', 5],
    ['digits beside Han', '中123中', 'Hans', 4],
    ['Hangul with its word spaces', '한국어 텍스트', 'Kore', 6.25],
    ['Korean with ASCII marks', '한국어, 텍스트.', 'Kore', 6.75],
  ])('sets CJK as xeCJK does: %s (%s)', (_, s, script, em) => {
    expect(near(w(s, script), em)).toBe(true)
  })
  it('scales and tracks the CJK face', () => {
    expect(w('中文中文', 'Hans', times, { scale: 0.95, track: 0.05 })).toBeCloseTo(4 * 0.95 + 3 * 0.05, 3)
  })
})

describe('atoms, pieces and lines', () => {
  const times = facesOf({ rm: 'ptm' }), cm = facesOf({ rm: 'cmr' })

  it('gives math roughly its content\'s width, and invisible commands none', () => {
    expect(atomWidth('$x$', times)).toBeGreaterThan(0.4)
    expect(atomWidth('$x$', times)).toBeLessThan(0.8)
    expect(atomWidth('$a + b = c$', times)).toBeGreaterThan(atomWidth('$x$', times) + 3)
    for (const src of ['\\label{eq:1}', '\\noindent', '\\midrule']) expect(atomWidth(src, times)).toBe(0)
    expect(atomWidth('~', cm)).toBeCloseTo(0.3333, 3)
  })
  it('sets citations by their style: numbers, author and year, superscripts', () => {
    expect(atomWidth('\\cite{a,b}', times, { citeStyle: 'numeric' })).toBeCloseTo(0.6 + 2 * 1.2, 3)
    expect(atomWidth('\\citep{a,b}', times, { citeStyle: 'author-year' })).toBeGreaterThan(12)
    expect(atomWidth('\\cite{a,b,c}', times, { citeStyle: 'super' })).toBeLessThan(2)
    expect(atomWidth('\\ref{sec:x}', times)).toBeGreaterThan(0.4)
    expect(atomWidth('\\ref{sec:x}', times)).toBeLessThan(1.5)
    expect(atomWidth('\\texttt{abcd}', times)).toBeCloseTo(4 * 0.525, 3)
  })
  it('reads the citation style from the preamble, or the bibliography\'s items', () => {
    expect(citeStyleOf('\\usepackage[numbers]{natbib}')).toBe('numeric')
    expect(citeStyleOf('\\usepackage{natbib}\\bibliographystyle{plainnat}')).toBe('author-year')
    expect(citeStyleOf('\\bibliographystyle{IEEEtran}')).toBe('numeric')
    expect(citeStyleOf('\\RequirePackage[super,comma]{natbib}')).toBe('super')
    expect(citeStyleOf('\\documentclass[fleqn,10pt]{wlscirep}')).toBe('super')
    expect(citeStyleOf('\\usepackage{natbib}', '\\bibitem[{Smith et~al.(2020)}]{smith}')).toBe('author-year')
    expect(citeStyleOf('\\usepackage{natbib}', '\\bibitem{smith}')).toBe('numeric')
    expect(citeStyleOf('\\usepackage[style=authoryear]{biblatex}')).toBe('author-year')
    expect(citeStyleOf('\\usepackage[style=numeric-comp]{biblatex}')).toBe('numeric')
  })
  it('sums a unit\'s pieces, a nested note as its mark alone', () => {
    const pieces = [{ t: 'text', s: 'ab ' }, { t: 'ph', src: '$x$' }, { t: 'open', src: '\\textbf{' }, { t: 'text', s: 'c' }, { t: 'close', src: '}' }, { t: 'nested', pre: '\\footnote{', post: '}' }]
    const sum = textWidth('ab ', times, { script: 'Latn' }) + atomWidth('$x$', times) + textWidth('c', times, { script: 'Latn' }) + 0.3
    expect(near(piecesWidth(pieces, times, { script: 'Latn' }), sum, 0.02)).toBe(true)
  })
  it('gives at least one line, and half a last line on average', () => {
    expect(linesAt(0.3, 24)).toBe(1)
    expect(linesAt(48, 24)).toBeCloseTo(2.5, 9)
  })
})

describe('places against the original', () => {
  type Place = { page: number; x: number; y: number }
  // two-column pages 792 pt high whose text runs from 700 pt down to 100 pt; a unit from (page, x, y) to (page, x, y)
  const marks = (pages: number, list: [number, Place, Place][]) => ({ pages, width: 612, height: 792, columns: Array(pages).fill(2), marks: new Map(list.flatMap(([i, s, e]) => [[`${i}s`, s], [`${i}e`, e]] as [string, Place][])) })
  const p = (page: number, x: number, y: number) => ({ page, x, y })
  const orig = marks(2, [[0, p(0, 60, 700), p(0, 60, 600)], [1, p(0, 60, 580), p(0, 60, 100)], [2, p(0, 320, 700), p(0, 320, 100)], [3, p(1, 60, 700), p(1, 60, 650)], [4, p(1, 320, 400), p(1, 320, 100)]])
  // unit 0 60 pt lower, unit 1 at the right column's top instead of low in the left, unit 2 halfway down the left,
  // unit 3 a page late, unit 4 missing
  const tr = marks(3, [[0, p(0, 60, 640), p(0, 60, 550)], [1, p(0, 320, 700), p(0, 320, 340)], [2, p(0, 60, 400), p(0, 60, 100)], [3, p(2, 60, 700), p(2, 60, 640)]])

  it('finds a layout against itself level, every block its size', () => {
    const same = alignment(orig, orig)
    expect([same.pages, same.drift.median, same.drift.within, same.size.median, same.matched, same.missing]).toEqual([0, 0, 1, 1, 5, 0])
  })
  it('counts the pages a translation gained and the units it lacks', () => {
    const a = alignment(orig, tr)
    expect([a.pages, a.matched, a.missing]).toEqual([1, 4, 1])
  })
  it('measures drift in columns of the text block, in reading order across columns and pages', () => {
    const v = alignment(orig, tr).drift.values
    expect(v[0]).toBeCloseTo(0.1, 6)
    expect(v[1]).toBeCloseTo(1 - (700 - 580) / 600, 6)
    expect(v[2]).toBeCloseTo(0.5, 6)
    expect(v[3]).toBeCloseTo(2, 6)
  })
  it('measures each block\'s height over its original\'s, and the shares within a tenth of a column and 15 %', () => {
    const a = alignment(orig, tr)
    expect(a.size.values.slice(0, 4).map((x: number) => Number(x.toFixed(6)))).toEqual([0.9, 0.75, 0.5, 1.2])
    expect([a.drift.within, a.size.within]).toEqual([0.25, 0.25])
  })
  it('gives each unit\'s signed drift in points of the original\'s text block, a unit the compile lacks left out', () => {
    const mk = (list: [string, Place][]) => ({ pages: 2, width: 600, height: 800, columns: [2, 2], marks: new Map(list) })
    const om = mk([['0s', p(0, 50, 700)], ['1s', p(0, 50, 100)], ['2s', p(0, 350, 400)], ['9s', p(0, 350, 700)]])
    const tm = mk([['0s', p(0, 50, 700)], ['1s', p(0, 350, 100)], ['2s', p(0, 350, 550)]])
    const d = drifts(om, tm), block = ((700 - 100) * 72.27) / 72
    expect(d.get(0)).toBeCloseTo(0, 9)
    expect(d.get(1)).toBeCloseTo(block, 6)
    expect(d.get(2)).toBeCloseTo(-block / 4, 6)
    expect(d.has(9)).toBe(false)
  })
  it('reads a start above the original\'s highest mark on its page as ahead, not level (Korean 2608.21180\'s abstract)', () => {
    const mk = (list: [string, Place][]) => ({ pages: 2, width: 600, height: 800, columns: [1, 1], marks: new Map(list) })
    const om = mk([['3s', p(0, 50, 480)], ['3e', p(0, 50, 200)]])
    const tm = mk([['3s', p(0, 50, 536)], ['3e', p(0, 50, 250)]])
    expect(drifts(om, tm).get(3)).toBeCloseTo((-56 * 72.27) / 72, 6)
  })
  it('reads both documents on the original\'s columns, page by page: a two-column body and a one-column appendix (Chinese 2608.02163)', () => {
    // the original: the body over pages 0–1 in two columns, the appendix over pages 2–5 in one; the translation a page
    // shorter. Read with one flag per document — the original's a fifth of its starts in the right half, the
    // translation's past it — every place after the body differed by the pages before it, 18.75 columns
    const unit = (i: number, s: Place): [string, Place][] => [[`${i}s`, s], [`${i}e`, { ...s, y: s.y - 50 }]]
    const om = { pages: 6, width: 612, height: 792, columns: [2, 2, 1, 1, 1, 1], marks: new Map([...unit(0, p(0, 60, 700)), ...unit(1, p(1, 330, 400)), ...unit(2, p(2, 60, 700)), ...unit(3, p(4, 60, 100)), ...unit(4, p(5, 60, 700))]) }
    const tm = { pages: 5, width: 612, height: 792, columns: [2, 2, 1, 1, 1], marks: new Map([...unit(0, p(0, 60, 700)), ...unit(1, p(1, 330, 400)), ...unit(2, p(2, 60, 700)), ...unit(3, p(3, 60, 100)), ...unit(4, p(4, 60, 400))]) }
    const a = alignment(om, tm)
    expect(a.pages).toBe(-1)
    expect(a.drift.values.slice(0, 3)).toEqual([0, 0, 0])
    // a unit a page early in the appendix is a column early, a page there being one column (no page here has a block
    // tall enough to measure in: each is the page's whole height)
    expect(a.drift.values[3]).toBeCloseTo(1, 6)
    expect(a.drift.values[4]).toBeCloseTo(1 - 300 / 792, 6)
    expect(drifts(om, tm).get(1)).toBeCloseTo(0, 9)
  })
  it('reads a unit on its original\'s page and height as level, whatever its own compile set the page in (aastex 2608.12606)', () => {
    // the translation's two-column body ends a page early, its one-column appendix starting there mid-page: on the
    // original's page 3, a unit at the original's height is where a reader looking at both pages finds it
    const om = { pages: 4, width: 612, height: 792, columns: [2, 2, 2, 1], marks: new Map<string, Place>([['0s', p(0, 60, 700)], ['1s', p(3, 60, 600)], ['2s', p(3, 60, 100)]]) }
    const tm = { pages: 4, width: 612, height: 792, columns: [2, 2, 1, 1], marks: new Map<string, Place>([['0s', p(0, 60, 700)], ['1s', p(3, 60, 600)], ['2s', p(3, 60, 100)]]) }
    expect(alignment(om, tm).drift.values).toEqual([0, 0, 0])
    // a page past the original's last is set as its last
    const longer = { ...tm, pages: 5, marks: new Map([...tm.marks, ['2s', p(4, 60, 100)]]) }
    expect(alignment(om, longer).drift.values[2]).toBeCloseTo(1, 6)
  })
  it('reads the right half of a one-column page as the same column: a run-in label, a centred caption', () => {
    const om = { pages: 1, width: 612, height: 792, columns: [1], marks: new Map<string, Place>([['0s', p(0, 60, 700)], ['1s', p(0, 400, 400)], ['2s', p(0, 60, 100)]]) }
    expect(drifts(om, { ...om, marks: new Map([...om.marks, ['1s', p(0, 60, 400)]]) }).get(1)).toBeCloseTo(0, 9)
  })
})
