// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Glyph, type InkPoint, type PackedGlyphs, packGlyphs, pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { type Follow, OWNED_HOW, ownedOf, type StreamPage } from '@/pdf-reader/engine/layout/stream.mjs'

// The marks read and the layout maker keep a page's glyphs packed as columns (packGlyphs), not as a Glyph object each (the
// prepare memory note of 2026-10-15). Over every page of the sample paper (tests/fixtures/pdf/sample-1, read by the pinned
// PDF.js as the server reads a PDF): the columns hold each Glyph's numbers bit for bit, in the order asked; and ownedOf
// finds on the packed glyphs what it finds on the Glyph objects themselves, under random points among them

type Ink = ReturnType<typeof pageInk>
const read: { ink: Ink; view: number[] }[] = []
beforeAll(async () => {
  const task = getDocument({ data: new Uint8Array(readFileSync(new URL('../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url))), verbosity: 0 })
  try {
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      read.push({ ink: pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate }), view: [...page.view] })
    }
  } finally { await task.destroy() }
})

/** a seeded generator of numbers in [0, 1) (mulberry32) */
function random(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('packGlyphs over the sample paper', () => {
  it('reads a page of real ink: four pages, thousands of glyphs, some boxes', () => {
    expect(read).toHaveLength(4)
    expect(read.reduce((n, r) => n + r.ink.glyphs.length, 0)).toBeGreaterThan(5000)
    expect(read.some(r => r.ink.boxes.length > 0)).toBe(true)
  })

  it("holds every Glyph's numbers and character bit for bit, in stream order", () => {
    for (const { ink: { glyphs } } of read) {
      const P = packGlyphs(glyphs)
      expect(P.n).toBe(glyphs.length)
      for (const k of ['x0', 'x1', 'y', 'top', 'bottom', 'size'] as const) expect(Array.from(P[k]), k).toEqual(glyphs.map(g => g[k]))
      expect(P.u).toEqual(glyphs.map(g => g.u))
      // its ink across with its advance; no font asked
      expect(Array.from(P.ix0)).toEqual(glyphs.map(g => Math.min(g.x0, g.ix0)))
      expect(Array.from(P.ix1)).toEqual(glyphs.map(g => Math.max(g.x1, g.ix1)))
      expect(Array.from(P.font)).toEqual(glyphs.map(() => -1))
      expect(P.most).toBe(Math.max(0, ...glyphs.map(g => g.size)))
    }
  })

  it('in the order given, each font by the id asked for: the layout maker\'s by baseline', () => {
    for (const { ink: { glyphs } } of read) {
      const order = glyphs.map((_, i) => i).sort((a, b) => (glyphs[a] as Glyph).y - (glyphs[b] as Glyph).y || (glyphs[a] as Glyph).x0 - (glyphs[b] as Glyph).x0 || a - b)
      const names: string[] = []
      const P = packGlyphs(glyphs, { order, fontIds: f => (names.includes(f) ? names.indexOf(f) : names.push(f) - 1) })
      const by = order.map(i => glyphs[i] as Glyph)
      expect(P.n).toBe(glyphs.length)
      for (const k of ['x0', 'x1', 'y', 'top', 'bottom', 'size'] as const) expect(Array.from(P[k]), k).toEqual(by.map(g => g[k]))
      expect(P.u).toEqual(by.map(g => g.u))
      expect(Array.from(P.font).map(i => names[i])).toEqual(by.map(g => g.font))
    }
    expect(packGlyphs([])).toMatchObject({ n: 0, most: 0, u: [] })
  })
})

/** a page's glyphs as ownedOf reads them (their count, origin, baseline, size and character), read from each Glyph object
 *  at each access: the object-per-glyph form the marks read kept before */
function objects(glyphs: Glyph[]): PackedGlyphs {
  const column = (k: 'x0' | 'y' | 'size' | 'u') => new Proxy([], { get: (_, i) => (typeof i === 'string' && /^\d+$/.test(i) ? glyphs[Number(i)]?.[k] : undefined) })
  return { n: glyphs.length, x0: column('x0'), y: column('y'), size: column('size'), u: column('u') } as unknown as PackedGlyphs
}
/** the first WANT characters of the page's glyphs from `g`, as the marking gives the text after a piece */
const textFrom = (glyphs: Glyph[], g: number) => glyphs.slice(g, g + 16).map(x => x.u).join('').normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, 8)

/**
 * Random points over `count` pages of the sample from `from`: each page a column body or none, now and then a float in
 * it, units each with a start mark, pieces with an opening point and most a closing one (now and then on the next page,
 * before the opening one or twice), most an end mark; what the marking says of each piece, and names the log drops
 */
function layout(rand: () => number, from: number, count: number) {
  const pts: { name: string; glyph: number }[][] = Array.from({ length: count }, () => [])
  const follows = new Map<string, Follow>(), dropped: string[] = []
  let unit = 0, bracket = 0
  for (let q = 0; q < count; q++) {
    const glyphs = (read[from + q] as { ink: Ink }).ink.glyphs, n = glyphs.length
    const at = () => Math.floor(rand() * (n + 1))
    const pair = (a: string, b: string) => { const x = at(), y = at(); pts[q]?.push({ name: a, glyph: Math.min(x, y) }, { name: b, glyph: Math.max(x, y) }) }
    if (rand() < 0.7) { bracket++; pts[q]?.push({ name: `bs${bracket}`, glyph: Math.floor(rand() * 40) }, { name: `be${bracket}`, glyph: Math.max(0, n - Math.floor(rand() * 40)) }) }
    if (rand() < 0.3) { bracket++; pair(`fs${bracket}`, `fe${bracket}`) }
    for (let u = 0, units = 1 + Math.floor(rand() * 8); u < units; u++, unit++) {
      const s = at(), e = Math.min(n, s + Math.floor(rand() * 600))
      pts[q]?.push({ name: `${unit}s`, glyph: s })
      if (rand() < 0.7) pts[q]?.push({ name: `${unit}e`, glyph: e })
      const pieces = Math.floor(rand() * 4)
      const opens = Array.from({ length: pieces }, () => s + Math.floor(rand() * (e - s + 1))).sort((a, b) => a - b)
      opens.forEach((a, k) => {
        const name = `${rand() < 0.2 ? 'n' : 'p'}${unit}.${2 * k + 1}`
        pts[q]?.push({ name: `${name}a`, glyph: a })
        if (rand() < 0.05) pts[q]?.push({ name: `${name}a`, glyph: Math.min(n, a + 3) })
        const closing = rand() < 0.65
        let b = Math.min(n, a + Math.floor(rand() * 30))
        if (closing) {
          if (q + 1 < count && rand() < 0.15) pts[q + 1]?.push({ name: `${name}b`, glyph: Math.floor(rand() * 60) })
          else pts[q]?.push({ name: `${name}b`, glyph: rand() < 0.05 ? Math.max(0, a - 2) : b })
        } else b = a + Math.floor(rand() * 10)
        const next = k + 1 < opens.length ? `p${unit}.${2 * k + 3}a` : null
        const want = rand() < 0.35 ? '' : rand() < 0.9 ? textFrom(glyphs, Math.min(n, b)) : 'zzzzzzzz'
        follows.set(`${name}a`, { closing: closing ? rand() < 0.95 : rand() < 0.05, want, ends: [...(next ? [next] : []), `${unit}e`], blocked: rand() < 0.1 })
        if (rand() < 0.03) dropped.push(`${name}${rand() < 0.5 ? 'a' : 'b'}`)
      })
    }
  }
  const page = (q: number, form: (g: Glyph[]) => PackedGlyphs): StreamPage => {
    const { ink, view } = read[from + q] as { ink: Ink; view: number[] }
    const nBoxes = ink.boxes.length / 4
    const points: InkPoint[] = [...(pts[q] ?? [])].sort((a, b) => a.glyph - b.glyph).map(({ name, glyph }) => ({ name, glyph, box: glyph < ink.glyphs.length ? (ink.boxAt[glyph] as number) : nBoxes }))
    return { glyphs: form(ink.glyphs), boxes: ink.boxes, points, boxAt: ink.boxAt, view }
  }
  return {
    packed: Array.from({ length: count }, (_, q) => page(q, g => packGlyphs(g))),
    objects: Array.from({ length: count }, (_, q) => page(q, objects)),
    o: { follows: (name: string) => follows.get(name) ?? null, dropped },
  }
}

describe('ownedOf over packed glyphs', () => {
  it('finds what it finds on the Glyph objects, under 400 random layouts of points over the sample\'s pages', () => {
    const rand = random(20261015), hows = new Map<number, number>()
    let owned = 0
    for (let trial = 0; trial < 400; trial++) {
      const count = 1 + Math.floor(rand() * 3), from = Math.floor(rand() * (read.length - count + 1))
      const { packed, objects: objs, o } = layout(rand, from, count)
      const got = [...ownedOf(packed, o)], want = [...ownedOf(objs, o)]
      expect(got).toEqual(want)
      for (const [, e] of got) { hows.set(e.how, (hows.get(e.how) ?? 0) + 1); owned += e.glyphs.length }
    }
    // the layouts reach most of ownedOf's answers, and own glyphs: the comparison is not of empty maps
    const reached = [...hows.keys()].map(h => OWNED_HOW[h])
    expect(reached.length, reached.join('; ')).toBeGreaterThanOrEqual(12)
    expect(owned).toBeGreaterThan(10_000)
  })
})
