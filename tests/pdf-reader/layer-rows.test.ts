import { describe, expect, it } from 'vitest'
import { type BundleUnit, bundleUnitsOf, type ReadBundle, UNIT_FLAG_BITS } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import {
  batchesOf, layerRows, type Row, rowOf, type RowSourceUnit, runRows, sourceUnitsOf, toTranslate, type TranslateResult, unitOf,
} from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { PIECES_MAX as NET_PIECES_MAX } from '@/pdf-reader/engine/layer/net.mjs'
import { kOfSource, trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { PIECES_MAX } from '@/pdf-reader/engine/layout/json.mjs'
import { type BatchReport, type Compiled, keptFor, openPaper, runLive } from '@/pdf-reader/engine/live.mjs'
import { batchOf, FIRST_BATCH, NEXT_BATCH, plainSource, translateUnits } from '@/pdf-reader/engine/mt.mjs'

// The rows (the layer-only plan §4.1, A2's E6): one unit of one language as the engine's translateUnits gave it, with each
// piece the translated text or the index of the bundle unit's source piece; v0's unit made of a row again; the rows a
// language's results so far allow, a table's group decided; the ids a language translates and its batches; the whole
// loop for the extension. Synthetic bundles only: the five papers' units are checked by spikes/rows-check.mjs

type Bundle = Pick<ReadBundle, 'units'>
const bundleOf = (units: (BundleUnit | null)[]): Bundle => ({ units })
const enc = (s: string) => new TextEncoder().encode(s)

const T = UNIT_FLAG_BITS.TITLE, KEPT = UNIT_FLAG_BITS.KEPT
/** a paragraph of every kind of piece: a text, a group's open and close, a placeholder twice, a forced break, an accent
 *  as written, a nested footnote (unit 1), a citation */
const PARA: BundleUnit = ['para', 0, null, null, null, [
  [0, 'Text with '], [2, 1, '\\textbf{'], [0, 'bold'], [3, 1, '}'], [1, '$x$'], [0, ' and '], [1, '$x$'], [1, '\\\\'],
  [0, ' caf\u00c3\u00a9', " caf\\'e"], [4, '\\footnote{', 1, '}'], [1, '\\cite{a}'], [0, ' end.'],
]]
const BASE: BundleUnit[] = [
  ['heading', T, null, null, null, [[0, 'A Title']]],
  ['footnote', 0, null, null, null, [[0, 'A note.']]],
  PARA,
  ['author', 0, null, null, null, [[0, 'Ada Lovelace']]],
  ['heading', UNIT_FLAG_BITS.FRONT | UNIT_FLAG_BITS.BRACKETED, 1, null, { lead: 'a' }, [[0, 'Intro']]],
]
const base = () => bundleOf(BASE)

const tr = (s: string) => ({ t: 'text', tr: true, s })
/** a result as translateUnits gives it: a string a translated text, a number the unit's own source piece (the object) */
function res(b: Bundle, id: number, parts: (string | number)[], more: Partial<TranslateResult> = {}): TranslateResult {
  const src = sourceUnitsOf(b)[id] as RowSourceUnit
  return { pieces: parts.map(p => (typeof p === 'string' ? tr(p) : src.pieces[p])), state: 'whole', by: 'B', ...more } as TranslateResult
}
/** the paragraph translated: every piece in its place */
const PARA_RES = ['Tr text ', 1, 'tr bold', 3, 4, ' tr and ', 6, 7, ' tr cafe', 9, 10, ' tr end.']

describe('the bundle\'s source units', () => {
  it('are rebuilt once per bundle: the same objects on every call, each piece carrying its index k', () => {
    const b = base(), units = sourceUnitsOf(b)
    expect(sourceUnitsOf(b)).toBe(units)
    expect(sourceUnitsOf(base())).not.toBe(units)
    for (const [k, p] of (units[2] as RowSourceUnit).pieces.entries()) expect((p as { k: number }).k).toBe(k)
  })
  it('are the paper\'s units: bundleUnitsOf over them gives the bundle\'s units back, flags, edges, cell and nested unit included', () => {
    const units: BundleUnit[] = [
      ...BASE,
      ['cell', KEPT, null, { table: 0, row: 0, col: 0, span: 1, head: true }, null, [[0, 'Model']]],
      ['cell', 0, null, { table: 0, row: 1, col: 0, span: 2, head: false }, { trail: 'x', inner: 'y z' }, [[2, 58, '\\multirow{2}{*}{'], [2, 59, '\\shortstack{'], [0, 'ASR']]],
      ['cell', 0, null, { table: 0, row: 2, col: 0, span: 1, head: false }, null, [[0, 'down'], [3, 59, '}'], [3, 58, '}']]],
    ]
    const units_ = sourceUnitsOf(bundleOf(units)) as RowSourceUnit[]
    expect(units_[2]?.pieces.find(p => (p as { t: string }).t === 'nested')).toMatchObject({ t: 'nested', unit: units_[1] })
    const paper = { units: units_, kept: new Set(units_.filter((_, i) => (units[i] as BundleUnit)[1] & KEPT)) }
    expect(bundleUnitsOf(paper)).toEqual(units)
  })
  it('keep a dropped unit null at its index, and a unit nesting a dropped one is dropped too; a malformed unit never throws', () => {
    const nested: BundleUnit = ['para', 0, null, null, null, [[4, '\\footnote{', 1, '}']]]
    const units = sourceUnitsOf(bundleOf([BASE[0] as BundleUnit, null, nested, 'x' as unknown as BundleUnit, ['para', 0, null, null, null, [[9, 'x']] as never]]))
    expect(units.map(u => u === null)).toEqual([false, true, true, true, true])
    expect(sourceUnitsOf({} as Bundle)).toEqual([])
    expect(sourceUnitsOf(null as unknown as Bundle)).toEqual([])
  })
})

describe('rowOf', () => {
  it('writes each translated text as its string and every other piece as its source piece\'s index', () => {
    const b = base()
    const row = rowOf(b, 2, res(b, 2, PARA_RES, { sentences: { src: [3], tr: [4] } }))
    expect(row).toEqual([2, ['Tr text ', 1, 'tr bold', 3, 4, ' tr and ', 6, 7, ' tr cafe', 9, 10, ' tr end.'], 'whole', 'B', { src: [3], tr: [4] }])
    expect(row).toHaveLength(5)
  })
  it('tells a placeholder from its twin by the object: $x$ twice, in the order the translation has them', () => {
    const b = base()
    expect(rowOf(b, 2, res(b, 2, [6, 'then', 4]))[1]).toEqual([6, 'then', 4])
  })
  it('copies the sentences, and gives none where the result has none', () => {
    const b = base(), s = { src: [3], tr: [4] }, r = res(b, 2, PARA_RES, { sentences: s }), row = rowOf(b, 2, r)
    expect(row[4]).toEqual(s)
    expect(row[4]).not.toBe(s)
    expect(rowOf(b, 2, res(b, 2, PARA_RES))[4]).toBeNull()
    expect(rowOf(b, 2, res(b, 2, PARA_RES, { sentences: { src: 'x', tr: [1] } as never }))[4]).toBeNull()
  })
  it('writes the white space the wire cut off a unit\'s ends (not the source\'s objects, not translated) as the strings they are', async () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, '\n  Alpha beta gamma '], [1, '$x$'], [0, ' delta epsilon \n']]]])
    const unit = sourceUnitsOf(b)[0] as RowSourceUnit
    const { results } = await translateUnits([unit], async texts => texts.map(t => ({ text: t.replace(/(?<![@a-z])[A-Za-z]{2,}/g, 'word'), by: 'B' })))
    const r = results.get(unit) as TranslateResult
    expect(r.pieces?.[0]).toEqual({ t: 'text', s: '\n  ' })
    const row = rowOf(b, 0, r)
    expect(row[1]).toEqual(['\n  ', 'word word word ', 1, ' word word', ' \n'])
    const u = unitOf(b, row) as unknown as { pieces: never[] }
    expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(trPiecesOf(r.pieces as never[], kOfSource(unit.pieces)))
  })
  /** §4.1's bound on a string piece, as the web's reader holds it: at most 16,000 code units, no C0 control but \n and \t,
   *  none of U+007F to U+009F, none of the bidirectional controls U+202A to U+202E and U+2066 to U+2069 */
  const inBound = (s: string) => s.length <= 16000 && !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(s.replace(/[\n\t]/g, ''))
  /** a result's TrPiece as a row's pieces give them: a text's carriage returns written as the line feeds a row holds */
  const crToLf = (pieces: ReturnType<typeof trPiecesOf>) => (pieces ?? []).map(p => (p[0] === 0 ? [0, p[1].replace(/\r\n?/g, '\n')] : p))
  const words = (t: string) => t.replace(/(?<![@a-z])[A-Za-z]{2,}/g, 'word')

  it('writes the white space of a CRLF source as line feeds, on the markers path: a row holds no carriage return', async () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, '\r\n  Alpha beta\r\ngamma '], [1, '$x$'], [0, ' delta epsilon\r\n\r\n']]]])
    const unit = sourceUnitsOf(b)[0] as RowSourceUnit
    const { results } = await translateUnits([unit], async texts => texts.map(t => ({ text: words(t), by: 'B' })))
    const r = results.get(unit) as TranslateResult
    // (the wire cut the ends off; the engine puts them back as pieces of their own, raw)
    expect(((r.pieces as { s: string }[])[0] as { s: string }).s).toBe('\r\n  ')
    const row = rowOf(b, 0, r)
    expect(row[1].filter(p => typeof p === 'string').every(p => inBound(p as string))).toBe(true)
    expect(row[1][0]).toBe('\n  ')
    expect(row[1].at(-1)).toBe('\n\n')
    // the hybrid's pieces are the result's up to the carriage returns
    const u = unitOf(b, row) as unknown as { pieces: never[] }
    expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(crToLf(trPiecesOf(r.pieces as never[], kOfSource(unit.pieces))))
  })
  it('writes the white space of a CRLF source as line feeds, on the runs path too: the translated string carries the unit\'s own', async () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, '\r\nAlpha beta '], [1, '$x$'], [0, ' delta\r\n']]]])
    const unit = sourceUnitsOf(b)[0] as RowSourceUnit
    const { results } = await translateUnits([unit], async texts => texts.map(() => ({ text: 'ONLY RUNS', by: 'B' })), 'runs')
    const r = results.get(unit) as TranslateResult
    expect(((r.pieces as { s: string }[])[0] as { s: string }).s).toBe('\r\nONLY RUNS ')
    const row = rowOf(b, 0, r)
    expect(row[1]).toEqual(['\nONLY RUNS ', 1, ' ONLY RUNS\n'])
    const u = unitOf(b, row) as unknown as { pieces: never[] }
    expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(crToLf(trPiecesOf(r.pieces as never[], kOfSource(unit.pieces))))
  })
  it('writes only strings that pass §4.1\'s bound, whatever control a text holds: a property over every C0, DEL and C1 code and the bidirectional controls', () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, 'a'], [1, '$x$'], [0, 'b']]]])
    const codes = [...Array.from({ length: 0xa0 }, (_, i) => i), 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]
    for (const c of codes) {
      const ch = String.fromCharCode(c)
      for (const tr of [true, false]) {
        const row = rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', ...(tr ? { tr: true } : {}), s: `x${ch}y${ch}${ch}` }, { t: 'text', tr, s: `\r${ch}\r\n${ch}` }] })
        expect(row[2]).toBe('whole')
        for (const p of row[1]) expect(typeof p === 'string' && inBound(p), `U+${c.toString(16)} tr=${tr}: ${JSON.stringify(p)}`).toBe(true)
        // (a tab and a line feed are kept, a carriage return is a line feed, any other control a space)
        if (c === 9 || c === 10) expect(row[1][0]).toBe(`x${ch}y${ch}${ch}`)
        if (c === 13) expect(row[1][0]).toBe('x\ny\n\n')
        if (c === 11 || c === 12 || c === 0 || c === 0x7f || (tr && c === 0x85)) expect(row[1][0]).toBe('x y  ')
      }
    }
  })
  it('writes a white-space piece the engine put back as the Unicode its source bytes hold: a unit ending in a letter whose UTF-8 ends in 0xA0 round-trips exactly', async () => {
    // "caf" and a-grave, as the source holds its bytes (C3 A0): the engine reads the lone A0 as the white space it cuts off
    const b = bundleOf([['para', 0, null, null, null, [[0, 'caf\u00c3\u00a0']]]])
    const unit = sourceUnitsOf(b)[0] as RowSourceUnit
    const { results } = await translateUnits([unit], async () => [{ text: 'kaffee', by: 'B' }])
    const r = results.get(unit) as TranslateResult
    expect(r.pieces?.map(p => (p as { s: string }).s)).toEqual(['kaffee', '\u00a0'])
    const row = rowOf(b, 0, r)
    expect(row[1]).toEqual(['kaffee', '\ufffd'])
    const u = unitOf(b, row) as unknown as { pieces: never[] }
    expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(trPiecesOf(r.pieces as never[], kOfSource(unit.pieces)))
  })
  it('writes a none row, no throw, where a string it would write is past 16,000 code units (§4.1\'s bound): at the limit it is a row', () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, 'a'], [1, '$x$'], [0, 'b']]]])
    const at = rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: 'x'.repeat(16000) }] })
    expect(at[2]).toBe('whole')
    expect(at[1][0]).toHaveLength(16000)
    const long = [{ t: 'text', tr: true, s: 'x'.repeat(16001) }, { t: 'text', s: ' '.repeat(16001) }, { t: 'text', tr: true, s: `${'y'.repeat(15999)}\u{1f600}` }]
    for (const piece of long) expect(rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: 'short' }, piece], by: 'B', sentences: { src: [1], tr: [2] } })).toEqual([0, [], 'none', null, null])
    // (counted after the white space is written as a row writes it: a carriage return pair is one code unit fewer)
    expect(rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: '\r\n'.repeat(8000) }] })[2]).toBe('whole')
    expect(rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: '\r\n'.repeat(8001) }] })[2]).toBe('whole')
    expect(rowOf(b, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: '\n'.repeat(16001) }] })[2]).toBe('none')
  })
  it('writes a text the runs path left untouched (the unit\'s own source object) as its index', async () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, 'Alpha beta '], [1, '$x$'], [0, '1'], [1, '\\ref{a}']]]])
    const unit = sourceUnitsOf(b)[0] as RowSourceUnit
    // (the markers path loses the marker, so the unit goes as its runs: only the text with letters is sent)
    const { results } = await translateUnits([unit], async texts => texts.map(() => ({ text: 'ONLY RUNS', by: 'B' })), 'runs')
    const r = results.get(unit) as TranslateResult
    expect(r.state).toBe('whole')
    const row = rowOf(b, 0, r)
    expect(row[1]).toEqual([expect.stringContaining('ONLY RUNS'), 1, 2, 3])
    expect(row[2]).toBe('whole')
  })
  it('writes a partial result with its pieces, and none, lost and a lost result\'s shown pieces with none', () => {
    const b = base()
    expect(rowOf(b, 2, res(b, 2, PARA_RES, { state: 'partial' }))[2]).toBe('partial')
    expect(rowOf(b, 0, { state: 'none' })).toEqual([0, [], 'none', null, null])
    expect(rowOf(b, 0, { state: 'lost' })).toEqual([0, [], 'lost', null, null])
    expect(rowOf(b, 0, res(b, 0, ['x'], { state: 'lost' }))).toEqual([0, [], 'lost', 'B', null])
  })
  it('makes a none row, no throw, of a piece with no source piece in its unit', () => {
    const b = base()
    expect(rowOf(b, 2, { pieces: [tr('x'), { t: 'ph', src: '\\nowhere' }], state: 'whole', by: 'B' })).toEqual([2, [], 'none', null, null])
    // (another unit's piece is no piece of this one)
    const two = bundleOf([['para', 0, null, null, null, [[1, '$a$']]], ['para', 0, null, null, null, [[1, '$b$']]]])
    const other = (sourceUnitsOf(two)[1] as RowSourceUnit).pieces[0]
    expect(rowOf(two, 0, { pieces: [other], state: 'whole' } as TranslateResult)).toEqual([0, [], 'none', null, null])
    expect(rowOf(two, 1, { pieces: [other], state: 'whole' } as TranslateResult)).toEqual([1, [0], 'whole', null, null])
  })
  it('never throws on a hostile result, a dropped unit or an id the bundle has not: a none row', () => {
    const b = bundleOf([BASE[0] as BundleUnit, null])
    const hostile = [null, undefined, 3, 'x', {}, { state: 'whole' }, { state: 'whole', pieces: 5 }, { state: 'whole', pieces: [null] }, { state: 'whole', pieces: [3] }, { state: 'whole', pieces: [{ t: 'text', tr: true, s: 7 }] }, { state: 'kept', pieces: [] }]
    for (const r of hostile) expect(rowOf(b, 0, r as never)).toEqual([0, [], 'none', null, null])
    for (const id of [1, 2, -1, 0.5, Number.NaN, '0' as never]) expect(rowOf(b, id, { state: 'whole', pieces: [tr('x')] })).toEqual([id, [], 'none', null, null])
    expect(() => rowOf(null as never, 0, { state: 'none' })).not.toThrow()
  })
})

