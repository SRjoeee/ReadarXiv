// One person, one translation per paper (the owner's ruling of 2026-11-10, docs/PDF-READER.md §19.15): where the names toggle
// shows the author block, a unit the part states names a person of the block elsewhere (Part.paper.named) is laid with the
// block's translation of the name; with the toggle off it is laid from its own row, as before. Made here, at the lay, from rows
// as they came, never stored: each row stays its own unit's translation (a stored mix would go stale with the block's row),
// and every caller of layPage (the reader, the parity, the gates) lays the page alike.
//
// - The block's translation of a name: the block member's row cut into its stretches by the elements the part states (Split):
//   each cut back once and in order, its stretches holding a letter exactly where the source's do, the name's stretch then
//   trimmed of punctuation, white space, symbols and controls. A reply cut otherwise has none (the tags wire's element moved
//   across a name gives the neighbour's name between the same two elements: the letters' places tell it), never a guess.
// - In a variant (the unit's form with its names as elements, asked of the translator with the unit): its row with each name's
//   element the block's translation, its sentences mapped back onto the unit (`src`) and onto the text as drawn (`tr`); where
//   a name has none, or the variant's row failed, the unit's own row: its names cannot be told apart in that row.
// - A unit that is a name, whole, between two of its cuts: its own row with that stretch's letters the block's, its own
//   punctuation kept; where the block's has none, its own translation of that name.
// - What a page waits for (wait.ts): with the names shown, the variant's row and the block members' rows besides the unit's.
// An original module (no port statement).
import type { Named, OutPiece, Part, Person, Row, Split } from '@readarxiv/format'
import type { Rows } from '../types.ts'

const LETTER = /\p{L}/u
const EDGE = /^[\p{P}\p{Z}\p{S}\p{C}]+|[\p{P}\p{Z}\p{S}\p{C}]+$/gu
const trimmed = (s: string) => s.replace(/\s+/g, ' ').replace(EDGE, '')

/** a row's text cut into the stretches `split` states, or null where the row cannot be cut exactly (the header) */
export function cutRow(content: readonly OutPiece[], split: Split): string[] | null {
  const [, cuts, spaces, lettered] = split
  const cutSet = new Set(cuts)
  const spaceSet = new Set(spaces)
  const texts = ['']
  let next = 0
  let bad = false
  const walk = (ps: readonly OutPiece[]) => {
    for (const p of ps) {
      if (bad) return
      if (p.t === 'text') texts[texts.length - 1] += p.s
      else if (p.t === 'span') walk(p.content)
      else if (cutSet.has(p.id)) {
        if (cuts[next] !== p.id) bad = true
        next++
        texts.push('')
      } else if (spaceSet.has(p.id)) texts[texts.length - 1] += ' '
    }
  }
  walk(content)
  if (bad || next !== cuts.length) return null
  const want = new Set(lettered)
  for (const [k, t] of texts.entries()) if (LETTER.test(t) !== want.has(k)) return null
  return texts
}

/** a projection's offsets mapped where a stretch of it at `at`, `from` long, becomes `to` long (an offset inside it to its start) */
const shift = (o: number, at: number, from: number, to: number) => (o < at + from ? Math.min(o, at) : o + to - from)

interface Ctx {
  rows: Rows
  leave: ReadonlySet<string>
  persons: readonly Person[]
  splits: ReadonlyMap<string, Split>
}

/** the block's translation of person `p`: its text, null where it has none, undefined where its row is still to come */
function personOf(c: Ctx, p: number): string | null | undefined {
  const person = c.persons[p]
  if (!person) return null
  const [unit, kind, k] = person
  if (c.leave.has(kind)) return null
  const row = c.rows.get(unit)
  if (!row) return c.rows.done ? null : undefined
  const split = c.splits.get(unit)
  if (!row.ok || !split) return null
  const texts = cutRow(row.content, split)
  const name = texts?.[k] !== undefined ? trimmed(texts[k]) : ''
  return LETTER.test(name) ? name : null
}

