// design-a's entry (§1.2): layPage(part, rows, rules, metrics) → Page, pure, called in every state. A part is the page's whole
// problem: every flow its page reads, each member's facts on arXiv's page (Placed), the paper's faces and \lineskip; the rows are
// the translation package's Results by unit id. Composed over what the gate's runner proves member by member: the wait check
// (waitOf: rows not in while more may come, before any work), each member's reading and tokens (read.ts readMember over the row's
// pieces made from the member's stated facts, rowPieces: no Units object), its faces (B.cover: a face not loaded is waited for, a
// character no served face holds leaves it `served`), its setting (adapt.ts: U.blocks, U.decor, U.params, its flow's shared
// rows), every flow laid and each pass page filled (layPagePrepared: L8-L11, a flow that throws its own; a table's cells laid
// whole or not at all, a size tie's members at one size), and the members as drawn (D.display). The reader's leave
// (Rules.leave: the unit kinds it shows untranslated) leaves a member of such a kind the original's (`left`), nothing of it
// off and no row of it waited for. A babel name is set on its own (S.names over the part, nameOf), or, bound by the part to the
// member after it in its flow, as that member's lead (lay/lead.ts). Each member's boxes on both panes (Laid.lit, lay/lit.ts: lit
// whole, no part stating `cuts` yet) and the page's links as drawn (Page.links, lay/links.ts: moved with their pieces, else at
// A's boxes). A figure text is set by S.figures over the part (lay/figures.ts: one laid line of its translation where it
// fits, a turned one's along its run, its items' `dir`), one of a part that states no text of its own (Placed.plain: a part
// made before) read as before. A CJK cell's bands are read over the rules its own Room.band states. A member's groups are turned
// off on a page only where it has them there (groupsOn: the add-on wraps each page's ink apart), as today's hide.mjs hides
// each page's own: a member laid across a page break turns off on the other page none of the groups of this one. A
// theorem-like head is drawn in the target's word (U.label's headLabelInTarget): the rules' (Rules.heads), else the paper's own
// name unit's row (ownNamesOf over Part.paper.names), as today's headOf; a reference cleveref or \autoref generates, and a
// citation's note, with its names in the target's (U.rename: Rules.refs, babel's names, the paper's own), as today's renameRefs.
import { LINE_FLAG, type OutPiece, type Part, type Placed } from '@readarxiv/format'
import { cover } from '../breaker/cover.ts'
import { faceOf, ownSmallCaps } from '../breaker/faces.ts'
import { fitMeasure, fontString } from '../breaker/measure.ts'
import { type NameRow, setNameOf } from '../shared/names.ts'
import { ownNamesOf } from '../unit/rename.ts'
import type { Layout, Tokens } from '../fit/types.ts'
import type { Item, Laid, Metrics, Page, Rows, Rules, Unlaid } from '../types.ts'
import type { TextItem } from '../emit/display.ts'
import { adapt, rectOf, sharedPaper } from './adapt.ts'
import type { FlowMember } from './flow.ts'
import { figuresOf } from './figures.ts'
import { keptBefore, type Lead, ledBy, type NameWord } from './lead.ts'
import { type LinkFate, type LinkOwner, linksOf } from './links.ts'
import { inFrame, inkOfLine, litLaid, litOfA, pageBoxOf, runBoxOfA } from './lit.ts'
import { layPagePrepared } from './page.ts'
import { tokenBand } from '../emit/sentences.ts'
import { CJK } from '../breaker/script.ts'
import { measured, paperOf, readMember, rowPieces, tstyleOf } from './read.ts'
import { waitOf } from './wait.ts'

/** what a caller may ask of a lay besides its Page. A head's names are no option: the target's are the rules' (Rules.heads),
 *  the paper's own its name units' rows (Part.paper.names, ownNamesOf), so that every caller lays one page alike */
export type EntryOptions = {
  /** where given, what became of each of the part's links (lay/links.ts LinkFate, by its index): the gate's count */
  linkFates?: LinkFate[]
}

const LABEL_KEPT = 4

