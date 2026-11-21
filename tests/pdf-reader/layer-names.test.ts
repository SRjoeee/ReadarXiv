import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// Structural names in the layer (PDF-READER §19.11): a label is what the head macro set before the unit, never the unit's
// own opening placeholder however its translation reorders it; a theorem-like head and the names cleveref and \autoref
// generate are drawn in the target's names, their numbers the original's

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false, design: 'times' }
type St = typeof serif & { fill?: number }
const plain = (fill?: number): St => ({ ...serif, ...(fill === undefined ? {} : { fill }) })
const bold = (fill?: number): St => ({ ...serif, bold: true, ...(fill === undefined ? {} : { fill }) })
/** a text item's characters, each half its size wide, from x on baseline 100 */
const item = (text: string, x: number, n: number, st: St) => [...text].map((ch, k) => ({ ch, x0: x + 5 * k, x1: x + 5 * (k + 1), yb: 100, size: 10, item: n, ix: x, k, st }))
/** the page of `items` ([text, st] in turn, one space apart) and its line's rectangle */
const pageOf = (items: [string, St][]) => {
  let x = 10
  const chars = items.flatMap(([t, st], n) => { const c = item(t, x, n, st); x += 5 * [...t].length + 5; return c })
  return { page: chars, rect: [1, 10, 97.85, x, 106.83] }
}
const text = (s: string, tr = false) => ({ t: 'text', s, ...(tr ? { tr: true } : {}) })
const ph = (src: string) => ({ t: 'ph', src })
/** a drawn unit as rows.mjs unitOf makes it: its translated pieces, its source pieces by identity beside them */
const unitOf = (source: Record<string, unknown>[], translated: (number | string)[], kind = 'para') => {
  const src = source.map((p, k) => ({ ...p, k }))
  const u = { kind, src: plainSource({ pieces: src } as never), state: 'whole', pieces: translated.map(p => (typeof p === 'number' ? src[p] : text(p, true))) }
  Object.defineProperty(u, 'source', { value: src, enumerable: false })
  return u as never
}
const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const P = () => ({ ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 })
/** the extent across of the page's items `from` to `to` */
const span = (page: ReturnType<typeof pageOf>, from: number, to = from): [number, number] => {
  const cs = page.page.filter(c => c.item >= from && c.item <= to)
  return [Math.min(...cs.map(c => c.x0)), Math.max(...cs.map(c => c.x1))]
}
/** the unit read in a layout file of one line and no label, each placeholder's ink a segment (`rows`, by its k); its references
 *  renamed for `to` where `names`, then its tokens */
const read = (u: never, page: ReturnType<typeof pageOf>, rows: Record<number, [number, number]>, names: string | null = null, own: ReadonlyMap<string, string> | null = null) => {
  const lu = {
    lines: Float64Array.from([1, page.rect[1]!, page.rect[3]!, 100, 108, 98, 10, 0]), frames: Float64Array.from([1, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)], labels: new Float64Array(0),
    ph: new Map(Object.entries(rows).map(([k, [a, z]]) => [Number(k), { kind: 'ref', flags: 0, segs: Float64Array.from([1, a - 0.3, 100, z + 0.3, 108, 98]) }])),
  } as never
  const t = T.texRects(lu)
  const kOf = (u as unknown as { pieces: { k?: number }[] }).pieces.map(p => p.k ?? -1)
  const prep = L2.prepareUnit(u, t.rects as never, [page.page as never], new Map() as never, null, T.texParts(lu, kOf, { lines: t }) as never)
  if (names) L2.renameRefs(prep as never, names, resolveRules(BUILTIN_RULES, names).labels, own)
  const tokens = L2.tokensOf2(u, prep as never, 'zh', BASE as never, DESIGNS as never, P() as never, null, () => 0) as unknown as { s?: string; st: { color?: string } }[]
  return { prep: prep as unknown as { label?: { text: string } }, drawn: tokens.filter(x => typeof x.s === 'string' && /\S/.test(x.s)).map(x => [x.s, x.st.color ?? null]) }
}

