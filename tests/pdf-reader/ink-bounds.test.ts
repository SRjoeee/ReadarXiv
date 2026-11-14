// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import * as E from '@readarxiv/engine'
import * as B from './helpers/ink-before.mjs'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

// pageInk's walk reads PDF.js's values through the readers of packages/engine/src/ink-args.ts (an argument's six numbers, a box
// of four, a path's box and its data, a list, an operation's arguments, a font, a shown array, a Type 3 glyph's procedure),
// each giving the value its read gave or none where the value is not of that shape (a path read past its end NaN where it
// was undefined: neither finite). Held here to the walk before that change (helpers/ink-before.mjs, a8cc7da22 verbatim),
// value for value, under every reading a reader asks of it (indices, turned, shapes, glyphs alone, budgets, steps, a turned
// page, outlines collected and given, a names table), whole and in pieces: on every page of the repository's PDFs through
// PDF.js's own lists, on seeded synthetic lists of every malformed shape the walk meets (truncated paths, a missing bbox, a
// glyph without a font, an unknown Type 3 glyph, short and absent arguments, containers of another kind), on hand cases at
// each bound, and, where the lab's data is on the machine (AXT_LAB_DATA), on ten corpus papers chosen for breadth. Every other
// function the module exports is held alike on what the walk gives and on seeded inputs of its own.

type Rec = Record<string, unknown>
type List = { fnArray: number[]; argsArray: unknown[] }
type Objects = { get(objId: string): unknown; has?(objId: string): boolean }
type Reader = { read(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): void; end(): Rec }
/** the module's functions as the test calls them, on any input */
interface Ink {
  pageInk(OPS: Record<string, number>, ops: List, objs: Objects, o: Rec): Rec
  inkReader(OPS: Record<string, number>, objs: Objects, o: Rec): Reader
  outlineBox(objs: unknown, font: unknown, fontChar: unknown): unknown
  outlineKey(font: unknown, fontId: string, g: Rec): string
  outlineTable(collected: unknown): unknown
  readOutlines(table: unknown): Map<string, unknown>
  regionsOfPoints(points: unknown, glyphCount: number): unknown
  displayTextMask(regions: unknown, n: number): unknown
  regionMask(regions: unknown, n: number, kind: string): unknown
  unreadOf(ink: unknown): unknown
  packGlyphs(glyphs: unknown, o?: Rec): unknown
}
const NOW = E as unknown as Ink
const BEFORE = B as unknown as Ink
const O = OPS as unknown as Record<string, number>

/** a seeded generator (mulberry32): the same inputs on every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** where two values first part (null: nowhere): numbers by Object.is (NaN is NaN, -0 is not 0), typed arrays element by element,
 *  arrays with their holes, Maps and Sets in their order, objects by their keys in their order */
function diff(a: unknown, b: unknown, at = ''): string | null {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? null : `${at}: ${String(a)} against ${String(b)}`
  if (a === b) return null
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!(ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) || a.constructor !== b.constructor) return `${at}: a view of another kind`
    const x = Array.from(a as unknown as ArrayLike<number>), y = Array.from(b as unknown as ArrayLike<number>)
    if (x.length !== y.length) return `${at}: a view of another length`
    for (let k = 0; k < x.length; k++) if (!Object.is(x[k], y[k])) return `${at}[${k}]: ${x[k]} against ${y[k]}`
    return null
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!(Array.isArray(a) && Array.isArray(b)) || a.length !== b.length) return `${at}: arrays of another length`
    for (let k = 0; k < a.length; k++) {
      if (k in a !== k in b) return `${at}[${k}]: a hole against none`
      const d = diff(a[k], b[k], `${at}[${k}]`)
      if (d) return d
    }
    return null
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return `${at}: maps of another size`
    const x = [...a], y = [...b]
    for (let k = 0; k < x.length; k++) {
      const d = diff(x[k]![0], y[k]![0], `${at}.key(${k})`) ?? diff(x[k]![1], y[k]![1], `${at}.get(${String(x[k]![0])})`)
      if (d) return d
    }
    return null
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return `${at}: sets of another size`
    return diff([...a], [...b], `${at}.values`)
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.join() !== kb.join()) return `${at}: keys ${ka.join()} against ${kb.join()}`
    for (const k of ka) {
      const d = diff((a as Rec)[k], (b as Rec)[k], `${at}.${k}`)
      if (d) return d
    }
    return null
  }
  return `${at}: ${String(a)} against ${String(b)}`
}
/** what a call gave, or what it threw (its class and message) */
const outcome = (f: () => unknown) => {
  try {
    return { value: f() }
  } catch (e) {
    return { threw: `${(e as Error)?.constructor?.name}: ${(e as Error)?.message}` }
  }
}
const differ = (f: (I: Ink) => unknown) => diff(outcome(() => f(NOW)), outcome(() => f(BEFORE)))

/** the readings a reader asks of the walk, each read whole */
const READINGS: readonly [string, Rec][] = [
  ['plain', { rotate: 0 }],
  ['indices', { rotate: 0, indices: true }],
  ['turned', { rotate: 0, indices: true, turned: true }],
  ['turned, every path', { rotate: 0, indices: true, turned: true, shapesAll: true }],
  ['turned, no shapes', { rotate: 0, turned: true, shapes: false }],
  ['glyphs alone', { rotate: 0, glyphsOnly: true }],
  ['budgets', { rotate: 0, indices: true, turned: true, glyphsMax: 15, boxesMax: 6 }],
  ['steps', { rotate: 0, indices: true, stepsMax: 300 }],
  ['a turned page', { rotate: 90, indices: true, turned: true }],
  ['a whole turn', { rotate: -360, indices: true }],
]
/** the readings read in pieces too */
const PIECED: readonly [string, Rec][] = [READINGS[2]!, READINGS[6]!]

