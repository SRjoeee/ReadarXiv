// U.marks (design-b §1.5, T16, T17): the marks no line starts with that the translation sets where the original's line
// shows none (after a display, whose line opens with none; after a held line's own mark, the one it shows), dropped; and the
// class's own marks after the unit's text (Placed.tail) set in place of the translation's of their kinds at its end. Today
// both are decided inside tokensOf2, as the tokens are made: B.tokens calls these where today does, and its answer carries
// the decisions (`MarksTrace`, the tap's U.marks slot: `{ drops: [kind, before, after], tail: [marks, merged] }`). Ported
// from engine 065c1d973 layer2.mjs: the dropped closure L2:2669-2680, droppedHeld L2:2379-2391, markKind L2:2363-2372, the
// tail merge L2:2845-2878 (the tail's characters then pushed by B.tokens).
//
// Its inputs (U.elements' and the part's facts): a display's resolution and the mark the original sets after it
// (`origAfter` ← El / Line), a held line's marks (`heldAfter`, `heldMarks`), the class's tail and the unit's own marks there
// (`tail`, `tailOwn` ← Placed.tail).
import { noStart } from '../breaker/script.ts'
import type { Token } from '../breaker/tokens.ts'

/** what the text after an element drops its leading marks for: a display (the mark the original sets after it), or a held
 *  line's marks */
export type MarksAfter = { origAfter?: string | null; held?: readonly string[] }
/** U.marks' decisions in one unit's tokens, as the tap's slot holds them: each text whose leading marks were dropped (its
 *  kind, before, after), and the tail (how many marks it sets, how many of the translation's it took off its end) */
export type MarksTrace = {
  drops: [kind: 'held' | 'display', before: string, after: string][]
  tail: [marks: number, merged: number] | null
}

/** the kind a mark no line may start with is, across scripts (L2:2363 markKind) */
export function markKind(ch: string): string {
  if (/^[.\u3002\uff0e\uff61]$/u.test(ch)) return 'stop'
  if (/^[,\u3001\uff0c\uff64]$/u.test(ch)) return 'comma'
  if (/^[;\uff1b]$/u.test(ch)) return 'semi'
  if (/^[:\uff1a]$/u.test(ch)) return 'colon'
  if (/^[!\uff01]$/u.test(ch)) return 'excl'
  if (/^[?\uff1f]$/u.test(ch)) return 'quest'
  if (/^[)\]}\uff09\uff3d\uff5d\u3009\u300b\u300d\u300f\u3011\u3015\u3017\u3019\u301b’”]$/u.test(ch)) return 'close'
  return ch
}
/** the text after a placeholder kept on its held line, without the leading marks that stand for one the line shows after it
 *  (L2:2379 droppedHeld) */
export function droppedHeld(s: string, held: readonly string[]): string {
  const left = held.map(markKind)
  let t = s,
    kept = ''
  while (left.length) {
    const lead = /^\s*/.exec(t)![0],
      ch = String.fromCodePoint(t.codePointAt(lead.length) ?? 0x20)
    if (lead.length >= t.length || !noStart(ch)) break
    const at = left.indexOf(markKind(ch))
    if (at >= 0) left.splice(at, 1)
    else kept += lead + ch
    t = t.slice(lead.length + ch.length)
  }
  return kept + t
}

/** the first text after a display or a held line's mark, its leading marks dropped (a display's: every one no line starts
 *  with, unless the original sets one after it); a drop noted in `trace` (L2:2669 dropped) */
export function dropMarks(s: string, after: MarksAfter, trace?: MarksTrace): string {
  const held = !!after.held
  let t = s
  if (after.held) t = droppedHeld(s, after.held)
  else
    for (;;) {
      const lead = /^\s*/.exec(t)![0],
        ch = String.fromCodePoint(t.codePointAt(lead.length) ?? 0x20)
      if (lead.length >= t.length || !noStart(ch) || noStart(after.origAfter)) break
      t = t.slice(lead.length + ch.length)
    }
  if (t !== s) trace?.drops.push([held ? 'held' : 'display', s, t])
  return t
}

/** the class's tail set in place of the translation's marks of its kinds at the unit's end: those marks taken off the last
 *  tokens (as many of each kind as the tail sets, less the unit's own there), spaces before them dropped; how many were
 *  taken. The tail's own characters are then pushed by B.tokens (L2:2845-2878) */
export function mergeTail(tokens: Token[], tail: readonly { ch: string }[], tailOwn: readonly string[] | null): number {
  const left = new Map<string, number>()
  for (const c of tail) left.set(markKind(c.ch), (left.get(markKind(c.ch)) ?? 0) + 1)
  const trailing = new Map<string, number>(),
    own = new Map<string, number>()
  for (const ch of tailOwn ?? []) own.set(markKind(ch), (own.get(markKind(ch)) ?? 0) + 1)
  scan: for (let q = tokens.length - 1; q >= 0; q--) {
    const t = tokens[q]!
    if (t.space) continue
    if (typeof t.s !== 'string' || t.ph || t.sup || t.label) break
    const cps = [...t.s]
    for (let x = cps.length - 1; x >= 0; x--) {
      if (!/^\p{P}$/u.test(cps[x]!)) break scan
      trailing.set(markKind(cps[x]!), (trailing.get(markKind(cps[x]!)) ?? 0) + 1)
    }
  }
  for (const [kind, n] of left)
    left.set(kind, Math.min(n, Math.max(0, (trailing.get(kind) ?? 0) - (own.get(kind) ?? 0))))
  const sum = () => [...left.values()].reduce((a, b) => a + b, 0)
  const before = sum()
  const take = (ch: string) => {
    const n = left.get(markKind(ch)) ?? 0
    if (n > 0) left.set(markKind(ch), n - 1)
    return n > 0
  }
  for (;;) {
    while (tokens.at(-1)?.space) tokens.pop()
    const t = tokens.at(-1)
    if (!t || typeof t.s !== 'string' || t.ph || t.sup || t.label) break
    const cps = [...t.s]
    let n = cps.length
    while (n > 0 && take(cps[n - 1]!)) n--
    if (n === cps.length) break
    if (n === 0) {
      tokens.pop()
      continue
    }
    t.s = cps.slice(0, n).join('')
    break
  }
  return before - sum()
}
