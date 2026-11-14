// One person, one translation per paper (the owner's ruling of 2026-11-10, docs/PDF-READER.md §19.15): where the names toggle
// shows the author block under the title, a block name a unit holds elsewhere (an ACM reference format, a correspondence line,
// an acknowledgement, a self-citation) is drawn with the block's translation of that name; with the toggle off that unit is
// ordinary text, translated and drawn as before. What the bundle states for it, made here from the units and the block's members:
//
// - A **stretch** of a unit: its text between two pieces that set something (an element that is no tie, states no glue, is no
//   forced break and is not silent, or a nested unit's mark) or its edges; a group's edges no cut (Microsoft sends back a group
//   that travelled on no wire hollow, its words outside it: 70 of 293 names of today's stored replies cut at them came back so,
//   0 of 242 cut at the elements alone), a tie a space, what sets nothing nothing.
// - A **name**: a stretch of a unit of kind `author` (the source's author declaration, TeX's \author data), trimmed of Unicode
//   punctuation, white space, symbols and controls at both ends, of two words or more: a given name and a surname as the block
//   writes them (a single word, "AI" of 2609.36054v2's \author{… Institute for Law \& AI}, is no person's and stands in 99 of its
//   paragraphs).
// - Its **anchor**: the first member of the block (the names toggle's member kinds, by ord) one of whose stretches is the name;
//   its row's text there is the block's translation of the name. A name no block member holds so has none and nothing of it is
//   drawn otherwise than before (a block that lists names with no element between them: IEEEtran's \IEEEauthorblockN{A, B and C}).
// - An **occurrence**: the name's text inside one text piece of any other unit a member lays and the paper does not keep, white space between its words any, no
//   letter or digit beside it, the longest name first; the anchor's own stretch is none. A unit whose every occurrence is a whole
//   stretch of it is resolved in its own row (stretch mode: 2610.22065v1's reference format names, each its own unit; 2604's
//   "Zhiqiang Shen (", the translator's own bracket kept); any other unit holding one has a **variant**, a unit of kind `named`:
//   its content with each occurrence's text an element of kind `person` (its `src` the name as the unit writes it), its other
//   pieces and their ids as they are, written right after it, so that a translator is asked for it with the unit and its row is
//   its own (its own id and wire: nothing is keyed by the toggle). An original module (no port statement).
import { type Named, type Person, type Piece, type Split, toggleKind, type Unit, unitId } from '@readarxiv/format'
import type { PieceClass } from '../instrument.ts'

/** the kind of a unit's form with the block's names it holds as elements, and the kind of each such element */
export const NAMED_KIND = 'named'
export const PERSON_KIND = 'person'
/** the member kinds of the author block under the title: the names toggle's (reader classes.ts, author-block.ts) */
const BLOCK_KINDS: ReadonlySet<string> = new Set(['author', 'affiliation', 'inknames'])

/** what an element is to a stretch: a cut, a space (a tie: TeX's interword space, no line break at it), or nothing */
function roleOf(p: Piece, c: PieceClass | undefined): 'cut' | 'space' | 'none' {
  if (p.t === 'unit') return 'cut'
  if (p.t !== 'el') return 'none'
  if (p.silent) return 'none'
  if (c?.brk || c?.glue) return 'cut'
  const cls = c?.cls ?? p.kind
  if (cls === 'space') return 'space'
  if (cls === 'zero') return 'none'
  return 'cut'
}

const EDGE = /^[\p{P}\p{Z}\p{S}\p{C}]+|[\p{P}\p{Z}\p{S}\p{C}]+$/gu
const LETTER = /\p{L}/u
/** a stretch's text as names are compared: white space collapsed, trimmed of punctuation, white space, symbols, controls */
const nameOf = (s: string): string => s.replace(/\s+/g, ' ').replace(EDGE, '')
/** two words or more, each holding a letter */
const isName = (n: string): boolean => n.split(' ').filter((w) => LETTER.test(w)).length >= 2