/** where the walk and the one before first part on `list` (null: nowhere): under every reading whole, in pieces of `sizes`, its
 *  outlines collected, their table made and read back and given to a reading of no outlines of its own, a names table; and what
 *  the functions of the glyphs and regions it gives make of them */
function inkDifference(list: List, objs: Objects, sizes: readonly number[] = [1, 7, 1000]): string | null {
  for (const [name, o] of READINGS) {
    const d = differ(I => I.pageInk(O, list, objs, { ...o }))
    if (d) return `${name}${d}`
  }
  for (const size of sizes) {
    for (const [name, o] of PIECED) {
      const d = differ(I => {
        const r = I.inkReader(O, objs, { ...o })
        for (let i = 0; i < list.fnArray.length; i += size) r.read(list.fnArray.slice(i, i + size), list.argsArray.slice(i, i + size))
        return [r.end(), r.end()]
      })
      if (d) return `${name}, in pieces of ${size}${d}`
    }
  }
  // (outlines collected, their table, the table read back, and given where the objects give none: the browser's case)
  const collected = { now: new Map(), before: new Map() }
  const c = diff(
    outcome(() => [NOW.pageInk(O, list, objs, { rotate: 0, indices: true, collect: collected.now }), collected.now]),
    outcome(() => [BEFORE.pageInk(O, list, objs, { rotate: 0, indices: true, collect: collected.before }), collected.before]),
  )
  if (c) return `collect${c}`
  const table = BEFORE.outlineTable(collected.before)
  const t = diff(outcome(() => NOW.outlineTable(collected.now)), outcome(() => table))
  if (t) return `outlineTable${t}`
  const given = { now: NOW.readOutlines(table), before: BEFORE.readOutlines(table) }
  const g = diff(given.now, given.before)
  if (g) return `readOutlines${g}`
  const pathless: Objects = { get: id => objs.get(id), has: id => !id.includes('_path_') && (objs.has?.(id) ?? false) }
  const o = diff(
    outcome(() => NOW.pageInk(O, list, pathless, { rotate: 0, indices: true, outlines: given.now })),
    outcome(() => BEFORE.pageInk(O, list, pathless, { rotate: 0, indices: true, outlines: given.before })),
  )
  if (o) return `outlines given${o}`
  const names = { now: new Map(), before: new Map() }
  const n = diff(
    outcome(() => [NOW.pageInk(O, list, objs, { rotate: 0, names: names.now }), [...names.now.values()]]),
    outcome(() => [BEFORE.pageInk(O, list, objs, { rotate: 0, names: names.before }), [...names.before.values()]]),
  )
  if (n) return `names${n}`
  // (what the walk gives, through the functions that read it)
  const ink = BEFORE.pageInk(O, list, objs, { rotate: 0, indices: true, turned: true })
  const glyphs = ink.glyphs as Rec[], regions = ink.regions
  const order = glyphs.map((_, i) => glyphs.length - 1 - i)
  for (const [name, f] of [
    ['unreadOf', (I: Ink) => [I.unreadOf(ink), I.unreadOf(I.pageInk(O, list, objs, { rotate: 0, stepsMax: 40 }))]],
    ['packGlyphs', (I: Ink) => I.packGlyphs(glyphs)],
    ['packGlyphs, ordered', (I: Ink) => I.packGlyphs(glyphs, { order, fontIds: (f: string) => f.length, columns: ['u', 'x0', 'fill', 'font', 'ix1'] })],
    ['displayTextMask', (I: Ink) => I.displayTextMask(regions, glyphs.length + 2)],
    ['regionMask', (I: Ink) => ['code', 'display', 'dtext', 'dmath'].map(k => I.regionMask(regions, glyphs.length, k))],
  ] as const) {
    const d = differ(f)
    if (d) return `${name}${d}`
  }
  return null
}

// ---- the synthetic page: fonts, outlines and procedures of every shape

