// The ownership of A's glyphs: which member owns each glyph of arXiv's page, and the lists each member states its ink in
// (Member's `text`, `label`, `els`; its boxes and turned glyphs, which are listed and never owned). One value, the only writer
// of both: a claiming phase takes ink for a member here, and the table and the member's lists are written together; a reading
// phase asks who owns a glyph. Made of three arrays (A's size, A's partners on B, B's units), it knows no record of locate's.
// After the last claim it is frozen: a write then throws. The check states what the lists and the wrap's groups say against
// the table (Located.disagreements).
import type { Disagreement, Located, Member } from './work.ts'

/** the table's owner of a glyph no member owns: free (a trail, an end mark or a unit born on A may take it), or held as A's ink
 *  inside a unit that stays the original's. work.ts `open` fills the record's table with the same FREE until the table leaves
 *  the record */
const FREE = -1
const HELD = -2

/** a member's seven lists (work.ts Member): A's glyphs by role, its boxes, its turned glyphs */
export type Ink = Pick<Member, 'text' | 'label' | 'els' | 'textBoxes' | 'elBoxes' | 'elBoxesB' | 'turned'>

/** what a reading phase is handed, and what `freeze` returns */
export interface Owned {
  /** the member that owns glyph `a` of A, by its ord; -1 where none does (the glyph is free, or held) */
  member(a: number): number
  /** no member owns it and no unit holds it: what a trail, an end mark or a unit born on A may take */
  free(a: number): boolean
  /** some source unit has it (ink.ts `owned`): a member owns it, a unit that stays the original's holds it, or its partner on
   *  B is a unit's and that unit was not released */
  taken(a: number): boolean
  /** the source unit it is (ink.ts `ownerOf`): its member's unit, else its partner's unit on B; -1 none */
  unit(a: number): number
  /** the check: what the members' lists and the wrap's groups state against the table */
  check(members: readonly Member[], groups: Located['groups']): Disagreement[]
}

/** what a claiming phase is handed */
export interface Claims extends Owned {
  /** the member takes this ink: every glyph of `text`, `label` and `els` is its own, and each list given is appended to the
   *  member's, in the order given (an element new to the member after its others) */
  take(mem: Member, ink: Partial<Ink>): void
  /** glyph `a` stays A's ink inside a unit that stays the original's: no member's, and not free */
  hold(a: number): void
  /** unit `u` is not placed and gives up its glyphs' partners on A (members.ts: set in a paragraph that sets a unit again) */
  release(u: number): void
  /** ink the member already has changes role: its text glyphs `text` and its elements `nested` become its one element `id`
   *  (artefacts.ts), its elements' boxes with them. Returns that element's glyphs, ascending. No owner changes */
  asElement(mem: Member, id: string, text: readonly number[], nested: readonly string[]): readonly number[]
  /** TODAY'S, carried so that no byte moves, and goes with its fix: as `take`, but the glyphs the member owns are `claimed`,
   *  which the maker states apart from the lists (ink.ts: a figure text made of a printed line lists its elements' glyphs in
   *  `els` and claims none of them, its `ph` empty). Every glyph on one side alone is counted by `check`, carried */
  takeAsStated(mem: Member, ink: Partial<Ink>, claimed: readonly number[]): void
}

/** what `locate` holds */
export interface Ownership extends Claims {
  /** no write after this: `take`, `takeAsStated`, `hold`, `release` and `asElement` throw. Returns the read-only face */
  freeze(): Owned
}

/**
 * The ownership of A's `size` glyphs, every one free. `aToB` and `unitB` (A's partners on B, B's units) are read by `taken` and
 * `unit`. `table`: the table to write, the record's while the phases still read it there (work.ts `claimedA`)
 */