describe('a label is what the head macro set, never a placeholder the unit\'s source opens with', () => {
  // 2610.18513v1 p19 u156: "\Cref{prop:lbCs} below shows how …", its translation "below" first and the placeholder second:
  // cleveref's "Theorem 5.1", the
  // source's own first piece, read as a theorem's label because the translation began with text, was kept as the original's ink at
  // the line's start and drawn again inside the translation
  const page = () => pageOf([['Theorem', plain(0)], ['5.1', plain(0x0000ff)], ['below', plain()], ['shows', plain()]])
  const u = () => unitOf([ph('\\Cref{prop:lbCs}'), text(' below shows')], ['\u4e0b\u6587', 0, '\u5c55\u793a'])
  it('takes none, and draws the reference once, inside the translation', () => {
    const pg = page()
    const { prep, drawn } = read(u(), pg, { 0: span(pg, 0, 1) })
    expect(prep.label).toBeUndefined()
    expect(drawn.filter(([s]) => s === '5.1')).toHaveLength(1)
  })
  it('takes no mark the source itself begins with for a class\'s (2610.21085v1 p30 u358, a cell\'s "(nats)")', () => {
    // read by the source's pieces, the cell begins with text; its "(" before its first word is the source's own, which read as a
    // class's mark left its line short of its bracket and its table's header group unfit
    const pg = pageOf([['(nats)', plain()]])
    const { prep } = read(unitOf([text(' (nats) ')], ['\uff08\u56fd\u6c11\u515a\uff09'], 'cell'), pg, {})
    expect(prep.label).toBeUndefined()
  })
  it('still takes a label the class set before a source that begins with text (a float\'s "Figure 3:")', () => {
    const pg = pageOf([['Figure', plain()], ['3:', plain()], ['Results', plain()], ['shown', plain()]])
    const { prep } = read(unitOf([text('Results shown')], ['\u7ed3\u679c']), pg, {})
    expect(prep.label?.text).toBe('Figure 3')
  })
})

describe('a generated reference in the target\'s names (renameRefs)', () => {
  it('cleveref\'s "Theorem A.17" drawn in zh\'s name, its number in its link\'s colour (2610.18513v1 p19 u156)', () => {
    const pg = pageOf([['as', plain()], ['shown', plain()], ['in', plain()], ['Theorem', plain(0)], ['A.17', plain(0x0000ff)], ['here', plain()]])
    const u = unitOf([text('as shown in '), ph('\\Cref{lem:nonlazy_mixing}'), text(' here')], ['\u5982', 1, '\u6240\u793a'])
    const before = read(u, pg, { 1: span(pg, 3, 4) })
    expect(before.drawn.map(([s]) => s)).toContain('Theorem')
    const { drawn } = read(u, pg, { 1: span(pg, 3, 4) }, 'zh')
    expect(drawn.map(([s]) => s)).not.toContain('Theorem')
    expect(drawn.map(([s]) => s).join('')).toContain('\u5b9a\u7406A.17')
    expect(drawn.find(([s]) => s === 'A.17')?.[1]).toBe('#0000ff')
  })
  it('a reference no package names whole in the target stays as its page shows it ("Section A.7" in zh)', () => {
    const pg = pageOf([['in', plain()], ['Section', plain(0)], ['A.7', plain(0x0000ff)], ['here', plain()]])
    const u = unitOf([text('in '), ph('\\Cref{sec:technical-results}'), text(' here')], ['\u5728', 1, '\u4e2d'])
    expect(read(u, pg, { 1: span(pg, 1, 2) }, 'zh').drawn.map(([s]) => s)).toContain('Section')
    // (the paper's name unit's translation where it has one: PDF-READER §19.14)
    const own = read(u, pg, { 1: span(pg, 1, 2) }, 'zh', new Map([['Section', '\u8282']])).drawn
    expect(own.map(([s]) => s)).not.toContain('Section')
    expect(own.map(([s]) => s).join('')).toContain('\u8282A.7')
    expect(own.find(([s]) => s === 'A.7')?.[1]).toBe('#0000ff')
  })
  it('a citation\'s note, its name and number, in the target\'s; the cited work\'s own text as it is ("[Ascolani et al., 2026, Lemma 1]")', () => {
    const pg = pageOf([['builds', plain()], ['on', plain()], ['[Ascolani', plain(0x0000ff)], ['et', plain(0x0000ff)], ['al.,', plain(0x0000ff)], ['2026,', plain(0x0000ff)], ['Lemma', plain(0)], ['1]', plain(0)]])
    const u = unitOf([text('builds on '), ph('\\cite[Lemma~1]{ascolani2026scalability}')], ['\u5efa\u7acb\u5728', 1, '\u4e4b\u4e0a'])
    const all = read(u, pg, { 1: span(pg, 2, 7) }, 'zh').drawn.map(([s]) => s).join('')
    expect(all).toContain('\u5f15\u74061]')
    expect(all).toContain('et')
    expect(all).not.toContain('Lemma')
  })
})