const F32 = (a: readonly number[]) => new Float32Array(a)
const THROWS = Symbol('throws')
/** a Type 3 glyph's procedure: its operations, each with arguments of every shape a procedure's may hold */
function procedureOf(next: () => number, pick: <T>(a: readonly T[]) => T): unknown {
  if (next() < 0.06) return pick<unknown>([null, undefined, 5, {}, { fnArray: 'x' }, { fnArray: { length: 'many' } }, { fnArray: [O.constructPath] }])
  const fnArray: number[] = [], argsArray: unknown[] = []
  const add = (fn: number | undefined, args: unknown) => { fnArray.push(fn ?? -1); argsArray.push(args) }
  if (next() < 0.7) add(next() < 0.5 ? O.setCharWidth : O.setCharWidthAndBounds, next() < 0.5 ? [600, 0] : [600, 0, 0, -10, 500, 700])
  for (let k = Math.floor(next() * 7); k > 0; k--) {
    const r = next()
    if (r < 0.1) add(O.save, undefined)
    else if (r < 0.18) add(O.restore, next() < 0.5 ? [] : null)
    else if (r < 0.28) add(O.transform, pick<unknown>([[2, 0, 0, 2, 5, 5], [1, 0.5, 0, 1, 0, 0], [1, 0, 0], ['a', 0, 0, 1, 0, 0], F32([0.5, 0, 0, 0.5, 1, 1]), [1e308, 0, 0, 1e308, 1e308, 0]]))
    else if (r < 0.34) add(O.setLineWidth, [pick<unknown>([3, 0, -1, 'x', Number.NaN])])
    else if (r < 0.42) add(O.setGState, [pick<unknown>([[['LW', 4]], [['ca', 0], ['CA', 0.5]], [['ca', 0.3]], [['CA', 0]], 'x', [5, ['LW']], []])])
    else if (r < 0.62) {
      const op = pick<number | undefined>([O.fill, O.eoFill, O.stroke, O.closeStroke, O.fillStroke, O.endPath, O.rawFillPath, 77])
      add(O.constructPath, [op, [pathOf(next, pick)], pick<unknown>([F32([0, 0, 500, 700]), F32([10, -5, 400, 600]), F32([5, 5, 1, 1]), F32([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]), [0, 0, 10], null, [0, 0, 'a', 1]])])
    } else if (r < 0.7) add(pick([O.paintImageMaskXObject, O.paintImageXObject, O.paintInlineImageXObject, O.paintSolidColorImageMask]), [{}])
    else if (r < 0.8) add(pick([O.setFillRGBColor, O.setFillColorN, O.setFillTransparent, O.setLineCap, O.clip, O.beginText, O.endText, O.setDash]), ['#ff0000'])
    else if (r < 0.86) add(pick([O.showText, O.shadingFill, O.paintFormXObjectBegin, O.beginGroup]), [[]])
    else add(Math.floor(next() * 120), [])
  }
  if (next() < 0.03) for (let k = 0; k < 520; k++) add(O.setLineWidth, [1])
  if (next() < 0.03) for (let k = 0; k < 1005; k++) add(O.save, undefined)
  return { fnArray, argsArray }
}
/** a path's data (DrawOPS), whole or cut short, a Float32Array as PDF.js writes it or an array, or no path at all */
function pathOf(next: () => number, pick: <T>(a: readonly T[]) => T): unknown {
  if (next() < 0.06) return pick<unknown>([null, undefined, 'abc', 5, {}, { length: 'x' }, { length: 4 }])
  const a: number[] = []
  if (next() < 0.25) {
    const x = Math.round(next() * 300), y = Math.round(next() * 300), w = Math.round(next() * 50) + 1, h = Math.round(next() * 50) + 1
    a.push(0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4)
  } else {
    for (let k = 1 + Math.floor(next() * 5); k > 0; k--) {
      const op = next() < 0.93 ? pick([0, 1, 1, 2, 3, 4]) : pick([5, -1, 1.5])
      a.push(op)
      const n = op === 0 || op === 1 ? 2 : op === 2 ? 6 : op === 3 ? 4 : 0
      for (let q = 0; q < n; q++) a.push(next() < 0.03 ? Number.NaN : Math.round((next() * 320 - 20) * 100) / 100)
    }
  }
  if (next() < 0.15) a.length = Math.floor(next() * a.length)
  return next() < 0.75 ? F32(a) : a
}
/** the page's common objects: fonts of every shape, glyph outlines, a Type 3 font's procedures by a Map and by an object; `has`
 *  where the page gives it */
function objectsOf(seed: number, withHas: boolean): Objects {
  const next = rng(seed), pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
  const procs = new Map<string, unknown>()
  for (let k = 0; k < 8; k++) procs.set(`p${k}`, procedureOf(next, pick))
  // (a glyph named by a digit: a glyph whose id is the code itself, a number, is not it)
  procs.set('3', procedureOf(next, pick))
  const base = { name: 'ABCDEF+CMR10', loadedName: 'F1', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false }
  const table: Record<string, unknown> = {
    F1: base,
    F2: { ...base, loadedName: 'F2', name: '', ascent: 0, descent: 0.1, fontMatrix: [0.002, 0, 0.0004, 0.001, 0, 0] },
    F3: { loadedName: 'F3', name: 7, fontMatrix: [1, 2], ascent: Number.NaN, descent: '-0.3' },
    F4: { ...base, loadedName: 'F4', name: 'GHIJKL+Pagella', ascent: '0.8', descent: -0.25, fontMatrix: F32([0.001, 0, 0, 0.001, 0, 0]) },
    FV: { ...base, loadedName: 'FV', vertical: true, defaultVMetrics: [1000, 500, 880] },
    FW: { ...base, loadedName: 'FW', vertical: true },
    FI: { ...base, loadedName: 'FI', isInvalidPDFjsFont: true },
    T3: { name: 'T3a', loadedName: 'T3', isType3Font: true, fontMatrix: [0.01, 0, 0, 0.01, 0, 0], charProcOperatorList: procs },
    T3o: { name: 'T3b', loadedName: 'T3o', isType3Font: true, fontMatrix: [0.001, 0, 0, -0.001, 0, 0], charProcOperatorList: Object.fromEntries(procs) },
    T3x: { name: 'T3c', loadedName: 'T3x', isType3Font: true, fontMatrix: ['x', 0, 0, 1, 0, 0], charProcOperatorList: procs },
    T3n: { name: 'T3d', loadedName: 'T3n', isType3Font: true, fontMatrix: [0.01, 0, 0, 0.01, 0, 0], charProcOperatorList: 'none' },
    T3t: { name: 'T3e', loadedName: 'T3t', isType3Font: 'yes', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], charProcOperatorList: procs },
    S: 'an error font, resolved as its message',
    N: null,
    Z: 0,
    X: THROWS,
  }
  const outlines: Record<string, unknown> = {
    a: [0, 0.1, -0.2, 1, 0.5, -0.2, 2, 0.6, 0, 0.6, 0.3, 0.5, 0.7, 1, 0.1, 0.7, 4],
    b: [],
    c: [0, 0.1],
    d: [5, 1, 2],
    e: [0, Number.NaN, 1],
    f: [0, 0, 0, 3, 0.5, 1, 1, 0, 4],
    g: THROWS,
    h: null,
    i: {},
    j: 'plain',
  }
  for (const font of ['F1', 'F2', 'F4', 'FV', 'FI', 'T3']) {
    for (const [ch, v] of Object.entries(outlines)) {
      table[`${font}_path_${ch}`] = v === THROWS || v === null ? v : ch === 'i' ? { path: {} } : ch === 'j' ? { path: [0, 0.2, 0.3, 1, 0.8, 0.9] } : { path: F32(v as number[]) }
    }
  }
  // (by its id as it is, as PDF.js's PDFObjects looks one up in a Map: an id of another kind finds nothing)
  const objects = new Map(Object.entries(table))
  const get = (id: string) => {
    if (!objects.has(id)) throw new Error(`Requesting object that isn't resolved yet ${id}.`)
    const v = objects.get(id)
    if (v === THROWS) throw new Error(`no object ${id}`)
    return v
  }
  return withHas ? { get, has: id => objects.has(id) } : { get }
}