describe('unitOf', () => {
  /** every piece shape through the pipeline's own functions: the translation, its row, the unit v0 reads */
  async function roundTrip(format: 'markers' | 'tags' | 'runs') {
    const b = base(), unit = sourceUnitsOf(b)[2] as RowSourceUnit
    const send = async (texts: string[]) => texts.map(t => ({ text: t.replace(/(?<![@a-z</])\b[A-Za-z]{3,}\b(?![^<]*>)/g, 'word'), by: 'B' }))
    const { results } = await translateUnits([unit], send, format)
    const result = results.get(unit) as TranslateResult
    return { b, unit, result, row: rowOf(b, 2, result) }
  }
  for (const format of ['markers', 'tags', 'runs'] as const) {
    it(`gives v0 the unit whose pieces' k give the hybrid's pieces as the result's do (${format})`, async () => {
      const { b, unit, result, row } = await roundTrip(format)
      expect(row[2]).toBe('whole')
      const u = unitOf(b, row) as { pieces: { k: number }[] }
      expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(trPiecesOf(result.pieces as never[], kOfSource(unit.pieces)))
      expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).not.toBeNull()
    })
  }
  it('rebuilds the pieces as the source\'s own objects (carrying their k) and the translated texts as translated text pieces', () => {
    const b = base(), src = sourceUnitsOf(b)[2] as RowSourceUnit
    const u = unitOf(b, rowOf(b, 2, res(b, 2, PARA_RES))) as { pieces: { t: string; tr?: boolean; s?: string; k?: number }[] }
    expect(u.pieces).toHaveLength(12)
    expect(u.pieces[0]).toEqual({ t: 'text', tr: true, s: 'Tr text ' })
    for (const k of [1, 3, 4, 6, 7, 9, 10]) { expect(u.pieces[PARA_RES.indexOf(k)]).toBe(src.pieces[k]); expect(u.pieces[PARA_RES.indexOf(k)]?.k).toBe(k) }
    // (the twin is the other object: $x$ at 4 and at 6)
    expect(u.pieces[4]).not.toBe(u.pieces[6])
  })
  it('reads the hybrid\'s pieces of a break, a group\'s open with its style and a nested footnote as it does of the result', () => {
    const b = base(), src = sourceUnitsOf(b)[2] as RowSourceUnit, r = res(b, 2, PARA_RES)
    const u = unitOf(b, rowOf(b, 2, r)) as { pieces: unknown[] }
    const got = trPiecesOf(u.pieces, p => (p as { k: number }).k)
    expect(got).toEqual(trPiecesOf(r.pieces as never[], kOfSource(src.pieces)))
    expect(got).toContainEqual([2, 1, 1]) // \textbf{ open: BOLD
    expect(got).toContainEqual([3, 3])
    expect(got).toContainEqual([0, '\n']) // \\ a line feed
    expect(got).toContainEqual([1, 9]) // the footnote
  })
  it('keeps an open that no unit of its own closes (\\multirow{ closed by the next cell) a piece like any other', () => {
    const b = bundleOf([
      ['cell', 0, null, { table: 0, row: 1, col: 0, span: 2, head: false }, null, [[2, 58, '\\multirow{2}{*}{'], [2, 59, '\\shortstack{'], [0, 'ASR']]],
      ['cell', 0, null, { table: 0, row: 2, col: 0, span: 1, head: false }, null, [[0, 'down'], [3, 59, '}'], [3, 58, '}']]],
    ])
    for (const id of [0, 1]) {
      const src = sourceUnitsOf(b)[id] as RowSourceUnit
      const r = res(b, id, src.pieces.map((p, k) => ((p as { t: string }).t === 'text' ? `tr${k}` : k)))
      const u = unitOf(b, rowOf(b, id, r)) as { pieces: unknown[] }
      expect(trPiecesOf(u.pieces, p => (p as { k: number }).k)).toEqual(trPiecesOf(r.pieces as never[], kOfSource(src.pieces)))
    }
  })
  it('gives kind, src (plainSource), the title from the flag and the group from the cell, the state of the row', () => {
    const b = bundleOf([
      ...BASE,
      ['cell', 0, null, { table: 3, row: 1, col: 2, span: 2, head: false }, null, [[0, 'Alpha'], [1, '$x$'], [0, ' beta']]],
      ['cell', 0, null, { table: 3, row: 0, col: 1, span: 1, head: true }, null, [[0, 'Head']]],
    ])
    const title = unitOf(b, rowOf(b, 0, res(b, 0, ['T']))) as unknown as Record<string, unknown>
    expect(title).toMatchObject({ kind: 'heading', src: 'A Title', title: true, state: 'whole' })
    expect(title).not.toHaveProperty('group')
    const cell = unitOf(b, rowOf(b, 5, res(b, 5, ['A', 1, 'B']))) as unknown as Record<string, unknown>
    expect(cell).toMatchObject({ kind: 'cell', src: plainSource(sourceUnitsOf(b)[5] as never), group: '3:c2+2', state: 'whole' })
    expect(cell).not.toHaveProperty('title')
    expect(unitOf(b, rowOf(b, 6, res(b, 6, ['H']))) as unknown as Record<string, unknown>).toMatchObject({ group: '3:h' })
    expect(unitOf(b, [4, [], 'none', null, null]) as unknown as Record<string, unknown>).toEqual({ kind: 'heading', src: 'Intro', state: 'none' })
  })
  it('gives pieces to a whole or partial row only: none, lost and kept units are the source\'s', () => {
    const b = base()
    for (const state of ['none', 'lost', 'kept'] as const) expect(unitOf(b, [0, ['x'], state, null, null])).toEqual({ kind: 'heading', src: 'A Title', title: true, state })
    expect(unitOf(b, [0, ['x'], 'partial', null, null])).toMatchObject({ state: 'partial', pieces: [{ t: 'text', tr: true, s: 'x' }] })
  })
  it('gives a hostile string within §4.1\'s bound as the text it is', () => {
    const b = base()
    const evil = '</script><svg onload=alert(1)> \\input{/etc/passwd} \n\t'
    expect(unitOf(b, [0, [evil], 'whole', null, null])).toMatchObject({ pieces: [{ t: 'text', tr: true, s: evil }] })
  })
  it('is null for a string past §4.1\'s bound, as rowOf makes it none: past 16,000 code units, or holding a control but \\n and \\t, U+007F to U+009F, or a bidirectional control', () => {
    // (a host handing v0 rows the web's readRows never read: what the bound refuses is the original's here too)
    const b = base()
    const unit = (s: string) => unitOf(b, [0, [s], 'whole', null, null])
    expect(unit('x'.repeat(16_000))).not.toBeNull()
    expect(unit('x'.repeat(16_001))).toBeNull()
    const refused = [...Array.from({ length: 0x20 }, (_, c) => c).filter(c => c !== 0x0a && c !== 0x09), ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i), 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]
    for (const c of refused) expect(unit(`a${String.fromCharCode(c)}b`), `U+${c.toString(16)}`).toBeNull()
    for (const c of [0x09, 0x0a, 0x20, 0xa0, 0x2029, 0x2065, 0x206a]) expect(unit(`a${String.fromCharCode(c)}b`), `U+${c.toString(16)}`).not.toBeNull()
  })
  it("is null for a row of more pieces than an answer may have (PIECES_MAX, layer/net.mjs's): one k repeated makes no unit of it", () => {
    const b = base()
    expect(PIECES_MAX).toBe(NET_PIECES_MAX)
    const row = (n: number, piece: number | string) => [0, Array.from({ length: n }, () => piece), 'whole', null, null] as never
    expect((unitOf(b, row(PIECES_MAX, 0)) as { pieces: unknown[] }).pieces).toHaveLength(PIECES_MAX)
    expect(unitOf(b, row(PIECES_MAX + 1, 0))).toBeNull()
    expect(unitOf(b, row(PIECES_MAX + 1, 'x'))).toBeNull()
  })
  it('is null, never a throw, for a row that is no unit of the bundle\'s: an id past it, a dropped unit, a k past the unit, a shape', () => {
    const b = bundleOf([BASE[0] as BundleUnit, null, BASE[1] as BundleUnit])
    const rows = [
      [3, ['x'], 'whole', null, null], [1, ['x'], 'whole', null, null], [-1, [], 'none', null, null], [0.5, [], 'none', null, null], ['0', [], 'none', null, null],
      [0, [1], 'whole', null, null], [0, [-1], 'whole', null, null], [0, [0.5], 'whole', null, null], [0, [null], 'whole', null, null], [0, [{}], 'whole', null, null], [0, 'x', 'whole', null, null],
      [0, [], 'broken', null, null], [0, [], 7, null, null], [], null, undefined, 5, 'row', {}, [0],
    ]
    for (const row of rows) expect(unitOf(b, row as never)).toBeNull()
    expect(unitOf(null as never, [0, [], 'none', null, null])).toBeNull()
  })
})

