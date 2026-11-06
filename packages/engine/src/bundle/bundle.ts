// bundle(located, addOn, original): the bundle's objects (interfaces/page/design-a.md §1.1, §1.3, §2.1): `Units` (each distinct
// unit once, what a translator reads, in windows under the Worker's 1 MiB), one self-sufficient `Part` a page that has
// anything to lay, the add-on's bytes, and last the `Head` that names them all (the original's length, digest and 64 KiB
// chunk digests among them). Every object is written by @readarxiv/format's `write`: canonical bytes, named by their digest.
//
// A part holds, as whole flows (§1.3): (a) every flow with a line on its page; (b) for each earlier page on which a member of
// (a) has its first line, every flow with a line there; (c) every flow holding a member of a tie that also holds a member of
// (a) or (b). Its rows are every `text` id of its members and the paper's names. Nothing else.
import {
  BOUNDS,
  chunkDigests,
  type El,
  type Head,
  ORIGINAL_CHUNK,
  type Part,
  type Placed,
  type PrepWhy,
  sha256Hex,
  type Unit,
  write,
} from '@readarxiv/format'
import type { Instrument, PieceClass } from '../instrument.ts'
import type { Located, Member } from '../locate/locate.ts'
import type { AddOn } from '../wrap/wrap.ts'

export type BundleObject =
  | { kind: 'units'; bytes: Uint8Array; digest: string; count: number }
  | {
      kind: 'part'
      bytes: Uint8Array
      digest: string
      page: number
      flows: { a: number; b: number; c: number }
      members: number
    }
  | { kind: 'addon'; bytes: Uint8Array; digest: string }
  | { kind: 'head'; bytes: Uint8Array; digest: string; head: Head }

export interface BundleInput {
  ins: Instrument
  located: Located
  /** the add-on, or why the wrap was refused (then every page is A's) */
  addOn: AddOn | { refused: string; why: string }
  original: Uint8Array
  paper: { id: string; version: number; pages: number }
  made: string
}

/** each member's state in the bundle: why it stays the original's (PrepWhy), and the groups the add-on could not part */
export interface MemberState {
  why?: PrepWhy
  /** its text group is in the add-on on every page it has a line on: a reader can hide it */
  drawn: boolean
  fixed: number
}

export function stateOf(mem: Member, addOn: BundleInput['addOn']): MemberState {
  if (!mem.located) return { why: 'unlocated', drawn: false, fixed: 0 }
  if (mem.fixed) return { drawn: false, fixed: 0 }
  if ('refused' in addOn) return { why: 'page', drawn: false, fixed: 0 }
  // (an image of its own the wrap could not group: hiding its text would leave that image standing under a translation)
  for (const g of addOn.lost ?? []) if (g.startsWith(`${mem.ord}.`)) return { why: 'unwrapped', drawn: false, fixed: 0 }
  let fixed = 0
  for (const p of mem.pages) {
    const pg = addOn.pages.get(p)
    if (!pg?.ok) return { why: 'page', drawn: false, fixed: 0 }
    if (!addOn.groups.has(`${mem.ord}.${p}.t`)) return { why: 'unwrapped', drawn: false, fixed: 0 }
    if (pg.merged) {
      if (mem.elements.some(([, el]) => el.ink.some((k) => k[0] === p) && !el.keep)) fixed |= 2
      if (mem.labelAt?.ink[0] === p) fixed |= 4
    }
  }
  return { drawn: mem.pages.length > 0, fixed }
}

/** an element with what its source says of it (the instrument's PieceClass): its class as its kind, and the rest where set */
export function classed(el: El, c: PieceClass | undefined): El {
  if (!c) return el
  const out: El = { ...el, kind: c.cls }
  if (c.unknown) out.unknown = 1
  if (c.copy) out.copy = c.copy
  if (c.sym) out.sym = c.sym[1] ? [c.sym[0], 1] : [c.sym[0]]
  if (c.mark) out.mark = 1
  if (c.literal) out.literal = 1
  return out
}