const GLYPH_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'z', '', undefined, 7] as const
const FONTS = [['F1'], 'F1', 'F1', 'F1', 'F1', 'F2', 'F3', 'F4', 'F4', 'FV', 'FW', 'FI', 'T3', 'T3', 'T3', 'T3', 'T3o', 'T3x', 'T3n', 'T3t', 'S', 'N', 'Z', 'X', 'missing', 5, undefined]
const POINTS = ['zs', 'ze', 'q1', 'q2', 'qe1c', 'qe2j', 'fm1', 'cds1', 'cde1', 'dps2', 'dpe2', 'dts3', 'dte3', 'dms4', 'dme4', 'bs1', 'be1', 'm1', 'x.y-2']
/** a synthetic page's list: scenes of text, paths, forms, groups, annotations, images and points, with arguments of every shape
 *  PDF.js writes and of shapes it does not (a short or absent argument, a container of another kind), unbalanced at random */
function listOf(next: () => number): List {
  const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
  const fnArray: number[] = [], argsArray: unknown[] = []
  // (an operation's arguments that are no array, as no list of PDF.js's holds: a string, an object of indices, a number)
  const add = (fn: number | undefined, args: unknown) => { fnArray.push(fn ?? -1); argsArray.push(next() < 0.03 ? pick<unknown>(['F1', 'abc', { 0: 'F1', 1: 10, length: 2 }, { 0: [1, 0, 0, 1, 5, 5] }, 5, true]) : args) }
  const num = () => (next() < 0.05 ? pick<unknown>(['x', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '3']) : Math.round((next() * 600 - 50) * 100) / 100)
  const matrix = (): unknown => {
    const r = next()
    if (r < 0.55) return [1, 0, 0, 1, num(), num()]
    if (r < 0.7) return [next() * 2, 0, 0, next() * 2, num(), num()]
    if (r < 0.8) return [0, 1, -1, 0, num(), num()]
    if (r < 0.85) return F32([1, 0.3, 0, 1, 10, 10])
    return pick<unknown>([[1, 0, 0], null, undefined, 'abcdef', [1, 0, 0, 1, 0, 'y'], {}, { length: 6 }, [-1, 0, 0, 1, 0, 0]])
  }
  const box = (): unknown => {
    const r = next()
    if (r < 0.75) {
      const x = num(), y = num()
      return typeof x === 'number' && typeof y === 'number' ? F32([x, y, x + next() * 80, y + next() * 80]) : [x, y, 5, 5]
    }
    return r < 0.85 ? [num(), num(), num(), num()] : pick<unknown>([null, undefined, [0, 0, 5], F32([0, 0, 100, 100]), 'abcd', { length: 4 }])
  }
  const glyph = (): unknown => {
    if (next() < 0.12) return pick<unknown>([5, -120, 0, null, undefined, 'x', [], true])
    const g: Rec = { unicode: pick<unknown>(['a', 'B', ' ', '', 'fi', '(', 5, undefined]), fontChar: pick(GLYPH_CHARS), width: pick<unknown>([500, 0, 250.5, -100, '600', Number.NaN, undefined, null]), isSpace: pick<unknown>([false, false, true, 0, 'y']) }
    if (next() < 0.3) g.vmetric = pick<unknown>([undefined, null, [1000, 500, 880], [-900], 'x', [Number.NaN]])
    if (next() < 0.6) g.operatorListId = pick<unknown>(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'unknown', undefined, 0, 3])
    return g
  }
  const shown = (): unknown => (next() < 0.92 ? Array.from({ length: Math.floor(next() * 10) }, glyph) : pick<unknown>([null, 'abc', {}, 5]))
  const text = () => {
    add(O.beginText, [])
    if (next() < 0.92) add(O.setFont, [pick<unknown>(FONTS), pick<unknown>([10, 12, -10, 0, 'x', undefined, 9.5])])
    add(O.setTextMatrix, next() < 0.85 ? [next() < 0.6 ? [1, 0, 0, 1, num(), num()] : matrix()] : pick<unknown>([[1, 0, 0, 1, 72, 700], [], null]))
    for (let k = 1 + Math.floor(next() * 5); k > 0; k--) {
      const r = next()
      if (r < 0.45) add(O.showText, [shown()])
      else if (r < 0.5) add(O.showSpacedText, [shown()])
      else if (r < 0.55) add(O.nextLineShowText, [shown()])
      else if (r < 0.6) add(O.nextLineSetSpacingShowText, [num(), num(), shown()])
      else if (r < 0.66) add(pick([O.moveText, O.setLeadingMoveText]), [num(), num()])
      else if (r < 0.7) add(O.nextLine, [])
      else if (r < 0.85) add(pick([O.setCharSpacing, O.setWordSpacing, O.setHScale, O.setTextRise, O.setLeading]), [num()])
      else add(O.setTextRenderingMode, [pick<unknown>([0, 1, 2, 3, 4, 5, 6, 7, 'x'])])
    }
    if (next() < 0.9) add(O.endText, [])
  }
  const path = () => {
    if (next() < 0.3) add(pick([O.clip, O.eoClip]), [])
    const op = pick<unknown>([O.fill, O.eoFill, O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke, O.endPath, O.endPath, 77, 'fill'])
    const data = pathOf(next, pick)
    add(O.constructPath, next() < 0.9 ? [op, next() < 0.9 ? [data] : pick<unknown>([null, 'x', []]), box()] : pick<unknown>([[], [op], null]))
  }
  const point = (name: string) => add(O.setRenderingIntent, [next() < 0.85 ? `axt-${name}` : next() < 0.5 ? { name: `axt-${name}` } : pick<unknown>(['Perceptual', 5, null, {}])])
  const scene = (depth: number): void => {
    const r = next()
    if (r < 0.28) text()
    else if (r < 0.48) {
      if (next() < 0.7) add(O.save, undefined)
      if (next() < 0.5) add(O.transform, matrix())
      path()
      if (next() < 0.7) add(O.restore, next() < 0.5 ? [] : null)
    } else if (r < 0.56 && depth < 3) {
      add(O.paintFormXObjectBegin, next() < 0.9 ? [next() < 0.7 ? matrix() : null, box()] : pick<unknown>([[], null]))
      for (let k = Math.floor(next() * 3); k > 0; k--) scene(depth + 1)
      if (next() < 0.9) add(O.paintFormXObjectEnd, [])
    } else if (r < 0.62 && depth < 3) {
      add(O.beginGroup, [next() < 0.85 ? { smask: pick<unknown>([null, undefined, false, true, {}, 0]), bbox: box(), matrix: next() < 0.4 ? matrix() : undefined, isolated: true } : pick<unknown>([null, 5, 'x', []])])
      for (let k = Math.floor(next() * 3); k > 0; k--) scene(depth + 1)
      if (next() < 0.9) add(O.endGroup, [])
    } else if (r < 0.66 && depth < 3) {
      add(O.beginAnnotation, next() < 0.85 ? ['annot', box(), matrix(), matrix(), false] : pick<unknown>([[], ['annot'], null]))
      for (let k = Math.floor(next() * 2); k > 0; k--) scene(depth + 1)
      if (next() < 0.9) add(O.endAnnotation, [])
    } else if (r < 0.71) add(pick([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintSolidColorImageMask]), [{}])
    else if (r < 0.74) {
      const positions = next() < 0.75 ? Array.from({ length: Math.floor(next() * 7) }, num) : pick<unknown>([null, 'abcd', {}, { length: '4' }, F32([1, 2, 3, 4])])
      add(O.paintImageXObjectRepeat, next() < 0.8 ? ['img', num(), num(), positions] : ['img', 1])
    } else if (r < 0.76) add(O.paintImageMaskXObjectRepeat, [{}, num(), 0, 0, num(), next() < 0.8 ? [0, 0, 10, 10] : null])
    else if (r < 0.79) {
      const imgs = next() < 0.8 ? Array.from({ length: Math.floor(next() * 3) }, () => (next() < 0.8 ? { transform: matrix() } : pick<unknown>([null, 5]))) : pick<unknown>([null, 'x', {}, { length: 2 }])
      if (next() < 0.5) add(O.paintImageMaskXObjectGroup, [imgs])
      else add(O.paintInlineImageXObjectGroup, [{}, imgs])
    } else if (r < 0.82) add(O.shadingFill, ['shading'])
    else if (r < 0.88) {
      const entries = Array.from({ length: 1 + Math.floor(next() * 3) }, () =>
        pick<unknown>([['LW', num()], ['Font', [pick<unknown>(FONTS), 11]], ['Font', 'F1'], ['ca', pick<unknown>([0, 0.5, 1, 2, -1, 'x'])], ['CA', pick<unknown>([0, 0.5, 1])], ['BM', pick<unknown>(['source-over', 'multiply'])], ['SMask', pick<unknown>([true, false])], 'x', ['D']]),
      )
      add(O.setGState, [next() < 0.9 ? entries : pick<unknown>([null, 'x', {}])])
    } else if (r < 0.93) {
      const r2 = next()
      if (r2 < 0.4) add(O.setFillRGBColor, [pick<unknown>(['#ff0000', '#00FF7f', '#123', 'red', 5])])
      else if (r2 < 0.7) add(O.setFillColorN, pick<unknown>([['TilingPattern', 1], ['ShadingPattern'], [], null]))
      else if (r2 < 0.85) add(O.setFillTransparent, [])
      else add(O.setLineWidth, [num()])
    } else if (r < 0.97) {
      const name = pick(POINTS)
      point(name)
      if (name === 'zs' || name.startsWith('cds') || name.startsWith('dts') || name === 'bs1') {
        scene(depth + 1)
        if (next() < 0.8) point(name === 'zs' ? 'ze' : name === 'bs1' ? 'be1' : name.replace('s', 'e'))
      }
    } else add(next() < 0.5 ? Math.floor(next() * 100) : pick([O.save, O.restore, O.endGroup, O.endAnnotation, O.paintFormXObjectEnd]), pick<unknown>([[], undefined, null, [1, 2]]))
  }
  for (let k = 1 + Math.floor(next() * 9); k > 0; k--) scene(0)
  return { fnArray, argsArray }
}

