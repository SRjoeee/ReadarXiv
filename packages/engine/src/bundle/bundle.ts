// bundle(located, addOn, original): the bundle's objects (ARCHITECTURE.md §2): `Units` (each distinct
// unit once, what a translator reads, in windows under the Worker's 1 MiB), one self-sufficient `Part` a page that has
// anything to lay, the add-on's bytes, and last the `Head` that names them all (the original's length, digest and 64 KiB
// chunk digests among them). Every object is written by @readarxiv/format's `write`: canonical bytes, named by their digest.
//
// A part holds, as whole flows (§1.3): (a) every flow with a line on its page; (b) for each earlier page on which a member of
// (a) has its first line, every flow with a line there; (c) every flow holding a member of a tie that also holds a member of
// (a) or (b). Its rows are every `text` id of its members and the paper's names, and where a member's unit names a person of the
// author block elsewhere (names.ts, docs/PDF-READER.md §19.15) its variant's and the block's units' that translate the names.
// Nothing else.
import {
  BOUNDS,
  chunkDigests,
  type El,
  type Head,
  headNumberOf,
  ORIGINAL_CHUNK,
  type Part,
  type Piece,
  type Placed,
  type PrepWhy,
  sha256Hex,
  type Style,
  Target,
  type Unit,
  write,
} from '@readarxiv/format'
import type { Instrument, InstrumentUnit } from '../instrument.ts'
import { RUNNING } from '../instrument/language.ts'
import type { Located, Member } from '../locate/locate.ts'
import type { Landing } from '../locate/targets.ts'
import { classed } from '../locate/work.ts'
import { bySentence } from '../locate/words.ts'
import { namesOf, partNames } from './names.ts'
import { runInsOf } from './run-in.ts'
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

interface BundleInput {
  ins: Instrument
  located: Located
  /** the add-on, or why the wrap was refused (then every page is A's) */
  addOn: AddOn | { refused: string; why: string }
  original: Uint8Array
  paper: { id: string; version: number; pages: number }
  made: string
  /** what PDF.js recovered from while B and A were read (read.ts readPdf), stated in the head where any */
  recovered?: Head['recovered']
}

/** the kinds of unit the reader reads beyond its lay, which leave the units a translator is asked for never: a heading, which
 *  its contents list with its row as its title and the original's outline's page where no part places it (packages/reader
 *  session/contents.ts listedOf: one TeX set whose marks a class took off owns no glyph and is listed so), an abstract, the
 *  context every batch is given (session/rows.ts contextOf), and a paper's own name, which no page waits on and every theorem
 *  head of its name reads (packages/typeset lay/entry.ts, PDF-READER §19.14) */
const READ_BEYOND_LAY: ReadonlySet<string> = new Set(['heading', 'abstract', 'name'])
/** each member's state in the bundle: why it stays the original's (PrepWhy), and the groups the add-on could not part */
export interface MemberState {
  why?: PrepWhy
  /** its text group is in the add-on on every page it has a line on: a reader can hide it */
  drawn: boolean
  fixed: number
}

