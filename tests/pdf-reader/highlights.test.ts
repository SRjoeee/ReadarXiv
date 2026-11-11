// @vitest-environment node
// A highlighted word is its unit's element, found where TeX set it, its ground with it (lane soul-locate, 2026-11-12). soul's
// \hl, through a paper's own macro (`\newcommand{\hlsun}[1]{{\sethlcolor{Sun}\hl{#1}}}`) or by itself, sets a box of no width
// holding its ground's rule, then the word's characters. The marking gives no point to such a macro glued to the word before it,
// nor to one right after another paper's macro (it may read ahead), and the reader draws a macro with an argument from its ink (a
// crop, `other`), which holds no text: its glyphs were read as its unit's text, the unit's letters past its source's, and locate
// held the whole unit the original's (2111.09276v1's Figure 1 caption, `\hlyellow{high}\hlblue{lighted}`, its three sentences
// English). The fixture (tests/fixtures/pdf/highlights/, ours, CC0; made by scripts/make-highlight-fixture.mjs) holds each case:
// two highlights in one word after a closed one (a paragraph) and after one of its opening point alone (a caption), one at a
// word's start, its middle and its end, one run across a line's end, \hl itself, under two colours. The back half runs here over
// the compiles the front half made of it: the instrument over our final pass, prepareBack over the stand-in for arXiv's PDF.
import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Located, type PdfJs, prepareBack, type Tally } from '@readarxiv/engine'
import { readInkDecorated, readInkTexts } from '@/pdf-reader/engine/layout/marks.mjs'
import { classesOf, instrumentOf } from '@/pdf-reader/engine/pipeline/instrument.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