describe("pageInk's walk reads every list as it did before it read PDF.js's values through its readers", () => {
  it('on 3,000 seeded synthetic pages of every shape, whole and in pieces, under every reading', () => {
    const next = rng(20261113)
    let glyphs = 0, boxes = 0, shapes = 0, type3 = 0, capped = 0, degraded = 0
    for (let n = 0; n < 3000; n++) {
      const list = listOf(next)
      const objs = objectsOf(n % 40, n % 7 !== 0)
      expect(inkDifference(list, objs), `list ${n}`).toBeNull()
      const ink = BEFORE.pageInk(O, list, objs, { rotate: 0, indices: true, turned: true, shapesAll: true })
      glyphs += (ink.glyphs as unknown[]).length
      boxes += (ink.boxes as unknown[]).length / 4
      shapes += (ink.shapes as Map<number, unknown>).size
      type3 += (ink.glyphs as Rec[]).filter(g => g.ownColour || /^T3/.test(String(g.font))).length
      const budget = BEFORE.pageInk(O, list, objs, { ...READINGS[6]![1] })
      if (budget.capped) capped++
      if (budget.degraded) degraded++
    }
    // (the generator reaches what it is for: glyphs, boxes, figure paths, Type 3 glyphs, capped pages)
    expect(glyphs).toBeGreaterThan(3000)
    expect(boxes).toBeGreaterThan(3000)
    expect(shapes).toBeGreaterThan(400)
    expect(type3).toBeGreaterThan(1000)
    expect(capped).toBeGreaterThan(10)
    expect(degraded).toBeGreaterThan(10)
  }, 120_000)

  it('at each bound: the graphics state past STACK_MAX, a Type 3 procedure past its bound, a merged page, a long path', () => {
    const objs = objectsOf(1, true)
    const deep: List = { fnArray: [], argsArray: [] }
    for (let k = 0; k < 1003; k++) { deep.fnArray.push(O.save!); deep.argsArray.push(undefined) }
    deep.fnArray.push(O.constructPath!, O.restore!, O.restore!, O.restore!, O.restore!, O.constructPath!)
    deep.argsArray.push([O.fill, [F32([0, 1, 1, 1, 5, 5])], F32([1, 1, 5, 5])], [], [], [], [], [O.fill, [F32([0, 1, 1])], F32([1, 1, 5, 5])])
    expect(inkDifference(deep, objs, [1000])).toBeNull()
    const many: List = { fnArray: [], argsArray: [] }
    for (let k = 0; k < 900; k++) { many.fnArray.push(O.constructPath!); many.argsArray.push([O.fill, [F32([0, k % 300, k % 200, 1, (k % 300) + 3, k % 200, 3, 1, 1, 2, 2])], F32([k % 300, k % 200, (k % 300) + 3, (k % 200) + 3])]) }
    expect(inkDifference(many, objs, [64])).toBeNull()
    const glyphsOf = (font: string, ids: readonly unknown[]): List => ({
      fnArray: [O.beginText!, O.setFont!, O.setTextMatrix!, O.showText!, O.endText!],
      argsArray: [[], [font, 10], [[1, 0, 0, 1, 72, 700]], [ids.map(id => ({ unicode: 'x', fontChar: '', width: 500, isSpace: false, operatorListId: id }))], []],
    })
    for (const font of ['T3', 'T3o', 'T3x', 'T3n', 'T3t']) expect(inkDifference(glyphsOf(font, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'none', 3, '3', undefined, null]), objs), font).toBeNull()
    // (a cached null read again, and a cached value: a Type 3 glyph of no procedure, a font of none, a procedure's paint, each
    // met twice; no cache holds a value undefined, a box or null, a Paint, a font or null)
    const g = (id: unknown) => ({ unicode: 'x', fontChar: '', width: 500, isSpace: false, operatorListId: id })
    const twice: List = {
      fnArray: [O.beginText!, O.setFont!, O.setTextMatrix!, O.showText!, O.setFont!, O.showText!, O.setFont!, O.showText!, O.setFont!, O.showText!, O.endText!],
      argsArray: [[], ['T3n', 10], [[1, 0, 0, 1, 72, 700]], [[g('p0'), g('p0'), g('none'), g('none')]], ['missing', 10], [[g(undefined)]], ['missing', 10], [[g(undefined)]], ['T3', 10], [[g('none'), g('none'), g('p1'), g('p1')]], []],
    }
    expect(inkDifference(twice, objs)).toBeNull()
    // (paths whose box is not finite, each a step of the walk's or none, then a box: read under a bound of steps it meets)
    const unbounded: List = { fnArray: [], argsArray: [] }
    for (let k = 0; k < 200; k++) { unbounded.fnArray.push(O.constructPath!); unbounded.argsArray.push([O.fill, [F32([0, 1, 1, 1, 5, 5])], F32([1, 1, 5, Number.POSITIVE_INFINITY])]) }
    unbounded.fnArray.push(O.constructPath!)
    unbounded.argsArray.push([O.fill, [F32([0, 1, 1, 1, 5, 5])], F32([1, 1, 5, 5])])
    expect(inkDifference(unbounded, objs, [1000])).toBeNull()
  })

  it('a clip of five points whose fifth is not its first, the four before it a rectangle\'s corners in turn, then a fill under it', () => {
    const fifth: List = {
      fnArray: [O.paintFormXObjectBegin!, O.save!, O.clip!, O.constructPath!, O.constructPath!, O.restore!, O.paintFormXObjectEnd!],
      argsArray: [[F32([1, 0, 0, 1, 0, 0]), F32([0, 0, 100, 100])], [], [], [O.endPath, [F32([0, 10, 10, 1, 60, 10, 1, 60, 50, 1, 10, 50, 1, 35, 30, 4])], F32([10, 10, 60, 50])], [O.fill, [F32([0, 10, 10, 1, 60, 10, 1, 60, 50, 1, 10, 50, 4])], F32([10, 10, 60, 50])], [], []],
    }
    expect(inkDifference(fifth, objectsOf(1, true))).toBeNull()
  })
})

