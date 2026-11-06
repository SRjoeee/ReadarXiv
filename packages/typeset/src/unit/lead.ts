// U.lead (design-b §1.5, T29, E4, C25): a unit whose first line a babel name leads (a run-in "Proof." or "Abstract—"): the
// name's word in the target in its own style, then the original's joint as TeX set it (the characters between the name and
// the unit's text) in its own, and the glue after them; the label the unit is then laid with is the name and the joint,
// and its first line starts where the name does. Ported from engine 065c1d973: RUN:2047-2072 (the lead, the label, the
// first rectangle, the name's record), unlead RUN:1841-1847, styleOfChars L2:2912, colourOfStyle L2:2909, r1 RUN:244.
//
// Its inputs, and the field each comes from once lane L1 and the shared rules state them:
// - `ld`: the name that leads the unit as S.names read it (paintNames RUN:1355: its box and glue `nm`, its word in the
//   target and style, its characters on the page; `rec` the reader dump's account of the name) ← the flow's name member
// - `joint`: the characters between the name and the unit's text in the file's label box of the unit (jointOf RUN:2050,
//   the page's characters: F.label) ← Placed.label of the unit (a lead's joint)
// - `firstPage`, `nameShown` (the name's group is shown), `labelKept` (the wrap keeps the unit's label as the original's),
//   `relabels` (the unit's label group exists and is not kept: Placed.fixed bit 4) ← the toggles and Placed
// - `size0`: the size of the unit's first line in the file (lu.lines[6]) ← Placed's first Line size
// - `serif`: the paper's serif design (the run's designs, A3)
import type { LabelPart } from './label.ts'

/** a character of the page as the lead reads it */
export type LeadChar = {
  ch: string
  x0: number
  x1: number
  page?: number
  st?: { fam?: string; bold?: boolean; italic?: boolean; caps?: boolean; design?: string; fill?: number } | null
}
/** a name's account in the reader dump (paintNames' record), as the lead sets it */
export type NameRecord = {
  drawn?: boolean
  why?: string | null
  size?: number
  x?: number
  chars?: readonly LeadChar[]
}
/** the name that leads a unit (paintNames' leadsOf): its box and glue, its word in the target in its style, its characters */
export type NameLead = {
  nm: { page: number; x0: number; x1: number; size: number; glue: number; occurrence?: number }
  text: string
  st: LabelPart['st'] & Record<string, unknown>
  chars: readonly LeadChar[]
  rec: NameRecord
}
export type LeadInput = {
  ld: NameLead | null
  joint: readonly LeadChar[] | null
  firstPage: number | null
  nameShown: boolean
  labelKept: boolean
  relabels: boolean
  size0: number | null
  serif: string
}
/** a lead as the breaker sets it: its parts (the name, the joint) in their styles, the glue after them in em of the unit's
 *  size */
export type Lead = { parts: { text: string; st: Record<string, unknown> }[]; gap: number }
/** the unit led: its lead, the label it is laid with (whose characters are the unit's text), where its first line now
 *  starts (`x0`, where left of its first rectangle) and the name's record as drawn */
export type Led = {
  lead: Lead
  label: { x1: number; text: string; chars: readonly LeadChar[]; drawn: string }
  x0: number | null
  rec: Required<Pick<NameRecord, 'drawn' | 'why' | 'size' | 'x' | 'chars'>>
}

const r1 = (x: number) => Math.round(x * 100) / 100
const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
const colourOfStyle = (st: LeadChar['st']) =>
  Number.isInteger(st?.fill) && st!.fill! >= 0 ? { color: st!.fill! > 0 ? hexOf(st!.fill!) : undefined } : {}
/** a run's style from its characters, the first not a formula's (L2:2912 styleOfChars) */
export function styleOfChars(cs: readonly LeadChar[], serif: string): Record<string, unknown> {
  const s0 = cs.find((c) => c.st?.fam !== 'math')?.st ?? cs[0]?.st ?? {}
  return {
    fam: s0.fam === 'math' || !s0.fam ? 'serif' : s0.fam,
    bold: !!s0.bold,
    italic: !!s0.italic,
    caps: !!s0.caps,
    design: s0.design ?? serif,
    ...colourOfStyle(s0),
  }
}

/** the joint the lead reads: where the unit's first line is on the name's page, the name's group shown and the unit's label
 *  not kept, the file's joint; else none (RUN:2063) */
export const jointOf = (i: Omit<LeadInput, 'joint'>, joint: readonly LeadChar[]): readonly LeadChar[] | null =>
  i.ld && i.firstPage === i.ld.nm.page && i.nameShown && !i.labelKept ? joint : null

/** U.lead: the unit led by its name, or null where no name leads it, or its joint is the original's ink (a joint drawn anew
 *  only where its unit's label group hides it) (RUN:2047-2072) */
export function lead(i: LeadInput, firstRectX0: number | null): Led | null {
  const { ld, joint } = i
  if (!ld || !joint || !(!joint.length || i.relabels)) return null
  const jText = joint.map((c) => c.ch).join('')
  const size0 = i.size0 ?? ld.nm.size
  return {
    lead: {
      parts: [{ text: ld.text, st: ld.st }, ...(jText ? [{ text: jText, st: styleOfChars(joint, i.serif) }] : [])],
      gap: ld.nm.glue / size0,
    },
    label: {
      x1: Math.max(ld.nm.x1, ...joint.map((c) => c.x1)),
      text: ld.chars.map((c) => c.ch).join('') + jText,
      chars: [...ld.chars, ...joint],
      drawn: ld.text + jText,
    },
    x0: firstRectX0 !== null && ld.nm.x0 < firstRectX0 ? ld.nm.x0 : null,
    rec: { drawn: true, why: null, size: r1(ld.nm.size), x: r1(ld.nm.x0), chars: ld.chars },
  }
}

/** a led unit left the original's after all: its name's record, the name with it (RUN:1841 unlead) */
export function unlead(rec: NameRecord, why: string | null | undefined): NameRecord {
  const { size: _size, x: _x, ...rest } = rec
  return { ...rest, drawn: false, why: `inline: ${why ?? 'its unit unfit'}`, chars: [] }
}
