import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { BOXES_PAGE, OPS_CAP, STACK_MAX } from '@/pdf-reader/engine/layout/ink.mjs'
import { encodeLayoutMarks, layoutMarksOf, type MarkClass, parseLayoutMarks, type Switches } from '@/pdf-reader/engine/layout/marks.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { lineCheckOf as checkOf } from '@/pdf-reader/engine/layout/carry.mjs'

// The layout maker's fake world (layout-make.test.ts, page-pass.test.ts): fake PDF.js documents of arXiv's PDF (`pages`) and of
// the base page (our compile's final pass: the marked original's pages, `marked`, or `base` where a test gives it pages of
// its own), and a marks file made, as the run makes it, from a fake marked original: each run of text is a text item and the glyphs of an operator list alike, every character half an em
// wide, so that a word's place in the text layer is its glyphs' place. The marked original's operator list shows its
// runs in their order, and a point (`/axt-<name> ri`) beside each mark: before the first glyph on the mark's baseline at
// or right of it, else after the last one on that baseline (a page's `points` places one by hand, before a run's
// character, as TeX's content stream has it where a mark's place does not tell); a box is shown at the page's end, or
// before the run its fifth number names; `order`, the runs' order in the stream where it is not the text layer's

export const CH = 0.5
/** a run of glyphs; `blank`: each painted with the Unicode of a space (a symbolic font's code 32); `one`: the whole
 *  string one glyph's Unicode (a character and its variation selector); `fill`: its glyphs' fill as PDF.js reports it
 *  ('#rrggbb', setFillRGBColor; 'pattern', setFillColorN), black again after it; `tr`: its text rendering mode (Tr), 0
 *  again after it */
/** a run of text: `turn`, set a quarter turn (its baseline up the page from x, y: a \rotatebox{90}'s, a sideways cell's) */
export type Run = { s: string; x: number; y: number; size?: number; font?: string; w?: number; blank?: boolean; one?: boolean; eol?: boolean; fill?: string; tr?: number; turn?: boolean }
/** a Link annotation as PDF.js reports it (getAnnotations): its rectangle and the destination it names */
export type Annot = { rect: number[]; dest: string | unknown[]; quadPoints?: number[]; url?: string }
export type Page = { runs: Run[]; boxes?: number[][]; view?: number[]; ops?: 'never' | 'fails' | 'capped' | 'deep' | 'dense' | 'slow'; markedOps?: 'deep'; points?: Record<string, [run: number, char: number]>; order?: number[]; annots?: Annot[] }
export type Mark = [name: string, page: number, x: number, y: number]
export type World = { pages: Page[]; marked?: Page[]; base?: Page[]; marks: Mark[]; units: SourceUnit[]; switches?: Switches; inkless?: string[]; texts?: [string, string][]; names?: Record<string, 0 | 1>; complete?: Record<string, number>; apart?: string[] }