/**
 * The groups member `m` has on page `page`, as the add-on wraps them (format's groupName `axt:<ord>.<page>.<t|e|l>`, one of each
 * a page): its text where a line of it stands, its elements where one's ink is, its label where its box is. A Page turns off
 * nothing else there: a group the document does not hold leaves the whole member the original's (the reader's held()), and a
 * member laid across a page break turned off on one page the groups of the other (triage-1 B: 2608.16117v1-de p4's t11, its
 * p3 element drawn on p4; 2608.25210v2-zh p10's t196, its label on p9). Today's hide.mjs: a placeholder's group hidden where
 * one with segments on the page moved, the label where its box is on the page
 */
function groupsOn(m: Placed, page: number): number {
  return (
    (m.lines.some((l) => l[0] === page) ? 1 : 0) |
    (m.els?.some(([, e]) => e.ink.some((k) => k[0] === page)) ? 2 : 0) |
    (m.label?.ink[0] === page ? LABEL_KEPT : 0)
  )
}

/** each crop a member's layout draws, on any of its pages: the page its ink is cut from, and whether it is an element's (its
 *  piece) or its label's (D.display's crop: `k` its element, none its label) */
function cutsOf(L: Layout | undefined): { page: number; el: boolean }[] {
  const out: { page: number; el: boolean }[] = []
  for (const line of L?.lines ?? [])
    for (const it of line.items) {
      const c = (it.t as { crop?: { page: number; k?: number } }).crop
      if (c) out.push({ page: c.page, el: c.k !== undefined })
    }
  return out
}

/**
 * A CJK cell's rules as U.params' cellBands reads them, [x0, y0, x1, y1] each, on the page of its first line: the rule over its
 * lines and the rule under them, which its own Room.band states (the clear band between them), across its lines. Its own alone:
 * a cell's single line widened into its row (U.decor's widen) spans its neighbours, whose bands' edges stand over and under no
 * line of its (triage-1 S1: 1706.03762v7 p8's t94 capped at 0.897 by its row's other cells, 2602.23285v2 p7's t58 at 0.615).
 * A band edge is no rule of its where no rule stands on that side (Room.bandOpen: 1 under, 2 over; the band states the line's
 * own bottom or top there) or where the rule reaches into its line's own glyphs: the edge over its first line under their top,
 * the edge under its last line over their bottom, both as the part states them (Line's top and bottom: the PDF's ink, as the
 * rule's edges are). Today's rule: cell-rules.mjs pageRules took a rule through a line's own glyphs' band for none of its
 * own (the same top and bottom: 2610.21880v1 p2's tightly set table, its \hline 0.01 under t15's glyphs' top, cap 1 where the
 * band read as its rules gave 0.817; t22's under its glyphs' bottom, 0.897 where the band gave 0.827). Today's cellBands
 * (L2:352) then read those rules over the cell's own rectangle, never widened (RUN:2116)
 */
function bandRulesOf(m: Placed): (page: number) => number[] | undefined {
  const band = m.room.band
  // (its own lines, those whose ink is not kept: the band's, Room.band's bandOf)
  const own = m.lines.filter((l) => !(l[9] & LINE_FLAG.KEPT))
  const first = own[0],
    last = own.at(-1)
  if (!band || !first || !last) return () => undefined
  const x0 = Math.min(...own.map((l) => l[2])),
    x1 = Math.max(...own.map((l) => l[3]))
  const rules: number[] = []
  if (m.room.bandOpen !== 2 && band[1] >= first[5]) rules.push(x0, band[1], x1, band[1])
  if (m.room.bandOpen !== 1 && band[0] <= last[6]) rules.push(x0, band[0], x1, band[0])
  return (pg) => (pg === first[0] && rules.length ? rules : undefined)
}

/** for a part made before (one whose members state no Room.ends): the page's lowest unit line, as today's pageBottom (RUN:911:
 *  a line's band bottom and 0.24 of its height, the lowest of the page's units' but a figure's), read off the part: no unit
 *  borrows below it. A part of now states each page's own under each run of a member's lines, the page's every member read
 *  (this part holds a member running on to the next page, not that page's others) */