describe('toTranslate', () => {
  /** a paper the front end made: an author block, a table whose name cells it keeps, prose */
  const tex = '\\documentclass{article}\n\\title{A Title}\n\\author{Ada Lovelace}\n\\begin{document}\n\\maketitle\nThe prose names AlphaNet and BetaNet in running text, and says more.\n\n\\begin{tabular}{ll}\n\\toprule\nModel & Training cost \\\\\n\\midrule\nAlphaNet & fast training \\\\\nBetaNet & slow \\\\\n\\bottomrule\n\\end{tabular}\n\nAnother paragraph.\n\\end{document}\n'
  const paper = openPaper(new Map([['main.tex', enc(tex)]]))
  const bundle = bundleOf(bundleUnitsOf(paper))
  it('holds the paper\'s units: names kept, an author block kept where the language writes it as the paper does', () => {
    expect(paper.units.some(u => u.kind === 'author')).toBe(true)
    expect(paper.kept.size).toBeGreaterThan(0)
    expect(toTranslate(bundle, 'zh').length).toBeGreaterThan(0)
  })
  for (const lang of ['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru', 'en-GB', 'xx']) {
    it(`is the complement of keptFor, rising (${lang})`, () => {
      const kept = keptFor(paper, lang), want = paper.units.map((u, i) => (kept.has(u) ? -1 : i)).filter(i => i >= 0)
      expect(toTranslate(bundle, lang)).toEqual(want)
    })
  }
  it('skips a dropped unit', () => {
    const b = bundleOf([BASE[0] as BundleUnit, null, BASE[1] as BundleUnit, ['para', UNIT_FLAG_BITS.KEPT, null, null, null, [[0, 'Kept']]]])
    expect(toTranslate(b, 'de')).toEqual([0, 2])
  })
})