export function ownershipOf(
  of: { size: number; aToB: ArrayLike<number>; unitB: ArrayLike<number> },
  table: Int32Array = new Int32Array(of.size).fill(FREE),
): Ownership {
  const { size, aToB, unitB } = of
  /** each member's unit by its ord, from its first claim */
  const unitOf: number[] = []
  /** the units released (`release`) */
  const released = new Set<number>()
  /** the glyphs a `takeAsStated` left on one side alone (listed and not claimed, or claimed and not listed) */
  const carried = new Set<number>()
  let frozen = false
  const open = () => {
    if (frozen) throw new Error('locate: ownership written after its freeze')
  }

  const member = (a: number): number => {
    const c = table[a] as number
    return c >= 0 ? c : -1
  }
  const free = (a: number): boolean => table[a] === FREE
  const taken = (a: number): boolean => {
    const c = table[a] as number
    const b = aToB[a] as number
    return c >= 0 || c === HELD || (b >= 0 && (unitB[b] as number) >= 0 && !released.has(unitB[b] as number))
  }
  const unit = (a: number): number => {
    const c = table[a] as number
    // (every ord in the table was written by `take` or `takeAsStated`, which record its member's unit)
    if (c >= 0) return unitOf[c] as number
    const b = aToB[a] as number
    return b >= 0 ? (unitB[b] as number) : -1
  }

  /** appends `from` to the list of `id` in `to`, made where it has none (a new key goes after the others) */
  const append = <T>(to: Map<string, T[]>, id: string, from: readonly T[], each?: (x: T) => void) => {
    let l = to.get(id)
    if (!l) {
      l = []
      to.set(id, l)
    }
    for (const x of from) {
      each?.(x)
      l.push(x)
    }
  }
  /** the lists appended; the glyphs of `text`, `label` and `els` written to the table as the member's where `own` */
  const write = (mem: Member, ink: Partial<Ink>, own: boolean) => {
    open()
    unitOf[mem.ord] = mem.unit
    const claim = own
      ? (a: number) => {
          table[a] = mem.ord
        }
      : undefined
    for (const a of ink.text ?? []) {
      claim?.(a)
      mem.text.push(a)
    }
    for (const a of ink.label ?? []) {
      claim?.(a)
      mem.label.push(a)
    }
    for (const [id, l] of ink.els ?? []) append(mem.els, id, l, claim)
    for (const x of ink.textBoxes ?? []) mem.textBoxes.push(x)
    for (const [id, l] of ink.elBoxes ?? []) append(mem.elBoxes, id, l)
    for (const [id, l] of ink.elBoxesB ?? []) append(mem.elBoxesB, id, l)
    for (const x of ink.turned ?? []) mem.turned.push(x)
  }
  const take = (mem: Member, ink: Partial<Ink>): void => write(mem, ink, true)
  const takeAsStated = (mem: Member, ink: Partial<Ink>, claimed: readonly number[]): void => {
    write(mem, ink, false)
    for (const a of claimed) table[a] = mem.ord
    const listed = new Set<number>([...(ink.text ?? []), ...(ink.label ?? [])])
    for (const l of ink.els?.values() ?? []) for (const a of l) listed.add(a)
    const stated = new Set(claimed)
    for (const a of listed) if (!stated.has(a)) carried.add(a)
    for (const a of stated) if (!listed.has(a)) carried.add(a)
  }
  const hold = (a: number): void => {
    open()
    table[a] = HELD
  }
  const release = (u: number): void => {
    open()
    released.add(u)
  }
  const asElement = (
    mem: Member,
    id: string,
    text: readonly number[],
    nested: readonly string[],
  ): readonly number[] => {
    open()
    const own = [...text, ...nested.flatMap((n) => mem.els.get(n) ?? [])].sort((a, b) => a - b)
    const boxes = nested.flatMap((n) => mem.elBoxes.get(n) ?? [])
    const boxesB = nested.flatMap((n) => mem.elBoxesB.get(n) ?? [])
    for (const n of nested) {
      mem.els.delete(n)
      mem.elBoxes.delete(n)
      mem.elBoxesB.delete(n)
    }
    const gone = new Set(text)
    mem.text = mem.text.filter((a) => !gone.has(a))
    mem.els.set(id, own)
    if (boxes.length) {
      mem.elBoxes.set(id, boxes)
      mem.elBoxesB.set(id, boxesB)
    }
    return own
  }

  // ---- the check (Located.disagreements): every glyph a member owns is in exactly one of that member's `text`, `label` and
  // `els` lists, once; every glyph a member lists has that member as owner; no glyph a fixed member owns or lists has a group.
  // Two linear passes: the members' lists into one scratch array (the member a glyph is listed by: its owner where the owner
  // lists it, else the first to list it), then the table against it. A glyph's page and index are read off the groups' pages
  const check = (members: readonly Member[], groups: Located['groups']): Disagreement[] => {
    const out: Disagreement[] = []
    const off: number[] = [0]
    for (const g of groups) off.push((off.at(-1) as number) + g.glyphs.length)
    const at = (a: number): [page: number, glyph: number] => {
      let lo = 0
      let hi = groups.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if ((off[mid] as number) <= a) lo = mid
        else hi = mid - 1
      }
      return [lo + 1, a - (off[lo] as number)]
    }
    const grouped = (a: number) => {
      const [p, j] = at(a)
      return (groups[p - 1]?.glyphs[j] ?? null) !== null
    }
    const note = (kind: Disagreement['kind'], a: number, mem: number, role: string) => {
      const [page, glyph] = at(a)
      out.push({
        kind,
        page,
        glyph,
        member: mem,
        role,
        owner: table[a] as number,
        ...(carried.has(a) ? { carried: true } : {}),
      })
    }
    const by = new Int32Array(size).fill(-1)
    for (const mem of members) {
      const list = (role: string, l: readonly number[]) => {
        for (const a of l) {
          const c = table[a] as number
          if ((by[a] as number) >= 0) note('listed twice', a, mem.ord, role)
          if (c !== mem.ord) note('listed, not owned', a, mem.ord, role)
          if ((by[a] as number) < 0 || c === mem.ord) by[a] = mem.ord
          if (mem.fixed && grouped(a)) note('fixed, in a group', a, mem.ord, role)
        }
      }
      list('text', mem.text)
      list('label', mem.label)
      for (const [id, l] of mem.els) list(id, l)
    }
    for (let a = 0; a < size; a++) {
      const c = table[a] as number
      if (c < 0 || by[a] === c) continue
      note('owned, not listed', a, c, '')
      if (members[c]?.fixed && grouped(a)) note('fixed, in a group', a, c, '')
    }
    return out
  }

  const owned: Owned = { member, free, taken, unit, check }
  return {
    ...owned,
    take,
    takeAsStated,
    hold,
    release,
    asElement,
    freeze: () => {
      frozen = true
      return owned
    },
  }
}