function bottomsOf(part: Part): Map<number, number> {
  const out = new Map<number, number>()
  for (const flow of part.flows)
    for (const m of flow) {
      if (m.kind === 'figure' || m.kind === 'inkfigures' || m.kind === 'name') continue
      for (const l of m.lines) {
        const r = rectOf(l, m)
        out.set(r[0], Math.min(out.get(r[0]) ?? Number.POSITIVE_INFINITY, r[2] + 0.24 * (r[4] - r[2])))
      }
    }
  return out
}

/**
 * Whether a member a table's tie names, not set for `why`, holds its table the original's (today's contract, RUN:1223 and
 * settleGroup RUN:2411: a translated cell that cannot be drawn keeps every cell of its group the original's): a cell to be
 * translated that cannot be set does — unlocated, its row failed (a Row not ok: refused, unavailable, …), unproven, a face it
 * lacks, unfit, an error — and one the wrap cannot hide is the original's alone, the rest of its table laid (the coordinator's
 * ruling of 2026-10-24), unless it spans columns or rows (its box is the others' too). One never to be translated holds
 * nothing (today's "one not expected never has a row, and is the original's in a group drawn"): no text of its own, a kind the
 * reader leaves, or no row with every row in (`none`: a unit no translator was sent, a cell of digits; a translation that
 * failed is a Row, not ok)
 */
const holdsTable = (why: Unlaid, spanning: boolean) => why !== 'unwrapped' || spanning

/** a member's row content, or why it has none to be set from */
function contentOf(m: Placed, rows: Rows): OutPiece[] | Unlaid {
  if (m.why) return m.why
  if (typeof m.text !== 'string') return m.kind === 'name' ? 'name' : 'kind'
  const row = rows.get(m.text)
  if (!row) return 'none'
  if (!row.ok) return row.why.kind
  return row.content
}

/**
 * S.names over the part (RUN:1355 paintNames): a babel name drawn on its own, in the target's word, at its size, weight and
 * slant, its left edge kept or, centred, its centre, shrunk into the room on its line to the last floor at most. Its facts are
 * the part's: its Word, its own text (Placed.plain), Style (its case: the text's capitals, Style.upper, never faked small
 * capitals), its line, its column (the line's measure) and Room.side, the next ink either side (a glyph's edge a quarter of its
 * size clear, as nameRoom reads a character's). A name the part binds to the member after it in its flow (Placed.bound:
 * amsthm's "Proof.") leads that member: its word and style handed on (`lead`), not drawn by itself here
 */
