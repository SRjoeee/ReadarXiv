// The markers wire, over typed pieces (Microsoft's free endpoint keeps no tag: tags 0 %, markers 98 %, translation dossier
// §16). A unit goes out as plain text with its elements as markers `@a#`; what Microsoft does to markers is repaired here
// and nowhere else. Restated from the measured facts the PDF engine's wire (mt.mjs) carries, now that the source reader
// types each piece:
// - each marker is a hard sentence boundary to the endpoint, so a span that is not `must` goes on no wire: its words join
//   the sentence and its style may be lost (the decision: such a span may come back unstyled); a span holding the whole
//   unit goes on no wire either and comes back around the translation; a `must` span is kept as two markers, or as one
//   when it holds no text;
// - side-by-side elements, white space alone between them, go as one marker read back as all of them in order (28,203 of
//   the 53 sweep papers' 97,053 markers touched the one before); a display ends such a stretch;
// - a marker touching a word is read as part of it, and one right after a full stop leaves the last word untranslated: a
//   space of ours around it, taken back on reading where the reply kept it beside a stop or a digit;
// - a display's own end punctuation goes after its marker or the sentence runs on (0/444 vs 1,357/1,357), and the reply's
//   marks after that marker are taken off on reading;
// - ids are letters, never digits (engines reorder, merge and thousand-separate digits);
// - Microsoft writes `@e##`, `@d# #`, drops `#` before a CJK character, displaces a `#` (`@f#(#)`): read tolerantly where
//   the wire holds no `#` of its own.
import { asOut, textOf } from '../accept.ts'
import type { OutPiece, Piece, UnitIn } from '../contract.ts'
import { decode, ENTITY, escapeMarkers, INVISIBLE, LETTER, SAYS } from './text.ts'

export const DISPLAY = 'display'

type Item =
  | { t: 'text'; s: string; at: number }
  | { t: 'void'; out: OutPiece[]; at: number; len: number; display: boolean; stop: string | undefined }
  | { t: 'open'; id: string; at: number; letters: boolean; depth: number }
  | { t: 'close'; id: string; at: number }
export type Slot = { t: 'void'; out: OutPiece[] } | { t: 'open'; id: string } | { t: 'close'; id: string }

export interface MarkersPlan {
  wire: string
  /** marker n stands for slots[n − 1] */
  slots: Slot[]
  /** markers the wire set a space before after a full stop, after a digit, and before a digit */
  stops: ReadonlySet<number>
  numbers: ReadonlySet<number>
  numbersAfter: ReadonlySet<number>
  /** markers after which the wire wrote their element's own stop */
  own: ReadonlySet<number>
  /** spans that hold the whole unit, outermost first: back around the translation */
  around: readonly string[]
  /** kept spans whose source holds letters, innermost first: refilled where they come back empty */
  refill: readonly string[]
  /** the wire holds no `#` of its own: a `#` beside a marker is the marker's */
  hashFree: boolean
  /** for each wire offset (and its end), the offset in the unit's projection it came from */
  plainAt: readonly number[]
}

/** bijective base-26: 1 → a, 26 → z, 27 → aa */
export function toAlpha(id: number): string {
  let n = id
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(97 + r) + out
    n = (n - 1 - r) / 26
  }
  return out
}
export function fromAlpha(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 96)
  return n
}

const SOLID = /\S/
const LEAD_PUNCT = /^\s*[.,;:!?。．，、；：！？]/
const projLength = (ps: readonly Piece[]): number =>
  ps.reduce((n, p) => n + (p.t === 'text' ? p.s.length : p.t === 'el' ? 1 : projLength(p.content)), 0)

/** the spans that hold every element and every word of the unit, outermost first, and what they hold */
function around(content: readonly Piece[]): { ids: string[]; inner: readonly Piece[]; at: number } {
  const ids: string[] = []
  let inner = content
  let at = 0
  for (;;) {
    const solid = inner.filter((p) => !(p.t === 'text' && !SOLID.test(p.s)))
    const only = solid[0]
    if (solid.length !== 1 || only?.t !== 'span') return { ids, inner, at }
    at += projLength(inner.slice(0, inner.indexOf(only)))
    ids.push(only.id)
    inner = only.content
  }
}

