import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countValues } from '@/pdf-reader/engine/layout/json.mjs'
import {
  checkLayoutPart, checkLineskip, encodeLayout, encodeLayoutPart, indexLayout, layoutPartRows, mergeLayout, PART_KEYS, LABEL_KINDS, LAYOUT, LAYOUT_CAP, LAYOUT_SCHEMA, MIXED_FILL, LAYOUT_DEPTH, LAYOUT_VALUES, type LayoutFile, LayoutRefusal, NAME_FLAG, NAME_KEYS, PAGE_TEXT_ALL, PAGE_TEXT_KINDS, PH_FLAG, PH_KINDS,
  parseLayout, TEXT_MAX, UNIT_FLAG, UNIT_KINDS, UNLAID, UNLAID_ALL,
} from '@/pdf-reader/engine/layout/file.mjs'

// The layout file (spec §4.2): a file made from a paper, read by the container's service and by the reader's main thread.
// Every bound of its table is broken once, and each refusal names its path. Timing rows run only with AXT_MEASURE=1 (the
// pre-flight's W7): wall-clock bounds are not asserted in CI, the structure that makes them hold is

const utf8 = (s: string) => new TextEncoder().encode(s)
const TIMING = !!process.env.AXT_MEASURE

afterEach(() => { vi.restoreAllMocks() })

const H = UNIT_KINDS.indexOf('heading'), P = UNIT_KINDS.indexOf('para'), C = UNIT_KINDS.indexOf('caption'), F = UNIT_KINDS.indexOf('footnote')
const MATH = PH_KINDS.indexOf('math'), DISPLAY = PH_KINDS.indexOf('display'), CITE = PH_KINDS.indexOf('cite'), REF = PH_KINDS.indexOf('ref'), MACRO = PH_KINDS.indexOf('macro')

/** three pages and six units, every array used: a title, a paragraph, a section heading, a paragraph across two columns
 *  and onto the next page, a caption, a footnote */
function made(): LayoutFile {
  return {
    schema: LAYOUT_SCHEMA,
    layout: LAYOUT,
    pdfjs: '5.4.296',
    paper: { id: '2608.04322', version: 1, pages: 3 },
    left: 'a1b2c3d4',
    views: [0, 0, 612, 792, 0, 0, 612, 792, 0, 0, 612, 792],
    fonts: ['CMR10', 'CMBX12', 'CMMI10'],
    units: [
      [0, H, 0, UNIT_FLAG.TITLE, 1],
      [2, P, 9, 0, 5],
      [3, H, 1, 0, 2],
      [5, P, 9, 0, 6],
      [7, C, 9, UNIT_FLAG.CENTRED, 3],
      [8, F, 9, 0, 2],
    ],
    lines: [
      [0, [1, 150.5, 461.25, 700, 712.4, 696.1, 17.28, 1]],
      [2, [1, 72, 540, 650, 657.5, 647.25, 10, 0, 1, 72, 380.75, 638, 645.5, 635.25, 10, 0]],
      [3, [2, 72, 200, 720, 728.5, 717, 12, 1]],
      [5, [
        2, 72, 300, 690, 697.5, 687.25, 10, 0,
        2, 72, 300, 678, 685.5, 675.25, 10, 2,
        2, 312, 540, 690, 697.5, 687.25, 10, 0,
        2, 312, 540, 678, 685.5, 675.25, 10, 0,
        3, 72, 300, 720, 727.5, 717.25, 10, 0,
      ]],
      [7, [3, 200, 412, 400, 407, 397.5, 9, 0]],
      [8, [2, 72, 300, 100, 106, 98, 8, 0]],
    ],
    frames: [
      [0, [1, 0, 0, 1, -1, 30]],
      [2, [1, 0, 0, 2, -1, 12.5]],
      [3, [2, 0, 0, 1, -1, 8]],
      [5, [2, 0, 0, 2, -1, 20, 2, 1, 2, 2, 400, 20, 3, 0, 4, 1, 800, 600.75]],
      [7, [3, 0, 0, 1, -1, 50]],
      [8, [2, 0, 0, 1, -1, 62]],
    ],
    erase: [
      [2, [0, 72, 647.25, 300, 657.5, 0, 310, 647.25, 540, 657.5, 1, 72, 635.25, 380.75, 645.5]],
      [5, [3, 312, 675.25, 540, 685.5]],
    ],
    ph: [
      [2, 1, MATH, 0, 1, 200, 650, 230.5, 657.5, 646],
      // (a citation's glyphs coloured, hyperref's colorlinks blue; a formula's of two colours, none holding half: the fill last)
      [2, 3, CITE, PH_FLAG.SOURCE_BRACKETS, 1, 300, 638, 320, 645.5, 635.25, 0x0071bc],
      [5, 0, MATH, PH_FLAG.RAISED, 2, 280, 690, 300, 697.5, 687.25, 2, 72, 678, 90, 685.5, 675.25, MIXED_FILL],
      [5, 2, DISPLAY, PH_FLAG.NUMBERED, 2, 312, 690, 500, 697.5, 687.25, 2, 520, 690, 540, 697.5, 687.25],
      [5, 4, REF, PH_FLAG.EMPTY],
      [8, 1, MACRO, PH_FLAG.LOST],
    ],
    labels: [
      [3, LABEL_KINDS.indexOf('number'), 2, 50, 720, 66, 728.5, 717],
      [7, LABEL_KINDS.indexOf('caption'), 3, 150, 400, 195, 407, 397.5],
      [8, LABEL_KINDS.indexOf('footnote'), 2, 66, 100, 70, 106, 98],
    ],
    headings: [[0, 'A title'], [3, 'Method <b onclick="x()">&amp;</b>']],
    pageText: [[2, 3, '[12, 3]']],
    // unit 5's second line: a line its source does not write, not erased
    held: [[5, [1]]],
    // the abstract's name centred over page 1's paragraph, the references' in capitals on page 3, and a proof's name
    // leading unit 7's first line there (RUN_IN), 2.5 pt of glue after it
    names: [
      [1, NAME_KEYS.indexOf('abstract'), 1, 280, 680, 332.5, 687, 677.5, 9, 1, NAME_FLAG.CENTRED, -1, 0, 72, 540],
      [4, NAME_KEYS.indexOf('ref'), 3, 72, 500, 140.25, 508.4, 497.5, 12, 1, NAME_FLAG.CAPITALS, -1, 0, 72, 300],
      [6, NAME_KEYS.indexOf('proof'), 3, 100, 400, 140, 407, 397.5, 9, 1, NAME_FLAG.RUN_IN, 7, 2.5, 72, 540],
    ],
    // the paper's \lineskip and \lineskiplimit, LaTeX's own 1pt (0.9963 bp) and 0pt, to a hundredth as the writer sets them
    lineskip: [1, 0],
  }
}

/** the path a file's refusal names, or null when it is accepted; any other error is the test's failure */
function refusal(bytes: Uint8Array): LayoutRefusal | null {
  try {
    parseLayout(bytes)
    return null
  } catch (e) {
    if (!(e instanceof LayoutRefusal)) throw e
    return e
  }
}
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the file's types on purpose
type Edit = (f: any) => void
const broken = (edit: Edit) => { const f = structuredClone(made()); edit(f); return utf8(JSON.stringify(f)) }
const row = (n: number, r: number[]) => Array.from({ length: n }, () => r).flat()

