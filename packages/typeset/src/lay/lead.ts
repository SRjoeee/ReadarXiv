// U.lead over the part (today's run-in lead, RUN:2047-2072 over the facts a part states): a babel name the part binds to the
// member after it in its flow (Placed.bound: amsthm's "Proof.", IEEEtran's "Abstract—", a class's "Appendix A") is that
// member's lead: the name's word in the target, the joint TeX set after it (the member's own label on the name's line) and the
// original's glue after the joint, then the translation; the member's first line from the name's start, its label the name and
// the joint, drawn anew (its label group off), the name's text off with it. Where the joint cannot be drawn anew (the member's
// label kept by the add-on: today's labelKept) or the name has no word of the target's, the name stays the original's and the
// member is set after it, its first line pinned by the name's ink (today's edgesOf read it there) and its room beside it
// stopped at the name.
import type { Placed } from '@readarxiv/format'
import type { TStyle } from '../breaker/tokens.ts'
import { type PaperReading, tstyleOf } from './read.ts'

const LABEL_KEPT = 4
const PINNED = 2

/** a name's word in the target as S.names reads it for a lead (setNameOf's `lead`): its text and style */
export type NameWord = { text: string; st: TStyle }
/** the reading's lead (tokensOf2's `lead`): its parts in their styles, its glue in em of the member's first line's size, and
 *  the label it draws (the name's word and the joint) */
export type Lead = { parts: { text: string; st: TStyle }[]; gap?: number; drawn: string }

/** the member's own label on the name's line, after the name: the joint TeX set between the two */
function jointOf(name: Placed, led: Placed): Placed['label'] | undefined {
  const l = name.lines[0],
    lb = led.label
  if (!l || !lb) return undefined
  return lb.ink[0] === l[0] && Math.abs(lb.ink[5] - l[4]) <= 0.5 && lb.ink[1] >= l[3] - 0.05 ? lb : undefined
}

/** the member `led` set with the name before it as its lead, or null where the lead cannot be drawn anew */
export function ledBy(
  name: Placed,
  led: Placed,
  word: NameWord,
  designs: PaperReading['designs'],
): { m: Placed; lead: Lead } | null {
  const l = name.lines[0],
    f = led.lines[0]
  if (!l || !f) return null
  const joint = jointOf(name, led)
  const jText = joint ? [joint.name, joint.num, joint.punct].flatMap((x) => (x ? [x[0]] : [])).join('') : ''
  // (a joint the add-on cannot part from the member's text, or one whose text the part does not state: not drawn anew)
  if (joint && (!jText || (led.fixed ?? 0) & LABEL_KEPT)) return null
  const jSt = joint
    ? {
        ...tstyleOf(joint.style, designs),
        ...(joint.style.fill ? { color: `#${joint.style.fill.toString(16).padStart(6, '0')}` } : {}),
      }
    : null
  // (the glue after the joint, or after the name where none stands between: TeX's, none within a carry's 0.05 pt)
  const glue = f[2] - (joint ? joint.ink[3] : l[3])
  const size0 = f[10] ?? led.style.size
  const lead: Lead = {
    parts: [{ text: word.text, st: word.st }, ...(jText && jSt ? [{ text: jText, st: jSt }] : [])],
    gap: glue > 0.05 ? glue / size0 : 0,
    drawn: word.text + jText,
  }
  // (its label the name and the joint: drawn anew from the name's start, as today's prep.label)
  type Ink = NonNullable<Placed['label']>['ink']
  const nameInk: Ink = [l[0], l[2], l[6], l[3], l[5], l[4]]
  const ink: Ink = joint
    ? [l[0], l[2], Math.min(l[6], joint.ink[2]), Math.max(l[3], joint.ink[3]), Math.max(l[5], joint.ink[4]), l[4]]
    : nameInk
  const label: NonNullable<Placed['label']> = {
    kind: joint?.kind ?? 'head',
    ink,
    style: joint?.style ?? name.style,
    name: [name.plain ?? '', nameInk],
    ...(joint?.num ? { num: joint.num } : {}),
    ...(joint?.punct ? { punct: joint.punct } : {}),
  }
  return { m: { ...led, label }, lead }
}

/** the member set after a name that stays the original's on its first line: that line pinned by the name's ink, its room
 *  beside it stopped at the name */
export function keptBefore(name: Placed, led: Placed): Placed {
  const l = name.lines[0],
    f = led.lines[0]
  if (!l || !f) return led
  const lines = led.lines.map((x, j) => (j ? x : ([...x] as typeof x)))
  lines[0]![9] = (lines[0]![9] ?? 0) | PINNED
  const side = led.room.side
  return {
    ...led,
    lines,
    ...(side ? { room: { ...led.room, side: [Math.max(side[0], l[3]), side[1]] as [number, number] } } : {}),
  }
}