function itemsOf(content: readonly Piece[], at0: number): Item[] {
  const items: Item[] = []
  const walk = (ps: readonly Piece[], at: number, depth: number): number => {
    for (const p of ps) {
      if (p.t === 'text') {
        items.push({ t: 'text', s: p.s, at })
        at += p.s.length
      } else if (p.t === 'el') {
        items.push({ t: 'void', out: [{ t: 'el', id: p.id }], at, len: 1, display: p.kind === DISPLAY, stop: p.stop })
        at += 1
      } else if (!p.must) at = walk(p.content, at, depth)
      else if (SOLID.test(textOf(p.content))) {
        items.push({ t: 'open', id: p.id, at, letters: LETTER.test(textOf(p.content)), depth })
        at = walk(p.content, at, depth + 1)
        items.push({ t: 'close', id: p.id, at })
      } else {
        // a `must` span with no text: one marker for it and what it holds
        const len = projLength(p.content)
        const last = [...p.content].reverse().find((q) => q.t === 'el')
        items.push({
          t: 'void',
          out: [{ t: 'span', id: p.id, content: asOut(p.content) }],
          at,
          len,
          display: last?.t === 'el' && last.kind === DISPLAY,
          stop: last?.t === 'el' ? last.stop : undefined,
        })
        at += len
      }
    }
    return at
  }
  walk(content, at0, 0)
  // side-by-side elements, white space alone between them, one marker; a display ends the stretch
  const out: Item[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item
    let last = i
    if (it.t === 'void' && !it.display) {
      for (let x = i + 1; x < items.length; x++) {
        const y = items[x] as Item
        if (y.t === 'void') {
          last = x
          if (y.display) break
          continue
        }
        if (y.t !== 'text' || SOLID.test(y.s)) break
      }
    }
    if (last === i || it.t !== 'void') {
      out.push(it)
      continue
    }
    const run = items.slice(i, last + 1)
    const end = run[run.length - 1] as Extract<Item, { t: 'void' }>
    out.push({
      t: 'void',
      out: run.flatMap((x): OutPiece[] => (x.t === 'void' ? x.out : x.t === 'text' ? [{ t: 'text', s: x.s }] : [])),
      at: it.at,
      len: end.at + end.len - it.at,
      display: end.display,
      stop: end.stop,
    })
    i = last
  }
  return out
}