describe('a valid file', () => {
  it('a text symbol (TEXT) parses with its character as its page text, and indexes as a macro of no segments', () => {
    const f = made()
    const row = f.ph[5]
    if (!row) throw new Error('no row 5')
    row[3] = PH_FLAG.TEXT
    f.pageText.push([8, 1, '%'])
    const index = indexLayout(parseLayout(new TextEncoder().encode(encodeLayout(f))))
    expect(index.unit(8)!.ph.get(1)).toEqual({ kind: 'macro', flags: PH_FLAG.TEXT, segs: new Float64Array(0), text: '%', fill: null })
  })
  it('a later display of a display group (JOINED) and a LOST piece outside the unit (OUTSIDE) parse with no segments', () => {
    const f = made()
    // unit 5's display k2 owns its group's ink; a second display k3 of the group, JOINED; the LOST macro k1 of unit 8 OUTSIDE
    f.ph.splice(4, 0, [5, 3, DISPLAY, PH_FLAG.JOINED])
    const r8 = f.ph.find(r => r[0] === 8 && r[1] === 1)
    if (!r8) throw new Error('no row 8.1')
    r8[3] = PH_FLAG.LOST | PH_FLAG.OUTSIDE
    const index = indexLayout(parseLayout(new TextEncoder().encode(encodeLayout(f))))
    expect(index.unit(5)!.ph.get(3)).toEqual({ kind: 'display', flags: PH_FLAG.JOINED, segs: new Float64Array(0), text: null, fill: null })
    expect(index.unit(8)!.ph.get(1)?.flags).toBe(PH_FLAG.LOST | PH_FLAG.OUTSIDE)
  })
  it('a unit TeX set flush left or flush right indexes as such (LAYOUT 26); one of before none', () => {
    const f = made()
    f.units[2]![3] = UNIT_FLAG.FLUSH_LEFT
    f.units[3]![3] = UNIT_FLAG.FRONT | UNIT_FLAG.FLUSH_RIGHT
    const index = indexLayout(parseLayout(utf8(encodeLayout(f))))
    const id = (i: number) => f.units[i]![0] as number
    expect([index.unit(id(2))?.flush, index.unit(id(3))?.flush, index.unit(id(3))?.front]).toEqual(['left', 'right', true])
    expect(indexLayout(parseLayout(utf8(encodeLayout(made())))).unit(id(2))?.flush).toBeNull()
    expect(index.unit(7)).toMatchObject({ centred: true, flush: null })
  })
  it('a valid file parses, round-trips and indexes', () => {
    const f = made()
    const text = encodeLayout(f)
    // keys in the schema's order, no white space: the made file is already in that order and in hundredths
    expect(text).toBe(JSON.stringify(f))
    expect(parseLayout(utf8(text))).toEqual(f)
    const index = indexLayout(parseLayout(utf8(text)))
    expect(index.onPage(1)).toEqual([0, 2])
    expect(index.onPage(2)).toEqual([3, 5, 8])
    expect(index.onPage(3)).toEqual([5, 7])
    expect(index.onPage(4)).toEqual([])
    expect(index.onPage(0)).toEqual([])
    const u = index.unit(5)!
    expect(u).toMatchObject({ id: 5, kind: 'para', depth: 9, title: false, front: false, centred: false, pieces: 6, heading: null })
    expect(u.lines).toBeInstanceOf(Float64Array)
    expect(u.lines.length).toBe(40)
    expect([...u.frames]).toEqual(f.frames[3]![1])
    expect(u.erase.length).toBe(5)
    expect([...u.erase[3]!]).toEqual([312, 675.25, 540, 685.5])
    expect(u.erase[0]!.length).toBe(0)
    expect(u.ph.get(2)!.kind).toBe('display')
    expect(u.ph.get(2)!.flags).toBe(PH_FLAG.NUMBERED)
    expect([...u.ph.get(2)!.segs]).toEqual([2, 312, 690, 500, 697.5, 687.25, 2, 520, 690, 540, 697.5, 687.25])
    expect(u.ph.get(4)).toEqual({ kind: 'ref', flags: PH_FLAG.EMPTY, segs: new Float64Array(0), text: null, fill: null })
    expect(u.ph.has(1)).toBe(false)
    const two = index.unit(2)!
    expect(two.erase.map(e => [...e])).toEqual([[72, 647.25, 300, 657.5, 310, 647.25, 540, 657.5], [72, 635.25, 380.75, 645.5]])
    // a page-text placeholder's own text, as its glyphs give it
    expect(two.ph.get(3)).toEqual({ kind: 'cite', flags: PH_FLAG.SOURCE_BRACKETS, segs: new Float64Array([1, 300, 638, 320, 645.5, 635.25]), text: '[12, 3]', fill: 0x0071bc })
    // (the fill not a segment's: a formula's two segments, and its fill apart)
    expect([...u.ph.get(0)!.segs]).toEqual([2, 280, 690, 300, 697.5, 687.25, 2, 72, 678, 90, 685.5, 675.25])
    expect(u.ph.get(0)!.fill).toBe(MIXED_FILL)
    expect(two.ph.get(1)!.fill).toBeNull()
    expect(two.ph.get(1)?.text).toBeNull()
    expect(index.unit(0)).toMatchObject({ kind: 'heading', depth: 0, title: true, heading: 'A title' })
    expect(index.unit(7)).toMatchObject({ kind: 'caption', centred: true })
    expect([...index.unit(3)!.labels]).toEqual([0, 2, 50, 720, 66, 728.5, 717])
    expect([...index.unit(8)!.labels]).toEqual([3, 2, 66, 100, 70, 106, 98])
    expect(index.unit(8)!.ph.get(1)).toEqual({ kind: 'macro', flags: PH_FLAG.LOST, segs: new Float64Array(0), text: null, fill: null })
    expect(LAYOUT).toBe('31')
    expect(index.unit(5)!.held).toEqual([1])
    expect(index.unit(2)!.held).toEqual([])
    expect(PAGE_TEXT_KINDS).toEqual(['cite', 'ref', 'eqref'])
    expect(index.unit(1)).toBeNull()
    expect(index.unit(4)).toBeNull()
    expect(index.view(2)).toEqual([0, 0, 612, 792])
    expect(index.font(2)).toBe('CMMI10')
    expect(index.file).toEqual(f)
    // babel's names by page, in the file's order, with their flags read
    expect(index.names(1)).toEqual([{ occurrence: 1, key: 'abstract', page: 1, x0: 280, baseline: 680, x1: 332.5, top: 687, bottom: 677.5, size: 9, font: 1, centred: true, capitals: false, unit: -1, glue: 0, cx0: 72, cx1: 540 }])
    expect(index.names(3).map(n => [n.key, n.capitals, n.centred, n.unit, n.glue, n.cx1])).toEqual([['ref', true, false, -1, 0, 300], ['proof', false, false, 7, 2.5, 540]])
    expect(index.names(2)).toEqual([])
    expect(index.names(9)).toEqual([])
  })

  it("the maker's version and the schema the types declare are the module's (file.d.mts, raised with file.mjs)", () => {
    const declared = readFileSync(join(__dirname, '../../src/pdf-reader/engine/layout/file.d.mts'), 'utf8')
    expect(/export declare const LAYOUT: '([^']*)'/.exec(declared)?.[1]).toBe(LAYOUT)
    expect(Number(/export declare const LAYOUT_SCHEMA: (\d+)/.exec(declared)?.[1])).toBe(LAYOUT_SCHEMA)
  })

  it('strings come back as they are: a heading with markup is text, never markup', () => {
    const index = indexLayout(parseLayout(utf8(encodeLayout(made()))))
    expect(index.unit(3)!.heading).toBe('Method <b onclick="x()">&amp;</b>')
  })

  it('the index copies the file\'s numbers, and is made once: a lookup is the same answer again', () => {
    const f = parseLayout(utf8(encodeLayout(made())))
    const index = indexLayout(f)
    const u = index.unit(5)!
    f.lines[3]![1][1] = 100
    f.erase[1]![1][1] = 100
    f.ph[3]![5] = 100
    f.labels[0]![3] = 1
    expect(u.lines[1]).toBe(72)
    expect(u.erase[3]![0]).toBe(312)
    expect(u.ph.get(2)!.segs[1]).toBe(312)
    expect(index.unit(3)!.labels[2]).toBe(50)
    expect(index.unit(5)).toBe(u)
    expect(index.onPage(2)).toBe(index.onPage(2))
    expect(Object.isFrozen(index.onPage(2))).toBe(true)
    expect(Object.isFrozen(u)).toBe(true)
  })

  it('encodeLayout writes the schema\'s order and hundredths whatever it is given', () => {
    const f = made()
    const shuffled = Object.fromEntries(Object.entries(f).reverse()) as unknown as LayoutFile
    shuffled.views = [0.123, -0.004, 612.006, 792.3333, ...f.views.slice(4)]
    shuffled.lines = structuredClone(f.lines)
    shuffled.lines[0]![1] = [1, 150.504, 461.2549, 700.001, 712.4, 696.1, 17.284, 1]
    const back = parseLayout(utf8(encodeLayout(shuffled)))
    expect(Object.keys(back)).toEqual(Object.keys(f))
    expect(back.views.slice(0, 4)).toEqual([0.12, 0, 612.01, 792.33])
    expect(Object.is(back.views[1], 0)).toBe(true)
    expect(back.lines[0]![1]).toEqual([1, 150.5, 461.25, 700, 712.4, 696.1, 17.28, 1])
    expect(encodeLayout(back)).toBe(JSON.stringify(back))
    // (the paper's \lineskip as TeX gives it in PDF units, 1pt = 0.9962640099626402, to a hundredth like every number)
    shuffled.lineskip = [0.9962640099626402, -0.004]
    expect(parseLayout(utf8(encodeLayout(shuffled))).lineskip).toEqual([1, 0])
    // TeX's \maxdimen (16383.99998pt, \offinterlineskip's \lineskiplimit; 16322.7895 PDF units) and the 16384pt the probe
    // reads at most are written 16322.79, over the exact bound by the rounding: the file still reads, either sign
    const most = 16383.99998 * (72 / 72.27)
    shuffled.lineskip = [-most, most]
    expect(parseLayout(utf8(encodeLayout(shuffled))).lineskip).toEqual([-16322.79, 16322.79])
    shuffled.lineskip = [0, (16384 * 72) / 72.27]
    expect(parseLayout(utf8(encodeLayout(shuffled))).lineskip).toEqual([0, 16322.79])
  })

  it('a zero written -0 reads as 0, so that the file round-trips', () => {
    const text = JSON.stringify(made()).replace('"views":[0,', '"views":[-0,').replace('"units":[[0,', '"units":[[-0,').replace('"lines":[[0,[1,', '"lines":[[-0,[1,')
    expect(text.match(/-0,/g)).toHaveLength(3)
    const f = parseLayout(utf8(text))
    expect(Object.is(f.views[0], 0)).toBe(true)
    expect(f).toEqual(made())
    expect(parseLayout(utf8(encodeLayout(f)))).toEqual(f)
  })
})