export function nameOf(
  m: Placed,
  leads: boolean,
  rules: Rules,
  metrics: Metrics,
  paper: ReturnType<typeof paperOf>,
): { laid: Laid['lines'] } | { lead: NameWord } | { why: Unlaid } | { wait: [string, string][] } {
  const word = m.text as Exclude<Placed['text'], string>
  const l = m.lines[0]
  if (!l || m.lines.length !== 1) return { why: 'name' }
  const size = m.style.size
  const nm: NameRow = {
    occurrence: m.ord,
    key: word.name,
    page: l[0],
    x0: l[2],
    baseline: l[4],
    x1: l[3],
    top: l[5],
    bottom: l[6],
    size,
    font: 0,
    centred: m.align === 'c',
    // (the class's case change: Word.caps, or the text's capitals the part states (Style.upper, which faked small capitals
    // never are: S.names sets those in its word's own case, in small capitals))
    capitals: !!word.caps || (!!m.style.upper && !m.style.sc),
    unit: leads ? m.ord : -1,
    glue: 0,
    counter: 0,
    cx0: l[7],
    cx1: l[8],
  }
  const side = m.room.side
  const room = () => {
    const left = !side ? l[7] : side[0] === l[7] ? side[0] : side[0] + 0.25 * size
    const right = !side ? l[8] : side[1] === l[8] ? side[1] : side[1] - 0.25 * size
    return { left: Math.min(left, l[2]), right: Math.max(right, l[3]) }
  }
  const color = m.style.fill ? `#${m.style.fill.toString(16).padStart(6, '0')}` : undefined
  const st = { ...tstyleOf(m.style, paper.designs), ...(m.style.sc ? { caps: true } : {}), ...(color ? { color } : {}) }
  const set = setNameOf({
    nm,
    own: { text: m.plain ?? '', counter: word.counter?.[0] ?? '', size, small: !!m.style.sc, st, chars: [] },
    room,
    to: rules.target,
    labels: rules.labels,
    serif: paper.designs.serif,
    P: rules.set as never,
    faceOf: (s, cls) => faceOf(paper.roles, s, cls),
    ownSmallCaps,
    metrics,
    shown: !m.why,
  })
  if (set.wait) return { wait: set.wait }
  if (set.lead) return { lead: { text: set.lead.text, st: set.lead.st } }
  const d = set.drawn
  if (!d) return { why: set.rec.why === 'unfit' ? 'unfit' : set.rec.why === 'served' ? ('served' as Unlaid) : 'name' }
  const items: TextItem[] = []
  let x = d.x
  const fill = typeof d.color === 'string' ? Number.parseInt(d.color.slice(1), 16) : undefined
  for (const r of d.runs) {
    const f = r.face ?? d.face
    const face = fontString(f, 100)
    // (an oblique face's slant, a CJK face's synthetic italic: the run skewed, as D.display's)
    const slant = f?.oblique ? { skew: 1 as const, slant: f.oblique } : {}
    items.push({ s: r.s, x, face, size: d.size * r.k, ...(fill !== undefined ? { fill } : {}), ...slant })
    x += (metrics.advance(face, 100, r.s) / 100) * r.k * d.size
  }
  return { laid: [[d.baseline, d.x, x, items]] }
}