/** a member as its parts hold it */
function placedOf(mem: Member, ins: Instrument, st: MemberState): Placed {
  const unit = mem.unit >= 0 ? ins.units[mem.unit] : undefined
  const echo = unit?.echo !== undefined ? ins.units[unit.echo]?.id : undefined
  const p: Placed = {
    ord: mem.ord,
    kind: mem.kind === 'name' && mem.name !== undefined ? 'name' : mem.figure ? 'figure' : mem.kind,
    text: mem.name !== undefined ? { name: mem.name } : (echo ?? mem.id),
    lead: mem.lead,
    style: mem.style,
    align: mem.align,
    lines: mem.lines,
    room: mem.room,
  }
  if (st.why) p.why = st.why
  if (mem.join) p.join = mem.join
  if (mem.elements.length) {
    // (each element's class, copy text, a symbol's drawing and a footnote's mark as the instrument reads its source: the part
    // states them so that no rule of the typesetter reads a source)
    const cls = new Map(unit?.classes ?? [])
    p.els = mem.elements.map(([id, el]) => [id, classed(el, cls.get(id))])
  }
  if (mem.labelAt) p.label = mem.labelAt
  if (st.fixed) p.fixed = st.fixed
  if (mem.dir) p.dir = mem.dir
  if (mem.tail?.length) p.tail = mem.tail
  if (mem.read.length) p.read = [...new Set(mem.read)]
  return p
}

/** Units windows: each distinct unit once, at its first occurrence, cut under the Units bound */
function unitWindows(units: Unit[]): Unit[][] {
  const out: Unit[][] = []
  let cur: Unit[] = []
  let bytes = 32
  const cap = BOUNDS.units.bytes - 4096
  for (const u of units) {
    const n = JSON.stringify(u).length * 3
    if (cur.length && bytes + n > cap) {
      out.push(cur)
      cur = []
      bytes = 32
    }
    cur.push(u)
    bytes += n
  }
  if (cur.length) out.push(cur)
  return out
}