describe('refused before it is decoded or parsed', () => {
  it('refused before it is decoded or parsed', () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusal(new Uint8Array(LAYOUT_CAP + 1))).toMatchObject({ path: '', message: expect.stringMatching(/bytes/) })
    expect(decode).not.toHaveBeenCalled()
    expect(refusal(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]))).toMatchObject({ path: '', message: expect.stringMatching(/UTF-8/) })
    expect(parse).not.toHaveBeenCalled()
    const many = utf8(`[${'0,'.repeat(LAYOUT_VALUES)}0]`)
    expect(many.length).toBeLessThan(LAYOUT_CAP)
    expect(refusal(many)).toMatchObject({ path: '', message: expect.stringMatching(/values/) })
    expect(parse).not.toHaveBeenCalled()
    expect(refusal(utf8('{"schema":1,'))).toMatchObject({ path: '', message: expect.stringMatching(/not JSON/) })
    expect(refusal(utf8('[]'))).toMatchObject({ path: '' })
    expect(() => parseLayout('{}' as unknown as Uint8Array)).toThrow(LayoutRefusal)
  })

  it('a 100 MB announcement given as 100 MB of bytes is refused by its length without a pass over them', () => {
    const big = new Uint8Array(100 * 2 ** 20)
    const read: (string | symbol)[] = []
    const watched = new Proxy(big, { get(t, k) { read.push(k); const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v } })
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    expect(refusal(watched)).toMatchObject({ path: '', message: expect.stringMatching(/bytes/) })
    expect(new Set(read)).toEqual(new Set(['length']))
    expect(decode).not.toHaveBeenCalled()
  })

  it.runIf(TIMING)('timing: the 100 MB refusal is under 5 ms', () => {
    const big = new Uint8Array(100 * 2 ** 20)
    refusal(big)
    const t = performance.now()
    refusal(big)
    expect(performance.now() - t).toBeLessThan(5)
  })
})

// ---------------------------------------------------------------- nesting
/** how deep a value's brackets go: its own at 1, a number or a string at 0 */
const depthOf = (v: unknown): number => (typeof v === 'object' && v !== null ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0)
/** every path of a value but the root, with whether it is a container */
function* nodes(v: unknown, path: (string | number)[] = []): Generator<[(string | number)[], boolean]> {
  if (typeof v !== 'object' || v === null) return
  for (const [k, c] of Object.entries(v)) {
    const p = [...path, Array.isArray(v) ? Number(k) : k]
    yield [p, typeof c === 'object' && c !== null]
    yield* nodes(c, p)
  }
}
/** the made file with the value at `path` written as `text` */
function replaced(path: (string | number)[], text: string) {
  const f = structuredClone(made())
  // biome-ignore lint/suspicious/noExplicitAny: a test walks the file by path
  let holder: any = f
  for (const k of path.slice(0, -1)) holder = holder[k]
  holder[path[path.length - 1]!] = '@@HERE@@'
  const json = JSON.stringify(f), at = json.indexOf('"@@HERE@@"')
  return utf8(json.slice(0, at) + text + json.slice(at + '"@@HERE@@"'.length))
}