describe('batchesOf', () => {
  /** units of the given plain lengths (a word of letters, one text piece each) */
  const sized = (...n: number[]) => bundleOf(n.map((len): BundleUnit => ['para', 0, null, null, null, [[0, 'a'.repeat(len)]]]))
  it('cuts the first batch at 2,500 characters of plain source and the rest at 12,000, in source order', () => {
    expect([FIRST_BATCH, NEXT_BATCH]).toEqual([2500, 12000])
    const b = sized(...Array(40).fill(900))
    const batches = batchesOf(b, 'zh')
    // 900 + 900 = 1,800; a third would make 2,700
    expect(batches[0]).toEqual([0, 1])
    // 13 of 900 = 11,700; a fourteenth would make 12,600
    expect(batches[1]).toHaveLength(13)
    expect(batches[1]?.[0]).toBe(2)
    expect(batches.flat()).toEqual(Array.from({ length: 40 }, (_, i) => i))
    for (const batch of batches.slice(1, -1)) expect(batch).toHaveLength(13)
  })
  it('fills a batch to its limit exactly, and never splits a unit nor leaves a batch empty: a unit over the limit goes alone', () => {
    expect(batchesOf(sized(1250, 1250, 1), 'zh')).toEqual([[0, 1], [2]])
    expect(batchesOf(sized(30000, 5, 5, 13000, 7), 'zh')).toEqual([[0], [1, 2], [3], [4]])
    expect(batchesOf(sized(), 'zh')).toEqual([])
  })
  it('batches what toTranslate holds: a kept unit and a dropped one are in none', () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, 'a']]], ['para', KEPT, null, null, null, [[0, 'b']]], null, ['author', 0, null, null, null, [[0, 'c']]], ['para', 0, null, null, null, [[0, 'd']]]])
    expect(batchesOf(b, 'de')).toEqual([[0, 4]])
    expect(batchesOf(b, 'zh')).toEqual([[0, 3, 4]])
  })
  it('is the one rule: batchOf takes the units in the order given, runLive\'s batches are batchesOf\'s', async () => {
    expect(batchOf([5, 2, 9], i => [600, 1000, 900][[5, 2, 9].indexOf(i)] ?? 0, 2500)).toEqual([5, 2, 9])
    expect(batchOf([5, 2, 9], () => 1300, 2500)).toEqual([5])
    expect(batchOf([], () => 1, 2500)).toEqual([])
    const body = Array.from({ length: 12 }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')
    const paper = openPaper(new Map([['main.tex', enc(`\\documentclass{article}\\begin{document}\n${body}\\end{document}\n`)]]))
    const b = bundleOf(bundleUnitsOf(paper)), batches: number[][] = []
    const compile = async (): Promise<Compiled> => ({ ok: false, pdf: null, log: '! LaTeX Error: a failure.', ms: 1 })
    await runLive(paper, {
      lang: 'zh', compile, previews: false, format: 'markers',
      translate: async (texts: string[]) => texts.map(text => ({ text, by: 'B' })),
      onBatch: (report: BatchReport) => { if (!report.seeded) batches.push(report.units.map(u => u.id)) },
    } as never)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches).toEqual(batchesOf(b, 'zh'))
  })
})