export function* bundle(input: BundleInput): Generator<BundleObject> {
  const { ins, located, addOn, original, paper } = input
  const members = located.members
  const states = members.map((m) => stateOf(m, addOn))
  // ---- Units: every unit of the instrument but a babel name's word, and the units born on A
  const seen = new Set<string>()
  const units: Unit[] = []
  const add = (u: Unit) => {
    if (seen.has(u.id)) return
    seen.add(u.id)
    units.push(u)
  }
  for (const u of ins.units) {
    if (u.name !== undefined) continue
    add({
      id: u.id,
      kind: u.kind,
      content: u.content,
      ...(u.depth !== undefined ? { depth: u.depth } : {}),
      ...(u.kept ? { kept: true as const } : {}),
    })
  }
  for (const [ord, b] of located.born) add({ id: members[ord]!.id, kind: b.kind, content: b.content })
  const unitDigests: string[] = []
  for (const w of unitWindows(units)) {
    const { bytes, digest } = write('units', { format: 1, units: w })
    unitDigests.push(digest)
    yield { kind: 'units', bytes, digest, count: w.length }
  }

  // ---- parts
  const placed = members.map((m, i) => placedOf(m, ins, states[i]!))
  const flowOf = new Map<number, number>()
  located.flows.forEach((f, i) => {
    for (const o of f) flowOf.set(o, i)
  })
  const flowPages = located.flows.map((f) => new Set(f.flatMap((o) => members[o]!.lines.map((l) => l[0]))))
  const tiesOf = new Map<number, number[]>()
  located.ties.forEach((t, i) => {
    const ords = t.rule === 'cells' ? t.cells.flat() : t.ords
    for (const o of ords) (tiesOf.get(o) ?? tiesOf.set(o, []).get(o)!).push(i)
  })
  const tieOrds = located.ties.map((t) => (t.rule === 'cells' ? t.cells.flat() : t.ords))
  const faces = facesOf(members)
  const names: [string, string][] = ins.units
    .filter((u) => u.kind === 'name' && u.name === undefined)
    .map((u) => [textOf(u.content), u.id])
  const partDigests: (string | null)[] = []
  for (let p = 1; p <= paper.pages; p++) {
    const a = new Set<number>()
    located.flows.forEach((_, i) => {
      if (flowPages[i]!.has(p)) a.add(i)
    })
    // a page none of whose members a reader could lay is A's: no part
    const lays = [...a].some((i) => located.flows[i]!.some((o) => states[o]!.drawn && members[o]!.pages.includes(p)))
    if (!lays) {
      partDigests.push(null)
      continue
    }
    const b = new Set<number>()
    for (const i of a)
      for (const o of located.flows[i]!) {
        const first = members[o]!.lines[0]?.[0]
        if (first !== undefined && first < p)
          located.flows.forEach((_, j) => {
            if (!a.has(j) && flowPages[j]!.has(first)) b.add(j)
          })
      }
    const c = new Set<number>()
    for (const i of [...a, ...b])
      for (const o of located.flows[i]!)
        for (const t of tiesOf.get(o) ?? [])
          for (const q of tieOrds[t]!) {
            const j = flowOf.get(q)
            if (j !== undefined && !a.has(j) && !b.has(j)) c.add(j)
          }
    const take = [...a, ...b, ...c].sort((x, y) => x - y)
    const held = new Set(take.flatMap((i) => located.flows[i]!))
    const ties = located.ties.filter((_, t) => tieOrds[t]!.some((o) => held.has(o)))
    const part: Part = {
      format: 1,
      page: p,
      paper: {
        faces,
        ...(ins.tex.lineskip ? { lineskip: ins.tex.lineskip } : {}),
        ...(names.length ? { names } : {}),
      },
      flows: take.map((i) => located.flows[i]!.map((o) => placed[o]!)),
      ...(ties.length ? { ties } : {}),
      ...(located.links.get(p)?.length ? { links: located.links.get(p) } : {}),
    }
    const { bytes, digest } = write('part', part)
    partDigests.push(digest)
    yield { kind: 'part', bytes, digest, page: p, flows: { a: a.size, b: b.size, c: c.size }, members: held.size }
  }

  // ---- the add-on, and the head
  let addOnRef: Head['addOn'] = null
  const refused: [number, PrepWhy][] = []
  if (!('refused' in addOn)) {
    const digest = sha256Hex(addOn.bytes)
    addOnRef = { digest, bytes: addOn.bytes.length }
    yield { kind: 'addon', bytes: addOn.bytes, digest }
    for (const [pg, x] of addOn.pages) if (!x.ok) refused.push([pg, 'page'])
  }
  const outline: [number, number, string][] = []
  for (const mem of members)
    if (mem.kind === 'heading' && mem.located && mem.lines[0]) outline.push([mem.ord, mem.lines[0][0], mem.id])
  const head: Head = {
    format: 1,
    paper,
    made: input.made,
    original: {
      bytes: original.length,
      sha256: sha256Hex(original),
      chunk: ORIGINAL_CHUNK,
      chunks: chunkDigests(original),
    },
    addOn: addOnRef,
    units: unitDigests,
    parts: partDigests,
    ...(refused.length ? { refused: refused.sort((x, y) => x[0] - y[0]) } : {}),
    ...(outline.length ? { outline } : {}),
  }
  const { bytes, digest } = write('head', head)
  yield { kind: 'head', bytes, digest, head }
}

/** the paper's fonts as A names them, by the glyphs of located members set in each, most first (at most 24) */
function facesOf(members: Member[]): { fonts: [string, number][] } {
  const n = new Map<string, number>()
  for (const m of members) {
    if (!m.located || !m.style.design) continue
    n.set(m.style.design, (n.get(m.style.design) ?? 0) + m.text.length)
  }
  return { fonts: [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 24) }
}

const textOf = (content: readonly { t: string; s?: string }[]): string =>
  content.map((p) => (p.t === 'text' ? (p.s ?? '') : '')).join('')