export const FONTS: Record<string, unknown> = {
  F1: { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false },
  F2: { name: `ABCDEF+Ä${'x'.repeat(300)}`, fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false },
}
export const STYLES = { F1: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' }, F2: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' } }
export const size = (r: Run) => r.size ?? 10
export const adv = (r: Run) => (r.w ?? CH) * size(r)
/** where a run's character j begins, and where the run ends */
export const xAt = (r: Run, j: number) => r.x + j * adv(r)
export const endOf = (r: Run) => xAt(r, r.one ? 1 : r.s.length)
export const item = (r: Run) => ({ str: r.blank ? ' '.repeat(r.s.length) : r.s, dir: 'ltr', transform: r.turn ? [0, size(r), -size(r), 0, r.x, r.y] : [size(r), 0, 0, size(r), r.x, r.y], width: (r.one ? 1 : r.s.length) * adv(r), height: size(r), fontName: r.font ?? 'F1', hasEOL: !!r.eol })
/** where each mark's point stands in a page's stream: [run, character] before which it is shown, in the marks' order */
export function pointsOf(p: Page, page: number, marks: Mark[]) {
  const out: [name: string, run: number, char: number][] = []
  for (const [name, at] of Object.entries(p.points ?? {})) out.push([name, at[0], at[1]])
  for (const [name, pg, x, y] of marks) {
    if (pg !== page || p.points?.[name]) continue
    let first: [number, number] | null = null, last: [number, number] | null = null
    p.runs.forEach((r, ri) => {
      if (Math.abs(r.y - y) >= 0.5 * size(r)) return
      for (let c = 0; c < r.s.length; c++) {
        if (r.s[c] === ' ') continue
        if (!first && xAt(r, c) >= x - 0.01) first = [ri, c]
        last = [ri, c + 1]
      }
    })
    const at: [number, number] = first ?? last ?? [p.runs.length, 0]
    out.push([name, at[0], at[1]])
  }
  return out
}
export function opsOf(p: Page, points: [string, number, number][] = []) {
  const ops: [number, unknown[]][] = []
  const at = (ri: number, c: number) => { for (const [name, r, ch] of points) if (r === ri && ch === c) ops.push([OPS.setRenderingIntent, [{ name: `axt-${name}` }]]) }
  const box = (b: number[]) => ops.push([OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from(b.slice(0, 4))]])
  for (const ri of p.order ?? p.runs.map((_, i) => i)) {
    const r = p.runs[ri] as Run
    for (const b of p.boxes ?? []) if (b[4] === ri) box(b)
    if (r.fill) ops.push(r.fill === 'pattern' ? [OPS.setFillColorN, ['P0']] : [OPS.setFillRGBColor, [r.fill]])
    ops.push([OPS.beginText, []], [OPS.setFont, [r.font ?? 'F1', size(r)]], [OPS.setTextMatrix, [r.turn ? [0, 1, -1, 0, r.x, r.y] : [1, 0, 0, 1, r.x, r.y]]])
    if (r.tr !== undefined) ops.push([OPS.setTextRenderingMode, [r.tr]])
    // a space is a move, as TeX's pages show it: no glyph (the ink reader keeps every painted glyph); a point between two
    // characters parts the run's showText
    let glyphs: unknown[] = []
    if (r.one) { ops.push([OPS.showText, [[{ unicode: r.s, width: (r.w ?? CH) * 1000, isSpace: false, fontChar: r.s, vmetric: null }]]], [OPS.endText, []]); if (r.fill) ops.push([OPS.setFillRGBColor, ['#000000']]); continue }
    for (let c = 0; c <= r.s.length; c++) {
      if (points.some(([, pr, pc]) => pr === ri && pc === c)) { if (glyphs.length) ops.push([OPS.showText, [glyphs]]); glyphs = []; at(ri, c) }
      if (c === r.s.length) break
      const ch = r.s[c] as string
      glyphs.push(ch === ' ' ? -(r.w ?? CH) * 1000 : { unicode: r.blank ? ' ' : ch, width: (r.w ?? CH) * 1000, isSpace: !!r.blank, fontChar: ch, vmetric: null })
    }
    if (glyphs.length) ops.push([OPS.showText, [glyphs]])
    if (r.tr !== undefined) ops.push([OPS.setTextRenderingMode, [0]])
    ops.push([OPS.endText, []])
    if (r.fill) ops.push([OPS.setFillRGBColor, ['#000000']])
  }
  at(p.runs.length, 0)
  for (const b of p.boxes ?? []) if (b[4] === undefined) box(b)
  // (past OPS_CAP: operations the walk reads and does nothing with, after the page's own, as one typed array)
  if (p.ops === 'capped') { const fn = new Uint16Array(OPS_CAP + 1).fill(OPS.setFillRGBColor); fn.set(ops.map(o => o[0])); return { fnArray: fn, argsArray: ops.map(o => o[1]) } }
  // (after the page's own: saves past STACK_MAX, one of them restored and a path painted then, in a state the walk lost (so
  // the page is capped), or two thousand operations the walk does nothing with, more steps than come between two readings
  // of its clock; before it, one painted path more than BOXES_PAGE, off the page's columns, one operand each, so that the
  // page is degraded and every box of its own past the budget)
  if (p.ops === 'deep') {
    for (let i = 0; i <= STACK_MAX; i++) ops.push([OPS.save, []])
    ops.push([OPS.restore, []], [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([-100, 0, -90, 10])]])
  }
  if (p.ops === 'dense' || p.ops === 'slow') {
    const dense = p.ops === 'dense', extra = dense ? BOXES_PAGE + 1 : 2000, own = ops.length
    const fn = new Uint16Array(own + extra).fill(dense ? OPS.constructPath : OPS.setFillRGBColor)
    fn.set(ops.map(o => o[0]), dense ? extra : 0)
    const path = [OPS.fill, [Float32Array.from([0])], Float32Array.from([-100, 0, -90, 10])], filler = new Array(extra).fill(dense ? path : [])
    return { fnArray: fn, argsArray: dense ? [...filler, ...ops.map(o => o[1])] : [...ops.map(o => o[1]), ...filler] }
  }
  return { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }
}
/** PDF.js's glyph outlines (where it draws glyphs as paths, as in Node), by `<loadedName>_path_<fontChar>`: DrawOPS in em */
export const PATHS: Record<string, number[]> = {}
export const commonObjs = { get: (id: string) => (id in PATHS ? { path: new Float32Array(PATHS[id]!) } : (FONTS[id] ?? null)), has: (id: string) => id in PATHS || id in FONTS }
/** a page's getAnnotations, where it has annotations (`annots`): its Link annotations as PDF.js lists them; none, no such call */
const annotsOf = (p: Page) => (p.annots ? { getAnnotations: async () => (p.annots ?? []).map(a => ({ subtype: 'Link', ...a })) } : {})
export function arxivOf(pages: Page[], asked: number[] = []) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => {
      const p = pages[n - 1] as Page
      return {
        view: p.view ?? [0, 0, 612, 792], rotate: 0, commonObjs, ref: { num: 10 + n, gen: 0 },
        getTextContent: async () => ({ items: p.runs.map(item), styles: STYLES }),
        ...annotsOf(p),
        getOperatorList: () => {
          asked.push(n)
          return p.ops === 'never' ? new Promise(() => {}) : p.ops === 'fails' ? Promise.reject(new Error('broken page')) : Promise.resolve(opsOf(p))
        },
      }
    },
  }
}
/** the base page's pages (the layer route's step 2): the final pass of the marked original, whose glyphs stand where the marked
 *  original's do — `base` where a test gives the base page properties of its own (a page whose list never comes, …) */