/** A unit's markers wire and what reading a reply needs */
export function planMarkers(unit: UnitIn): MarkersPlan {
  const { ids, inner, at } = around(unit.content)
  const items = itemsOf(inner, at)
  const slots: Slot[] = []
  const stops = new Set<number>()
  const numbers = new Set<number>()
  const numbersAfter = new Set<number>()
  const own = new Set<number>()
  const kept: { id: string; depth: number }[] = []
  let wire = ''
  const plainAt: number[] = []
  const put = (s: string, from: number) => {
    wire += s
    for (let k = 0; k < s.length; k++) plainAt.push(from)
  }
  for (const [i, it] of items.entries()) {
    if (it.t === 'text') {
      // white space as one space, one where two runs meet; the escapes, each character of one at its source's place
      for (let k = 0; k < it.s.length; k++) {
        const ch = it.s[k] as string
        if (/\s/.test(ch)) {
          if (/\s$/.test(wire) || (k > 0 && /\s/.test(it.s[k - 1] as string))) continue
          put(' ', it.at + k)
        } else put(escapeMarkers(ch), it.at + k)
      }
      continue
    }
    slots.push(
      it.t === 'void'
        ? { t: 'void', out: it.out }
        : it.t === 'open'
          ? { t: 'open', id: it.id }
          : { t: 'close', id: it.id },
    )
    if (it.t === 'open' && it.letters) kept.push({ id: it.id, depth: it.depth })
    const n = slots.length
    const before = /[\p{L}\p{N}\p{M}.]$/u.test(wire) ? ' ' : ''
    if (wire.endsWith('.')) stops.add(n)
    if (/\p{N}$/u.test(wire)) numbers.add(n)
    const next = items[i + 1]
    const nextText = next?.t === 'text' ? next.s : ''
    const after = /^[\p{L}\p{N}\p{M}]/u.test(nextText) ? ' ' : ''
    if (/^\p{N}/u.test(nextText)) numbersAfter.add(n)
    const stop = it.t === 'void' && it.stop && !LEAD_PUNCT.test(nextText) ? it.stop : ''
    if (stop) own.add(n)
    const end = it.t === 'void' ? it.at + it.len : it.at
    put(before, it.at)
    put(`@${toAlpha(n)}#`, it.at)
    put(stop, end)
    put(after, end)
  }
  // the wire trimmed whole
  const lead = wire.length - wire.trimStart().length
  const trimmed = wire.trim()
  const map = plainAt.slice(lead, lead + trimmed.length)
  map.push(projLength(unit.content))
  return {
    wire: trimmed,
    slots,
    stops,
    numbers,
    numbersAfter,
    own,
    around: ids,
    refill: kept.sort((a, b) => b.depth - a.depth).map((k) => k.id),
    hashFree: !trimmed.replace(/@@|@[a-z]+#/g, '').includes('#'),
    plainAt: map,
  }
}

// ---------------------------------------------------------------- reading a reply back

export type Tok =
  | { t: 'text'; s: string }
  | { t: 'void'; out: OutPiece[] }
  | { t: 'open'; id: string }
  | { t: 'close'; id: string }

/** a marker's `#` doubled is its own, a space or a tab between or none, where the wire holds no `#` of its own */
const CLOSER = '#(?:[ \\t]*#)*'
/** the reply's markers: strictly (each with its `#`), or tolerantly (one without it too, of at most the highest id's
 *  width, followed by no letter of an id and no `#`: `@b形`) */
function readerOf(hashFree: boolean, bare: number | null): RegExp {
  const closer = hashFree ? CLOSER : '#'
  if (bare === null) return new RegExp(`@@|@([a-z]+)${closer}`, 'g')
  const letters = `[a-z]{1,${bare}}`
  return new RegExp(`@@|@(${letters})${closer}|@(${letters})(?![a-z#])`, 'g')
}
/** a run of `#` outside the markers, not an entity's, with a pair of brackets that held only it (`@f#(#)`) */
const STRAY = /(?<!&)#+/g
const STRAY_PAIR = /[ \t]*[([（【]\s*(?<!&)#+\s*[)\]）】]/g
/** our space after a stop before a marker, while the text still ends in a stop of any script */
const STOP_SPACE = /(?<=[.。．।॥۔։።။།])[ \t\n\f\r]+$/
/** our space after a digit before a marker, and before a digit after one */
const NUMBER_SPACE = /(?<=\p{N})[ \t\n\f\r]+$/u
const NUMBER_LEAD = /^[ \t\n\f\r]+(?=\p{N})/u
/** what a reply may set for an element's own stop right after its marker: any script's stop, comma, semicolon or colon */
const OWN_MARKS = '.,;:。．，、；：।۔،؛'
const OWN_LEAD = new RegExp(`^([ \\t\\n\\f\\r\\ue000]*)[${OWN_MARKS}]+`)
/** what the wire writes as one thing: a marker (read tolerantly too), an escaped `@`, an entity */
export const MARKER_ATOM = new RegExp(`@@|@[a-z]+(?:${CLOSER})?|${ENTITY}`, 'g')

/** A reply → tokens, or null where it cannot be read: a marker unknown, doubled or lost, every word lost */
export function readMarkers(text: string, plan: MarkersPlan, tolerant: boolean): Tok[] | null {
  const toks: Tok[] = []
  const seen = new Set<number>()
  let afterNumber = false
  let afterOwn = false
  const push = (raw: string, takeBack: RegExp | null) => {
    let s = raw
    if (plan.hashFree) s = s.replace(STRAY_PAIR, '').replace(STRAY, '')
    if (takeBack) s = s.replace(takeBack, '')
    if (afterOwn) s = s.replace(OWN_LEAD, '$1')
    s = decode(s)
    if (afterNumber) s = s.replace(NUMBER_LEAD, '')
    s = s.replace(INVISIBLE, '')
    if (s) toks.push({ t: 'text', s })
  }
  const re = readerOf(plan.hashFree, tolerant ? toAlpha(Math.max(1, plan.slots.length)).length : null)
  let last = 0
  let buf = ''
  for (let m = re.exec(text); m; m = re.exec(text)) {
    buf += text.slice(last, m.index)
    last = re.lastIndex
    if (m[0] === '@@') {
      buf += '@'
      continue
    }
    const id = fromAlpha((m[1] ?? m[2]) as string)
    const slot = plan.slots[id - 1]
    if (!slot || seen.has(id)) return null
    push(buf, plan.stops.has(id) ? STOP_SPACE : plan.numbers.has(id) ? NUMBER_SPACE : null)
    buf = ''
    seen.add(id)
    toks.push(slot)
    afterNumber = plan.numbersAfter.has(id)
    afterOwn = plan.own.has(id)
  }
  push(buf + text.slice(last), null)
  if (seen.size !== plan.slots.length) return null
  if (!toks.some((t) => t.t === 'text' && SAYS.test(t.s)) && LETTER.test(plan.wire.replace(MARKER_ATOM, '')))
    return null
  return toks
}

const STOP = /[.!?。！？]/
const STOPS = /[.!?。！？]/g
/** a kept span come back empty (the translator set its words outside it) takes the words right after its close, past other
 *  closes, up to the end of their sentence; else those right before its open, past other opens, from the start of theirs */
export function refill(toks: Tok[], ids: readonly string[]): Tok[] {
  const out = [...toks]
  const solid = (t: Tok) => t.t === 'text' && SOLID.test(t.s)
  for (const id of ids) {
    const i = out.findIndex((t) => t.t === 'open' && t.id === id)
    const j = out.findIndex((t) => t.t === 'close' && t.id === id)
    if (i < 0 || j <= i || out.slice(i + 1, j).some(solid)) continue
    let x = j + 1
    while (out[x]?.t === 'close') x++
    const after = out[x]
    if (after?.t === 'text') {
      const cut = after.s.search(STOP)
      const inside = cut < 0 ? after.s : after.s.slice(0, cut)
      if (LETTER.test(inside)) {
        if (cut < 0) out.splice(x, 1)
        else out[x] = { t: 'text', s: after.s.slice(cut) }
        out.splice(j, 0, { t: 'text', s: inside })
        continue
      }
    }
    x = i - 1
    while (x >= 0 && out[x]?.t === 'open') x--
    const before = out[x]
    if (x >= 0 && before?.t === 'text') {
      const cut = Math.max(-1, ...[...before.s.matchAll(STOPS)].map((m) => m.index ?? -1))
      const inside = before.s.slice(cut + 1)
      if (LETTER.test(inside)) {
        if (cut < 0) out.splice(x, 1)
        else out[x] = { t: 'text', s: before.s.slice(0, cut + 1) }
        const open = out.findIndex((t) => t.t === 'open' && t.id === id)
        out.splice(open + 1, 0, { t: 'text', s: inside })
      }
    }
  }
  return out
}

/** tokens → content: pairs nested as they close, the spans around the whole unit put back; null for a pair out of order */
export function contentOf(toks: readonly Tok[], aroundIds: readonly string[]): OutPiece[] | null {
  const root: OutPiece[] = []
  const stack: { id: string | null; content: OutPiece[] }[] = [{ id: null, content: root }]
  for (const t of toks) {
    const top = stack[stack.length - 1] as { id: string | null; content: OutPiece[] }
    if (t.t === 'text') top.content.push({ t: 'text', s: t.s })
    else if (t.t === 'void') top.content.push(...t.out)
    else if (t.t === 'open') {
      const node: OutPiece = { t: 'span', id: t.id, content: [] }
      top.content.push(node)
      stack.push({ id: t.id, content: node.content })
    } else {
      if (stack.length === 1 || top.id !== t.id) return null
      stack.pop()
    }
  }
  if (stack.length !== 1) return null
  let content = root
  for (const id of [...aroundIds].reverse()) content = [{ t: 'span', id, content }]
  return content
}