describe("the module's other functions give what they gave before", () => {
  const next = rng(4242)
  const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
  it('outlineBox on every shape of objects, font and outline', () => {
    const objs = [objectsOf(3, true), objectsOf(3, false), null, undefined, {}, { has: 5, get: () => 1 }, { has: () => true, get: () => { throw new Error('x') } }]
    const fonts = [...['F1', 'F2', 'F3', 'F4', 'FV', 'FI', 'T3'].map(id => objectsOf(3, true).get(id)), null, 'F1', { loadedName: 5 }, { loadedName: 'F1' }]
    for (const o of objs) for (const f of fonts) for (const ch of GLYPH_CHARS) expect(differ(I => I.outlineBox(o, f, ch)), `${String(ch)}`).toBeNull()
  })
  it('outlineKey, outlineTable and readOutlines on keys and tables of every shape', () => {
    for (let n = 0; n < 400; n++) {
      const font = pick<unknown>([{ name: 'ABC+CMR10' }, { name: '' }, { name: 5 }, {}, null, undefined, 'F1'])
      const g = { fontChar: pick<unknown>(['a', '', undefined, 5]), unicode: 'a', width: pick<unknown>([500, '500', Number.NaN, undefined, 0.0004, -3, null]) }
      const id = pick(['F1', 'f|2', ''])
      expect(differ(I => I.outlineKey(font, id, g))).toBeNull()
      const collected = new Map<string, unknown>()
      for (let k = Math.floor(next() * 5); k > 0; k--) collected.set(pick(['F|a|500', 'F|b|0', 'G|a|1|2', 'H|', '|x|0']), pick<unknown>([[0.1, -0.2, 0.7, 0.9], [], [0.123456, -0.0004, 1.0006, 0.5], [1, 2]]))
      expect(differ(I => I.outlineTable(collected))).toBeNull()
      const table = pick<unknown>([null, undefined, {}, { F: ['a', 1, -2, 3, 4, 'b', 1, 0, 0, 0] }, { F: 'x', G: [] }, { F: ['a', '10', null, 30, 40, 'c', 1] }, { F: [5, 1, 2, 3, 4], G: { length: 5 } }])
      expect(differ(I => I.readOutlines(table))).toBeNull()
    }
  })
  it('regionsOfPoints, displayTextMask and regionMask on seeded points and regions', () => {
    const NAMES = ['cds1', 'cde1', 'cds2', 'cde2', 'dps1', 'dpe1', 'dts1', 'dte1', 'dms1', 'dme1', 'bs1', 'be1', 'bs2', 'be2', 'q1', 'cds', 'xx1']
    for (let n = 0; n < 2000; n++) {
      const points: { name: string; glyph: number }[] = []
      for (let k = Math.floor(next() * 12), glyph = 0; k > 0; k--) {
        glyph += Math.floor(next() * 4) - (next() < 0.1 ? 3 : 0)
        points.push({ name: pick(NAMES), glyph })
      }
      const count = Math.floor(next() * 30)
      expect(differ(I => I.regionsOfPoints(points, count)), JSON.stringify(points)).toBeNull()
      const regions = next() < 0.8 ? BEFORE.regionsOfPoints(points, count) : pick<unknown>([null, undefined, [{ kind: 'dtext', from: -3, to: 50 }, { kind: 'dmath', from: 2, to: 4 }], [{ kind: 'code', from: 5, to: 2 }]])
      const kind = pick(['code', 'display', 'dtext', 'dmath'])
      expect(differ(I => [I.displayTextMask(regions, count), I.regionMask(regions, count, kind)])).toBeNull()
    }
  })
  it('unreadOf and packGlyphs on readings and glyphs of every shape', () => {
    for (const ink of [null, undefined, {}, { rotated: true }, { capped: 1 }, { timedOut: 'y' }, { capped: false, timedOut: false }]) expect(differ(I => I.unreadOf(ink))).toBeNull()
    for (let n = 0; n < 300; n++) {
      const glyphs = Array.from({ length: Math.floor(next() * 6) }, () => ({ u: pick(['a', 'b']), x0: next() * 10, x1: next() * 10 + 10, y: next(), top: 1, bottom: 0, size: pick([8, 10, 12, Number.NaN]), font: pick(['A', 'BB', '']), ix0: pick<unknown>([undefined, next() * 5]), ix1: pick<unknown>([undefined, next() * 25]), fill: pick<unknown>([undefined, 0, 255, -1, 1.5, Number.NaN, '3']) }))
      const order = next() < 0.5 ? null : glyphs.map((_, i) => (i * 7) % glyphs.length)
      const columns = pick<unknown>([undefined, ['u'], ['x0', 'x0', 'fill'], ['font', 'size', 'ix0', 'ix1', 'top', 'bottom', 'y', 'x1'], []])
      const o = { order, fontIds: next() < 0.5 ? null : (f: string) => f.length - 1, ...(columns ? { columns } : {}) }
      expect(differ(I => I.packGlyphs(glyphs, o))).toBeNull()
    }
  })
})

