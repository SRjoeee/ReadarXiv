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
// fits; a turned one, which design-a's Item cannot draw, the original's). A CJK cell's bands are read over the rules its Room.band
// states.
import type { OutPiece, Part, Placed } from '@readarxiv/format'
import { cover } from '../breaker/cover.ts'
import { faceOf, ownSmallCaps } from '../breaker/faces.ts'
import { fitMeasure, fontString } from '../breaker/measure.ts'
import { type NameRow, setNameOf } from '../shared/names.ts'
import type { Tokens } from '../fit/types.ts'
import type { Item, Laid, Metrics, Page, Rows, Rules, Unlaid } from '../types.ts'
import type { TextItem } from '../emit/display.ts'
import { adapt, rectOf } from './adapt.ts'
import type { FlowMember } from './flow.ts'
import { figuresOf } from './figures.ts'
import { keptBefore, type Lead, ledBy, type NameWord } from './lead.ts'
import { type LinkFate, type LinkOwner, linksOf } from './links.ts'
import { inkOfLine, litLaid, litOfA } from './lit.ts'
import { layPagePrepared } from './page.ts'
import { tokenBand } from '../emit/sentences.ts'
import { CJK } from '../breaker/script.ts'
import { measured, paperOf, readMember, rowPieces, tstyleOf } from './read.ts'
import { waitOf } from './wait.ts'

/** what laying a page reads besides its part and its rows: the target's head names (translator's dictionary, a data file of
 *  the rules: rules/tex-names.json), the paper's own name units' words; each absent where none is known */
export type EntryOptions = {
  heads?: Readonly<Record<string, string>> | null
  names?: ReadonlyMap<string, string> | null
  /** where given, what became of each of the part's links (lay/links.ts LinkFate, by its index): the gate's count */
  linkFates?: LinkFate[]
}

const LABEL_KEPT = 4

/** the page's lowest unit line, as today's pageBottom (RUN:911: a line's band bottom and 0.24 of its height, the lowest of the
 *  page's units' but a figure's): no unit borrows below it */
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
  // (a page's table rules as U.params' cellBands reads them, [x0, y0, x1, y1] each: the rule over a cell's lines and the rule
  // under them, which its Room.band states (the clear band between them), across the cell's lines)
  const rules0 = new Map<number, number[]>()
  for (const m of members) {
    const band = m.room.band
    if (!band || !m.lines.length) continue
    const pg = m.lines[0]![0]
    const x0 = Math.min(...m.lines.map((l) => l[2])),
      x1 = Math.max(...m.lines.map((l) => l[3]))
    const list = rules0.get(pg) ?? rules0.set(pg, []).get(pg)!
    list.push(x0, band[1], x1, band[1], x0, band[0], x1, band[0])
  }
  const lineskip = (part.paper.lineskip as [number, number] | undefined) ?? null
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
  // (the figure texts: set by S.figures, never read as paragraphs)
  const figs: Placed[] = []
  for (const flow of part.flows)
    for (let k = 0; k < flow.length; k++) {
      const m = flow[k]!
      if (leave.has(m.kind)) {
        state.set(m.ord, 'left')
        unmeant.add(m.ord)
        continue
      }
      if (m.kind === 'figure') {
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
          unit: { kind: m.kind, state: 'whole', pieces },
          rects: mm.lines.map((l) => rectOf(l, mm)),
          to: rules.target,
          P: R as never,
          paper,
          labels: { words: rules.labels, captions: rules.captions, heads: o.heads ?? null, names: o.names ?? null },
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
      rulesOf: (pg) => rules0.get(pg),
      lineskip,
      reading: {
        tokens,
        labelDrawn: rd.labelDrawn,
        lead: rd.lead,
        title: false,
        front: false,
        cjkSize: rd.cjkSize,
        referenced: rd.referenced,
        own: true,
      },
      bottomOf: (pg) => bottoms.get(pg),
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
        off: 1,
        lines: fl,
        lit: { left: [[boxOfA(m.lines[0]!)]], right: [fl.map(nameBox)], own: [] },
      }
    // (a name drawn on its own: its word on its line, its text group off)
    const nl = names.get(m.ord)
    if (nl) {
      const here = m.lines[0]![0] === page
      return {
        ord: m.ord,
        page,
        state: 'laid',
        off: 1,
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
        off: with_ ? 1 : 0,
        lines: [],
        lit: with_ ? { left: [], right: [], own: [] } : litOfA(m, page),
      }
    }
    const x = byOrd.get(m.ord)
    const st = x?.state ?? state.get(m.ord) ?? 'none'
    const lines = (x?.lines ?? []).map(
      ([y, x0, x1, items]) => [y, x0, x1, items as unknown as Item[]] as Laid['lines'][number],
    )
    // (its groups turned off: its text where laid, its elements where one is drawn otherwise than kept where it stands (a crop on
    // a laid line, or text in the translation: today's hide.mjs), its label where it is drawn anew or carried as a crop)
    const crops = lines.flatMap((l) => l[3]).filter((it): it is Extract<Item, { src: unknown }> => 'src' in it)
    const off =
      (st !== 'laid'
        ? 0
        : 1 |
          (moved.has(m.ord) || crops.some((c) => c.piece !== 'label' && c.piece !== 'counter') ? 2 : 0) |
          (relabelled.has(m.ord) || crops.some((c) => c.piece === 'label') ? LABEL_KEPT : 0)) & ~(m.fixed ?? 0)
    const layout = x?.lay?.layout
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
/** a name's drawn line as a box: its runs across, each run's band at its size (D.sentences' tokenBand: a CJK run's em box) */
const nameBox = ([y, x0, x1, items]: Laid['lines'][number]): [number, number, number, number] => {
  let bottom = y,
    top = y
  for (const it of items) {
    if (!('size' in it)) continue
    const b = tokenBand({ cls: CJK.test(it.s) ? 'cjk' : 'latin' }, { f: it.size }, y)
    bottom = Math.min(bottom, b.bottom)
    top = Math.max(top, b.top)
  }
  return [x0, bottom, x1, top]
}