export interface Stretches {
  /** each stretch's text (a tie a space) */
  texts: string[]
  cuts: string[]
  spaces: string[]
  /** the stretch each text piece stands in */
  of: Map<Piece, number>
}
/** a unit's stretches (the header) */
export function stretchesOf(content: readonly Piece[], classOf: (id: string) => PieceClass | undefined): Stretches {
  const out: Stretches = { texts: [''], cuts: [], spaces: [], of: new Map() }
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'text') {
        out.of.set(p, out.texts.length - 1)
        out.texts[out.texts.length - 1] += p.s
      } else if (p.t === 'span') walk(p.content)
      else {
        const r = roleOf(p, classOf(p.id))
        if (r === 'cut') {
          out.cuts.push(p.id)
          out.texts.push('')
        } else if (r === 'space') {
          out.spaces.push(p.id)
          out.texts[out.texts.length - 1] += ' '
        }
      }
    }
  }
  walk(content)
  return out
}
const splitOf = (id: string, st: Stretches): Split => [
  id,
  st.cuts,
  st.spaces,
  st.texts.flatMap((t, k) => (LETTER.test(t) ? [k] : [])),
]

/** a member as the names read it: its row's unit (Placed.text), its ord and its member kind */
export interface BlockMember {
  ord: number
  unit: string
  kind: string
  /** its unit's Unit.of (format's toggleKind reads it) */
  of?: string
}
export interface NamesOut {
  /** each unit's variant, by the unit's id */
  variants: Map<string, Unit>
  /** each unit that names a person elsewhere, by its id: its variant ('' none) and its names, persons by `persons`' index */
  named: Map<string, Named>
  persons: Person[]
  /** the splits the anchors and the units resolved in their own rows are cut by, by unit id */
  splits: Map<string, Split>
}

/**
 * The names a paper's units hold elsewhere than in the block (the header): `units` the bundle's, in order; `classOf` what the
 * source says of a unit's element (the instrument's PieceClass, by unit id and piece id); `members` the paper's members, the
 * block's among them (a unit no member lays is never drawn: no variant of it is asked for)
 */