/** a table of one header row and the given body rows, from table 0, its cells after the prose */
function tableBundle(rows: string[][], head = ['Model', 'Notes']): { b: Bundle; id: (row: number, col: number) => number } {
  const units: BundleUnit[] = [['para', 0, null, null, null, [[0, 'Prose.']]]]
  const ids = new Map<string, number>()
  const cellsOf = (r: number, texts: string[], isHead: boolean) => texts.forEach((text, col) => { ids.set(`${r}:${col}`, units.length); units.push(['cell', 0, null, { table: 0, row: r, col, span: 1, head: isHead }, null, [[0, text]]]) })
  cellsOf(0, head, true)
  for (const [r, texts] of rows.entries()) cellsOf(r + 1, texts, false)
  return { b: bundleOf(units), id: (row, col) => ids.get(`${row}:${col}`) as number }
}
const resultsOf = (b: Bundle, entries: [number, string | TranslateResult][]) => new Map<number, TranslateResult>(entries.map(([id, v]) => [id, typeof v === 'string' ? res(b, id, [v]) : v]))

describe('layerRows', () => {
  it('gives the rows of the units decided so far, rising, a unit with no result none', () => {
    const b = base()
    const { rows, held } = layerRows(b, resultsOf(b, [[2, res(b, 2, PARA_RES)], [0, 'Titel']]), 'de')
    expect(rows.map(r => r[0])).toEqual([0, 2])
    expect(rows[0]).toEqual([0, ['Titel'], 'whole', 'B', null])
    expect(held).toEqual([])
  })
  it('gives a lost and a none unit their rows: they are decided, the layer shows their source', () => {
    const b = base()
    const { rows } = layerRows(b, resultsOf(b, [[0, { state: 'lost' }], [1, { state: 'none' }]]), 'de')
    expect(rows).toEqual([[0, [], 'lost', null, null], [1, [], 'none', null, null]])
  })
  it('gives no row for a unit the language keeps (its author block, a name), nor for a dropped one', () => {
    const b = bundleOf([BASE[0] as BundleUnit, BASE[3] as BundleUnit, null, ['para', KEPT, null, null, null, [[0, 'Kept']]]])
    const results = resultsOf(b, [[0, 'T'], [1, 'Ada'], [3, 'Kept']])
    expect(layerRows(b, results, 'de').rows.map(r => r[0])).toEqual([0])
    expect(layerRows(b, results, 'zh').rows.map(r => r[0])).toEqual([0, 1])
  })
  it('holds a table group\'s cells until every cell of it is in, then gives every cell', () => {
    const { b, id } = tableBundle([['AlphaNet', 'fast training'], ['BetaNet', 'slow going']])
    const header = [id(0, 0), id(0, 1)] as number[], names = [id(1, 0), id(2, 0)] as number[], notes = [id(1, 1), id(2, 1)] as number[]
    const some = resultsOf(b, [[0, 'Prose'], [header[0] as number, 'Modell'], [header[1] as number, 'Hinweise'], [names[0] as number, 'AlphaNetz'], [names[1] as number, 'BetaNetz'], [notes[0] as number, 'schnelles Training']])
    const early = layerRows(b, some, 'de')
    // the prose is decided; the header and the first column are groups whose cells are all in; the notes column waits for its second cell
    expect(early.rows.map(r => r[0])).toEqual([0, ...header, ...names])
    expect(early.held).toEqual(notes)
    some.set(notes[1] as number, res(b, notes[1] as number, ['langsam']))
    const late = layerRows(b, some, 'de')
    expect(late.held).toEqual([])
    expect(late.rows.map(r => r[0])).toEqual([0, ...header, ...[...names, ...notes].sort((x, y) => x - y)])
    // (a cell whose group has no result at all yet is held too: it is the group that waits)
    expect(layerRows(b, resultsOf(b, [[0, 'Prose']]), 'de').held).toEqual(Array.from({ length: 6 }, (_, k) => k + 1))
  })
  it('holds the cells of a group that has a cell lost to the service, those already in too', () => {
    const { b, id } = tableBundle([['one two', 'three four'], ['five six', 'seven eight']])
    const col = [id(1, 1), id(2, 1)] as number[]
    const results = resultsOf(b, [[col[0] as number, 'A'], [col[1] as number, { state: 'lost' }]])
    const { rows, held } = layerRows(b, results, 'de')
    expect(held).toEqual([id(1, 0), id(2, 0), ...col, id(0, 0), id(0, 1)].sort((x, y) => x - y))
    expect(rows).toEqual([])
    results.set(col[1] as number, res(b, col[1] as number, ['B']))
    expect(layerRows(b, results, 'de').rows.map(r => r[0])).toContain(col[1])
  })
  it('keeps a group whole where most of its cells came back as they went: each cell kept, with its own translation', () => {
    const { b, id } = tableBundle([['ByteNet', 'one two'], ['GNMT', 'three four'], ['MoE', 'five six']])
    const names = [id(1, 0), id(2, 0), id(3, 0)] as number[]
    // the first column comes back as it went (the engine judged its cells names); the other column is translated
    const results = resultsOf(b, [
      [id(0, 0), 'Modell'], [id(0, 1), 'Notizen'],
      [names[0] as number, 'ByteNet'], [names[1] as number, 'GNMT'], [names[2] as number, 'Moe'],
      [id(1, 1), 'eins zwei'], [id(2, 1), 'drei vier'], [id(3, 1), 'fuenf sechs'],
    ])
    const { rows, held } = layerRows(b, results, 'de')
    const byId = new Map(rows.map(r => [r[0], r]))
    expect(held).toEqual([])
    for (const n of names) expect(byId.get(n)).toEqual([n, [], 'kept', 'B', null, 'whole'])
    expect(byId.get(id(1, 1))?.[2]).toBe('whole')
    expect(byId.get(id(0, 0))?.[2]).toBe('whole')
    // (the second column is no group of names: its cells changed)
    expect(rows.filter(r => r[2] === 'kept').map(r => r[0])).toEqual(names)
  })
  it('keeps a group whole where a cell could not be taken whole: that cell with its none or partial translation', () => {
    const { b, id } = tableBundle([['one two', 'three four'], ['five six', 'seven eight']])
    const col = [id(1, 0), id(2, 0)] as number[]
    const results = resultsOf(b, [
      [id(0, 0), 'H1'], [id(0, 1), 'H2'], [col[0] as number, 'Eins zwei'], [col[1] as number, { state: 'none' }], [id(1, 1), 'drei'], [id(2, 1), 'vier'],
    ])
    const { rows } = layerRows(b, results, 'de')
    expect(rows.find(r => r[0] === col[0])).toEqual([col[0], [], 'kept', 'B', null, 'whole'])
    expect(rows.find(r => r[0] === col[1])).toEqual([col[1], [], 'kept', null, null, 'none'])
    const partial = res(b, col[1] as number, ['x'], { state: 'partial' })
    results.set(col[1] as number, partial)
    expect(layerRows(b, results, 'de').rows.find(r => r[0] === col[1])?.slice(2)).toEqual(['kept', 'B', null, 'partial'])
  })
  it('counts a name the pipeline keeps as one that came back as it went, and gives it no row', () => {
    const units: BundleUnit[] = [
      ['cell', 0, null, { table: 0, row: 0, col: 0, span: 1, head: true }, null, [[0, 'Model']]],
      ['cell', KEPT, null, { table: 0, row: 1, col: 0, span: 1, head: false }, null, [[0, 'HellaSwag']]],
      ['cell', KEPT, null, { table: 0, row: 2, col: 0, span: 1, head: false }, null, [[0, 'Magicoder']]],
      ['cell', 0, null, { table: 0, row: 3, col: 0, span: 1, head: false }, null, [[0, 'GSM8K']]],
    ]
    const b = bundleOf(units)
    // two of the column's three cells are kept names and the last came back changed: two of three kept the source, so the
    // column is names (NAMES_SHARE), and its last cell is kept with it
    const { rows, held } = layerRows(b, resultsOf(b, [[0, 'Modell'], [3, 'GSM8K Neu']]), 'de')
    expect(held).toEqual([])
    expect(rows).toEqual([[0, ['Modell'], 'whole', 'B', null], [3, [], 'kept', 'B', null, 'whole']])
  })
  it('does not throw on a hostile map: a result of no shape, an id the bundle has not', () => {
    const b = base()
    const results = new Map<number, TranslateResult>([[0, null as never], [1, 5 as never], [99, { state: 'whole', pieces: [] }], [-1, { state: 'none' }]])
    expect(() => layerRows(b, results, 'de')).not.toThrow()
    expect(layerRows(b, results, 'de').rows).toEqual([])
  })
})