describe("pageInk's walk reads every page of the repository's PDFs as it did before", () => {
  it("through PDF.js's own operator lists, whole and in pieces, under every reading; and each glyph's outline box", async () => {
    const files = [...readdirSync(join(process.cwd(), 'tests/fixtures/pdf'), { recursive: true }).map(f => join('tests/fixtures/pdf', String(f))), ...['s1-columns', 's2-splits', 's3-turned'].map(s => `packages/reader/e2e/fixtures/${s}/arxiv.pdf`)].filter(f => f.endsWith('.pdf'))
    let pages = 0, glyphs = 0, outlines = 0
    for (const f of files) {
      const task = getDocument({ ...DOCUMENT_OPTIONS, data: new Uint8Array(readFileSync(join(process.cwd(), f))) })
      const doc = await task.promise
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const got = (await page.getOperatorList()) as unknown as List
        const list = { fnArray: [...got.fnArray], argsArray: [...got.argsArray] }
        const objs = page.commonObjs as unknown as Objects
        expect(inkDifference(list, objs, [1, 1000]), `${f} page ${p}`).toBeNull()
        glyphs += (BEFORE.pageInk(O, list, objs, { rotate: 0 }).glyphs as unknown[]).length
        // (each glyph's outline box, by its font as the walk read it)
        let font: unknown = null
        for (let j = 0; j < list.fnArray.length; j++) {
          const a = list.argsArray[j] as unknown[] | null
          if (list.fnArray[j] === O.setFont) font = (() => { try { return objs.get(String(a?.[0])) } catch { return null } })()
          else if (list.fnArray[j] === O.showText) {
            for (const g of (a?.[0] as Rec[]) ?? []) {
              if (!g || typeof g !== 'object') continue
              expect(differ(I => I.outlineBox(objs, font, g.fontChar)), `${f} page ${p}`).toBeNull()
              outlines++
            }
          }
        }
        pages++
      }
      await task.destroy()
    }
    expect(pages).toBeGreaterThan(20)
    expect(glyphs).toBeGreaterThan(10_000)
    expect(outlines).toBeGreaterThan(10_000)
  }, 300_000)
})