/** the projection offsets (each element one character, a group's edges none) of the elements `ids` in a row, in order */
function elementsAt(content: readonly OutPiece[], ids: ReadonlySet<string>): Map<string, number> {
  const at = new Map<string, number>()
  let o = 0
  const walk = (ps: readonly OutPiece[]) => {
    for (const p of ps) {
      if (p.t === 'text') o += p.s.length
      else if (p.t === 'span') walk(p.content)
      else {
        if (ids.has(p.id)) at.set(p.id, o)
        o++
      }
    }
  }
  walk(content)
  return at
}
/** a row's pieces with each element of `by` its text, neighbouring texts joined */
function replaced(content: readonly OutPiece[], by: ReadonlyMap<string, string>): OutPiece[] {
  const out: OutPiece[] = []
  for (const p of content) {
    const q: OutPiece =
      p.t === 'span'
        ? { ...p, content: replaced(p.content, by) }
        : p.t === 'el' && by.has(p.id)
          ? { t: 'text', s: by.get(p.id)! }
          : p
    const last = out[out.length - 1]
    if (q.t === 'text' && last?.t === 'text') out[out.length - 1] = { t: 'text', s: last.s + q.s }
    else out.push(q)
  }
  return out
}

function inVariant(c: Ctx, own: Row & { ok: true }, n: Named): Row | undefined {
  const variant = c.rows.get(n[1])
  if (!variant) return c.rows.done ? own : undefined
  if (!variant.ok) return own
  const by = new Map<string, string>()
  const names: { at: number; from: number; to: number; id: string }[] = []
  for (const x of n[2]) {
    if (x.length !== 4) return own
    const t = personOf(c, x[1])
    if (t === undefined) return c.rows.done ? own : undefined
    if (t === null) return own
    by.set(x[0], t)
    names.push({ at: x[3], from: 1, to: x[2], id: x[0] })
  }
  const content = replaced(variant.content, by)
  if (!variant.sentences) return { ...variant, id: own.id, content }
  // (the unit's projection: each name's element one character in the variant's, its text there; the drawn text's: each
  // element one character in the variant's row, its translation in this one)
  const src = variant.sentences.src.map((o) => names.reduce((x, y) => x + (y.at < o ? y.to - y.from : 0), o))
  const trAt = elementsAt(variant.content, new Set(by.keys()))
  const tr = variant.sentences.tr.map((o) =>
    [...by].reduce((x, [id, t]) => x + ((trAt.get(id) ?? Number.POSITIVE_INFINITY) < o ? t.length - 1 : 0), o),
  )
  return { ...variant, id: own.id, content, sentences: { src, tr } }
}