describe('nesting is refused before JSON.parse', () => {
  it('the deepest legal file nests LAYOUT_DEPTH = 4 deep: the file, lines (or frames, or erase), an entry [id, rows], its rows', () => {
    const f = made()
    // each key's value one bracket deeper than the file's own: the three entries arrays reach 4
    const reach = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, 1 + depthOf(v)]))
    expect(reach).toEqual({ schema: 1, layout: 1, pdfjs: 1, paper: 2, left: 1, views: 2, fonts: 2, units: 3, lines: 4, frames: 4, erase: 4, ph: 3, labels: 3, headings: 3, pageText: 3, held: 4, names: 3, lineskip: 2 })
    expect(depthOf(f)).toBe(4)
    expect(LAYOUT_DEPTH).toBe(4)
    const parse = vi.spyOn(JSON, 'parse')
    expect(parseLayout(utf8(encodeLayout(f)))).toEqual(f)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('no legal file nests deeper: every leaf given an array, and every array an object, is refused', () => {
    let leaves = 0, containers = 0
    for (const [path, container] of nodes(made())) {
      const e = refusal(replaced(path, container ? '{}' : '[]'))
      expect(e, path.join('.')).not.toBeNull()
      if (container) containers++; else leaves++
    }
    expect(leaves).toBeGreaterThan(250)
    expect(containers).toBeGreaterThan(40)
  })

  it.each([
    ['lines', ['lines', 0, 1, 0]],
    ['frames', ['frames', 3, 1, 0]],
    ['erase', ['erase', 0, 1, 0]],
  ] as [string, (string | number)[]][])('one level deeper at %s is refused before JSON.parse, naming no path', (_, path) => {
    const parse = vi.spyOn(JSON, 'parse')
    const e = refusal(replaced(path, '[1]'))
    expect(e).toMatchObject({ path: '', message: 'nested more than 4 deep' })
    expect(parse).not.toHaveBeenCalled()
  })

  /** the made file with 999,000 brackets opened and closed at `left`: 1.91 MiB and 999,000 and a few values, within both caps */
  const hostile = () => replaced(['left'], `${'['.repeat(999_000)}${']'.repeat(999_000)}`)

  it('999,000 nested brackets, inside both caps, are refused before JSON.parse, after a few characters', () => {
    const bytes = hostile()
    const text = new TextDecoder().decode(bytes)
    expect(bytes.length).toBeLessThan(LAYOUT_CAP)
    expect(bytes.length / 2 ** 20).toBeCloseTo(1.91, 1)
    expect(countValues(text)).toBeLessThanOrEqual(LAYOUT_VALUES)
    const parse = vi.spyOn(JSON, 'parse')
    const read = vi.spyOn(String.prototype, 'charCodeAt')
    const e = refusal(bytes)
    const calls = read.mock.calls.length
    read.mockRestore()
    expect(e).toMatchObject({ path: '', message: 'nested more than 4 deep' })
    expect(parse).not.toHaveBeenCalled()
    // the characters before `left`, and the brackets up to the fifth: never the million after
    expect(calls).toBeLessThan(200)
  })

  it.runIf(TIMING)('timing: the 999,000-deep file is refused in under 5 ms', () => {
    const bytes = hostile()
    refusal(bytes)
    const t = performance.now()
    refusal(bytes)
    const ms = performance.now() - t
    console.info(`999,000 deep: ${bytes.length} bytes, refused in ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(5)
  })
})

/** [what is broken, the edit, the path its refusal names] */
const ROWS: [string, Edit, string][] = [
  // the top level
  ['a missing key', f => { delete f.left }, 'left'],
  ['an extra key', f => { f.extra = 1 }, 'extra'],
  ['an extra key of 10,000 characters is named by its first 20', f => { f['k'.repeat(10000)] = 1 }, `${'k'.repeat(20)}…`],
  ['schema 1, a file before the names', f => { f.schema = 1 }, 'schema'],
  ['schema 2, a file before the interline glue', f => { f.schema = 2 }, 'schema'],
  ['schema 3', f => { f.schema = 3 }, 'schema'],
  ['schema 4, a file before the fill', f => { f.schema = 4 }, 'schema'],
  ['schema 6', f => { f.schema = 6 }, 'schema'],
  ['a lineskip of one number', f => { (f as { lineskip: unknown }).lineskip = [1] }, 'lineskip'],
  ['a lineskip that is a string', f => { (f as { lineskip: unknown }).lineskip = ['1pt', 0] }, 'lineskip[0]'],
  ['a lineskiplimit past \\maxdimen', f => { (f as { lineskip: unknown }).lineskip = [1, 1e6] }, 'lineskip[1]'],
  ['a lineskiplimit a hundredth past \\maxdimen as written', f => { (f as { lineskip: unknown }).lineskip = [1, 16322.8] }, 'lineskip[1]'],
  // (the maker's version is read for its shape alone: any maker's file under schema 2 is read, identities.test.ts)
  ['layout empty', f => { f.layout = '' }, 'layout'],
  ['layout with a space', f => { f.layout = '3 1' }, 'layout'],
  ['layout of 33 characters', f => { f.layout = '3'.repeat(33) }, 'layout'],
  ['layout 1 as a number', f => { f.layout = 1 }, 'layout'],
  ['pdfjs empty', f => { f.pdfjs = '' }, 'pdfjs'],
  ['pdfjs of 33 characters', f => { f.pdfjs = '5'.repeat(33) }, 'pdfjs'],
  ['pdfjs with a line feed', f => { f.pdfjs = '5.4\n' }, 'pdfjs'],
  ['left of 129 characters', f => { f.left = 'a'.repeat(129) }, 'left'],
  ['left with a character past ASCII', f => { f.left = 'ab\u0080' }, 'left'],
  // the paper
  ['paper not an object', f => { f.paper = [] }, 'paper'],
  ['paper with an extra key', f => { f.paper.title = 'x' }, 'paper.title'],
  ['paper without an id', f => { delete f.paper.id }, 'paper.id'],
  ['an id that is not arXiv\'s', f => { f.paper.id = '2608.123' }, 'paper.id'],
  ['an old-style id with a line feed after it', f => { f.paper.id = 'hep-th/9901001\n' }, 'paper.id'],
  ['an archive of 17 letters', f => { f.paper.id = `${'a'.repeat(17)}/9901001` }, 'paper.id'],
  ['an archive of 1 letter', f => { f.paper.id = '-/0000000' }, 'paper.id'],
  ['an id of 3,000,000 letters', f => { f.paper.id = `${'a'.repeat(3_000_000)}/1234567` }, 'paper.id'],
  ['version 0', f => { f.paper.version = 0 }, 'paper.version'],
  ['version 1,001', f => { f.paper.version = 1001 }, 'paper.version'],
  ['version 1.5', f => { f.paper.version = 1.5 }, 'paper.version'],
  ['pages 0', f => { f.paper.pages = 0 }, 'paper.pages'],
  ['pages 10,001', f => { f.paper.pages = 10001 }, 'paper.pages'],
  // views
  ['a view of x0 = x1', f => { f.views[6] = f.views[4] }, 'views[6]'],
  ['a view of y0 > y1', f => { f.views[5] = 800 }, 'views[7]'],
  ['a broken views stride', f => { f.views.push(0) }, 'views'],
  ['a view past 14,400', f => { f.views[2] = 14401 }, 'views[2]'],
  // fonts
  ['513 fonts', f => { f.fonts = Array.from({ length: 513 }, (_, i) => `F${i}`) }, 'fonts'],
  ['a font of 129 characters', f => { f.fonts[1] = 'F'.repeat(129) }, 'fonts[1]'],
  ['a font holding é', f => { f.fonts[1] = 'Café' }, 'fonts[1]'],
  ['an empty font name', f => { f.fonts[1] = '' }, 'fonts[1]'],
  // units
  ['units out of order', f => { [f.units[1], f.units[2]] = [f.units[2], f.units[1]] }, 'units[2][0]'],
  ['an id twice', f => { f.units[2][0] = f.units[1][0] }, 'units[2][0]'],
  ['a negative id', f => { f.units[0][0] = -1 }, 'units[0][0]'],
  ['a unit row of 4', f => { f.units[1].pop() }, 'units[1]'],
  ['a kind past UNIT_KINDS', f => { f.units[1][1] = UNIT_KINDS.length }, 'units[1][1]'],
  ['depth 6', f => { f.units[1][2] = 6 }, 'units[1][2]'],
  ['depth -2', f => { f.units[1][2] = -2 }, 'units[1][2]'],
  ['depth 8', f => { f.units[1][2] = 8 }, 'units[1][2]'],
  ['flags 32 (8 and 16 are FLUSH_LEFT and FLUSH_RIGHT, LAYOUT 26)', f => { f.units[1][3] = 32 }, 'units[1][3]'],
  ['flags CENTRED and FLUSH_LEFT both', f => { f.units[1][3] = UNIT_FLAG.CENTRED | UNIT_FLAG.FLUSH_LEFT }, 'units[1][3]'],
  ['flags FLUSH_LEFT and FLUSH_RIGHT both', f => { f.units[1][3] = UNIT_FLAG.TITLE | UNIT_FLAG.FLUSH_LEFT | UNIT_FLAG.FLUSH_RIGHT }, 'units[1][3]'],
  ['pieces 10,001', f => { f.units[1][4] = 10001 }, 'units[1][4]'],
  // lines
  ['a line row of 7 numbers', f => { f.lines[0][1].pop() }, 'lines[0][1]'],
  ['a lines entry with no line', f => { f.lines[0][1] = [] }, 'lines[0][1]'],
  ['2,001 lines in a unit', f => { f.lines[0][1] = row(2001, f.lines[0][1]) }, 'lines[0][1]'],
  ['lines out of order', f => { [f.lines[1], f.lines[2]] = [f.lines[2], f.lines[1]] }, 'lines[2][0]'],
  ['lines of a unit not in units', f => { f.lines[0][0] = 1 }, 'lines[0][0]'],
  ['a line on page pages + 1', f => { f.lines[0][1][0] = 4 }, 'lines[0][1][0]'],
  ['a line 2 pt outside its view', f => { f.lines[0][1][1] = -2 }, 'lines[0][1][1]'],
  ['a line 2 pt above its view', f => { f.lines[0][1][4] = 794 }, 'lines[0][1][4]'],
  ['a line of x0 = x1', f => { f.lines[0][1][2] = f.lines[0][1][1] }, 'lines[0][1][2]'],
  ['a line with bottom = top', f => { f.lines[0][1][5] = f.lines[0][1][4] }, 'lines[0][1][5]'],
  ['a baseline 2 pt above its top', f => { f.lines[0][1][3] = f.lines[0][1][4] + 2 }, 'lines[0][1][3]'],
  ['a baseline 2 pt below its bottom', f => { f.lines[0][1][3] = f.lines[0][1][5] - 2 }, 'lines[0][1][3]'],
  ['size 0', f => { f.lines[0][1][6] = 0 }, 'lines[0][1][6]'],
  ['size 201', f => { f.lines[0][1][6] = 201 }, 'lines[0][1][6]'],
  ['a font index past fonts', f => { f.lines[0][1][7] = 3 }, 'lines[0][1][7]'],
  ['a font index of 0.5', f => { f.lines[0][1][7] = 0.5 }, 'lines[0][1][7]'],
  // frames
  ['frames that leave a gap', f => { f.frames[3][1][8] = 3 }, 'frames[3][1][8]'],
  ['frames that overlap', f => { f.frames[3][1][8] = 1 }, 'frames[3][1][8]'],
  ['frames that stop before the unit\'s last line', f => { f.frames[3][1].splice(12, 6) }, 'frames[3][1]'],
  ['a frame past the unit\'s lines', f => { f.frames[3][1][15] = 2 }, 'frames[3][1][15]'],
  ['a frame of no line', f => { f.frames[0][1] = [1, 0, 0, 0, -1, 30, 1, 0, 0, 1, 0, 30] }, 'frames[0][1][3]'],
  ['a first frame not starting at 0', f => { f.frames[0][1][2] = 1 }, 'frames[0][1][2]'],
  ['frames whose shares fall', f => { f.frames[3][1][16] = 300 }, 'frames[3][1][16]'],
  ['a share of 1,001', f => { f.frames[3][1][16] = 1001 }, 'frames[3][1][16]'],
  ['a first share not -1', f => { f.frames[3][1][4] = 0 }, 'frames[3][1][4]'],
  ['a later share of -1', f => { f.frames[3][1][10] = -1 }, 'frames[3][1][10]'],
  ['a negative below', f => { f.frames[3][1][5] = -0.5 }, 'frames[3][1][5]'],
  ['a below past its page\'s height', f => { f.frames[3][1][5] = 792.01 }, 'frames[3][1][5]'],
  ['column 3', f => { f.frames[3][1][1] = 3 }, 'frames[3][1][1]'],
  ['a frame on a page its lines are not on', f => { f.frames[3][1][0] = 1 }, 'frames[3][1][0]'],
  ['a frame row of 5', f => { f.frames[0][1].pop() }, 'frames[0][1]'],
  ['frames out of order', f => { [f.frames[1], f.frames[2]] = [f.frames[2], f.frames[1]] }, 'frames[2][0]'],
  ['a unit with lines and no frames', f => { f.frames.splice(3, 1) }, 'frames'],
  ['frames of a unit without lines', f => { f.lines.pop() }, 'frames[5][0]'],
  // erase
  ['17 erase rectangles on one line', f => { f.erase[0][1].push(...row(15, [0, 72, 647.25, 300, 657.5])) }, 'erase[0][1][85]'],
  ['an erase on a line the unit has not', f => { f.erase[0][1][10] = 2 }, 'erase[0][1][10]'],
  ['an erase off its line\'s view', f => { f.erase[1][1][3] = 614 }, 'erase[1][1][3]'],
  ['an erase of x0 = x1', f => { f.erase[1][1][3] = 312 }, 'erase[1][1][3]'],
  ['an erase of y0 = y1', f => { f.erase[1][1][4] = 675.25 }, 'erase[1][1][4]'],
  ['an erase row of 4', f => { f.erase[0][1].pop() }, 'erase[0][1]'],
  ['an erase of a unit without lines', f => { f.lines.splice(1, 1); f.frames.splice(1, 1) }, 'erase[0][0]'],
  ['erase out of order', f => { f.erase.reverse() }, 'erase[1][0]'],
  // placeholders
  ['a placeholder of an unlocated unit', f => { f.ph[0][0] = 1 }, 'ph[0][0]'],
  ['k equal to its unit\'s pieces', f => { f.ph[0][1] = 5 }, 'ph[0][1]'],
  ['a k twice in a unit', f => { f.ph[1][1] = 1 }, 'ph[1][1]'],
  ['10,000 placeholders in one unit whose pieces are 9,999', f => {
    f.units[1][4] = 9999
    f.ph = Array.from({ length: 10000 }, (_, k) => [2, k, MATH, PH_FLAG.EMPTY])
  }, 'ph[9999][1]'],
  ['5 segments of an inline kind', f => { f.ph[0].push(...row(4, f.ph[0].slice(4))) }, 'ph[0]'],
  ['65 segments of a display', f => { f.ph[3].push(...row(63, f.ph[3].slice(4, 10))) }, 'ph[3]'],
  ['0 segments without EMPTY or LOST', f => { f.ph[0] = f.ph[0].slice(0, 4) }, 'ph[0]'],
  ['a segment on an EMPTY placeholder', f => { f.ph[4].push(...f.ph[0].slice(4)) }, 'ph[4]'],
  ['EMPTY and LOST together', f => { f.ph[4][3] = PH_FLAG.EMPTY | PH_FLAG.LOST }, 'ph[4][3]'],
  ['NUMBERED on a citation', f => { f.ph[1][3] = PH_FLAG.SOURCE_BRACKETS | PH_FLAG.NUMBERED }, 'ph[1][3]'],
  ['a placeholder kind of 11', f => { f.ph[0][2] = 11 }, 'ph[0][2]'],
  ['placeholder flags of 512', f => { f.ph[0][3] = 512 }, 'ph[0][3]'],
  // JOINED: a display's, alone, with no segments of its own (its ink its group's first display's)
  ['JOINED on a formula', f => { f.ph[0] = [2, 1, MATH, PH_FLAG.JOINED] }, 'ph[0]'],
  ['JOINED with segments', f => { f.ph[3][3] = PH_FLAG.JOINED }, 'ph[3]'],
  ['JOINED and LOST', f => { f.ph[3] = [5, 2, DISPLAY, PH_FLAG.JOINED | PH_FLAG.LOST] }, 'ph[3]'],
  ['JOINED and NUMBERED', f => { f.ph[3] = [5, 2, DISPLAY, PH_FLAG.JOINED | PH_FLAG.NUMBERED] }, 'ph[3]'],
  // OUTSIDE: with LOST alone
  ['OUTSIDE on a found formula', f => { f.ph[0][3] = PH_FLAG.OUTSIDE }, 'ph[0][3]'],
  ['OUTSIDE and LOST and RAISED', f => { f.ph[5][3] = PH_FLAG.LOST | PH_FLAG.OUTSIDE | PH_FLAG.RAISED }, 'ph[5][3]'],
  ['OUTSIDE and EMPTY', f => { f.ph[4][3] = PH_FLAG.EMPTY | PH_FLAG.OUTSIDE }, 'ph[4][3]'],
  ['TEXT on a formula', f => { f.ph[0][3] = PH_FLAG.TEXT }, 'ph[0]'],
  ['TEXT and LOST', f => { f.ph[5][3] = PH_FLAG.TEXT | PH_FLAG.LOST }, 'ph[5]'],
  ['a TEXT placeholder with no text', f => { f.ph[5][3] = PH_FLAG.TEXT }, 'pageText'],
  ['held not an array', f => { (f as Record<string, unknown>).held = {} }, 'held'],
  ['held of a unit without lines', f => { f.held.unshift([1, [1]]) }, 'held[0][0]'],
  ['held its first line', f => { f.held[0]![1] = [0] }, 'held[0][1][0]'],
  ['held past its lines', f => { f.held[0]![1] = [5] }, 'held[0][1][0]'],
  ['held twice', f => { f.held[0]![1] = [1, 1] }, 'held[0][1][1]'],
  ['held a line with an erase', f => { f.held[0]![1] = [3] }, 'held[0][1][0]'],
  ['held of no lines', f => { f.held[0]![1] = [] }, 'held[0][1]'],
  ['a placeholder row of 9', f => { f.ph[0].pop() }, 'ph[0]'],
  ['a fill past 0xFFFFFF', f => { f.ph[1][10] = 0x1000000 }, 'ph[1][10]'],
  ['a fill of -2', f => { f.ph[1][10] = -2 }, 'ph[1][10]'],
  ['a fill of 1.5', f => { f.ph[1][10] = 1.5 }, 'ph[1][10]'],
  ['a fill as a string', f => { (f.ph[1] as unknown[])[10] = '#0071bc' }, 'ph[1][10]'],
  ['a fill on an EMPTY placeholder', f => { f.ph[4].push(0x0071bc) }, 'ph[4][4]'],
  ['a fill on a LOST placeholder', f => { f.ph[5].push(MIXED_FILL) }, 'ph[5][4]'],
  ['a fill and a number more', f => { f.ph[1].push(0) }, 'ph[1]'],
  ['a segment on page 4', f => { f.ph[0][4] = 4 }, 'ph[0][4]'],
  ['a segment of x0 = x1', f => { f.ph[0][7] = f.ph[0][5] }, 'ph[0][7]'],
  ['a segment with bottom = top', f => { f.ph[0][9] = f.ph[0][8] }, 'ph[0][9]'],
  ['a segment 2 pt left of its view', f => { f.ph[0][5] = -2 }, 'ph[0][5]'],
  // labels
  ['5 labels on a unit', f => { f.labels.push(...Array.from({ length: 4 }, () => [...f.labels[1]])) }, 'labels[6][0]'],
  ['a label row of 7', f => { f.labels[0].pop() }, 'labels[0]'],
  ['a label of an unlocated unit', f => { f.labels[0][0] = 4 }, 'labels[0][0]'],
  ['a label kind of 4', f => { f.labels[0][1] = 4 }, 'labels[0][1]'],
  ['a label off its view', f => { f.labels[0][3] = -5 }, 'labels[0][3]'],
  ['a label\'s baseline 2 pt below its bottom', f => { f.labels[0][4] = 715 }, 'labels[0][4]'],
  ['a label with bottom = top', f => { f.labels[0][7] = 728.5 }, 'labels[0][7]'],
  // babel's names (D1a)
  ['names not an array', f => { f.names = {} }, 'names'],
  ['a name row of 14', f => { f.names[0].pop() }, 'names[0]'],
  ['names not by occurrence rising', f => { f.names[1][0] = 1 }, 'names[1][0]'],
  ['a name of a key past NAME_KEYS', f => { f.names[0][1] = NAME_KEYS.length }, 'names[0][1]'],
  ['a name on page 4', f => { f.names[0][2] = 4 }, 'names[0][2]'],
  ['a name with x0 = x1', f => { f.names[0][5] = f.names[0][3] }, 'names[0][5]'],
  ["a name's baseline 2 pt over its top", f => { f.names[0][4] = 690 }, 'names[0][4]'],
  ['a name of size 0', f => { f.names[0][8] = 0 }, 'names[0][8]'],
  ['a name of a font past fonts', f => { f.names[0][9] = 3 }, 'names[0][9]'],
  ['a name of flags 8', f => { f.names[0][10] = 8 }, 'names[0][10]'],
  ['a run-in name leading no unit of the file', f => { f.names[2][11] = 4 }, 'names[2][11]'],
  ['a name not run in that leads a unit', f => { f.names[0][11] = 7 }, 'names[0][11]'],
  ['a run-in name of no unit', f => { f.names[2][11] = -1 }, 'names[2][11]'],
  ['a glue on a name not run in', f => { f.names[0][12] = 1 }, 'names[0][12]'],
  ['a negative glue', f => { f.names[2][12] = -1 }, 'names[2][12]'],
  ["a glue past the page's width", f => { f.names[2][12] = 700 }, 'names[2][12]'],
  ["a name's column with x0 = x1", f => { f.names[0][14] = f.names[0][13] }, 'names[0][13]'],
  ["a name's column past the page", f => { f.names[0][14] = 700 }, 'names[0][13]'],
  ['10,001 names', f => { f.names = Array.from({ length: 10_001 }, (_, i) => [i, 0, 1, 280, 680, 332.5, 687, 677.5, 9, 1, 0, -1, 0, 72, 540]) }, 'names'],
  // headings
  ['a heading id of a paragraph', f => { f.headings[1][0] = 2 }, 'headings[1][0]'],
  ['a heading of an unlocated unit', f => { f.headings[0][0] = 1 }, 'headings[0][0]'],
  ['a heading twice', f => { f.headings.push([3, 'Again']) }, 'headings[2][0]'],
  ['a heading\'s src of 4,001 code units', f => { f.headings[1][1] = 'x'.repeat(4001) }, 'headings[1][1]'],
  ['a heading entry of 3', f => { f.headings[1].push('x') }, 'headings[1]'],
  // types
  ['a string where a number goes', f => { f.lines[0][1][1] = '150.5' }, 'lines[0][1][1]'],
  ['a number where a string goes', f => { f.pdfjs = 5 }, 'pdfjs'],
  ['a number where a font name goes', f => { f.fonts[0] = 5 }, 'fonts[0]'],
  ['null where an array goes', f => { f.units = null }, 'units'],
  ['an object where a row goes', f => { f.ph[0] = {} }, 'ph[0]'],
  ['true where an id goes', f => { f.headings[0][0] = true }, 'headings[0][0]'],
  ['an array where a src goes', f => { f.headings[0][1] = ['A title'] }, 'headings[0][1]'],
  // the page text: [unit, k, text] of a found placeholder of a page-text kind, rising, its text 1 to TEXT_MAX code units
  // of characters the text layer may give (a space; no control, bidi or lone surrogate)
  ['page text not an array', f => { f.pageText = {} }, 'pageText'],
  ['a page text of two fields', f => { f.pageText[0].pop() }, 'pageText[0]'],
  ['a page text of no unit of units', f => { f.pageText[0][0] = 4 }, 'pageText[0][0]'],
  ['a page text of a piece with no row', f => { f.pageText[0][1] = 2 }, 'pageText[0][1]'],
  ['a page text of a formula', f => { f.pageText[0][1] = 1 }, 'pageText[0][1]'],
  ['a page text of an EMPTY reference', f => { f.pageText[0] = [5, 4, '(2)'] }, 'pageText[0][1]'],
  ['a page text of a LOST one', f => { f.ph[1][3] = PH_FLAG.LOST; f.ph[1].length = 4 }, 'pageText[0][1]'],
  ['page texts not rising', f => { f.pageText.push([2, 3, '[1]']) }, 'pageText[1][1]'],
  ['a page text of a unit before the last', f => { f.ph.push([0, 0, CITE, 0, 1, 200, 650, 230.5, 657.5, 646]); f.pageText.push([0, 0, '[1]']) }, 'pageText[1][0]'],
  ['an empty page text', f => { f.pageText[0][2] = '' }, 'pageText[0][2]'],
  [`a page text of ${'257'} code units`, f => { f.pageText[0][2] = 'x'.repeat(TEXT_MAX + 1) }, 'pageText[0][2]'],
  ['a page text that is no string', f => { f.pageText[0][2] = 12 }, 'pageText[0][2]'],
  ['a page text with a tab', f => { f.pageText[0][2] = '[1,\t2]' }, 'pageText[0][2]'],
  ['a page text with a line break', f => { f.pageText[0][2] = '[1,\n2]' }, 'pageText[0][2]'],
  ['a page text with DEL', f => { f.pageText[0][2] = '[1\u007f]' }, 'pageText[0][2]'],
  ['a page text with a C1 control', f => { f.pageText[0][2] = '[1\u0085]' }, 'pageText[0][2]'],
  ['a page text with a bidi override', f => { f.pageText[0][2] = '[\u202e21]' }, 'pageText[0][2]'],
  ['a page text with a bidi isolate', f => { f.pageText[0][2] = '[\u206621]' }, 'pageText[0][2]'],
  ['a page text with a lone surrogate', f => { f.pageText[0][2] = '[\ud83d]' }, 'pageText[0][2]'],
  ['a page text with a byte order mark', f => { f.pageText[0][2] = '\ufeff[1]' }, 'pageText[0][2]'],
]

describe('refused by every bound', () => {
  it.each(ROWS)('%s', (_, edit, path) => {
    const e = refusal(broken(edit))
    expect(e, 'refused').not.toBeNull()
    expect(e!.path).toBe(path)
    expect(e!.message.startsWith(path)).toBe(true)
  })

  it('1e400 is Infinity once parsed, and refused', () => {
    const text = JSON.stringify(made()).replace('"views":[0,', '"views":[1e400,')
    expect(text).toContain('1e400')
    expect(refusal(utf8(text))?.path).toBe('views[0]')
    expect(refusal(utf8(JSON.stringify(made()).replace('[1,150.5,', '[1,-1e400,')))?.path).toBe('lines[0][1][1]')
  })

  it('the made file and every row\'s unbroken twin parse: each row breaks its bound alone', () => {
    expect(refusal(broken(() => {}))).toBeNull()
    // the bounds' edges are accepted
    const edges: Edit[] = [
      f => { f.paper.pages = 3; f.paper.version = 1000; f.left = ''; f.pdfjs = '~'.repeat(32) },
      f => { f.fonts[1] = '!'.repeat(128); f.units[1][2] = -1; f.units[2][2] = 5; f.units[1][3] = 7; f.units[1][4] = 10000 },
      f => { f.lines[0][1][1] = -1; f.lines[0][1][2] = 613; f.lines[0][1][3] = f.lines[0][1][4] + 1; f.lines[0][1][6] = 200 },
      f => { f.frames[3][1][10] = 0; f.frames[3][1][16] = 0; f.frames[3][1][17] = 792 },
      f => { f.frames[3][1][10] = 1000; f.frames[3][1][16] = 1000; f.frames[3][1][5] = 0 },
      f => { f.erase[0][1].push(...row(14, [0, 72, 647.25, 300, 657.5])) },
      f => { f.ph[0].push(...row(3, f.ph[0].slice(4))); f.ph[3].push(...row(62, f.ph[3].slice(4, 10))) },
      f => { f.ph[0][3] = PH_FLAG.RAISED | PH_FLAG.LOWERED | PH_FLAG.SOURCE_BRACKETS; f.ph[1][1] = 4; f.pageText[0][1] = 4 },
      f => { f.labels.push(...Array.from({ length: 3 }, () => [...f.labels[1]])); f.headings[1][1] = 'x'.repeat(4000) },
      f => { f.paper.id = 'hep-th/9901001' },
      f => { f.paper.id = 'math.GT/0309136' },
      f => { f.paper.id = '0704.0001' },
      f => { f.paper.id = `${'x'.repeat(16)}/9901001` },
      f => { f.paper.id = 'cs/9901001' },
      f => { f.paper.id = 'astro-ph.GA/0309136' },
      // a page text of TEXT_MAX code units, of a space, a no-break space and a character outside the BMP; none at all
      f => { f.pageText[0][2] = `[1,\u00a02 \u{1d465}${'9'.repeat(TEXT_MAX - 9)}]` },
      f => { f.pageText = [] },
      f => { f.ph.push([8, 0, PH_KINDS.indexOf('eqref'), PH_FLAG.RAISED, 2, 72, 100, 90, 106, 98]); f.pageText.push([8, 0, '(3.1)']) },
    ]
    for (const edit of edges) expect(refusal(broken(edit))).toBeNull()
    expect(`[1,\u00a02 \u{1d465}${'9'.repeat(TEXT_MAX - 9)}]`).toHaveLength(TEXT_MAX)
  })

  it('the page texts of a file are PAGE_TEXT_ALL code units at most', () => {
    // a unit of 2,000 citations, each with a page text of TEXT_MAX code units
    const n = Math.ceil(PAGE_TEXT_ALL / TEXT_MAX) + 1
    const edit: Edit = f => {
      f.units[1][4] = 10000
      f.ph = f.ph.filter((r: number[]) => r[0] !== 2)
      f.pageText = []
      for (let k = 0; k < n; k++) { f.ph.splice(k, 0, [2, k, CITE, 0, 1, 200, 650, 230.5, 657.5, 646]); f.pageText.push([2, k, 'x'.repeat(TEXT_MAX)]) }
    }
    expect(refusal(broken(edit))?.path).toBe('pageText')
    const fewer: Edit = f => { edit(f); f.pageText.length = n - 2 }
    expect(refusal(broken(fewer))).toBeNull()
  })
})

// ---------------------------------------------------------------- a layout part (bundle 4)
/** the file's rows and tables of PART_KEYS, what a part holds */
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the part's types on purpose
const partOf = (f: any) => Object.fromEntries(PART_KEYS.map(k => [k, f[k]])) as any

describe('a layout part', () => {
  const whole = made()
  const checked = (part: unknown, lo = 1, hi = 3, views = whole.views.slice(4 * (lo - 1), 4 * hi)) => checkLayoutPart(structuredClone(part), { pages: 3, views, lo, hi })
  const refused = (part: unknown, lo?: number, hi?: number, views?: number[]): LayoutRefusal | null => {
    try { checked(part, lo, hi, views); return null } catch (e) { if (!(e instanceof LayoutRefusal)) throw e; return e }
  }

  it('is the file\'s own rows: PART_KEYS in the file\'s order, and the made file\'s part passes, whole or by pages', () => {
    expect(PART_KEYS).toEqual(Object.keys(whole).filter(k => !['schema', 'layout', 'pdfjs', 'paper', 'left', 'views', 'lineskip'].includes(k)))
    expect(checked(partOf(whole))).toEqual(partOf(whole))
    expect(encodeLayoutPart(partOf(whole))).toBe(JSON.stringify(partOf(whole)))
    expect(JSON.stringify(layoutPartRows(partOf(whole)))).toBe(encodeLayoutPart(partOf(whole)))
  })

  // every row bound of checkLayout, through the part: the same table, less what is the header's
  it.each(ROWS.filter(([, , path]) => (PART_KEYS as readonly string[]).includes(path.split(/[[.]/)[0] ?? '')))('refuses at the same path: %s', (_, edit, path) => {
    const f = structuredClone(made())
    edit(f)
    const e = refused(partOf(f))
    expect(e, 'refused').not.toBeNull()
    expect(e!.path).toBe(path)
  })

  it('refuses a key of the header, a key missing, and anything that is not an object', () => {
    for (const extra of ['schema', 'paper', 'views', 'lineskip', 'left']) expect(refused({ ...partOf(whole), [extra]: 1 })?.path).toBe(extra)
    const { names: _names, ...short } = partOf(whole)
    expect(refused(short)?.path).toBe('names')
    expect(refused([])?.path).toBe('')
    expect(refused(null)?.path).toBe('')
  })

  it('takes a row on a page of [lo, hi] only, its box within that page\'s view (the views are the part\'s, from page lo)', () => {
    // the units of pages 2 and 3: 3, 5, 7, 8 (their placeholders, labels, held lines), the names of page 3
    const keep = new Set([3, 5, 7, 8])
    const part = partOf(whole)
    const onlyKept = (rows: number[][], at = 0) => rows.filter(r => keep.has(r[at] as number))
    const later = {
      ...part,
      units: onlyKept(part.units), lines: onlyKept(part.lines), frames: onlyKept(part.frames), erase: onlyKept(part.erase),
      ph: onlyKept(part.ph), labels: onlyKept(part.labels), headings: onlyKept(part.headings), pageText: [], held: onlyKept(part.held),
      names: part.names.filter((r: number[]) => (r[2] ?? 0) >= 2),
    }
    // page 2 wider than page 3: a box at x = 650 is page 2's alone
    const views = [0, 0, 700, 800, 0, 0, 612, 792]
    expect(refused(later, 2, 3, views)).toBeNull()
    expect(refused(part, 2, 3, views)?.path).toMatch(/^units\[0\]|^lines\[0\]\[1\]\[0\]/)
    const wide = structuredClone(later)
    wide.lines[0][1][2] = 650
    expect(refused(wide, 2, 3, views)).toBeNull()
    wide.lines[0][1][2] = 650
    wide.lines[0][1][0] = 3
    expect(refused(wide, 2, 3, views)?.path).toBe('lines[0][1][2]')
    // a page outside [lo, hi] is named: page 1 here, and page 3 where hi is 2
    const early = structuredClone(later)
    early.lines[0][1][0] = 1
    expect(refused(early, 2, 3, views)).toMatchObject({ path: 'lines[0][1][0]', message: expect.stringMatching(/not a page 2 to 3/) })
    expect(refused(later, 2, 2, views.slice(0, 4))).toMatchObject({ message: expect.stringMatching(/not a page 2 to 2/) })
  })

  it('is bounded per part: FONTS_MAX names, NAMES_MAX names, in one part', () => {
    const f = made()
    expect(refused({ ...partOf(f), fonts: Array.from({ length: 513 }, (_, i) => `F${i}`) })?.path).toBe('fonts')
    expect(refused({ ...partOf(f), fonts: Array.from({ length: 512 }, (_, i) => `F${i}`) })).toBeNull()
  })

  it('a whole file cut into parts (`sized` false) is read past the bounds a part holds, every other bound held', () => {
    // NAMES_MAX + 1 names, occurrence rising, each the abstract's on page 1
    const over = structuredClone(made())
    const name = over.names[0] as number[]
    over.names = Array.from({ length: 10_001 }, (_, i) => [i + 1, ...name.slice(1)])
    const bytes = utf8(encodeLayout(over))
    expect(refusal(bytes)).toMatchObject({ path: 'names', bound: 'rows' })
    expect(parseLayout(bytes, { sized: false }).names).toHaveLength(10_001)
    // the fonts past FONTS_MAX, a whole file's lines past LINES_ALL alike; a bound of a row's own (its page) still refuses
    const fonts = structuredClone(made())
    fonts.fonts = Array.from({ length: 513 }, (_, i) => `F${i}`)
    expect(refusal(utf8(encodeLayout(fonts)))?.path).toBe('fonts')
    expect(parseLayout(utf8(encodeLayout(fonts)), { sized: false }).fonts).toHaveLength(513)
    const bad = structuredClone(over)
    ;(bad.names[5] as number[])[2] = 4
    expect(() => parseLayout(utf8(encodeLayout(bad)), { sized: false })).toThrow(expect.objectContaining({ path: 'names[5][2]' }))
  })

  it('refuses a call that is not pages lo to hi of the paper with their views', () => {
    const part = partOf(whole)
    expect(() => checkLayoutPart(part, { pages: 3, views: whole.views, lo: 0, hi: 3 })).toThrow(RangeError)
    expect(() => checkLayoutPart(part, { pages: 3, views: whole.views, lo: 2, hi: 1 })).toThrow(RangeError)
    expect(() => checkLayoutPart(part, { pages: 3, views: whole.views, lo: 1, hi: 4 })).toThrow(RangeError)
    expect(() => checkLayoutPart(part, { pages: 3, views: whole.views.slice(0, 8), lo: 1, hi: 3 })).toThrow(RangeError)
  })

  it('checkLineskip is the file\'s lineskip check, at the path it is given', () => {
    expect(checkLineskip(null, 'lineskip')).toBeNull()
    expect(checkLineskip([1, 0], 'lineskip')).toEqual([1, 0])
    for (const bad of [[1], [1, 'x'], [1, 20000], {}, 7]) expect(() => checkLineskip(bad, 'head.lineskip')).toThrow(expect.objectContaining({ path: expect.stringMatching(/^head\.lineskip/) }))
  })
})

/** the file with its fonts table renumbered by first appearance (the lines by unit id, then the names), as the maker builds it */
function inFirstUse(f: LayoutFile): LayoutFile {
  const order: number[] = []
  const note = (i: number) => { if (!order.includes(i)) order.push(i) }
  for (const [, rows] of [...f.lines].sort((a, b) => a[0] - b[0])) for (let j = 7; j < rows.length; j += 8) note(rows[j] as number)
  for (const r of f.names) note(r[9] as number)
  const at = (i: number) => order.indexOf(i)
  return { ...f, fonts: order.map(i => f.fonts[i] as string), lines: f.lines.map(([id, rows]) => [id, rows.map((v, j) => (j % 8 === 7 ? at(v) : v))]), names: f.names.map(r => r.map((v, j) => (j === 9 ? at(v) : v))) }
}

describe('mergeLayout', () => {
  it('puts parts cut from a file back as the file: rows by id, names by occurrence, the fonts table by first appearance', () => {
    const f = inFirstUse(made())
    // two parts: units 0-3 with names 1; units 5-8 with names 4, 6; each its own fonts table, in its own order
    const cut = (ids: number[], names: number[][], fonts: string[]) => {
      const part = partOf(structuredClone(f))
      const keep = (r: number[]) => ids.includes(r[0] as number)
      const remap = (i: number) => fonts.indexOf(f.fonts[i] as string)
      const lines = part.lines.filter(keep).map(([id, rows]: [number, number[]]) => [id, rows.map((v, j) => (j % 8 === 7 ? remap(v) : v))])
      return {
        fonts, units: part.units.filter(keep), lines, frames: part.frames.filter(keep), erase: part.erase.filter(keep), ph: part.ph.filter(keep),
        labels: part.labels.filter(keep), headings: part.headings.filter(keep), pageText: part.pageText.filter(keep), held: part.held.filter(keep),
        names: names.map(r => r.map((v, j) => (j === 9 ? remap(v) : v))),
      }
    }
    const a = cut([0, 2, 3], [f.names[0] as number[]], ['CMBX12', 'CMR10'])
    const b = cut([5, 7, 8], [f.names[1] as number[], f.names[2] as number[]], ['CMMI10', 'CMBX12', 'CMR10'])
    expect(a.fonts.length + b.fonts.length).toBeGreaterThan(f.fonts.length)
    const merged = mergeLayout([a, b])
    expect(merged).toEqual(partOf(f))
    expect(encodeLayoutPart(merged)).toBe(encodeLayoutPart(partOf(f)))
    // in the other order too, and the parts are not changed
    const before = JSON.stringify([a, b])
    expect(mergeLayout([b, a])).toEqual(partOf(f))
    expect(JSON.stringify([a, b])).toBe(before)
  })

  it('leaves out a font in no row, and merges no parts to the empty part', () => {
    const f = inFirstUse(made())
    const part = { ...partOf(f), fonts: [...f.fonts, 'Unused'] }
    expect(mergeLayout([part]).fonts).toEqual(f.fonts)
    expect(mergeLayout([])).toEqual({ fonts: [], units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [] })
  })
})

// ---------------------------------------------------------------- the largest valid file
const PAGES = 1000, UNITS = 10000
/** a unit's lines: 1 to 8, the shape the file's 95 % of LAYOUT_VALUES was tuned with */
const linesOf = (i: number) => 1 + Math.floor((i % 9) * 0.875) + (i % 10 === 9 ? 1 : 0)
/** a file of 10,000 units within the caps, lines-heavy (a line costs the index most): every unit framed and every line
 *  erased (16 rectangles on a line of every hundredth unit), a split every seventh unit, a formula a unit, a numbered
 *  display every fourth, an empty citation every third, a label and a heading every tenth */
function largest(): LayoutFile {
  const views: number[] = []
  for (let p = 0; p < PAGES; p++) views.push(0, 0, 612, 792)
  const fonts = Array.from({ length: 512 }, (_, i) => `NimbusRomNo9L-Regu${i}`)
  const f: LayoutFile = { schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs: '5.4.296', paper: { id: '2608.30730', version: 3, pages: PAGES }, left: 'f'.repeat(64), views, fonts, units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [], lineskip: null }
  for (let i = 0; i < UNITS; i++) {
    const id = 2 * i, heading = i % 10 === 0, n = linesOf(i), page = 1 + (i % (PAGES - 1))
    f.units.push([id, heading ? H : P, heading ? 1 : 9, i % 8 === 0 ? UNIT_FLAG.CENTRED : 0, 40])
    const split = i % 7 === 0 && n > 1 ? Math.ceil(n / 2) : n
    const rows: number[] = [], erase: number[] = []
    for (let k = 0; k < n; k++) {
      const p = k < split ? page : page + 1, base = 760 - 12 * (k < split ? k : k - split)
      rows.push(p, 72, 540, base, base + 8, base - 3, 10, (i + k) % 512)
      for (let r = 0; r < (k === 0 && i % 100 === 0 ? 16 : 1); r++) erase.push(k, 72 + 25 * r, base - 3, 91 + 25 * r, base + 8)
    }
    f.lines.push([id, rows])
    f.frames.push([id, split < n ? [page, 0, 0, split, -1, 12.25, page + 1, 1, split, n - split, 512, 100.5] : [page, 0, 0, n, -1, 12.25]])
    f.erase.push([id, erase])
    f.ph.push([id, 3, MATH, 0, page, 100.25, 760.25, 120.75, 767.76, 757.76])
    if (i % 4 === 0) f.ph.push([id, 5, DISPLAY, PH_FLAG.NUMBERED, page, 150.25, 747.75, 400.75, 755.26, 745.26, page, 500.25, 747.75, 539.75, 755.26, 745.26])
    if (i % 3 === 0) f.ph.push([id, 9, CITE, PH_FLAG.EMPTY])
    if (heading) {
      f.labels.push([id, 0, page, 50.25, 760.25, 70.5, 767.76, 757.76])
      f.headings.push([id, `Section ${i}: on the measured layout of a long paper`])
    }
  }
  return f
}
/** how full a file is: the larger of its share of LAYOUT_CAP and of LAYOUT_VALUES */
const fill = (text: string) => Math.max(text.length / LAYOUT_CAP, countValues(text) / LAYOUT_VALUES)

describe('a hostile file costs no long task', () => {
  // pre-flight K16: 200,000 lines are past both caps (1.6 M numbers); the binding cap here is LAYOUT_VALUES, and the file
  // is made to 95 % of it: 42,108 lines, each erased
  const f = largest()
  const text = encodeLayout(f)
  const bytes = utf8(text)

  it('the largest valid file within the caps parses and indexes, in one pass', () => {
    const share = fill(text)
    expect(share).toBeGreaterThanOrEqual(0.95)
    expect(share).toBeLessThan(1)
    expect(text).toBe(JSON.stringify(f))
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const parse = vi.spyOn(JSON, 'parse')
    const parsed = parseLayout(bytes)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledTimes(1)
    const index = indexLayout(parsed)
    expect(parsed.units.length).toBe(UNITS)
    expect(index.unit(2 * 9998)!.lines.length).toBe(8 * linesOf(9998))
    expect(index.unit(0)!.erase[0]!.length).toBe(4 * 16)
    expect(index.onPage(1)).toEqual(Array.from({ length: 11 }, (_, k) => 2 * 999 * k).filter(id => id < 2 * UNITS))
    let framed = 0
    for (let p = 1; p <= PAGES; p++) framed += index.onPage(p).length
    expect(framed).toBe(UNITS + f.frames.filter(([, r]) => r.length > 6).length)
  })

  it('a refused one of the same size is refused at its last row, nothing returned', () => {
    const late = JSON.stringify({ ...f, headings: [...f.headings.slice(0, -1), [2 * 9991, 'A paragraph']] })
    expect(Math.abs(late.length - text.length)).toBeLessThan(100)
    expect(refusal(utf8(late))?.path).toBe(`headings[${f.headings.length - 1}][0]`)
  })

  it.runIf(TIMING)('timing: the largest valid file parses and indexes under 400 ms; a refused one returns under 50 ms', () => {
    const late = utf8(JSON.stringify({ ...f, headings: [...f.headings.slice(0, -1), [2 * 9991, 'A paragraph']] }))
    const once = () => { const t = performance.now(); indexLayout(parseLayout(bytes)); return performance.now() - t }
    const refused = () => { const t = performance.now(); refusal(late); return performance.now() - t }
    once()
    refused()
    const ms = once(), no = refused()
    console.info(`largest valid: ${text.length} bytes, ${ms.toFixed(1)} ms; refused: ${no.toFixed(1)} ms`)
    expect(ms).toBeLessThan(400)
    expect(no).toBeLessThan(50)
  })
})

describe("each colour piece's run's fill (`colours`, PR-C): a key only where a unit has one", () => {
  const withColours = (colours: unknown) => { const f = structuredClone(made()) as unknown as Record<string, unknown>; f.colours = colours; return f }
  it('is read, indexed by piece, written back as it is, and its absence leaves the file the bytes it was', () => {
    const f = withColours([[2, 0, 0x000099], [2, 4, 0xff0000], [5, 1, 0]])
    const parsed = parseLayout(utf8(JSON.stringify(f)))
    expect(parsed.colours).toEqual([[2, 0, 0x000099], [2, 4, 0xff0000], [5, 1, 0]])
    const index = indexLayout(parsed)
    expect(index.unit(2)?.colours).toEqual(new Map([[0, 0x000099], [4, 0xff0000]]))
    expect(index.unit(3)?.colours.size).toBe(0)
    expect(parseLayout(utf8(encodeLayout(parsed)))).toEqual(parsed)
    const none = parseLayout(utf8(JSON.stringify(made())))
    expect(encodeLayout(none)).not.toContain('colours')
  })
  it('refuses an empty key, a row of another shape, a unit not of units, a piece past its unit\'s, rows out of order and a fill out of range', () => {
    for (const [colours, path] of [[[], 'colours'], [[[2, 0]], 'colours[0]'], [[[4, 0, 1]], 'colours[0][0]'], [[[2, 5, 1]], 'colours[0][1]'], [[[2, 1, 1], [2, 0, 1]], 'colours[1][1]'], [[[2, 1, 0x1000000]], 'colours[0][2]'], [[[2, 1, -1]], 'colours[0][2]'], ['x', 'colours']] as const) {
      expect(refusal(utf8(JSON.stringify(withColours(colours))))?.path, JSON.stringify(colours)).toBe(path)
    }
  })
  it('a part holds them too, and the parts merged hold them by unit and piece', () => {
    const f = parseLayout(utf8(JSON.stringify(withColours([[2, 0, 0x000099], [5, 1, 0]]))))
    const rows = layoutPartRows(f as never)
    expect(rows.colours).toEqual([[2, 0, 0x000099], [5, 1, 0]])
    const a = { ...(rows as object), colours: [[5, 1, 0]] }, b = { ...(rows as object), colours: [[2, 0, 0x000099]] }
    expect(mergeLayout([a, b] as never).colours).toEqual([[2, 0, 0x000099], [5, 1, 0]])
    const { colours: _drop, ...bare } = rows as { colours?: unknown }
    expect(Object.hasOwn(mergeLayout([bare] as never), 'colours')).toBe(false)
  })
})

describe('why each unit not laid is the original\'s (`unlaid`): a key only where one is not laid', () => {
  const withUnlaid = (unlaid: unknown) => { const f = structuredClone(made()) as unknown as Record<string, unknown>; f.unlaid = unlaid; return f }
  it('is read, written back as it is, and its absence leaves the file the bytes it was', () => {
    const f = withUnlaid([[1, 'noAnchor'], [4, 'lineTaken'], [6, 'unplacedMarks']])
    const parsed = parseLayout(utf8(JSON.stringify(f)))
    expect(parsed.unlaid).toEqual([[1, 'noAnchor'], [4, 'lineTaken'], [6, 'unplacedMarks']])
    expect(parseLayout(utf8(encodeLayout(parsed)))).toEqual(parsed)
    expect(encodeLayout(parseLayout(utf8(JSON.stringify(made()))))).not.toContain('unlaid')
    // (every code of the closed set is one)
    expect(parseLayout(utf8(JSON.stringify(withUnlaid(UNLAID.map((c, j) => [100 + j, c])))))?.unlaid).toHaveLength(UNLAID.length)
  })
  it('refuses an empty key, a row of another shape, a unit the file lays, ids out of order, a code not of the set, and past its bound', () => {
    for (const [unlaid, path] of [[[], 'unlaid'], [[[1]], 'unlaid[0]'], [[[1, 'noLine', 0]], 'unlaid[0]'], [[[2, 'noLine']], 'unlaid[0][0]'], [[[4, 'noLine'], [1, 'noLine']], 'unlaid[1][0]'], [[[4, 'noLine'], [4, 'kind']], 'unlaid[1][0]'], [[[-1, 'noLine']], 'unlaid[0][0]'], [[[1.5, 'noLine']], 'unlaid[0][0]'], [[[1, 'other']], 'unlaid[0][1]'], [[[1, 3]], 'unlaid[0][1]'], ['x', 'unlaid']] as const) {
      expect(refusal(utf8(JSON.stringify(withUnlaid(unlaid))))?.path, JSON.stringify(unlaid)).toBe(path)
    }
    const many = Array.from({ length: UNLAID_ALL + 1 }, (_, j) => [100 + j, 'kind'])
    expect(refusal(utf8(JSON.stringify(withUnlaid(many))))).toMatchObject({ path: 'unlaid', bound: 'rows' })
    // (a file cut into parts holds them all: the bound is each part's)
    expect(parseLayout(utf8(JSON.stringify(withUnlaid(many))), { sized: false }).unlaid).toHaveLength(UNLAID_ALL + 1)
  })
  it('a part holds them too, and the parts merged hold them by unit', () => {
    const f = parseLayout(utf8(JSON.stringify(withUnlaid([[1, 'noAnchor'], [6, 'dark']]))))
    const rows = layoutPartRows(f as never)
    expect(rows.unlaid).toEqual([[1, 'noAnchor'], [6, 'dark']])
    expect(checkLayoutPart(structuredClone(rows), { pages: 3, views: f.views, lo: 1, hi: 3 }).unlaid).toEqual([[1, 'noAnchor'], [6, 'dark']])
    const a = { ...(rows as object), unlaid: [[6, 'dark']] }, b = { ...(rows as object), unlaid: [[1, 'noAnchor']] }
    expect(mergeLayout([a, b] as never).unlaid).toEqual([[1, 'noAnchor'], [6, 'dark']])
    const { unlaid: _drop, ...bare } = rows as { unlaid?: unknown }
    expect(Object.hasOwn(mergeLayout([bare] as never), 'unlaid')).toBe(false)
  })
})