describe('which placeholders are generated references (GENERATED_REF)', () => {
  it('cleveref\'s every form that prints a counter\'s name, its ranges and plural names too (Devin on #468), and \\autoref; not \\ref', () => {
    for (const s of ['\\cref{a}', '\\Cref{a,b}', '\\crefrange{a}{b}', '\\Crefrange{a}{b}', '\\cpageref{a}', '\\cpagerefrange{a}{b}', '\\namecref{a}', '\\nameCrefs{a}', '\\lcnamecrefs{a}', '\\labelcref{a}', '\\autoref{a}', '\\Autoref{a}', '\\cref*{a}']) expect(L2.GENERATED_REF.test(s), s).toBe(true)
    for (const s of ['\\ref{a}', '\\eqref{a}', '\\crefname{x}{y}{z}', '\\pageref{a}']) expect(L2.GENERATED_REF.test(s), s).toBe(false)
  })
})

describe('a theorem-like head\'s label in the target (headLabelInTarget)', () => {
  it('"Definition 5.1 (" drawn in ctex\'s name, the head in its bold and the note\'s bracket in its own, the note after it with no space (2610.18513v1 p18 u150)', () => {
    const cs = [...item('Definition', 85, 0, bold()), ...item('5.1', 140, 1, bold()), ...item('(', 158, 2, plain())]
    const h = L2.headLabelInTarget(cs as never, 'zh')!
    expect(h.text).toBe('\u5b9a\u4e49 5.1 (')
    expect(h.parts).toEqual([{ text: '\u5b9a\u4e49 5.1', st: { bold: true, italic: false } }, { text: ' (', st: { bold: false, italic: false } }])
    expect(h.open).toBe(true)
  })
  it('none where the target\'s dictionary has no word for the name, or the label is no head', () => {
    expect(L2.headLabelInTarget(item('Assumption', 85, 0, bold()) as never, 'zh')).toBeNull()
    expect(L2.headLabelInTarget(item('1.', 85, 0, bold()) as never, 'zh')).toBeNull()
    // (a babel name is the names' own, never a theorem's head: amsthm's "Proof.", whose name group a label's drawing never hides;
    // 2610.18513v1 p38 u347, where the file located no name and its label box held "Proof.", was drawn over the original's)
    expect(L2.headLabelInTarget(item('Proof.', 85, 0, plain()) as never, 'zh')).toBeNull()
    // (a theorem's longer name is no babel name's: translator's "Proof Sketch", CodeRabbit on #468)
    expect(L2.headLabelInTarget([...item('Proof', 85, 0, bold()), ...item('Sketch', 115, 1, bold()), ...item('1.', 150, 2, bold())] as never, 'zh')?.text).toBe('\u8bc1\u660e\u63d0\u8981 1.')
    expect(L2.headLabelInTarget([...item('Theorem', 85, 0, bold()), ...item('2.', 130, 1, bold())] as never, 'ja')).toBeNull()
  })
  it('in the paper\'s name unit\'s translation where no dictionary holds the name (PDF-READER §19.14); a babel name never', () => {
    const own = new Map([['Assumption', '\u5047\u8bbe'], ['Theorem', '\u5b9a\u7406'], ['Proof', '\u8bc1\u660e']])
    expect(L2.headLabelInTarget([...item('Assumption', 85, 0, bold()), ...item('1.', 140, 1, bold())] as never, 'zh', own)?.text).toBe('\u5047\u8bbe 1.')
    expect(L2.headLabelInTarget([...item('Theorem', 85, 0, bold()), ...item('2.', 130, 1, bold())] as never, 'ja', own)?.parts).toEqual([{ text: '\u5b9a\u7406 2', st: { bold: true, italic: false } }, { text: '.', st: { bold: true, italic: false } }])
    expect(L2.headLabelInTarget(item('Proof.', 85, 0, plain()) as never, 'zh', own)).toBeNull()
  })
})

describe('a structural name\'s row (nameOfRow)', () => {
  const row = (state: string, ...s: string[]) => ({ kind: 'name', src: ' Section ', state, pieces: s.map(x => ({ t: 'text', s: x })) })
  it('its English and the target\'s word: the translation\'s text, an ideographic full stop the translator ends it with gone', () => {
    expect(L2.nameOfRow(row('whole', '\u8282'))).toEqual(['Section', '\u8282'])
    expect(L2.nameOfRow(row('whole', ' \u7ae0', '\u8282\u3002 '))).toEqual(['Section', '\u7ae0\u8282'])
    expect(L2.nameOfRow(row('partial', 'Abschnitt'))).toEqual(['Section', 'Abschnitt'])
  })
  it('none for another unit, a row of no translation, or an empty one', () => {
    expect(L2.nameOfRow({ ...row('whole', 'x'), kind: 'para' })).toBeNull()
    expect(L2.nameOfRow(row('none', 'Section'))).toBeNull()
    expect(L2.nameOfRow(row('lost'))).toBeNull()
    expect(L2.nameOfRow(row('whole', ' ', '\u3002'))).toBeNull()
    expect(L2.nameOfRow(null)).toBeNull()
  })
})