function inOwnRow(c: Ctx, own: Row & { ok: true }, n: Named): Row | undefined {
  const split = c.splits.get(n[0])
  if (!split) return own
  const want = new Map<number, string>()
  for (const x of n[2]) {
    if (x.length !== 2) return own
    const t = personOf(c, x[1])
    if (t === undefined && !c.rows.done) return undefined
    if (typeof t === 'string') want.set(x[0], t)
  }
  if (!want.size || !cutRow(own.content, split)) return own
  // (each stretch's letters, where they stand within one text piece of the row, the block's: the rest as the row has it)
  const cutSet = new Set(split[1])
  let k = 0
  let o = 0
  const edits: { at: number; from: number; to: number }[] = []
  const pieces: { p: OutPiece & { t: 'text' }; k: number; o: number }[] = []
  const walk = (ps: readonly OutPiece[]) => {
    for (const p of ps) {
      if (p.t === 'text') {
        pieces.push({ p, k, o })
        o += p.s.length
      } else if (p.t === 'span') walk(p.content)
      else {
        if (cutSet.has(p.id)) k++
        o++
      }
    }
  }
  walk(own.content)
  const swap = new Map<OutPiece, string>()
  for (const [stretch, name] of want) {
    const mine = pieces.filter((x) => x.k === stretch && LETTER.test(x.p.s))
    if (mine.length !== 1) continue
    const { p, o: at } = mine[0]!
    const lead = p.s.length - p.s.replace(/^[\p{P}\p{Z}\p{S}\p{C}]+/u, '').length
    const tail = p.s.length - p.s.replace(/[\p{P}\p{Z}\p{S}\p{C}]+$/u, '').length
    const core = p.s.length - lead - tail
    swap.set(p, p.s.slice(0, lead) + name + p.s.slice(lead + core))
    edits.push({ at: at + lead, from: core, to: name.length })
  }
  if (!swap.size) return own
  const rebuilt = (ps: readonly OutPiece[]): OutPiece[] =>
    ps.map((p) =>
      p.t === 'span' ? { ...p, content: rebuilt(p.content) } : swap.has(p) ? { t: 'text', s: swap.get(p)! } : p,
    )
  const content = rebuilt(own.content)
  if (!own.sentences) return { ...own, content }
  const tr = own.sentences.tr.map((x) => edits.reduce((y, e) => y + (shift(x, e.at, e.from, e.to) - x), x))
  return { ...own, content, sentences: { src: own.sentences.src, tr } }
}

/**
 * The rows page `part` is laid from: a unit the part states names a person of the block elsewhere resolved (the header),
 * every other row as it is; `leave` the member kinds the reader leaves the original's (the names toggle's among them)
 */
export function namedRows(part: Pick<Part, 'paper'>, rows: Rows, leave: ReadonlySet<string>): Rows {
  const named = part.paper.named
  if (!named?.length) return rows
  const c: Ctx = {
    rows,
    leave,
    persons: part.paper.persons ?? [],
    splits: new Map((part.paper.splits ?? []).map((s) => [s[0], s])),
  }
  const byUnit = new Map(named.map((n) => [n[0], n]))
  const made = new Map<string, Row | undefined>()
  return {
    get(id) {
      const n = byUnit.get(id)
      if (!n) return rows.get(id)
      if (made.has(id)) return made.get(id)
      const own = rows.get(id)
      // (no person of it shown: its own row, as it came, the variant's and the block's never read, as none is waited for)
      const got =
        !own?.ok || !shownOf(n, c.persons, leave).length ? own : n[1] ? inVariant(c, own, n) : inOwnRow(c, own, n)
      made.set(id, got)
      return got
    },
    get done() {
      return rows.done
    },
    ...(rows.kept ? { kept: (id: string) => rows.kept!(id) } : {}),
  }
}

/** the persons a unit that names the block's holds that the toggles show (`leave` holds none of their kinds): the one test of
 *  what a page laid with it reads (namedRows) and of what it waits for (namedWaits). The composer keeps a page laid once
 *  nothing it waits for is missing, so a lay that read a row its page did not wait for drew what that row's coming later
 *  changes (2611.03953v2-zh p1, staging round B14: the correspondence footnote's variant late, the names off, the footnote
 *  the original's until a toggle laid the page again with its own row) */
function shownOf(n: Named, persons: readonly Person[], leave: ReadonlySet<string>): Person[] {
  return n[2].map((x) => persons[x[1]]).filter((p): p is Person => !!p && !leave.has(p[1]))
}

/** the rows besides its own a unit the part states names a person of the block waits for while rows may come: its variant's
 *  and the block members', where the names are shown (shownOf) */
export function namedWaits(part: Pick<Part, 'paper'>, id: string, leave: ReadonlySet<string>): string[] {
  const n = part.paper.named?.find((x) => x[0] === id)
  if (!n) return []
  const shown = shownOf(n, part.paper.persons ?? [], leave)
  if (!shown.length) return []
  return [...(n[1] ? [n[1]] : []), ...shown.map((p) => p[0])]
}