/** a send that translates every word of a wire text, and counts and records what it was asked */
function sender(over: (texts: string[], call: number) => void | Promise<void> = () => {}) {
  const calls: string[][] = []
  const send = async (texts: string[]) => {
    calls.push(texts)
    await over(texts, calls.length)
    return texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, 'wort'), by: 'B' }))
  }
  return { send, calls }
}
/** a paper of `n` paragraphs of about 300 characters each, and a table whose cells come late */
const longBundle = (n: number, table = false) => {
  const units: BundleUnit[] = Array.from({ length: n }, (_, k): BundleUnit => ['para', 0, null, null, null, [[0, `Paragraph ${k} ${'prose words '.repeat(25)}`], [1, `$x_${k}$`], [0, ' end.']]])
  if (table) for (const [r, row] of [['AlphaNet', 'fast training'], ['BetaNet', 'slow going']].entries()) for (const [col, text] of row.entries()) units.push(['cell', 0, null, { table: 0, row: r + 1, col, span: 1, head: false }, null, [[0, text]]])
  return bundleOf(units)
}

describe('runRows', () => {
  it('runs the batches, gives onRows each batch\'s rows once, and returns the rows layerRows has over every result', async () => {
    const b = longBundle(80), { send, calls } = sender(), given: Row[][] = []
    const out = await runRows(b, { lang: 'de', send, onRows: rows => given.push(rows), signal: new AbortController().signal })
    expect(calls.map(c => c.length)).toEqual(batchesOf(b, 'de').map(x => x.length))
    expect(calls.length).toBeGreaterThan(2)
    expect(given.map(rows => rows.map(r => r[0]))).toEqual(batchesOf(b, 'de'))
    expect(out).toMatchObject({ lost: 0, stopped: null })
    // the rows given, put together, are the rows returned, and they are layerRows' over the results asked for at once
    expect(new Map(given.flat().map(r => [r[0], r]))).toEqual(out.rows)
    const units = sourceUnitsOf(b) as RowSourceUnit[]
    const { results } = await translateUnits(units, sender().send)
    const all = new Map([...results].map(([u, r]) => [units.indexOf(u), r as TranslateResult]))
    expect(layerRows(b, all, 'de').rows).toEqual([...out.rows.values()])
    for (const r of out.rows.values()) expect(r[2]).toBe('whole')
  })
  it('passes the held cells along, and gives a table group\'s cells together once the batch holding its last cell is in', async () => {
    const b = longBundle(12, true), { send } = sender(), seen: { ids: number[]; held: number[] }[] = []
    const out = await runRows(b, { lang: 'de', send, onRows: (rows, held) => seen.push({ ids: rows.map(r => r[0]), held }) })
    expect(batchesOf(b, 'de').length).toBe(2)
    // the cells are the last four units (12..15), in the second batch with the last paragraphs: the first batch holds them
    // (their groups wait for cells not yet asked), the second decides them
    expect(seen).toHaveLength(2)
    expect(seen[0]?.ids).toEqual(batchesOf(b, 'de')[0])
    expect(seen[0]?.held).toEqual([12, 13, 14, 15])
    expect(seen[1]?.ids.slice(-4)).toEqual([12, 13, 14, 15])
    expect(seen[1]?.held).toEqual([])
    expect(out.rows.size).toBe(16)
  })
  it('asks the unit nearest the reading place first, afresh for every batch', async () => {
    const b = longBundle(30), ranks: number[] = []
    let place = 29
    const { send, calls } = sender()
    await runRows(b, { lang: 'de', send, rank: id => { ranks.push(id); return Math.abs(id - place) }, onRows: () => { place = 0 }, signal: undefined })
    // the first batch (2,500 characters, 7 units of about 325) is around unit 29; the reader moved to 0 after it
    const texts = (batch: string[]) => batch.map(t => Number(/Paragraph (\d+)/.exec(t)?.[1]))
    expect(texts(calls[0] as string[])).toEqual([29, 28, 27, 26, 25, 24, 23])
    expect(texts(calls[1] as string[])[0]).toBe(0)
    expect(new Set(calls.flat().map(t => /Paragraph (\d+)/.exec(t)?.[1])).size).toBe(30)
  })
  it('stops before the next batch when the signal has aborted, with what it has', async () => {
    const b = longBundle(30), { send, calls } = sender(), ctl = new AbortController()
    const out = await runRows(b, { lang: 'de', send, onRows: () => ctl.abort(), signal: ctl.signal })
    expect(calls).toHaveLength(1)
    expect(out.stopped).toBe('aborted')
    expect([...out.rows.keys()]).toEqual(batchesOf(b, 'de')[0])
    expect(out.lost).toBe(0)
    // (an aborted signal at the start asks nothing)
    const none = await runRows(b, { lang: 'de', send, onRows: () => { throw new Error('no rows') }, signal: AbortSignal.abort() })
    expect(none).toMatchObject({ stopped: 'aborted', lost: 0 })
    expect(none.rows.size).toBe(0)
    expect(calls).toHaveLength(1)
  })
  it('stops for good at a refusal of the service (an error with a kind): what is in stands, the rest is lost', async () => {
    const b = longBundle(80)
    const { send, calls } = sender((_t, call) => { if (call === 2) throw Object.assign(new Error('no key'), { kind: 'no-key' }) })
    const out = await runRows(b, { lang: 'de', send, onRows: () => {}, signal: undefined })
    expect(calls).toHaveLength(2)
    expect(out.stopped).toBe('no-key')
    expect([...out.rows.keys()]).toEqual(batchesOf(b, 'de')[0])
    expect(out.lost).toBe(80 - (batchesOf(b, 'de')[0] as number[]).length)
  })
  it('stops after a batch that part of the service lost (partial, lost): the batch\'s lost units are lost rows, the rest are never asked', async () => {
    const b = longBundle(80)
    const { send, calls } = sender((texts, call) => {
      if (call !== 2) return
      const partial = texts.map((t, i) => (i < 2 ? null : { text: t, by: 'B' }))
      throw Object.assign(new Error('rate'), { kind: 'rate-limit', partial, lost: new Set([0, 1]) })
    })
    const rows: Row[][] = []
    const out = await runRows(b, { lang: 'de', send, onRows: r => rows.push(r), signal: undefined })
    expect(calls).toHaveLength(2)
    expect(out.stopped).toBe('rate-limit')
    const second = batchesOf(b, 'de')[1] as number[]
    expect(out.rows.get(second[0] as number)?.[2]).toBe('lost')
    expect(out.rows.get(second[1] as number)?.[2]).toBe('lost')
    expect(out.rows.get(second[2] as number)?.[2]).toBe('whole')
    expect(batchesOf(b, 'de').length).toBeGreaterThan(2)
    expect(out.lost).toBe(2 + (80 - (batchesOf(b, 'de')[0] as number[]).length - second.length))
    expect(rows).toHaveLength(2)
  })
  it('lets an error with no kind through: a bug is not a refusal', async () => {
    const b = longBundle(5), { send } = sender(() => { throw new Error('a bug') })
    await expect(runRows(b, { lang: 'de', send, onRows: () => {}, signal: undefined })).rejects.toThrow('a bug')
  })
  it('asks nothing of a bundle with nothing to translate', async () => {
    const { send, calls } = sender()
    const out = await runRows(bundleOf([['para', KEPT, null, null, null, [[0, 'Kept']]], null]), { lang: 'de', send, onRows: () => { throw new Error('no rows') }, signal: undefined })
    expect(calls).toHaveLength(0)
    expect(out).toEqual({ rows: new Map(), lost: 0, stopped: null })
  })
  it('sends in the wire format asked for: tags with the sentence cuts, runs one run a text', async () => {
    const b = bundleOf([['para', 0, null, null, null, [[0, 'First sentence here. Second sentence follows. '], [1, '\\cite{a}'], [0, ' Third one ends.']]]])
    const seen: { texts: string[]; cuts?: unknown }[] = []
    const send = async (texts: string[], cuts?: unknown) => { seen.push({ texts, cuts }); return texts.map(text => ({ text, by: 'B' })) }
    const tags = await runRows(b, { lang: 'de', send, format: 'tags', onRows: () => {}, signal: undefined })
    expect(seen[0]?.texts[0]).toMatch(/<x id="1"\/>/)
    expect(seen[0]?.cuts).toBeDefined()
    expect(tags.rows.get(0)?.[2]).toBe('whole')
    seen.length = 0
    const runs = await runRows(b, { lang: 'de', send, format: 'runs', onRows: () => {}, signal: undefined })
    expect(seen[0]?.texts.every(t => !t.includes('<x') && !t.includes('@a#'))).toBe(true)
    expect(runs.rows.get(0)?.[2]).toBe('whole')
  })
})