export const basePagesOf = (w: World) => w.base ?? w.marked ?? w.pages
/** a fake PDF.js document of the base page */
export const baseOf = (w: World, asked: number[] = []) => arxivOf(basePagesOf(w), asked)
/** the line check of a world: the base page's lines found on arXiv's (`pages`), as the page pass makes it */
export async function lineCheckOf(w: World) {
  return checkOf((await readArxivText(baseOf(w))).tokens, (await readArxivText(arxivOf(w.pages))).tokens)
}
export function markedOf(pages: Page[], marks: Mark[]) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => {
      const p = pages[n - 1] as Page
      return { view: p.view ?? [0, 0, 612, 792], rotate: 0, commonObjs, getTextContent: async () => ({ items: p.runs.map(item), styles: STYLES }), getOperatorList: async () => opsOf({ ...p, ops: p.markedOps }, pointsOf(p, n, marks)), ...annotsOf(p) }
    },
    getDestinations: async () => new Map(marks.map(([name, page, x, y]) => [`axt-${name}`, [{ num: 100 + page, gen: 0 }, { name: 'FitR' }, x, y, null]])),
    getPageIndex: async (ref: { num: number }) => ref.num - 101,
  }
}
export async function marksOf(w: World, log = '', classes?: MarkClass[]) {
  return parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(markedOf(w.marked ?? w.pages, w.marks), log, { engine: 'pdflatex', switches: w.switches ?? null, inkless: w.inkless ?? null, texts: w.texts ?? null, names: w.names ?? null, complete: w.complete ?? null, apart: w.apart ?? null, units: w.units, OPS, ...(classes ? { classes } : {}) }))))
}
export const text = (s: string) => ({ t: 'text', s })
export const ph = (src: string) => ({ t: 'ph', src })
export const unit = (kind: string, pieces: unknown[], more: Partial<SourceUnit> & { front?: boolean } = {}): SourceUnit => ({ kind, pieces, ...more })
export const words = (from: number, n: number) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ')