export function stateOf(mem: Member, addOn: BundleInput['addOn']): MemberState {
  if (!mem.located) return { why: 'unlocated', drawn: false, fixed: 0 }
  // (its ink stays whatever the translation: no group of it. A text so left that is no kept unit (a figure text the figure
  // reading keeps, ink.ts; a cell held for its decorated word, §18.61) holds text a translation could be laid over, over ink
  // that stays: unwrapped, the original's, and no evidence for its table's group decision. A kept block holds
  // none)
  if (mem.fixed) return mem.kept ? { drawn: false, fixed: 0 } : { why: 'unwrapped', drawn: false, fixed: 0 }
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

/** an element's placements in a part: the El each states, its member's text size and locate's baseline reading (Member.onBase) */
type Placement = { el: El; size: number; onBase: boolean }
/** the text TeX set for an element where it stands, on its line's baseline at its text's size, where every placement of its unit
 *  in a part states it: the El's text, the same at each, no footnote's mark (drawn raised whatever it is set as), its glyphs on
 *  their line's baseline (locate's reading, Member.onBase, made for every class: an El of class `other` states its text with no
 *  baseline read), at its member's text size, the two sizes read on the format's grid (a hundredth: El.style.size is written on
 *  it, a member's Style.size as read off its glyphs, 2111.09276v1's cells 8.189157574 against 8.19); none where it stands in no
 *  part */
function textAt(ps: readonly Placement[] | undefined): string | undefined {
  const t = ps?.[0]?.el.text
  if (typeof t !== 'string' || !t) return undefined
  return ps!.every(
    (x) =>
      x.el.text === t &&
      !x.el.mark &&
      x.onBase &&
      x.el.style !== undefined &&
      onGrid(x.el.style.size) === onGrid(x.size),
  )
    ? t
    : undefined
}
/** a size on the format's grid, a hundredth of a PDF unit (schema.ts: the prepare writes its numbers on a 1/100 grid) */
const onGrid = (v: number): number => Math.round(v * 100) / 100
/** the kind of a command's element, the source reader's (marks.ts classOf `macro`: a paper's command or one no table names, a
 *  kept command that sets a word's letters, `\hl{guitar}`): the one kind whose text the bundle states. A formula's, a number's
 *  or a reference's glyphs glued to letters ("$n$th") are another question, which no reader reads: a fact no reader reads is
 *  not stated */
const COMMAND_KIND = 'macro'
/** a unit's content as the bundle states it: each command's element with the text TeX set for it where it stands (format's el
 *  `text`, textAt), by `uid` and its piece id. The instrument's content stays as it is: a copy where anything is stated */
function statedOf(
  uid: string,
  content: readonly Piece[],
  placements: ReadonlyMap<string, readonly Placement[]>,
): Piece[] {
  let any = false
  const walk = (ps: readonly Piece[]): Piece[] =>
    ps.map((p) => {
      if (p.t === 'span') return { ...p, content: walk(p.content) }
      if (p.t !== 'el' || p.kind !== COMMAND_KIND) return p
      const text = textAt(placements.get(`${uid}|${p.id}`))
      if (text === undefined) return p
      any = true
      return { ...p, text }
    })
  const out = walk(content)
  return any ? out : (content as Piece[])
}

/** a unit's text as its source writes it: its text pieces, a group's opened, an element or a nested unit a space */
const textOfPieces = (ps: readonly Piece[]): string =>
  ps.map((q) => (q.t === 'text' ? q.s : q.t === 'span' ? textOfPieces(q.content) : ' ')).join('')

/** a member as its parts hold it; `runin` its unit's groups stated as titles set in the line (run-in.ts runInsOf) */
function placedOf(
  mem: Member,
  units: readonly InstrumentUnit[],
  st: MemberState,
  runin: ReadonlySet<string> | undefined,
): Placed {
  const unit = mem.unit >= 0 ? units[mem.unit] : undefined
  const echo = unit?.echo !== undefined ? units[unit.echo]?.id : undefined
  const p: Placed = {
    ord: mem.ord,
    kind: mem.kind === 'name' && mem.name !== undefined ? 'name' : mem.figure ? 'figure' : mem.kind,
    text:
      mem.name !== undefined ? { name: mem.name, ...(mem.counter ? { counter: mem.counter } : {}) } : (echo ?? mem.id),
    lead: mem.lead,
    style: mem.style,
    ...(mem.markFace ? { markFace: mem.markFace } : {}),
    align: mem.align,
    lines: mem.lines,
    room: mem.room,
  }
  if (st.why) p.why = st.why
  if (mem.inner) p.inner = mem.inner
  if (mem.join) p.join = mem.join
  if (mem.leads !== undefined) p.bound = 1
  // (the paper's title and its front matter: no section heading's rules for them, X.lastLines)
  if (unit?.title) p.title = 1
  if (unit?.front) p.front = 1
  // (the block its source ties its row's unit to, which its reading option follows with its kind: format's toggleKind)
  const of = (unit?.echo !== undefined ? units[unit.echo] : unit)?.of
  if (of) p.of = of
  if (mem.elements.length) {
    // (each element's class, copy text, a symbol's drawing and a footnote's mark as the instrument reads its source: the part
    // states them so that no rule of the typesetter reads a source)
    const cls = new Map(unit?.classes ?? [])
    p.els = mem.elements.map(([id, el]) => [id, classed(el, cls.get(id), !!mem.asInk?.has(id))])
  }
  // (each group's command and fill, as the instrument reads its source; the paragraph TeX opened at it, as locate read it)
  // (and a figure text's runs in another face, each group's style read off its glyphs on A)
  // (and a group's fill where its source and TeX's log state none: the fill its text's glyphs hold on A, where it is not the
  // fill around it, locate's fills.ts: a link's that hyperref colours; a colour piece's the log's)
  // (and the face of a group whose command names none where the instrument states none: the face its own text's glyphs hold
  // on A, where it is not the face around it; a group the instrument faced on B keeps that)
  // (and a title its unit's source sets in the line with no mark after it, the same on every member of the unit: run-in.ts)
  if (
    unit?.spans?.length ||
    mem.spanOpens?.size ||
    mem.spanStyles?.length ||
    mem.spanFills?.length ||
    mem.spanFaces?.length ||
    runin?.size
  ) {
    const spans = new Map(
      (unit?.spans ?? []).map(([id, x]): [string, NonNullable<Placed['spans']>[number][1]] => [id, { ...x }]),
    )
    for (const [id, j] of mem.spanOpens ?? []) spans.set(id, { ...spans.get(id), opens: j })
    // (a group whose glyphs stand at several sizes states none: its style at the member's size, drawn as the member)
    const several = new Set(mem.spanSeveral ?? [])
    const sized = (id: string, style: Style): Style => (several.has(id) ? { ...style, size: mem.style.size } : style)
    for (const [id, style] of mem.spanStyles ?? []) spans.set(id, { ...spans.get(id), style: sized(id, style) })
    for (const [id, colour] of mem.spanFills ?? [])
      if (spans.get(id)?.colour === undefined) spans.set(id, { ...spans.get(id), colour })
    for (const [id, style] of mem.spanFaces ?? [])
      if (spans.get(id)?.style === undefined) spans.set(id, { ...spans.get(id), style: sized(id, style) })
    for (const id of runin ?? []) spans.set(id, { ...spans.get(id), runin: 1 })
    p.spans = [...spans]
  }
  // (a caption's label: its float's type, by which its name is drawn in the target's word)
  if (mem.labelAt)
    p.label =
      mem.labelAt.kind === 'float' && unit?.float && /^[a-z][a-z0-9]{0,31}$/.test(unit.float)
        ? { ...mem.labelAt, float: unit.float }
        : mem.labelAt
  if (st.fixed) p.fixed = st.fixed
  if (mem.dir) p.dir = mem.dir
  if (mem.run) p.run = mem.run
  if (mem.plain !== undefined) p.plain = mem.plain
  // (a table cell: its place in TeX's grid and its own text as its source writes it, which a table's groups are decided by:
  // the header, each column, the cells spanning the same columns; a column of names, its cells come back as they went)
  if (unit?.cell) {
    const c = unit.cell
    p.cell = [c.row, c.col, c.span ?? 1, c.head ? 1 : 0]
    if (mem.plain === undefined) p.plain = textOfPieces(unit.content)
    // (where TeX stands its lines in its row, a cell of an m or a b column: Placed.stand, §18.92)
    if (c.stand) p.stand = c.stand
  }
  if (mem.tail?.length) p.tail = mem.tail
  if (mem.read.length) p.read = [...new Set(mem.read)]
  if (mem.words) p.words = mem.words
  // (the paragraphs TeX opened inside its text, each by its first word: locate's facts pass, PDF-READER §18.69)
  if (mem.paras?.length) p.paras = mem.paras
  // (beside them, the element each point stands directly after in the source, where one does: Placed.parasAfter)
  if (mem.paras?.length && mem.parasAfter) p.parasAfter = mem.parasAfter
  return p
}

/** whether a member has ink on page `p`: a line, an element's or its label's */
const inkOn = (x: Placed, p: number) =>
  x.lines.some((l) => l[0] === p) || !!x.els?.some(([, e]) => e.ink.some((k) => k[0] === p)) || x.label?.ink[0] === p

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

/**
 * The head's outline: each located heading member as [ord, its first line's page, its unit], and each one's printed number
 * where its label states one (format's headNumberOf: a label of kind `head`, its number or a counter alone): what the reader's
 * contents read at open (packages/reader session/contents.ts), the parts of its far pages unread
 */
export function outlineOf(members: readonly Member[]): {
  outline: [number, number, string][]
  numbers: [number, string][]
} {
  const outline: [number, number, string][] = []
  const numbers: [number, string][] = []
  for (const mem of members) {
    if (mem.kind !== 'heading' || !mem.located || !mem.lines[0]) continue
    outline.push([mem.ord, mem.lines[0][0], mem.id])
    const n = headNumberOf(mem.labelAt)
    if (n) numbers.push([mem.ord, n.slice(0, 32)])
  }
  return { outline, numbers }
}

export function* bundle(input: BundleInput): Generator<BundleObject> {
  const { ins, located, addOn, original, paper } = input
  const members = located.members
  const states = members.map((m) => stateOf(m, addOn))
  // (each unit's titles set in the line, read once over its source, the paragraphs TeX opened at its groups wherever a member
  // of it states one (SpanAt.opens) and the elements it states glue of (PieceClass.glue): a unit of the paper's running text
  // (language.ts RUNNING: a paragraph, the abstract, a theorem's body, a caption, a footnote) a translator cuts into sentences
  // (Unit.sentences), not an entry's; never an author block, whose names one after another set off by the paper's \quad are no
  // title and its sentence (2503.06072v3, 2608.11605v1))
  const sourceUnits = located.units ?? ins.units
  const opened = new Map<number, Set<string>>()
  for (const m of members)
    for (const [id] of m.spanOpens ?? []) (opened.get(m.unit) ?? opened.set(m.unit, new Set()).get(m.unit)!).add(id)
  const runins = new Map<number, Set<string>>()
  for (const m of members) {
    const u = sourceUnits[m.unit]
    if (!u || runins.has(m.unit) || u.kept || u.entry || !RUNNING.has(u.kind) || !bySentence(u.kind, !!u.figure))
      continue
    const glued = new Set((u.classes ?? []).flatMap(([id, c]) => (c.glue ? [id] : [])))
    runins.set(m.unit, runInsOf(u.content, opened.get(m.unit) ?? new Set(), glued))
  }
  const placed = members.map((m, i) => placedOf(m, sourceUnits, states[i]!, runins.get(m.unit)))
  // ---- each page's part, as the flows it holds (a, b, c below), or none: what the units' statements read of the parts
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
  const takes: { a: Set<number>; b: Set<number>; c: Set<number>; take: number[] }[] = []
  for (let p = 1; p <= paper.pages; p++) {
    const a = new Set<number>()
    located.flows.forEach((_, i) => {
      if (flowPages[i]!.has(p)) a.add(i)
    })
    // a page none of whose members a reader could lay is A's: no part
    const lays = [...a].some((i) => located.flows[i]!.some((o) => states[o]!.drawn && members[o]!.pages.includes(p)))
    if (!lays) {
      takes.push({ a, b: new Set(), c: new Set(), take: [] })
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
    takes.push({ a, b, c, take: [...a, ...b, ...c].sort((x, y) => x - y) })
  }
  // (each element's placements in a part, by its row's unit id and its piece id: the El the part states and its member)
  const inPart = new Set(takes.flatMap((x) => x.take.flatMap((i) => located.flows[i]!)))
  const placements = new Map<string, { el: El; size: number; onBase: boolean }[]>()
  for (const o of inPart) {
    const x = placed[o]!
    if (typeof x.text !== 'string') continue
    for (const [id, el] of x.els ?? []) {
      const k = `${x.text}|${id}`
      ;(placements.get(k) ?? placements.set(k, []).get(k)!).push({
        el,
        size: x.style.size,
        onBase: !!members[o]!.onBase?.has(id),
      })
    }
  }
  // ---- Units: every unit of the instrument's but a babel name's word and a unit TeX never set (below), those locate made on A
  // (its ink units, kept blocks and figure texts), and the units born on A
  const all = located.units ?? ins.units
  // (a unit every member of which the locate left unlocated because TeX set no point of it and it owns no glyph of B
  // (`unlocated: marks`, place.ts: the ownership's why 'marks'): a false branch of a conditional, a class's keywords it never
  // prints, a picture's text, whose glyphs the figure reading makes its own units of (PDF-READER §18.102), an author's unit a
  // class prints from its own store. Nothing of it is on a page, and what TeX printed of it, where it printed any, is an ink
  // unit's, asked as that: it is not asked. One another unit asked names in its content (a nested unit) is kept, so is one of a
  // kind the reader reads beyond its lay (READ_BEYOND_LAY: a heading, an abstract, a name), and the names
  // of the block are read from every unit as before (names.ts: an author's unit TeX never set still writes its names, which the
  // block TeX printed draws: 2608.14557v1), only what is written left without it)
  const everyMember = new Map<number, boolean>()
  for (const m of members)
    everyMember.set(m.unit, (everyMember.get(m.unit) ?? true) && !m.located && m.cause === 'marks')
  const named = new Set<string>()
  // (at any depth: a nested unit inside a span, a formatted group, is its unit's too)
  const nameIn = (ps: readonly Piece[]): void => {
    for (const q of ps)
      if (q.t === 'unit') named.add(q.unit)
      else if (q.t === 'span') nameIn(q.content)
  }
  // (and one a part's member names as its text, its own unit or the one its ink unit echoes, placedOf: a unit TeX set without its
  // points, read off the page as an ink unit of its letters, drawn with that unit's row; the members a part holds, those with a
  // line, as names.ts reads them below)
  for (const x of placed) if (typeof x.text === 'string' && x.lines.length) named.add(x.text)
  const neverSet = (u: (typeof all)[number], i: number) =>
    everyMember.get(i) === true && !named.has(u.id) && !READ_BEYOND_LAY.has(u.kind)
  // (the nested units of the units asked alone, and theirs in turn: a note nested in a branch TeX never takes goes with it)
  const scanned = new Set<number>()
  for (let grew = true; grew; ) {
    grew = false
    for (const [i, u] of all.entries()) {
      if (scanned.has(i) || neverSet(u, i)) continue
      scanned.add(i)
      const before = named.size
      nameIn(u.content)
      if (named.size > before) grew = true
    }
  }
  /** the ids asked: of a unit some instance of which TeX set (or another names), and every unit born on A */
  const asked = new Set<string>()
  const seen = new Set<string>()
  const units: Unit[] = []
  const add = (u: Unit) => {
    if (seen.has(u.id)) return
    seen.add(u.id)
    units.push(u)
  }
  for (const [i, u] of all.entries()) {
    if (u.name !== undefined) continue
    if (!neverSet(u, i)) asked.add(u.id)
    add({
      id: u.id,
      kind: u.kind,
      content: statedOf(u.id, u.content, placements),
      ...(u.depth !== undefined ? { depth: u.depth } : {}),
      ...(u.of ? { of: u.of } : {}),
      // (running text a translator cuts into sentences, the reader lighting each with its translation: words.ts bySentence)
      ...(!u.kept && bySentence(u.kind, !!u.figure) ? { sentences: true as const } : {}),
      ...(u.kept ? { kept: true as const } : {}),
      ...(u.entry ? { entry: true as const } : {}),
    })
  }
  for (const [ord, b] of located.born) {
    asked.add(members[ord]!.id)
    add({
      id: members[ord]!.id,
      kind: b.kind,
      content: b.content,
      ...(bySentence(b.kind) ? { sentences: true as const } : {}),
    })
  }
  // (the block's names its units hold elsewhere, docs/PDF-READER.md §19.15: each unit's variant right after it, so that a
  // translator is asked for both together)
  const classes = new Map(all.map((u) => [u.id, new Map(u.classes ?? [])]))
  const names = namesOf(
    units,
    (u, p) => classes.get(u)?.get(p),
    // (the members a part holds: one with no line on any page is drawn nowhere)
    placed.flatMap((x) =>
      typeof x.text === 'string' && x.lines.length
        ? [{ ord: x.ord, unit: x.text, kind: x.kind, ...(x.of ? { of: x.of } : {}) }]
        : [],
    ),
  )
  const written = units.flatMap((u) => {
    if (!asked.has(u.id)) return []
    const v = names.variants.get(u.id)
    return v ? [u, v] : [u]
  })
  const unitDigests: string[] = []
  for (const w of unitWindows(written)) {
    const { bytes, digest } = write('units', { format: 1, units: w })
    unitDigests.push(digest)
    yield { kind: 'units', bytes, digest, count: w.length }
  }

  // ---- parts
  const faces = facesOf(members)
  const babel: [string, string][] = ins.units
    .filter((u) => u.kind === 'name' && u.name === undefined)
    .map((u) => [textOf(u.content), u.id])
  const partDigests: (string | null)[] = []
  // (the page's frames of units TeX set turned (locate/turned-frames.ts), those of which a reader could lay a member: a page that holds
  // nothing else to lay has a part for them, its flows none)
  const framesOn = (p: number) =>
    (located.frames ?? []).filter((f) => f.page === p && f.flows.some((fl) => fl.some((o) => states[o]!.drawn)))
  for (let p = 1; p <= paper.pages; p++) {
    const { a, b, c, take } = takes[p - 1]!
    const frames = framesOn(p)
    if (!take.length && !frames.length) {
      partDigests.push(null)
      continue
    }
    const framed = frames.flatMap((f) => f.flows.flat())
    const held = new Set([...take.flatMap((i) => located.flows[i]!), ...framed])
    const ties = located.ties.filter((_, t) => tieOrds[t]!.some((o) => held.has(o)))
    // (the page's annotations, and those of the members with a line on it on their other pages, with their page: a translation
    // draws a member's piece on whichever of its pages its text falls, the link over it there)
    const own = located.links.get(p) ?? []
    const across: NonNullable<Part['links']> = []
    for (const i of a)
      for (const o of located.flows[i]!) {
        if (!members[o]!.pages.includes(p)) continue
        for (const q of members[o]!.pages)
          if (q !== p)
            for (const l of located.links.get(q) ?? []) if (l.owner?.[0] === o) across.push({ ...l, page: q })
      }
    const links = [...own, ...across]
    const named = partNames(
      names,
      [...take.flatMap((i) => located.flows[i]!), ...framed].flatMap((o) =>
        typeof placed[o]!.text === 'string' ? [placed[o]!.text] : [],
      ),
    )
    const part: Part = {
      format: 1,
      page: p,
      paper: {
        faces,
        // (each member's style its letters' base outside its groups, Part.paper.bases)
        bases: 1,
        ...(ins.tex.lineskip ? { lineskip: ins.tex.lineskip } : {}),
        ...(babel.length ? { names: babel } : {}),
        ...(named ?? {}),
      },
      // (a member's words where it has ink on the page, a line, an element's or its label's: one carried for another page's sake,
      // in a flow or a tie it shares, lights there, not here)
      // (but a member that states a paragraph's first word (Placed.paras) keeps them in every part: the page that lays it for
      // another page's sake pairs that word with a sentence start as its own page does, or the two pages' lays differ)
      flows: take.map((i) =>
        located.flows[i]!.map((o) => {
          const x = placed[o]!
          if (!x.words || x.paras || inkOn(x, p)) return x
          const { words: _, ...rest } = x
          return rest
        }),
      ),
      ...(ties.length ? { ties } : {}),
      ...(links.length ? { links } : {}),
      ...(frames.length
        ? {
            frames: frames.map((f) => ({
              dir: f.dir,
              flows: f.flows.map((fl) => fl.map((o) => placed[o]!)),
              ...(f.ties.length ? { ties: f.ties } : {}),
            })),
          }
        : {}),
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
  const { outline, numbers } = outlineOf(members)
  const targets = targetsOf(input.located.targets)
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
    ...(numbers.length ? { numbers } : {}),
    ...(input.recovered?.length ? { recovered: input.recovered } : {}),
    ...(input.ins.made.reduced ? { reduced: true as const } : {}),
    ...(targets.length ? { targets } : {}),
  }
  const { bytes, digest } = write('head', head)
  yield { kind: 'head', bytes, digest, head }
}

/** the head's targets (docs/PDF-READER.md §20): each landing locate made (locate/targets.ts) as format's Target, sorted by its
 *  destination, each destination once; one format's Target refuses (a destination past its bound) left out, its links keeping
 *  their jump, so that no landing can refuse the head */
export function targetsOf(landings: readonly Landing[]): Target[] {
  return [...landings]
    .sort((a, b) => (a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : 0))
    .filter((l, i, all) => i === 0 || all[i - 1]!.dest !== l.dest)
    .map(
      (l): Target =>
        l.next ? [l.dest, l.kind, l.page, l.ord, l.box, l.next[0], l.next[1]] : [l.dest, l.kind, l.page, l.ord, l.box],
    )
    .filter((t) => Target.safeParse(t).success)
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
