// design-a's entry (§1.2): layPage(part, rows, rules, metrics) → Page, pure, called in every state. A part is the page's whole
// problem: every flow its page reads, each member's facts on arXiv's page (Placed), the paper's faces and \lineskip; the rows are
// the translation package's Results by unit id. Composed over what the gate's runner proves member by member: the wait check
// (waitOf: rows not in while more may come, before any work), each member's reading and tokens (read.ts readMember over the row's
// pieces made from the member's stated facts, rowPieces: no Units object), its faces (B.cover: a face not loaded is waited for, a
// character no served face holds leaves it `served`), its setting (adapt.ts: U.blocks, U.decor, U.params, its flow's shared
// rows), every flow laid and each pass page filled (layPagePrepared: L8-L11, a flow that throws its own), and the members as drawn
// (D.display). What it does not compose yet, each said where it is decided: a babel name's and a figure text's members (S.names,
// S.figures: their members stay the original's, `name` / `kind`), the sentences' boxes (Laid.lit: empty), the page's links
// (Page.links: empty), a CJK cell's bands from its stated band (Room.band: none read).
import type { OutPiece, Part, Placed } from '@readarxiv/format'
import { cover } from '../breaker/cover.ts'
import { fitMeasure } from '../breaker/measure.ts'
import type { Tokens } from '../fit/types.ts'
import type { Item, Laid, Metrics, Page, Rows, Rules, Unlaid } from '../types.ts'
import { adapt, rectOf } from './adapt.ts'
import type { FlowMember } from './flow.ts'
import { layPagePrepared } from './page.ts'
import { paperOf, readMember, rowPieces } from './read.ts'
import { waitOf } from './wait.ts'

/** what laying a page reads besides its part and its rows: the target's head names (translator's dictionary, a data file of
 *  the rules: rules/tex-names.json), the paper's own name units' words; each absent where none is known */
export type EntryOptions = {
  heads?: Readonly<Record<string, string>> | null
  names?: ReadonlyMap<string, string> | null
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

/** a member's row content, or why it has none to be set from */
function contentOf(m: Placed, rows: Rows): OutPiece[] | Unlaid {
  if (m.why) return m.why
  if (typeof m.text !== 'string') return m.kind === 'name' ? 'name' : 'kind'
  const row = rows.get(m.text)
  if (!row) return 'none'
  if (!row.ok) return row.why.kind
  return row.content
}

/** layPage (design-a §1.2): page `part.page` laid from its part and the target's rows */
export function layPage(part: Part, rows: Rows, rules: Rules, metrics: Metrics, o: EntryOptions = {}): Page {
  const page = part.page
  const members = part.flows.flat()
  const waiting = waitOf(part, rows)
  const waitAll = (faces: [string, string][]): Page => ({
    page,
    wait: { rows: waiting, faces },
    members: members.map((m) => ({
      ord: m.ord,
      page,
      state: 'waiting',
      off: 0,
      lines: [],
      lit: { left: [], right: [], own: [] },
    })),
    links: [],
  })
  if (waiting.length) return waitAll([])
  const R = rules.set
  const measure = fitMeasure(metrics)
  const paper = paperOf(part.paper.faces.fonts, rules.target, rules.cjkFaces as never)
  const bottoms = bottomsOf(part)
  const lineskip = (part.paper.lineskip as [number, number] | undefined) ?? null
  const state = new Map<number, Unlaid>()
  const faces: [string, string][] = []
  const prepared = new Map<number, FlowMember>()
  const relabelled = new Set<number>()
  for (const flow of part.flows)
    flow.forEach((m, k) => {
      const content = contentOf(m, rows)
      if (typeof content === 'string') {
        state.set(m.ord, content)
        return
      }
      const relabels = !!m.label && !((m.fixed ?? 0) & LABEL_KEPT)
      let rd: ReturnType<typeof readMember>
      try {
        rd = readMember({
          m,
          unit: { kind: m.kind, state: 'whole', pieces: rowPieces(m, content) },
          rects: m.lines.map((l) => rectOf(l, m)),
          to: rules.target,
          P: R as never,
          paper,
          labels: { words: rules.labels, captions: rules.captions, heads: o.heads ?? null, names: o.names ?? null },
          relabels,
          metrics,
          shown: Number.POSITIVE_INFINITY,
        })
      } catch (e) {
        if (e instanceof RangeError) throw e
        state.set(m.ord, 'error')
        return
      }
      if (rd.unproven >= 0) {
        state.set(m.ord, 'unproven' as Unlaid)
        return
      }
      const c = cover(rd.tokens as never, metrics)
      if ('wait' in c) {
        faces.push(...c.wait)
        return
      }
      if (!c.ok) {
        state.set(m.ord, c.why as Unlaid)
        return
      }
      const after = flow[k + 1] ?? null
      const got = adapt({
        m,
        before: flow[k - 1] ?? null,
        after,
        afterOpen: !!after && typeof contentOf(after, rows) !== 'string',
        R,
        measure,
        patterns: rules.hyph as never,
        view: () => undefined,
        rulesOf: () => undefined,
        lineskip,
        reading: {
          tokens: rd.tokens as Tokens,
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
      prepared.set(m.ord, got.member)
    })
  // (one state per call: a face not loaded leaves the whole page waiting, as a row not in does)
  if (faces.length) return waitAll(faces)
  // (each flow cut where a member is not set: the one after it starts where TeX set it, as after a member left the original's)
  const flows: FlowMember[][] = []
  for (const flow of part.flows) {
    let cur: FlowMember[] = []
    for (const m of flow) {
      const p = prepared.get(m.ord)
      if (!p) {
        if (cur.length) flows.push(cur)
        cur = []
        continue
      }
      cur.push(cur.length ? p : { ...p, rowStart: undefined })
    }
    if (cur.length) flows.push(cur)
  }
  const ties = (part.ties ?? []).flatMap((t) =>
    t.rule === 'cells' ? [{ rule: 'cells' as const, cells: t.cells.flat() }] : [],
  )
  const laid = layPagePrepared(page, flows, ties, R)
  const byOrd = new Map(laid.members.map((x) => [x.ord, x]))
  const out: Laid[] = members.map((m) => {
    const x = byOrd.get(m.ord)
    const st = x?.state ?? state.get(m.ord) ?? 'none'
    const lines = (x?.lines ?? []).map(
      ([y, x0, x1, items]) => [y, x0, x1, items as unknown as Item[]] as Laid['lines'][number],
    )
    // (its groups turned off: its text where laid, its elements where one is drawn at a place of its own (a crop on a laid line),
    // its label where it is drawn anew or carried as a crop)
    const crops = lines.flatMap((l) => l[3]).filter((it): it is Extract<Item, { src: unknown }> => 'src' in it)
    const off =
      st !== 'laid'
        ? 0
        : 1 |
          (crops.some((c) => c.piece !== 'label' && c.piece !== 'counter') ? 2 : 0) |
          (relabelled.has(m.ord) || crops.some((c) => c.piece === 'label') ? LABEL_KEPT : 0)
    return {
      ord: m.ord,
      page,
      state: st,
      off: off & ~(m.fixed ?? 0),
      ...(x?.fit ? { fit: x.fit } : {}),
      lines,
      lit: { left: [], right: [], own: [] },
    }
  })
  return { page, wait: { rows: [], faces: [] }, members: out, links: [] }
}
