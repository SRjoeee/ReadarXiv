// lab/typeset/parity/relay.mjs: today's own text laid in v2's unit, the fresh rule's second look (the coordinator's ruling of
// 2026-11-12). A member v2 is laid with a fresh row (fresh.mjs) draws another translation than today's; a measure whose two
// distances follow from the length of the text drawn (verdict.mjs FRESH_UNJUDGED) is not judged on it. v2.mjs lays the pair once
// more with each such member given today's own text where it can be placed in v2's unit (relayOf), render.mjs draws the pages that
// lay changes, and the verdict judges each set-aside difference again on that drawing (verdict.mjs freshResolve): gone, it follows
// from the different text; still there, it is judged as any; with no text of today's to lay, not comparable, its reason said.
import { readingOf } from '../../../packages/typeset/tests/replay/l1.ts'
import { doorSentences } from '../../../packages/typeset/tests/replay/rows.ts'

/** TeX's special characters a backslash escapes, each printing itself */
const ESCAPED = /^\\([#$%&_{}])$/
/** the characters a placeholder of today's prints where v2's unit holds them as text: l1.ts readingOf's (an address, a formula's
 *  run, an identifier, a brace's text symbol, a tie, an underscore), or a TeX escape of a special character (`\&` prints "&") */
export const printedOf = (src) => readingOf(src) ?? ESCAPED.exec(src ?? '')?.[1] ?? null

/** a unit's pieces flat, in the source's order (read.ts sourcePieces's reading: text, `ph` an element, `open` / `close` a group's
 *  edges, `nested` a unit), each element with its own id: the id a row names it by. The format's element ids are the source's
 *  piece numbers, not the flat order's (a group's edges collapsed in the tree: 1512.03385v1 t324's year, element 19, the 16th
 *  piece flat), so a row naming an element by its flat place names another or none, and the lay draws it nowhere */
export function flatOf(content) {
  const out = []
  const walk = (ps) => {
    for (const p of ps) {
      if (p.t === 'text') out.push({ t: 'text', s: p.s })
      else if (p.t === 'el') out.push({ t: 'ph', src: p.src, id: p.id })
      else if (p.t === 'unit') out.push({ t: 'nested', id: p.id })
      else {
        if (p.open !== undefined) out.push({ t: 'open', src: p.open })
        walk(p.content)
        if (p.close !== undefined) out.push({ t: 'close', src: p.close })
      }
    }
  }
  walk(content)
  return out
}

/** what today's unit holds, in its order: each character of its texts, each placeholder (`k` its piece's index, the number its
 *  door row cites it by, with its source); its groups' opens and closes none (l1.ts atomsOf's) */
const atomsOf = (today) =>
  today.pieces.flatMap((p, k) => (p.kind === 'text' ? (p.s ?? '').split('').map((c) => ({ c })) : p.kind === 'ph' ? [{ k, src: p.src ?? '' }] : []))

/**
 * v2's unit (its flat pieces) read against today's unit of the same text (its atoms), in order, all of both read; groups read
 * through: every character of v2's texts today's character, or a placeholder of today's that prints those characters (printedOf:
 * `\&` where v2's text holds "&"); each element of v2's today's placeholder of its own source, or the run of today's atoms whose
 * characters (a placeholder's its printing) are the element's reading (readingOf: an address, a formula's run, an identifier v2
 * holds as an element where today's held it as text). Returns, by today's placeholder: the element of v2's it is (`el`) or the
 * characters v2 holds for it (`text`); the elements read by their characters with their runs of today's atoms; each of today's
 * atoms' offset in v2's projection (each element one character, a group's edges none) and its length; null where the two differ
 */
export function readAlike(flat, atoms) {
  const map = new Map()
  const runs = []
  const at = []
  let j = 0,
    o = 0
  for (const p of flat) {
    if (p.t === 'open' || p.t === 'close') continue
    if (p.t === 'text') {
      for (let i = 0; i < p.s.length; ) {
        const a = atoms[j]
        if (!a) return null
        if ('c' in a) {
          if (a.c !== p.s[i]) return null
          at[j++] = o++
          i++
          continue
        }
        const r = printedOf(a.src)
        if (!r || p.s.slice(i, i + r.length) !== r) return null
        map.set(a.k, { text: r })
        at[j++] = o
        o += r.length
        i += r.length
      }
      continue
    }
    if (p.t !== 'ph') return null
    const a = atoms[j]
    if (a && 'k' in a && a.src === p.src) {
      map.set(a.k, { el: p.id })
      at[j++] = o++
      continue
    }
    const r = readingOf(p.src)
    if (!r) return null
    const from = j
    let got = ''
    while (got.length < r.length) {
      const x = atoms[j]
      const s = !x ? null : 'c' in x ? x.c : printedOf(x.src)
      if (!s || !r.startsWith(got + s)) return null
      got += s
      // (the run's first atom at the element's offset, the others inside it: none)
      at[j] = j === from ? o : -1
      j++
    }
    runs.push({ id: p.id, from, to: j })
    o++
  }
  return j === atoms.length ? { map, runs, at, len: o } : null
}

/**
 * Today's door row of a unit (`today`: its prepare dump's unit, whose pieces the row's numbers cite) said in v2's unit (`unit`:
 * the bundle's, its content; `sentences` where it is lit by sentence): the translation as today's row writes it, each of today's
 * placeholders the element of v2's that is it or the characters v2 holds for it, each element of v2's today held as text where
 * the translation holds that text, in their order and at one way of placing them, today's group edges dropped (v2's groups are
 * placed by the chain's reading, rows.mjs readAsChain), its sentences counted in v2's projection. Exact or none: `{ content,
 * sentences? }`, or `{ why }` where v2's unit and today's read otherwise (cut otherwise: a text one holds and the other not, an
 * element neither reads as the other's), a placeholder the row cites stands for no piece of v2's, or v2's elements stand at no
 * places of the translation or at more than one way. A unit lit by sentence whose sentences cannot be counted in v2's projection
 * is said without them (`unsentenced`)
 */
export function todaySaid(row, today, unit) {
  const flat = flatOf(unit.content)
  const atoms = atomsOf(today)
  const alike = readAlike(flat, atoms)
  if (!alike) return { why: "v2's unit is cut otherwise than today's: their texts do not read alike" }
  // (the translation as today's atoms: the row's strings and the texts it cites, character by character, today's placeholders it
  // cites; a group's edges none)
  const tr = []
  for (const q of row[1]) {
    const p = typeof q === 'string' ? { kind: 'text', s: q } : today.pieces[q]
    if (!p) return { why: "today's row cites a piece its unit has not" }
    if (p.kind === 'text') for (const c of (p.s ?? '').split('')) tr.push({ c })
    else if (p.kind === 'ph') tr.push({ k: q, src: p.src ?? '' })
  }
  const same = (a, b) => ('c' in a ? 'c' in b && a.c === b.c : 'k' in b && a.k === b.k)
  // (the elements of v2's today held as text, placed by their runs of today's atoms in the translation, in their order, one way
  // only: l1.ts keptRow's placing)
  const els = alike.runs.map((r) => ({ id: r.id, pat: atoms.slice(r.from, r.to) }))
  const fits = (e, i) => els[e].pat.every((x, d) => tr[i + d] !== undefined && same(tr[i + d], x))
  const ways = Array.from({ length: els.length + 1 }, () => new Array(tr.length + 1).fill(0))
  ways[els.length].fill(1)
  for (let e = els.length - 1; e >= 0; e--)
    for (let i = tr.length; i >= 0; i--) ways[e][i] = Math.min(2, (i < tr.length ? ways[e][i + 1] : 0) + (fits(e, i) ? ways[e + 1][i + els[e].pat.length] : 0))
  if (ways[0][0] !== 1) return { why: `an element of v2's unit that today's held as text stands ${ways[0][0] ? 'at more than one place' : 'nowhere'} in today's translation` }
  const runAt = new Map()
  for (let e = 0, i = 0; e < els.length; e++) {
    while (!(fits(e, i) && ways[e + 1][i + els[e].pat.length] > 0)) i++
    runAt.set(i, e)
    i += els[e].pat.length
  }
  // (the content, and each of the translation's atoms' offset in v2's: a run's first its element's, the rest none)
  const content = []
  const trAt = []
  let text = '',
    o = 0
  const flush = () => {
    if (text) content.push({ t: 'text', s: text })
    text = ''
  }
  for (let i = 0; i < tr.length; ) {
    if (runAt.has(i)) {
      const e = runAt.get(i)
      flush()
      content.push({ t: 'el', id: String(els[e].id) })
      trAt[i] = o++
      for (let d = 1; d < els[e].pat.length; d++) trAt[i + d] = -1
      i += els[e].pat.length
      continue
    }
    const x = tr[i]
    trAt[i] = o
    if ('c' in x) {
      text += x.c
      o++
    } else {
      const m = alike.map.get(x.k)
      if (!m) return { why: `today's row cites a placeholder (${x.src}) that stands for no piece of v2's unit` }
      if (m.text !== undefined) {
        text += m.text
        o += m.text.length
      } else {
        flush()
        content.push({ t: 'el', id: String(m.el) })
        o++
      }
    }
    i++
  }
  flush()
  if (!unit.sentences) return { content }
  const s = doorSentences(
    row,
    today.pieces.map((p) => ({ t: p.kind, s: p.s })),
  )
  const src = s?.src.map((x) => (x === atoms.length ? alike.len : (alike.at[x] ?? -1)))
  const trs = s?.tr.map((x) => (x === tr.length ? o : (trAt[x] ?? -1)))
  if (!s || src.includes(-1) || trs.includes(-1)) return { content, unsentenced: true }
  return { content, sentences: { src, tr: trs } }
}

/**
 * The re-lay's rows of a pair's members laid with a fresh row (v2.mjs's `needs`: ord -> { id, cause }, those whose fresh row was
 * a translation): what today drew of each, laid in v2's unit. 'today-kept' (today's name/code rule never sent it) and 'group'
 * (today's group decision kept the cell): sent nothing, the original's as today; 'unit' (its stored row is today's row of another
 * unit said in v2's): that stored row; 'no-row': today's door row said in v2's unit (todaySaid), the original's where today left
 * it so (its door row kept or none), else not comparable. `todayOf` ord -> today's ord (join.mjs todayJoin), `doors` today's door
 * rows by ord, `prepared` today's prepare dump's units by ord, `units` the bundle's units by id. Returns `drop` (the ids laid
 * without their fresh row: their stored row, or none), `said` (id -> the row of today's text in v2's unit, a Result before the
 * chain's reading), `how` (ord -> 'unsent' | 'stored' | 'said'), `incomparable` (ord -> why), `unsentenced` (ords said without
 * their sentences)
 */
export function relayOf(needs, { todayOf, doors, prepared, units }) {
  const drop = new Set(),
    said = new Map(),
    how = new Map(),
    incomparable = new Map(),
    unsentenced = new Set()
  for (const [ord, { id, cause }] of needs) {
    if (cause === 'today-kept' || cause === 'group') {
      drop.add(id)
      how.set(ord, 'unsent')
      continue
    }
    if (cause === 'unit') {
      drop.add(id)
      how.set(ord, 'stored')
      continue
    }
    const t = todayOf(ord)
    const door = t === undefined ? undefined : doors?.get(t)
    if (t === undefined) {
      incomparable.set(ord, 'no unit of today is joined to it')
      continue
    }
    if (!door) {
      incomparable.set(ord, 'today has no row of its unit')
      continue
    }
    if (door[2] !== 'whole' && door[2] !== 'partial') {
      drop.add(id)
      how.set(ord, 'unsent')
      continue
    }
    const u = units.get(id),
      p = prepared?.get(t)
    if (!u || !p) {
      incomparable.set(ord, p ? 'its unit is not in the bundle' : "today's prepare dump holds no unit of its")
      continue
    }
    const r = todaySaid(door, p, { content: u.content, sentences: u.sentences })
    if (r.why) {
      incomparable.set(ord, r.why)
      continue
    }
    said.set(id, { id, ok: true, content: r.content, by: String(door[3] ?? ''), ...(r.sentences ? { sentences: r.sentences } : {}) })
    how.set(ord, 'said')
    if (r.unsentenced) unsentenced.add(ord)
  }
  return { drop, said, how, incomparable, unsentenced }
}