/** ten papers of the baseline's corpora, chosen for breadth by what each asks of the walk (counted by PDF.js's lists): a Type 3
 *  font of bitmaps (rawFillPath) and shadings; soft masks and groups, two papers; tiling patterns, two; text set turned on
 *  most pages, beside the busiest page of the census; Type 3 fonts on many pages, one subset embedded several times; the most
 *  boxes on a page; clips by the thousand; a page of 510,458 operations */
const CORPUS: readonly string[] = ['2610.21377v1', '2610.19274v1', '2610.40394v1', '2501.14787v1', '2610.40576v1', '2608.12606v1', '2010.11929v2', '2307.16209v1', '2608.27728v1', '2608.04322v1']
describe("pageInk's walk reads ten corpus papers as it did before (asked once, AXT_INK_CORPUS, where the lab's data is)", () => {
  it.skipIf(!process.env.AXT_INK_CORPUS)('every page, whole and in pieces, under every reading', async () => {
    const listing = join(process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data', 'refactor-2026-11/baseline/corpora/all.tsv')
    if (!existsSync(listing)) return
    const dirs = new Map(readFileSync(listing, 'utf8').trim().split('\n').map(l => l.split('\t') as [string, string]))
    let pages = 0, papers = 0
    for (const id of CORPUS) {
      const pdf = join(dirs.get(id) ?? '', 'arxiv.pdf')
      if (!existsSync(pdf)) continue
      papers++
      const task = getDocument({ ...DOCUMENT_OPTIONS, data: new Uint8Array(readFileSync(pdf)) })
      const doc = await task.promise
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const got = (await page.getOperatorList()) as unknown as List
        expect(inkDifference({ fnArray: [...got.fnArray], argsArray: [...got.argsArray] }, page.commonObjs as unknown as Objects, [1000]), `${id} page ${p}`).toBeNull()
        page.cleanup()
        pages++
      }
      await task.destroy()
    }
    // (asked for, the ten are read whole: 495 pages)
    expect([papers, pages]).toEqual([CORPUS.length, 495])
  }, 3_600_000)
})
