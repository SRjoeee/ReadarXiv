import { rolesFor } from './roles'
import { layerRulesFor } from '@/pdf-reader/engine/layer-rules.mjs'
import type { Slot } from '@/pdf-reader/engine/layer/breaks.mjs'
import type { Hyphenator } from '@/pdf-reader/engine/layer/hyphen.mjs'
import type { TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { type Measure, type Token, tokensOf } from '@/pdf-reader/engine/layer/tokens.mjs'
import type { LayoutIndex, LayoutUnit } from '@/pdf-reader/engine/layout/file.mjs'

// What the layer's token and line-breaking tests share: the brief's fake measure and a hand-made unit and layout index.
// A unit's lines carry what tokensOf reads (a font and a size per line); nothing else of a layout file is needed

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u201c\u201d\u2018\u2019\u2014\u2026\u00b7]/

/** a Latin character 50, a CJK one 100, a space 25, at 100 px: the face is not looked at */
export const measure: Measure = text => {
  let w = 0
  for (const ch of text) w += ch === ' ' ? 25 : CJK.test(ch) ? 100 : 50
  return w
}

export interface PhSpec { kind: string; flags?: number; segs?: number[]; text?: string }
export interface UnitSpec { kind: string; title: boolean; centred: boolean; lineFonts: number[]; size: number; ph: Record<number, PhSpec> }

/** a located unit with one line per entry of `lineFonts` (each an index into the layout's fonts), all of one size */
export function unitOf(o: Partial<UnitSpec> = {}): LayoutUnit {
  const lineFonts = o.lineFonts ?? [0, 0, 0]
  const size = o.size ?? 10
  const lines = new Float64Array(lineFonts.length * 8)
  for (const [i, font] of lineFonts.entries()) lines.set([1, 72, 540, 700 - 12 * i, 710 - 12 * i, 698 - 12 * i, size, font], i * 8)
  const ph = new Map<number, { kind: string; flags: number; segs: Float64Array; text?: string }>()
  // `text`: the layout's own text of the placeholder (Task 6b's), where a test gives one
  for (const [k, p] of Object.entries(o.ph ?? {})) ph.set(Number(k), { kind: p.kind, flags: p.flags ?? 0, segs: Float64Array.from(p.segs ?? [1, 100, 700, 130, 710, 698]), ...(p.text === undefined ? {} : { text: p.text }) })
  return {
    id: 1, kind: o.kind ?? 'para', depth: 0, title: o.title ?? false, front: false, centred: o.centred ?? false, pieces: 64,
    lines, frames: new Float64Array(0), erase: [], ph, labels: new Float64Array(0), heading: null,
  } as unknown as LayoutUnit
}

/** a layout index that knows its fonts (all the tokens read) */
export function fileOf(fonts: string[]): LayoutIndex {
  return {
    file: { fonts },
    unit: () => null,
    onPage: () => [],
    view: () => [0, 0, 612, 792],
    font(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= fonts.length) throw new RangeError('no such font')
      return fonts[index]!
    },
  } as unknown as LayoutIndex
}

/** a translation's tokens for the line-breaking tests: the paper's own body font, the target's rules and roles */
export function tokenize(text: string | TrPiece[], target = 'en', o: { unit?: Partial<UnitSpec>; hyphen?: Hyphenator | null } = {}): Token[] {
  const pieces: TrPiece[] = typeof text === 'string' ? [[0, text]] : text
  const tokens = tokensOf(pieces, {
    unit: unitOf(o.unit), file: fileOf(['NimbusRomNo9L-Regu']), target, rules: layerRulesFor(target), roles: rolesFor(target, 'times'),
    measure, hyphen: o.hyphen ?? null,
  })
  if (!tokens) throw new Error(`not drawable: ${JSON.stringify(text)}`)
  return tokens
}

/** the lines' slots: one per width, a baseline 12 below the one before; `edit` changes any of them */
export function slotsOf(widths: number[], edit: (slot: Slot, index: number) => void = () => {}): Slot[] {
  return widths.map((w, i) => {
    const slot: Slot = { frame: 0, page: 1, x0: 0, x1: w, baseline: 700 - 12 * i, centred: false, after: 0 }
    edit(slot, i)
    return slot
  })
}

/** what the line breaker is given besides the tokens and slots */
export const contextOf = (target: string, hyphen: Hyphenator | null = null) => ({ rules: layerRulesFor(target), target, measure, hyphen })