export function namesOf(
  units: readonly Unit[],
  classOf: (unit: string, piece: string) => PieceClass | undefined,
  members: readonly BlockMember[],
): NamesOut {
  const out: NamesOut = { variants: new Map(), named: new Map(), persons: [], splits: new Map() }
  const byId = new Map(units.map((u) => [u.id, u]))
  const stretches = new Map<string, Stretches>()
  const st = (u: Unit) => {
    const had = stretches.get(u.id)
    if (had) return had
    const s = stretchesOf(u.content, (p) => classOf(u.id, p))
    stretches.set(u.id, s)
    return s
  }
  // ---- the names, each with its anchor
  const names: string[] = []
  for (const u of units)
    if (u.kind === 'author')
      for (const t of st(u).texts) {
        const n = nameOf(t)
        if (isName(n) && !names.includes(n)) names.push(n)
      }
  if (!names.length) return out
  const block = members.filter((m) => BLOCK_KINDS.has(m.kind)).sort((a, b) => a.ord - b.ord)
  const laid = new Set(members.map((m) => m.unit))
  const anchor = new Map<string, number>()
  const nameAt: string[] = []
  for (const n of names)
    for (const m of block) {
      const u = byId.get(m.unit)
      if (!u || u.kept) continue
      const k = st(u).texts.findIndex((t) => nameOf(t) === n)
      if (k < 0) continue
      anchor.set(n, out.persons.length)
      nameAt.push(n)
      out.persons.push([u.id, toggleKind(m), k])
      out.splits.set(u.id, splitOf(u.id, st(u)))
      break
    }
  if (!anchor.size) return out
  // ---- each name's text, white space between its words any, no letter or digit beside it
  const patterns = [...anchor].map(
    ([n, person]) =>
      [
        person,
        n,
        new RegExp(
          `(?<![\\p{L}\\p{N}])${n
            .split(' ')
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+')}(?![\\p{L}\\p{N}])`,
          'gu',
        ),
      ] as const,
  )
  for (const u of units) {
    if (u.kept || u.kind === NAMED_KIND || u.kind === 'name' || !laid.has(u.id)) continue
    const s = st(u)
    // (each text piece's occurrences: [start, end, person], the longest first, none overlapping)
    const found = new Map<Piece, [number, number, number][]>()
    const visit = (ps: readonly Piece[]) => {
      for (const p of ps) {
        if (p.t === 'span') visit(p.content)
        if (p.t !== 'text') continue
        const all: [number, number, number][] = []
        for (const [person, , re] of patterns)
          for (const m of p.s.matchAll(re)) all.push([m.index, m.index + m[0].length, person])
        all.sort((x, y) => y[1] - y[0] - (x[1] - x[0]) || x[0] - y[0])
        const taken: [number, number, number][] = []
        for (const x of all) if (!taken.some((y) => x[0] < y[1] && y[0] < x[1])) taken.push(x)
        // (the anchor's own stretch is no occurrence; a shorter name inside it none either)
        const occ = taken
          .filter(([, , person]) => {
            const [a, , k] = out.persons[person]!
            return !(a === u.id && s.of.get(p) === k)
          })
          .sort((x, y) => x[0] - y[0])
        if (occ.length) found.set(p, occ)
      }
    }
    visit(u.content)
    if (!found.size) continue
    // (stretch mode: every occurrence the whole of its stretch, resolved in the unit's own row)
    const wholes: [number, number][] = []
    for (const [p, occ] of found)
      for (const [, , person] of occ) {
        const k = s.of.get(p)!
        if (occ.length === 1 && nameOf(s.texts[k]!) === nameAt[person]) wholes.push([k, person])
      }
    if (wholes.length === [...found.values()].reduce((n, o) => n + o.length, 0)) {
      out.named.set(u.id, [u.id, '', wholes])
      out.splits.set(u.id, splitOf(u.id, s))
      continue
    }
    // (variant mode: each occurrence an element of the variant, its id one no piece of the unit has)
    const ids = new Set<string>()
    const idsOf = (ps: readonly Piece[]) => {
      for (const p of ps) {
        if (p.t !== 'text') ids.add(p.id)
        if (p.t === 'span') idsOf(p.content)
      }
    }
    idsOf(u.content)
    let prefix = 'n'
    while ([...ids].some((i) => i.startsWith(prefix))) prefix += 'n'
    const at: [string, number, number, number][] = []
    // (the projection's offset as the variant has it: text pieces joined, each element one character, a group's edges none)
    let offset = 0
    const rewrite = (ps: readonly Piece[]): Piece[] =>
      ps.flatMap((p): Piece[] => {
        if (p.t === 'span') return [{ ...p, content: rewrite(p.content) }]
        if (p.t !== 'text') {
          offset++
          return [p]
        }
        const occ = found.get(p)
        if (!occ) {
          offset += p.s.length
          return [p]
        }
        const parts: Piece[] = []
        let from = 0
        for (const [a, b, person] of occ) {
          if (a > from) parts.push({ t: 'text', s: p.s.slice(from, a) })
          offset += a - from
          const id = `${prefix}${at.length}`
          at.push([id, person, b - a, offset])
          parts.push({ t: 'el', id, kind: PERSON_KIND, src: p.s.slice(a, b) })
          offset++
          from = b
        }
        if (from < p.s.length) parts.push({ t: 'text', s: p.s.slice(from) })
        offset += p.s.length - from
        return parts
      })
    const content = rewrite(u.content)
    const v: Unit = {
      id: unitId(NAMED_KIND, content),
      kind: NAMED_KIND,
      content,
      ...(u.sentences ? { sentences: true as const } : {}),
    }
    out.variants.set(u.id, v)
    out.named.set(u.id, [u.id, v.id, at])
  }
  return out
}

/** what a part states of the names its members' units hold (Part.paper's named, persons, splits): those of `texts` (its
 *  members' row ids), each person and split once, persons numbered in the part's order */
export function partNames(
  names: NamesOut,
  texts: readonly string[],
): { named: Named[]; persons: Person[]; splits: Split[] } | null {
  const named: Named[] = []
  const persons: Person[] = []
  const local = new Map<number, number>()
  const splits = new Map<string, Split>()
  const personOf = (p: number) => {
    const had = local.get(p)
    if (had !== undefined) return had
    const i = persons.length
    local.set(p, i)
    const x = names.persons[p]!
    persons.push(x)
    splits.set(x[0], names.splits.get(x[0])!)
    return i
  }
  const seen = new Set<string>()
  for (const t of texts) {
    const n = names.named.get(t)
    if (!n || seen.has(t)) continue
    seen.add(t)
    if (!n[1]) splits.set(t, names.splits.get(t)!)
    named.push([
      n[0],
      n[1],
      n[2].map((x) =>
        x.length === 4
          ? ([x[0], personOf(x[1]), x[2], x[3]] as [string, number, number, number])
          : ([x[0], personOf(x[1])] as [number, number]),
      ),
    ])
  }
  return named.length ? { named, persons, splits: [...splits.values()] } : null
}