const DIR = new URL('../fixtures/pdf/highlights/', import.meta.url)
const bytes = (f: string) => new Uint8Array(readFileSync(new URL(f, DIR)))
const pdfjs = { getDocument, OPS } as unknown as PdfJs
const HIGHLIGHT = /^\\hl(?:sun|sky)?\{/

type Unit = { kind: string; pieces: { t: string; s?: string; src?: string }[] }
let units: Unit[] = []
let located: Located
let A: { glyphs: { u: string; x0: number; x1: number; y: number }[]; boxes: number[]; kinds: number[] }

beforeAll(async () => {
  const source = new Map([['highlights.tex', bytes('highlights.tex')]])
  const made = JSON.parse(readFileSync(new URL('made.json', DIR), 'utf8')) as { options: Record<string, unknown>; log: string }
  const paper = openPaper(source) as { units: Unit[] }
  units = paper.units
  const { instrument } = await instrumentOf({ paper, finalPdf: bytes('final.pdf'), options: made.options, log: made.log, pdfjs, documentOptions: DOCUMENT_OPTIONS, made: { compiler: 'pdflatex', tree: '2025', front: 'today' } })
  let tally: Tally | null = null
  for await (const x of prepareBack(instrument, bytes('arxiv.pdf'), { pdfjs, pdfOptions: DOCUMENT_OPTIONS, PL: PL as never, deflate, inflate, paper: { id: '2600.00002', version: 1 }, made: 'test', classesOf: classesOf as never, keep: true }))
    if (x.kind === 'tally') tally = x
  located = (tally as Tally).locatedAll as Located
  A = (tally as Tally).pagesA![0]!.page as unknown as typeof A
}, 60_000)

/** each source unit's member, by unit index */
const memberOf = (u: number) => located.members.find((m) => m.unit === u && m.name === undefined)!
/** the highlights of a unit: its pieces of \hl or a macro over it, by piece id */
const highlightsOf = (u: number) => units[u]!.pieces.flatMap((p, k) => (p.t === 'ph' && HIGHLIGHT.test(p.src ?? '') ? [[String(k), p.src!] as const] : []))
/** the argument a highlight's source sets */
const argumentOf = (src: string) => /\{([^{}]*)\}$/.exec(src)![1]!.replace(/\s/g, '')
/** A's ground boxes: a painted path a line high (soul's ground, the height of its font's line), not the figure's frame */
const grounds = () =>
  A.kinds.flatMap((kind, x) => {
    const [x0, y0, x1, y1] = A.boxes.slice(4 * x, 4 * x + 4) as [number, number, number, number]
    const h = Math.abs(y1 - y0)
    return kind >= 0 && x1 - x0 > 1 && h > 5 && h < 20 ? [{ x, x0, y0: Math.min(y0, y1), x1, y1: Math.max(y0, y1) }] : []
  })

describe('a highlighted word is its unit\'s element, its ground with it', () => {
  const cases: [string, number][] = [
    ['two highlights in one word, the second right after a closed one (a paragraph)', 0],
    ['a highlight at a word\'s start, in its middle and at its end', 1],
    ['a highlight run across a line\'s end', 2],
    ['soul\'s \\hl itself', 3],
    ['two highlights in one word, the first of its opening point alone (a caption)', 4],
  ]
  for (const [name, u] of cases)
    it(`${name}: the unit located, each highlight an element of the glyphs it sets and their ground`, () => {
      expect(units[u]!.kind).toBe(u === 4 ? 'caption' : 'para')
      const mem = memberOf(u)
      expect({ unit: u, located: mem.located, cause: mem.cause ?? null }).toEqual({ unit: u, located: true, cause: null })
      const hs = highlightsOf(u)
      expect(hs.length).toBeGreaterThan(0)
      for (const [id, src] of hs) {
        const glyphs = mem.els.get(id) ?? []
        expect({ src, text: glyphs.map((a) => A.glyphs[a]!.u).join('') }).toEqual({ src, text: argumentOf(src) })
        expect({ src, boxes: (mem.elBoxes.get(id) ?? []).length > 0 }).toEqual({ src, boxes: true })
      }
    })

  it('every ground on the page is a located element\'s ink, inside its crop, the letters on it the element\'s and no text\'s', () => {
    const owner = new Map<number, [number, string]>()
    for (const mem of located.members) for (const [id, l] of mem.elBoxes) for (const [, ai] of l) owner.set(ai, [mem.ord, id])
    const gs = grounds()
    // (each word a highlight sets is painted on a ground of its own: 41 words in the fixture's nine highlights)
    expect(gs.length).toBeGreaterThan(40)
    const unowned: number[] = []
    for (const g of gs) {
      const o = owner.get(g.x)
      if (!o) { unowned.push(g.x); continue }
      const mem = located.members[o[0]]!
      expect(mem.located).toBe(true)
      const el = mem.elements.find(([id]) => id === o[1])![1]
      // (the crop: one of the element's ink rectangles [page, x0, bottom, x1, top, baseline] holds the ground)
      const inside = el.ink.some(([, x0, b, x1, t]) => x0 <= g.x0 + 0.01 && x1 >= g.x1 - 0.01 && Math.min(b, t) <= g.y0 + 0.01 && Math.max(b, t) >= g.y1 - 0.01)
      expect({ ground: g.x, inside }).toEqual({ ground: g.x, inside: true })
      // (the letters set on the ground: the element's glyphs, none of them its unit's text; the ground of a space between two
      // highlighted words has none)
      const on = A.glyphs.flatMap((gl, a) => ((gl.x0 + gl.x1) / 2 > g.x0 && (gl.x0 + gl.x1) / 2 < g.x1 && gl.y > g.y0 && gl.y < g.y1 ? [a] : []))
      const els = new Set(mem.els.get(o[1]) ?? [])
      expect({ ground: g.x, notTheElement: on.filter((a) => !els.has(a)), text: on.filter((a) => mem.text.includes(a)) }).toEqual({ ground: g.x, notTheElement: [], text: [] })
    }
    expect(unowned).toEqual([])
    // (and the letters: every highlight's, on the grounds)
    expect(gs.reduce((n, g) => n + A.glyphs.filter((gl) => (gl.x0 + gl.x1) / 2 > g.x0 && (gl.x0 + gl.x1) / 2 < g.x1 && gl.y > g.y0 && gl.y < g.y1).length, 0)).toBe(units.flatMap((_, u) => highlightsOf(u).map(([, src]) => argumentOf(src).length)).reduce((n, k) => n + k, 0))
  })
})

/** a probe log's ink sample: TeX's listing of its box between the section's rows (marks.mjs inkSection) */
const sample = (i: number, nodes: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box68=', '\\hbox(7.87+3.37)x40.0', ...nodes, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`].join('\n')
/** a ground soul sets before a syllable: a box of no width, a colour stack round leaders of a rule (`depth` its dots) */
const ground = (depth = 1, colour = '{0 0 0.2 0 k 0 0 0.2 0 K}') => {
  const d = '.'.repeat(depth)
  return [`${d}\\hbox(7.87+3.37)x0.0, glue set - 18.0fil`, `${d}.\\hbox(0.0+0.0)x0.0`, `${d}.\\kern -0.25`, `${d}.\\pdfcolorstack 0 push ${colour}`, `${d}.\\leaders 18.27`, `${d}..\\rule(7.87+3.37)x*`, `${d}.\\kern 0.0`, `${d}.\\pdfcolorstack 0 pop`, `${d}.\\glue 0.0 plus 1.0fil minus 1.0fil`]
}
const chars = (t: string) => [...t].map((c) => `.\\OT1/ptm/m/n/10 ${c}`)

describe('the probe\'s text of a highlight: the characters TeX set beside the decoration it painted', () => {
  it('soul\'s ground in a box of no width before the characters: their text, which readInkTexts refuses (a rule is ink no text says)', () => {
    const log = sample(0, [...ground(), ...chars('high')])
    expect(readInkDecorated(log, ['\\hlyellow{high}'])).toEqual([['\\hlyellow{high}', 'high']])
    expect(readInkTexts(log, ['\\hlyellow{high}'])).toEqual([])
  })
  it('syllables a discretionary parts (its ground and hyphen set only at a break) and a space\'s ground as leaders of a rule', () => {
    const disc = ['.\\discretionary', ...ground(2), '..\\OT1/ptm/m/n/10 -']
    const space = ['.\\pdfcolorstack 0 push {0 0 0.2 0 k 0 0 0.2 0 K}', '.\\leaders 3.04 plus 1.52 minus 1.01', '..\\rule(7.87+3.37)x*', '.\\kern 0.0', '.\\pdfcolorstack 0 pop', '.\\hbox(0.0+0.0)x0.0']
    const log = sample(0, [...ground(), ...chars('Con'), ...disc, ...ground(), ...chars('tra'), ...space, ...ground(), ...chars('dict.')])
    expect(readInkDecorated(log, ['\\hlp{Con-tra dict.}'])).toEqual([['\\hlp{Con-tra dict.}', 'Contradict.']])
  })
  it('a colour stack\'s line TeX broke at max_print_line (79 characters): the rest on the next line, here an empty one', () => {
    const colour = '{0.97647 0.90196 0.91765 rg 0.97647 0.90196 0.91765 RG}'
    expect(`..\\pdfcolorstack 0 push ${colour}`.length).toBe(79)
    const nodes = ground(1, colour)
    nodes.splice(4, 0, '')
    expect(readInkDecorated(sample(0, [...nodes, ...chars('Perfect.')]), ['\\hlg{Perfect.}'])).toEqual([['\\hlg{Perfect.}', 'Perfect.']])
  })
  it('no answer: a character inside a box of no width (set over the line\'s), and a sample with no decoration (readInkTexts\' alone)', () => {
    const rlap = ['.\\hbox(7.87+3.37)x0.0, glue set - 5.0fil', '..\\OT1/ptm/m/n/10 x', '..\\glue 0.0 plus 1.0fil minus 1.0fil']
    expect(readInkDecorated(sample(0, [...rlap, ...chars('word')]), ['\\over{word}'])).toEqual([])
    expect(readInkDecorated(sample(0, chars('word')), ['\\plain{word}'])).toEqual([])
    expect(readInkTexts(sample(0, chars('word')), ['\\plain{word}'])).toEqual([['\\plain{word}', 'word']])
  })
})
