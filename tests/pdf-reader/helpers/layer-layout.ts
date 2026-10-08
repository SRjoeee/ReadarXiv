import { rolesFor } from './roles'
import type { LayerInput } from '@/pdf-reader/engine/layer/fit.mjs'
import { layerRulesFor } from '@/pdf-reader/engine/rules/layer-rules.mjs'
import {
  encodeLayout, indexLayout, LABEL_KINDS, LAYOUT, type LayoutFile, type LayoutIndex, PH_KINDS, parseLayout, UNIT_KINDS,
} from '@/pdf-reader/engine/layout/file.mjs'
import { measure } from './layer-fixtures'

// What the layer's fit and page tests share: layout files written in the test, made into an index through the real writer
// and parser (so that every unit a test lays is one a reader could be given), and the fit's input with the brief's fake
// measure (a Latin character 0.5 em, a CJK one 1 em, a space 0.25 em). Sizes are 10 unless a line says otherwise, so at
// full size a CJK character is 10 PDF units wide

export interface LineSpec { page?: number; x0?: number; x1: number; baseline: number; size?: number }
export interface FrameSpec { page?: number; column?: number; lines: number; share?: number; below?: number }
export interface PhSpec { k: number; kind: (typeof PH_KINDS)[number]; flags?: number; segs?: number[][]; text?: string }
export interface LabelSpec { kind?: (typeof LABEL_KINDS)[number]; page?: number; x0: number; baseline: number; x1: number }
/** an erase rectangle: the unit's line it is on (its index), x0, y0, x1, y1 */
export type EraseSpec = [line: number, x0: number, y0: number, x1: number, y1: number]
export interface UnitDef {
  id: number; kind?: (typeof UNIT_KINDS)[number]; flags?: number; pieces?: number
  lines: LineSpec[]; frames?: FrameSpec[]; ph?: PhSpec[]; labels?: LabelSpec[]; erase?: EraseSpec[]; held?: number[]
}

/** a line's rectangle as a 10 pt line's: 7 above its baseline, 2.5 below */
const top = (l: LineSpec) => l.baseline + 0.7 * (l.size ?? 10)
const bottom = (l: LineSpec) => l.baseline - 0.25 * (l.size ?? 10)

/** a layout file of these units on `pages` US Letter pages, written and parsed as a reader would get it */
export function layoutOf(units: UnitDef[], pages = 2): LayoutIndex {
  const file: LayoutFile = {
    schema: 1, layout: LAYOUT, pdfjs: '5.4.296', paper: { id: '1512.03385', version: 1, pages }, left: '',
    views: Array.from({ length: pages }, () => [0, 0, 612, 792]).flat(), fonts: ['NimbusRomNo9L-Regu'],
    units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [],
  }
  for (const u of units) {
    file.units.push([u.id, UNIT_KINDS.indexOf(u.kind ?? 'para'), u.kind === 'heading' ? 1 : 9, u.flags ?? 0, u.pieces ?? 64])
    file.lines.push([u.id, u.lines.flatMap(l => [l.page ?? 1, l.x0 ?? 72, l.x1, l.baseline, top(l), bottom(l), l.size ?? 10, 0])])
    const frames = u.frames ?? [{ lines: u.lines.length }]
    let first = 0
    file.frames.push([u.id, frames.flatMap((f, j) => {
      const row = [f.page ?? u.lines[first]?.page ?? 1, f.column ?? 0, first, f.lines, j === 0 ? -1 : (f.share ?? 0), f.below ?? 0]
      first += f.lines
      return row
    })])
    if (u.erase?.length) file.erase.push([u.id, u.erase.flat()])
    if (u.held?.length) file.held.push([u.id, [...u.held]])
    for (const p of u.ph ?? []) {
      file.ph.push([u.id, p.k, PH_KINDS.indexOf(p.kind), p.flags ?? 0, ...(p.segs ?? []).flat()])
      // a placeholder's own text: a text symbol's character (PH_FLAG.TEXT), or a page text's
      if (p.text !== undefined) file.pageText.push([u.id, p.k, p.text])
    }
    for (const l of u.labels ?? []) file.labels.push([u.id, LABEL_KINDS.indexOf(l.kind ?? 'number'), l.page ?? 1, l.x0, l.baseline, l.x1, l.baseline + 7, l.baseline - 2.5])
    if (u.kind === 'heading') file.headings.push([u.id, 'Introduction'])
  }
  return indexLayout(parseLayout(new TextEncoder().encode(encodeLayout(file))))
}

/** the layout's own text of a placeholder (Task 6b's: its own glyphs' text), set on a unit's row of an index: the file
 *  format has no place for it yet */
export function withText(file: LayoutIndex, id: number, k: number, text: string): LayoutIndex {
  const unit = file.unit(id)!
  const ph = new Map(unit.ph)
  ph.set(k, { ...unit.ph.get(k)!, text } as never)
  const own = { ...unit, ph }
  return { ...file, unit: (i: number) => (i === id ? own : file.unit(i)) }
}

/** n lines of one column: from `top` down at `pitch`, `x0` to `x0 + w`; `baselines` gives them their own */
export function column(n: number, o: { page?: number; x0?: number; w?: number; top?: number; pitch?: number; baselines?: number[] } = {}): LineSpec[] {
  const x0 = o.x0 ?? 72, w = o.w ?? 400, pitch = o.pitch ?? 12, start = o.top ?? 700
  return Array.from({ length: n }, (_, i) => ({ page: o.page ?? 1, x0, x1: x0 + w, baseline: o.baselines?.[i] ?? start - pitch * i }))
}

/** the fit's input for a target: its rules and roles (a Times paper), the fake measure, no hyphenation */
export const inputOf = (file: LayoutIndex, target: string, rules = layerRulesFor(target)): LayerInput => ({ file, target, rules, roles: rolesFor(target, 'times'), measure, hyphen: null })

const HAN = '\u6a21\u578b\u4f7f\u7528\u6211\u4eec\u5b66\u4e60\u6570\u636e\u8bad\u7ec3\u7f51\u7edc'
/** n Chinese characters, none of them punctuation */
export const han = (n: number) => Array.from({ length: n }, (_, i) => HAN[i % HAN.length]).join('')
// characters Japanese and Chinese both write so, which every face of both holds
const KANJI = '\u6a21\u578b\u4f7f\u7528\u65b9\u6cd5\u7814\u7a76\u63d0\u6848\u6587\u5b57'
/** n kanji, none of them punctuation */
export const kanji = (n: number) => Array.from({ length: n }, (_, i) => KANJI[i % KANJI.length]).join('')
const WORDS = ['modell', 'daten', 'netz', 'lernen', 'wir', 'zeigen', 'eine', 'methode', 'und', 'die']
/** a German-looking text of n words */
export const words = (n: number) => Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ')