/** layPage (design-a §1.2): page `part.page` laid from its part and the target's rows */
export function layPage(part: Part, rows: Rows, rules: Rules, metrics: Metrics, o: EntryOptions = {}): Page {
  const page = part.page
  const members = part.flows.flat()
  // (the kinds the reader leaves the original's: its "what to translate", design-a's Choices.leave)
  const leave = new Set(rules.leave)
  const waiting = waitOf(part, rows, leave)
  const waitAll = (faces: [string, string][]): Page => ({
    page,
    wait: { rows: waiting, faces },
    members: members.map((m) => ({
      ord: m.ord,
      page,
      state: 'waiting',
      off: 0,
      lines: [],
      lit: litOfA(m, page),
    })),
    // (the page is the original's while it waits: every link at A's box, as for a member not laid; no run is measured)
    links: linksOf(part, page, new Map(), () => 0, o.linkFates),
  })
  if (waiting.length) return waitAll([])
  const R = rules.set
  const measure = fitMeasure(metrics)
  const paper = paperOf(part.paper.faces.fonts, rules.target, rules.cjkFaces as never)
  const bottoms = bottomsOf(part)
  // (the free paper two members share on one baseline, each its half: two cells of a row)
  const shared = sharedPaper(part.flows, page)
  const lineskip = (part.paper.lineskip as [number, number] | undefined) ?? null
  // (a theorem-like head's word where the target's packages name none: the paper's own name unit's translation, PDF-READER
  // §19.14, today's ownNames)
  const ownNames = ownNamesOf(part.paper.names, rows)
  const state = new Map<number, Unlaid>()
  // (the members never to be translated: no text of their own, or of a kind the reader leaves; they hold no tie)
  const unmeant = new Set<number>()
  const faces: [string, string][] = []
  const prepared = new Map<number, FlowMember>()
  const relabelled = new Set<number>()
  // (the members whose elements on this page are drawn otherwise than kept where they stand: a crop or text in the translation)
  const moved = new Set<number>()
  // (the elements each member's reading keeps where they stand (U.elements' kept, in place): their ink and their links stay)
  const keptIn = new Map<number, Set<string>>()
  // (each member read, its faces asked and only then measured: the reading takes no width, B.cover asks Metrics' readiness
  // first, so that a face not loaded is waited for and never measured, PR #620's re-review)
  const read = new Map<
    number,
    { rd: ReturnType<typeof readMember>; pieces: ReturnType<typeof rowPieces>; tokens: Tokens }
  >()
  // (a babel name's: S.names over the part, nameOf)
  const names = new Map<number, Laid['lines']>()
  // (a name the part binds to the member after it (Placed.bound): that member's lead where its word is drawn with it (lay/lead.ts
  // ledBy), else the original's before it (keptBefore); by the member it leads. `boundTo`: each name drawn as a lead, its member)
  const leadFor = new Map<number, { name: Placed; word: NameWord | null }>()
  const boundTo = new Map<number, number>()
  // (each member as it is set: one led by a name with the name and the joint its label, one after a name kept pinned by it)
  const setAs = new Map<number, Placed>()
  // (the figure texts: set by S.figures, never read as paragraphs. One of a part made before the prepare stated its own text
  // (Placed.plain) is read as before (converge-4's entry, ec6715946: a paragraph's reading): S.figures, its source unknown,
  // would redraw a label its translation leaves as it was, #631's review)
  const figs: Placed[] = []
  for (const flow of part.flows)
    for (let k = 0; k < flow.length; k++) {
      const m = flow[k]!
      if (leave.has(m.kind)) {
        state.set(m.ord, 'left')
        unmeant.add(m.ord)
        // (a name left the original's before the member the part binds it to: that member set after it, pinned by it, as after
        // any name kept (keptBefore; Devin on #624: its follower could widen over the name))
        const next = m.kind === 'name' && m.bound ? flow[k + 1] : undefined
        if (next && next.kind !== 'name') leadFor.set(next.ord, { name: m, word: null })
        continue
      }
      if (m.kind === 'figure' && typeof m.plain === 'string') {
        figs.push(m)
        continue
      }
      if (m.kind === 'name' && typeof m.text !== 'string') {
        unmeant.add(m.ord)
        // (bound: set only with the member after it, which its part holds; none there, it stays the original's with it)
        const next = m.bound ? flow[k + 1] : undefined
        if (m.bound && (!next || next.kind === 'name')) {
          state.set(m.ord, 'bound')
          continue
        }
        if (m.why) {
          state.set(m.ord, m.why)
          if (next) leadFor.set(next.ord, { name: m, word: null })
          continue
        }
        const n = nameOf(m, !!next, rules, metrics, paper)
        if ('wait' in n) faces.push(...n.wait)
        else if ('why' in n) state.set(m.ord, n.why)
        else if ('lead' in n) {
          leadFor.set(next!.ord, { name: m, word: n.lead })
          state.set(m.ord, 'bound')
        } else names.set(m.ord, n.laid)
        if (next && !('lead' in n)) leadFor.set(next.ord, { name: m, word: null })
        continue
      }
      const content = contentOf(m, rows)
      if (typeof content === 'string') {
        state.set(m.ord, content)
        if (!m.why && (typeof m.text !== 'string' || content === 'none')) unmeant.add(m.ord)
        continue
      }
      // (led by a name: its lead drawn anew with it, or the name kept the original's before it)
      const ld = leadFor.get(m.ord)
      const led: { m: Placed; lead: Lead } | null = ld?.word ? ledBy(ld.name, m, ld.word, paper.designs) : null
      const mm = led ? led.m : ld ? keptBefore(ld.name, m) : m
      if (ld) {
        setAs.set(m.ord, mm)
        if (led) boundTo.set(ld.name.ord, m.ord)
        else if (ld.word) state.set(ld.name.ord, 'name')
      }
      const relabels = !!mm.label && !((mm.fixed ?? 0) & LABEL_KEPT)
      let rd: ReturnType<typeof readMember>
      const pieces = rowPieces(mm, content)
      try {
        rd = readMember({
          m: mm,
          unit: { kind: m.kind, ...(m.title ? { title: true } : {}), state: 'whole', pieces },
          rects: mm.lines.map((l) => rectOf(l, mm)),
          to: rules.target,
          P: R as never,
          paper,
          labels: { words: rules.labels, captions: rules.captions, heads: rules.heads, names: ownNames },
          refs: rules.refs,
          relabels,
          lead: led?.lead ?? null,
          shown: Number.POSITIVE_INFINITY,
        })
      } catch (e) {
        if (e instanceof RangeError) throw e
        state.set(m.ord, 'error')
        continue
      }
      if (rd.unproven >= 0) {
        state.set(m.ord, 'unproven' as Unlaid)
        continue
      }
      const c = cover(rd.tokens as never, metrics)
      if ('wait' in c) {
        faces.push(...c.wait)
        continue
      }
      if (!c.ok) {
        state.set(m.ord, c.why as Unlaid)
        continue
      }
      let tokens: Tokens
      try {
        tokens = measured(rd.tokens as Tokens, metrics)
      } catch (e) {
        if (e instanceof RangeError) throw e
        state.set(m.ord, 'error')
        continue
      }
      read.set(m.ord, { rd, pieces, tokens })
    }
  // (the figure texts, S.figures over the part: a face not loaded waited for as any)
  const fig = figuresOf(part, figs, rows, { paper, R, metrics })
  faces.push(...fig.wait)
  for (const [ord, w] of fig.why) state.set(ord, w)
  // (one state per call: a face not loaded leaves the whole page waiting, as a row not in does)
  if (faces.length) return waitAll(faces)
  // (each read member's setting, its flow taken from its end: a run-in head's follower is open only where the follower is set,
  // so that no head runs over the row of a member left the original's (the reader's leave, a row failed, unproven), PR #620's
  // re-review: the follower's row was in, the follower left, the head drawn over its original text)
  // (a name in a flow is no row for the member beside it: the member it leads is set with it, or after it kept)
  const besideOf = (x: Placed | undefined) => (!x || x.kind === 'name' ? null : (setAs.get(x.ord) ?? x))
  const adaptAt = (flow: readonly Placed[], k: number, open: boolean): void => {
    const m = setAs.get(flow[k]!.ord) ?? flow[k]!
    const r = read.get(m.ord)
    if (!r) return
    const { rd, pieces, tokens } = r
    const after = besideOf(flow[k + 1])
    const got = adapt({
      m,
      before: besideOf(flow[k - 1]),
      after,
      afterOpen: open && !!after,
      R,
      measure,
      patterns: rules.hyph as never,
      view: () => undefined,
      rulesOf: bandRulesOf(m),
      lineskip,
      reading: {
        tokens,
        labelDrawn: rd.labelDrawn,
        lead: rd.lead,
        cjkSize: rd.cjkSize,
        referenced: rd.referenced,
        breaks: rd.breaks,
        own: true,
      },
      bottomOf: (pg) => bottoms.get(pg),
      ...(shared.has(m.ord) ? { shared: shared.get(m.ord)! } : {}),
    })
    if ('stop' in got) {
      state.set(m.ord, 'kind')
      return
    }
    if (rd.labelDrawn !== null) relabelled.add(m.ord)
    // (today's hide.mjs: its placeholders' group hidden on a page where one with ink there, no display, is not kept where it
    // stands; an element kept in place by the part (El.keep) is in no group)
    const els = new Map(m.els ?? [])
    const inPlace = new Set<string>()
    for (const [q, res] of rd.resolutions) {
      const p = pieces[q] as { t: string; k?: number } | undefined
      const e = p?.t === 'ph' || p?.t === 'nested' ? els.get(String(p.k)) : undefined
      if (e && (res.mode === 'kept' || res.inPlace)) inPlace.add(String(p!.k))
      if (!e || e.keep || e.kind === 'display' || res.mode === 'kept' || res.inPlace) continue
      if (e.ink.some((x) => x[0] === page)) moved.add(m.ord)
    }
    keptIn.set(m.ord, inPlace)
    prepared.set(m.ord, got.member)
  }
  for (const flow of part.flows)
    for (let k = flow.length - 1; k >= 0; k--) {
      const next = flow[k + 1]
      adaptAt(flow, k, !!next && prepared.has(next.ord))
    }
  // (a table laid whole or not at all: a cell not set before its lay that holds its table (holdsTable) leaves every cell of it
  // the original's, the set ones 'cells', as settleTies withholds a table whose cell its lay refused; the others are decided
  // by their lays, over the cells set (a cell left out of the flows and its tie handed whole, settleTies skips the table))
  const inPart = new Set(members.map((m) => m.ord))
  const held = new Set<number>()
  const cellTies: { rule: 'cells'; cells: number[] }[] = []
  for (const t of part.ties ?? []) {
    if (t.rule !== 'cells') continue
    const cells = t.cells.flat()
    const spanning = new Set(t.spanning ?? [])
    const holds = cells.some((o) => {
      const why = state.get(o)
      return why !== undefined && !unmeant.has(o) && holdsTable(why, spanning.has(o))
    })
    if (holds) {
      for (const o of cells) {
        held.add(o)
        if (!state.has(o) && prepared.has(o)) state.set(o, 'cells')
      }
      continue
    }
    // (a tie naming a member its part does not hold is no tie of this page's: handed whole, settleTies decides nothing of it)
    cellTies.push({
      rule: 'cells',
      cells: cells.every((o) => inPart.has(o)) ? cells.filter((o) => prepared.has(o)) : cells,
    })
  }
  // (a head whose follower's table is held runs over no row of it either)
  for (const flow of part.flows)
    flow.forEach((m, k) => {
      const next = flow[k + 1]
      if (next && held.has(next.ord) && prepared.get(m.ord)?.follower?.open && !held.has(m.ord)) adaptAt(flow, k, false)
    })
  // (each flow cut where a member is not set: the one after it starts where TeX set it, as after a member left the original's)
  const flows: FlowMember[][] = []
  for (const flow of part.flows) {
    let cur: FlowMember[] = []
    for (const m of flow) {
      const p = held.has(m.ord) ? undefined : prepared.get(m.ord)
      if (!p) {
        if (cur.length) flows.push(cur)
        cur = []
        continue
      }
      cur.push(cur.length ? p : { ...p, rowStart: undefined })
    }
    if (cur.length) flows.push(cur)
  }
  const ties = [
    ...cellTies,
    ...(part.ties ?? []).flatMap((t) => (t.rule === 'size' ? [{ rule: 'size' as const, ords: t.ords }] : [])),
  ]
  const laid = layPagePrepared(page, flows, ties, R)
  const byOrd = new Map(laid.members.map((x) => [x.ord, x]))
  // (each name drawn as a lead, by the member it leads: its ink on A lit with that member's)
  const leadOf = new Map<number, Placed>()
  for (const m of members) {
    const to = boundTo.get(m.ord)
    if (to !== undefined) leadOf.set(to, m)
  }
  // (the members laid on the page with their layouts: the owners whose links are drawn with them)
  const owners = new Map<number, LinkOwner>()
  const out: Laid[] = members.map((m) => {
    // (a figure text drawn: its translation on its line, its text group off)
    const fl = fig.laid.get(m.ord)
    if (fl)
      return {
        ord: m.ord,
        page,
        state: 'laid',
        off: groupsOn(m, page) & 1,
        lines: fl,
        lit: litOfFigure(m, page, fl),
      }
    // (a name drawn on its own: its word on its line, its text group off)
    const nl = names.get(m.ord)
    if (nl) {
      const here = m.lines[0]![0] === page
      return {
        ord: m.ord,
        page,
        state: 'laid',
        off: groupsOn(m, page) & 1,
        lines: here ? nl : [],
        lit: here ? { left: [[boxOfA(m.lines[0]!)]], right: [nl.map(nameBox)], own: [] } : litOfA(m, page),
      }
    }
    // (a name drawn as its member's lead: its text off where that member is laid, both the original's where it is not; lit with
    // the member it leads)
    const to = boundTo.get(m.ord)
    if (to !== undefined) {
      const with_ = (byOrd.get(to)?.state ?? state.get(to)) === 'laid'
      return {
        ord: m.ord,
        page,
        state: with_ ? 'laid' : 'bound',
        off: with_ ? groupsOn(m, page) & 1 : 0,
        lines: [],
        lit: with_ ? { left: [], right: [], own: [] } : litOfA(m, page),
      }
    }
    const x = byOrd.get(m.ord)
    const st = x?.state ?? state.get(m.ord) ?? 'none'
    const lines = (x?.lines ?? []).map(
      ([y, x0, x1, items]) => [y, x0, x1, items as unknown as Item[]] as Laid['lines'][number],
    )
    // (its groups turned off, each only where it has it on this page (groupsOn): its text where laid, its elements where one with
    // ink here is drawn otherwise than kept where it stands (a crop cut from this page, on a line of either page, or text in the
    // translation: today's hide.mjs), its label where it is drawn anew or carried as a crop)
    const layout = x?.lay?.layout
    const cuts = cutsOf(layout).filter((c) => c.page === page)
    const off =
      (st !== 'laid'
        ? 0
        : 1 |
          (moved.has(m.ord) || cuts.some((c) => c.el) ? 2 : 0) |
          (relabelled.has(m.ord) || cuts.some((c) => !c.el) ? LABEL_KEPT : 0)) &
      groupsOn(m, page) &
      ~(m.fixed ?? 0)
    const kept = keptIn.get(m.ord) ?? new Set<string>()
    const pieces = read.get(m.ord)?.pieces
    if (st === 'laid' && layout && pieces)
      owners.set(m.ord, {
        m,
        layout,
        off,
        kept,
        elOf: (k) => {
          const p = pieces[k] as { t: string; k?: number } | undefined
          return p && (p.t === 'ph' || p.t === 'nested') && p.k !== undefined ? String(p.k) : null
        },
      })
    return {
      ord: m.ord,
      page,
      state: st,
      off,
      ...(x?.fit ? { fit: x.fit } : {}),
      lines,
      lit: st === 'laid' ? litLaid(m, page, layout, { off, kept, lead: leadOf.get(m.ord) ?? null }) : litOfA(m, page),
    }
  })
  return {
    page,
    wait: { rows: [], faces: [] },
    members: out,
    links: linksOf(part, page, owners, measure.w100, o.linkFates),
  }
}

/** a name's line on A as a box: its ink across, its fonts' boxes up and down */
const boxOfA = (l: Placed['lines'][number]): [number, number, number, number] => {
  const k = inkOfLine(l)
  return [k[1], k[2], k[3], k[4]]
}
/** a name's or a figure text's drawn line as a box: its runs across, each run's band at its size (D.sentences' tokenBand: a CJK
 *  run's em box); a turned line's (its items' `dir`) in its run's frame (Laid.lit's `dir`): from its origin along it, that band
 *  across it */
const nameBox = ([y, x0, x1, items]: Laid['lines'][number]): [number, number, number, number] => {
  let bottom = y,
    top = y
  for (const it of items) {
    if (!('size' in it)) continue
    const b = tokenBand({ cls: CJK.test(it.s) ? 'cjk' : 'latin' }, { f: it.size }, y)
    bottom = Math.min(bottom, b.bottom)
    top = Math.max(top, b.top)
  }
  const dir = items[0] && 'dir' in items[0] ? items[0].dir : undefined
  if (!dir) return [x0, bottom, x1, top]
  const [s, t] = inFrame(dir, x0, y)
  return [s, t + bottom - y, s + x1 - x0, t + top - y]
}
/** a figure text drawn: on A its line, as drawn its laid line; a turned one's both in its run's frame, lit turned with it (its
 *  run's box on A, its line along it as drawn) */
function litOfFigure(m: Placed, page: number, fl: Laid['lines']): Laid['lit'] {
  const run = runBoxOfA(m, page)
  const right = fl.map(nameBox)
  if (run && m.dir) return { left: [[run]], right: [right], own: [], dir: m.dir }
  return { left: [[boxOfA(m.lines[0]!)]], right: [m.dir ? right.map((b) => pageBoxOf(b, m.dir!)) : right], own: [] }
}
