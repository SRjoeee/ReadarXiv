// The units no source unit is, made on arXiv's page (design §4.3; the coordinator's decision of 2026-11-07): the running heads
// and feet, contents and lists, notes and orphan text, a biblatex entry's lines (ink units), the kept blocks, and the text inside a
// figure (figure texts), cut and kinded by today's rule — today's ledger, inkUnitsOf, keptUnitsOf and figureUnitsOf (copied as
// they are under ./today, held equal to today's by tests/pdf-reader/locate-ink-today.test.ts) — run over A's page in place of
// B's: A's glyphs, each owned where a source unit owns it (its partner's owner on B, or locate's claim: a located member's, a held
// glyph), every other free, those B never printed among them (a figure's text inside its form where B is a draft, a supplement);
// and B's marks (its points, paragraphs and their ends, regions, pictures) carried onto A's stream through the mapping. What the
// instrument states is source units alone: these are made here, each a unit of today's shape (its id format's unitId over its
// kind and content, today's id; an ink unit's echo, its alignment as TeX set its paragraph, a figure text's set and direction,
// a kept block fixed) with its ink on A.
import { type Piece, type Style, unitId } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocPoint } from '../doc.ts'
import type { PageInk } from '../ink.types.ts'
import type { Instrument, InstrumentUnit, PieceClass, SpanClass } from '../instrument.ts'
import { runIns } from '../marks/run-ins.ts'
import { type AuthorBlock, authorBlockOf } from './author-block.ts'
import {
  changeOf,
  faceKeyOf,
  type StyleGlyph,
  styleKeyOf,
  styleOf as glyphStyleOf,
  turnedStyleGlyph,
  unitSize,
} from './facts.ts'
import {
  classOf,
  claimInk,
  figureGroup,
  figureUnitsOf,
  inkUnitsOf,
  keptUnitsOf,
  ledgerOf,
  type TodayInkUnit,
  type TodayPage,
  type TodayPiece,
  type TodayUnit,
  UNIT_FLAG,
} from './today/today.types.ts'

/** a figure text's anchor as an alignment: its start's, its centre's, its end's (Placed.align) */
const ALIGN_OF = { start: 'l', centre: 'c', end: 'r' } as const

/** a unit made on A and its ink there: its text glyphs (global, stream order), its label's (an ink unit's leading mark, which its
 *  text does not say), its placeholders' glyphs (the element `ph`), its turned glyphs ([page, index]) and its boxes ([page,
 *  index]) */
export interface Made {
  unit: InstrumentUnit
  text: number[]
  label?: number[]
  ph: number[]
  phId: string | null
  turned: [number, number][]
  textBoxes: [number, number][]
  elBoxes: [number, number][]
  /** a figure text's groups of its runs in another face (figureRuns): each one's style, its glyphs', by its piece id */
  spanStyles?: [string, Style][]
  /** an ink unit's elements of a kept run, each its own (by piece id): the run's glyphs the claim gave the unit's placeholders
   *  (inkUnitsOf's `glyphs.runs`; none where another unit owns them all) and the rules the claim gave them that stand nearest
   *  its glyphs */
  els?: Map<string, { glyphs: number[]; boxes: [number, number][] }>
}

export interface InkInput {
  ins: Instrument
  inkA: Doc
  /** A's pages as pageInk read them (read.ts `raw`), null for a page not read */
  raws: readonly (PageInk | null)[]
  m: Mapping
  pageA: Int32Array
  /** whether a glyph of A (global) is a source unit's: its partner's owner on B, a located member's claim, a held glyph */
  owned: (a: number) => boolean
  /** what the front half reads of an ink unit's pieces (today's classesOf, the instrument adapter's), where it is given */
  classesOf?: ((pieces: TodayPiece[]) => [string, PieceClass][]) | undefined
  /** the source unit a glyph of A (global) is, -1 none: where it is given, the author block under the title is read
   *  (author-block.ts) */
  ownerOf?: ((a: number) => number) | undefined
}

export interface InkStats {
  ink: number
  kept: number
  figures: number
  glyphs: number
}

/** the units made on A, in today's bundle's order (ink units, kept blocks, figure texts: those drawn first), their indices from
 *  `ins.units.length` on (an echo's index, of a source unit or of an ink unit before it, in that one list) */
export function inkOf(o: InkInput): { made: Made[]; stats: InkStats; block: AuthorBlock | null } {
  const { ins, inkA, m } = o
  const base = ins.units.length
  const carried = carry(ins.ink, inkA, m, o.pageA)
  // ---- each A page as today's makers read one, its glyphs' and boxes' owners
  const turnedOwned = inkA.pages.map((pg) => new Array<string | null>(pg.turned?.length ?? 0).fill(null))
  // (a turned glyph's partner on B: whether TeX showed it in an included figure)
  const turnedForm = inkA.pages.map((pg) => new Array<boolean | null>(pg.turned?.length ?? 0).fill(null))
  ins.ink.pages.forEach((pg, p) => {
    ;(pg.turned ?? []).forEach((t, j) => {
      const ap = m.turnedPage[p]?.[j] ?? 0
      if (ap > 0) turnedForm[ap - 1]![m.turnedIndex[p]![j] as number] = t.form
    })
  })
  ;(ins.turned ?? []).forEach((ow, p) => {
    for (let j = 0; j < ow.unit.length; j++) {
      const ap = m.turnedPage[p]?.[j] ?? 0
      if ((ow.unit[j] as number) >= 0 && ap > 0) turnedOwned[ap - 1]![m.turnedIndex[p]![j] as number] = 'u'
    }
  })
  // (whether a glyph is shown in an included figure, and which: its partner's on B, where it has one, as TeX included it; arXiv's
  // producer may have flattened the figure's form)
  const B = ins.ink
  const pageB = new Int32Array(m.offB[B.pages.length] as number)
  B.pages.forEach((pg, p) => {
    pageB.fill(p + 1, m.offB[p] as number, (m.offB[p] as number) + pg.glyphs.length)
  })
  const formOf = (i: number, j: number): { form: boolean; fid: number | undefined } | null => {
    const b = m.aToB[(m.offA[i] as number) + j] as number
    if (b < 0) return null
    const p = (pageB[b] as number) - 1
    const g = B.pages[p]!.glyphs[b - (m.offB[p] as number)]!
    return { form: g.form, fid: g.fid }
  }
  const pages: TodayPage[] = inkA.pages.map((pg, i) =>
    pageOf(pg.view, o.raws[i] ?? null, carried[i]!, turnedOwned[i]!, (j) => formOf(i, j), turnedForm[i]!),
  )
  const own: { glyphs: (string | null)[][]; boxes: (string | null)[][] } = {
    glyphs: inkA.pages.map((pg, i) =>
      Array.from({ length: pg.glyphs.length }, (_, j): string | null =>
        o.owned((m.offA[i] as number) + j) ? 'u' : null,
      ),
    ),
    boxes: inkA.pages.map((pg) => new Array<string | null>(pg.kinds.length).fill(null)),
  }
  ins.boxes.forEach((ow, p) => {
    for (let x = 0; x < ow.unit.length; x++) {
      const ap = m.boxPage[p]?.[x] ?? 0
      if ((ow.unit[x] as number) >= 0 && ap > 0) own.boxes[ap - 1]![m.boxIndex[p]![x] as number] = 'u'
    }
  })
  const units: TodayUnit[] = ins.units.map((u) =>
    u.kind === 'name' ? null : { kind: u.kind, pieces: flatOf(u.content) },
  )
  // ---- the author block under the title (author-block.ts), read twice: before the figure texts, so that a framed title box's
  // block is no figure's text (TeX drew it in the picture its title is in); and once the ink units are cut, from its first name
  // (an ink unit rule 8 made of the names) on
  const ownerOf = o.ownerOf
  const blockOf = (named: ((i: number, j: number) => boolean) | null) =>
    ownerOf
      ? authorBlockOf(
          pages.map((pg, i) => {
            const gs = pg.glyphs as { pid?: number; form?: boolean; y: number; size: number }[]
            const at = pg.boxAt as ArrayLike<number>
            return {
              n: gs.length,
              owner: (j: number) => ownerOf((m.offA[i] as number) + j),
              pid: (j: number) => gs[j]?.pid,
              form: (j: number) => !!gs[j]?.form,
              onLine: (j: number, k: number) => {
                const G = gs[j]
                const F = gs[k]
                return !!G && !!F && Math.abs(G.y - F.y) < 0.5 * Math.max(G.size, F.size)
              },
              graphicBefore: (j: number) => {
                for (let x = j > 0 ? (at[j - 1] as number) : 0; x < (at[j] as number); x++)
                  if (own.boxes[i]![x] === null) return true
                return false
              },
              ...(named ? { named: (j: number) => named(i, j) } : {}),
              ends: carried[i]!.points.filter((x) => FRONT_ELEMENT.test(x.name)).map((x) => x.glyph),
            }
          }),
          ins.units,
        )
      : null
  const framed = blockOf(null)

  // ---- today's sequence (pipeline/instrument.mjs, wrapFinal's): the figure texts of what no unit owns, the ledger with them
  // owned, the ink units, their claims, then the kept blocks of what is left
  // (the block's ink is no figure's text, though TeX drew it in the picture its title is in: a framed title box)
  const fig = figureUnitsOf(pages, {
    glyphs: own.glyphs.map((row, i) =>
      framed?.page === i ? row.map((x, g) => x ?? (framed.has(g) ? 'b' : null)) : row,
    ),
  })
  const ledgerOwn = own.glyphs.map((row, i) => {
    const f = fig.glyphs[i]
    if (!f?.size) return row
    const out = [...row]
    for (const [g, k] of f) out[g] = figureGroup(k)
    return out
  })
  const ledger = ledgerOf(pages, { glyphs: ledgerOwn }, { units })
  const ink = inkUnitsOf(pages, ledger, { units, from: base })
  const namedAt = new Set<string>()
  for (const u of ink)
    if (u.kind === 'inknames') for (const [p, g] of [...u.glyphs.text, ...u.glyphs.ph]) namedAt.add(`${p - 1}|${g}`)
  const block = blockOf((i, j) => namedAt.has(`${i}|${j}`))
  if (block) nameBlock(ink, ledger, (p, g) => block.page === p - 1 && block.has(g))
  const boxesBefore = own.boxes.map((row) => [...row])
  claimInk(own, ink, pages)
  const kept = keptUnitsOf(
    pages,
    ledger,
    (p, g) => own.glyphs[p - 1]?.[g] ?? (fig.glyphs[p - 1]?.has(g) ? 'f' : null),
    { from: base + ink.length },
  )

  // ---- the units, as the instrument adapter stated today's (pipeline/instrument.mjs:322-340 at abe884b5e)
  const made: Made[] = []
  const global = (p: number, g: number) => (m.offA[p - 1] as number) + g
  for (const u of ink) {
    const e = u.echo
    const echoed = e === null ? null : e < base ? ins.units[e]! : made[e - base]!.unit
    const content = echoed ? echoed.content : contentOf(u.pieces)
    const classes = o.classesOf?.(u.pieces) ?? []
    const spans: [string, SpanClass][] = echoed
      ? (echoed.spans ?? []).flatMap(([id, x]): [string, SpanClass][] =>
          x.cmd !== undefined ? [[id, { cmd: x.cmd, ...(x.to ? { to: x.to } : {}) }]] : [],
        )
      : spansOf(u.pieces)
    const flags = u.rows.unit[3]
    const align =
      flags === UNIT_FLAG.CENTRED
        ? 'c'
        : flags === UNIT_FLAG.FLUSH_LEFT
          ? 'l'
          : flags === UNIT_FLAG.FLUSH_RIGHT
            ? 'r'
            : flags === UNIT_FLAG.JUSTIFIED
              ? 'j'
              : undefined
    const unit: InstrumentUnit = {
      id: unitId(u.kind, content),
      kind: u.kind,
      content,
      ...(classes.length ? { classes } : {}),
      ...(spans.length ? { spans } : {}),
      ...(e !== null ? { echo: e } : {}),
      ...(align ? { align } : {}),
    }
    // (its text and placeholders' glyphs as its claim set them; a placeholder's its first element's, there being no points to tell
    // them apart: the adapter's rule, pipeline/instrument.mjs:375-379)
    const first = firstEl(content)
    const x: Made = { unit, text: [], ph: [], phId: first, turned: [], textBoxes: [], elBoxes: [] }
    // (its label's glyphs, which its claim gave its text's group: a source unit's label is a role of its own, its group `.l`,
    // kept where it stands, carried with a line set otherwise or drawn anew, never erased with the text it is no word of)
    const labelled = new Set((u.glyphs.label ?? []).map(([p, g]) => global(p, g)))
    const label: number[] = []
    for (const [p, g] of u.glyphs.text)
      if (own.glyphs[p - 1]?.[g] === `u${u.id}`) (labelled.has(global(p, g)) ? label : x.text).push(global(p, g))
    if (label.length) x.label = label
    for (const [p, g] of u.glyphs.ph) {
      const w = own.glyphs[p - 1]?.[g]
      if (w === `u${u.id}.p`) (first !== null ? x.ph : x.text).push(global(p, g))
      else if (w === `u${u.id}`) x.text.push(global(p, g))
    }
    // (each element its own kept run's glyphs, the maker's: today's file draws each placeholder by its own segments, rows.ph;
    // given the first, every run was drawn at its place and none at the others')
    if (first !== null) {
      x.els = new Map()
      for (const [k, gs] of u.glyphs.runs ?? []) {
        const mine = gs.filter(([p, g]) => own.glyphs[p - 1]?.[g] === `u${u.id}.p`).map(([p, g]) => global(p, g))
        x.els.set(String(k), { glyphs: mine, boxes: [] })
      }
    }
    made.push(x)
  }
  // (the rules TeX painted on an ink unit's lines, which its claim took: its text's, or a placeholder's)
  own.boxes.forEach((row, i) => {
    row.forEach((w, b) => {
      if (w === null || boxesBefore[i]![b] !== null) return
      const r = /^u(\d+)(\.p)?$/.exec(w)
      const x = r ? made[Number(r[1]) - base] : undefined
      if (!x) return
      ;(r![2] && x.phId !== null ? x.elBoxes : x.textBoxes).push([i + 1, b])
    })
  })
  // (and each rule the claim gave an ink unit's placeholders, the element's whose glyph stands nearest it: claimInk gives a
  // placeholder a rule inside its extent, an inline fraction's bar between its numerator and its denominator)
  for (const x of made) {
    if (!x.els?.size) continue
    for (const [p, b] of x.elBoxes) {
      const B4 = inkA.pages[p - 1]!.boxes
      const cx = ((B4[4 * b] as number) + (B4[4 * b + 2] as number)) / 2
      const cy = ((B4[4 * b + 1] as number) + (B4[4 * b + 3] as number)) / 2
      let best: { boxes: [number, number][] } | null = null
      let near = Number.POSITIVE_INFINITY
      for (const e of x.els.values())
        for (const a of e.glyphs) {
          if (o.pageA[a] !== p) continue
          const g = inkA.pages[p - 1]!.glyphs[a - (m.offA[p - 1] as number)]!
          const d = Math.hypot(Math.max(g.x0 - cx, 0, cx - g.x1), Math.max(g.bottom - cy, 0, cy - g.top))
          if (d < near) {
            near = d
            best = e
          }
        }
      best?.boxes.push([p, b])
    }
  }
  for (const u of kept) {
    const content: Piece[] = []
    const x: Made = {
      unit: { id: unitId(u.kind, content), kind: u.kind, content, kept: true, fixed: true },
      text: [],
      ph: [],
      phId: null,
      turned: [],
      textBoxes: [],
      elBoxes: [],
    }
    for (const [p, g] of u.glyphs.text) if (own.glyphs[p - 1]?.[g] == null) x.text.push(global(p, g))
    made.push(x)
  }
  // (the figure texts in today's bundle's order: those it draws first, in their order, then those whose ink stays)
  const figOrder = [...fig.units.keys()].sort(
    (a, b) => (fig.units[a]!.why ? 1 : 0) - (fig.units[b]!.why ? 1 : 0) || a - b,
  )
  // (each figure text's glyphs: its level ones (global, stream order) and its turned ones ([page, index]), in today's reading's
  // order of them)
  const figText = new Map<number, number[]>()
  const figTurned = new Map<number, [number, number][]>()
  fig.glyphs.forEach((mp, i) => {
    for (const [g, k] of mp) (figText.get(k) ?? figText.set(k, []).get(k)!).push(global(i + 1, g))
  })
  fig.turned.forEach((mp, i) => {
    for (const [j, k] of mp) (figTurned.get(k) ?? figTurned.set(k, []).get(k)!).push([i + 1, j])
  })
  for (const k of figOrder) {
    const f = fig.units[k]!
    const text = (figText.get(k) ?? []).sort((a, b) => a - b)
    const turned = figTurned.get(k) ?? []
    // (its text in the runs its glyphs set in another face than its own: each a group of its own, its style its glyphs')
    const { content, styles } = figureRuns(f.text ?? '', streamOfFigure(text, turned, pages, inkA, m, o.pageA))
    const ux = f.ux ?? 1
    const uy = f.uy ?? 0
    const dir: [number, number] | undefined =
      Math.abs(ux - 1) > 1e-6 || Math.abs(uy) > 1e-6
        ? [Math.round(ux * 1e4) / 1e4, Math.round(uy * 1e4) / 1e4]
        : undefined
    // (where a translation of it may stand, as today's figure reading tells it: S.figures reads these from the part)
    const room = {
      ...(Number.isFinite(f.x) ? { x: f.x } : {}),
      ...(Number.isFinite(f.y) ? { y: f.y } : {}),
      ...(Number.isFinite(f.length) ? { length: f.length } : {}),
      ...(f.anchor ? { anchor: f.anchor } : {}),
      ...(Number.isFinite(f.before) ? { before: f.before } : {}),
      ...(Number.isFinite(f.after) ? { after: f.after } : {}),
      ...(typeof f.under === 'number' && Number.isFinite(f.under) ? { under: f.under } : {}),
    }
    made.push({
      unit: {
        id: unitId('inkfigures', content),
        kind: 'inkfigures',
        content,
        figure: { set: f.set ?? f.k, ...(dir ? { dir } : {}), ...room },
        ...(f.anchor ? { align: ALIGN_OF[f.anchor as keyof typeof ALIGN_OF] } : {}),
        ...(f.why ? { why: `figure: ${f.why}`, fixed: true as const } : {}),
      },
      text,
      ph: [],
      phId: null,
      turned,
      textBoxes: [],
      elBoxes: [],
      ...(styles.length ? { spanStyles: styles } : {}),
    })
  }
  for (const x of made) x.text.sort((a, b) => a - b)
  return {
    made,
    stats: {
      ink: ink.length,
      kept: kept.length,
      figures: fig.units.length,
      glyphs: made.reduce((n, x) => n + x.text.length + x.ph.length, 0),
    },
    block,
  }
}

/** the point the marked compile sets where TeX begins a front matter environment no author's (marks.mjs POINTS_TEX `fm<n>`) */
const FRONT_ELEMENT = /^fm\d+$/
/** the kinds of the ink units the author block takes: today's ledger's notes and orphans, and its names (rule 8) */
const BLOCK_TAKES = new Set(['inknotes', 'inkorphan', 'inknames'])
/**
 * The ink units of the author block under the title its names, and none elsewhere (the owner's ruling of 2026-11-09: the names
 * toggle governs the block under the title, whole, and nothing else). Inside it, an ink unit all of whose glyphs are the
 * block's ink is of the names (`inknames`), a note's or an orphan's of today's ledger as much as one rule 8 named; outside it, one
 * rule 8 named for an author unit's words or an echo of one (acmart's reference format, a running line printed from the same data)
 * is its ledger line's class again, the text it is
 */
function nameBlock(
  ink: TodayInkUnit[],
  ledger: { lines: unknown[] },
  inBlock: (page: number, g: number) => boolean,
): void {
  const lineCls = new Map<string, string>()
  for (const l of ledger.lines as { page: number; cls: string; gs: number[] }[])
    for (const g of l.gs) lineCls.set(`${l.page}|${g}`, l.cls)
  for (const u of ink) {
    if (!BLOCK_TAKES.has(u.kind)) continue
    const gs = [...u.glyphs.text, ...u.glyphs.ph]
    const inside = gs.length > 0 && gs.every(([p, g]) => inBlock(p, g))
    let cls = u.cls
    if (inside) cls = 'names'
    else if (u.cls === 'names') {
      const first = u.glyphs.text[0] ?? u.glyphs.ph[0]
      const was = first ? lineCls.get(`${first[0]}|${first[1]}`) : undefined
      cls = was === 'notes' ? 'notes' : 'orphan'
    }
    if (cls === u.cls) continue
    const kind = cls === 'names' ? 'inknames' : cls === 'notes' ? 'inknotes' : 'inkorphan'
    u.cls = cls
    u.kind = kind
    u.rows.unit[1] = kind
  }
}

// ---------------------------------------------------------------- a figure text's style runs
/** a figure text's glyph in its run's order: what today's figure reading read its text off (its Unicode, blank), and its style */
type FigureGlyph = { u: string; blank: boolean; style: StyleGlyph }
/** a figure text's glyphs, level and turned, in the order today's figure reading strings its text (figure-text.mjs streamOf: by
 *  show and place in it), each as it read it (the page it was given) with its style as locate reads one (A's glyph: its font's
 *  base name, size and fill); and its own glyphs as locate's style reads them, its level ones then its turned ones */
function streamOfFigure(
  text: readonly number[],
  turned: readonly [number, number][],
  pages: readonly TodayPage[],
  inkA: Doc,
  m: Mapping,
  pageA: Int32Array,
): { stream: FigureGlyph[]; own: StyleGlyph[] } {
  type Read = { u?: string; blank?: boolean; n: number; k: number }
  const at: (FigureGlyph & { n: number; k: number })[] = []
  const own: StyleGlyph[] = []
  const read = (x: Read, style: StyleGlyph) => {
    at.push({ u: x.u ?? '', blank: !!x.blank || !/\S/u.test(x.u ?? ''), style, n: x.n, k: x.k })
    own.push(style)
  }
  for (const a of text) {
    const p = (pageA[a] as number) - 1
    const g = a - (m.offA[p] as number)
    read((pages[p]!.glyphs as Read[])[g]!, inkA.pages[p]!.glyphs[g]!)
  }
  for (const [p, j] of turned)
    read((pages[p - 1]!.turned as Read[])[j]!, turnedStyleGlyph(inkA.pages[p - 1]!.turned![j]!))
  at.sort((x, y) => x.n - y.n || x.k - y.k)
  return { stream: at, own }
}

/**
 * A figure text's content, its text (today's figure reading's: its glyphs' Unicode in its run's order, NFKC, a space where
 * they stand apart, white space collapsed) in the runs its glyphs set in another face than its own: each a group of its own,
 * the style its glyphs state on A, by its piece id. Its own style is locate's (facts.ts styleOf over its glyphs: the face of most of
 * them, the first to the most where two tie); the text outside its groups is in it. Each character is its glyph's, the k-th
 * that is no white space the k-th of its glyphs' text; a space between two characters of one run is that run's, any other its
 * own. A group is named for what its face changes (LaTeX's names: `bold` or `medium`, `italic` or `upright`, the role), has no
 * source (neither `open` nor `close`), and is a label (`must`) where the run-in rule makes one (runIns): today's figure reading
 * names one face for a run of one family's faces, its first glyph's (2608.25210v2 p2: "Data Extraction Task" in
 * HelveticaNeue-Bold, ": Extract all …" in HelveticaNeue, all drawn bold), and one style read off all of them is the face of
 * most of them (all drawn regular). One face: one text, today's unit
 */
function figureRuns(
  s: string,
  { stream, own }: { stream: readonly FigureGlyph[]; own: readonly StyleGlyph[] },
): { content: Piece[]; styles: [string, Style][] } {
  const base = styleKeyOf(glyphStyleOf(own))
  const chars = [...s]
  const SPACE = /\s/u
  // (each character's glyph: its glyphs' text, white space aside, as today's textOf strings it)
  const glyphOf: (number | null)[] = []
  let q = 0
  let left = 0
  const textOf = (x: FigureGlyph) => (x.blank ? 0 : [...x.u.normalize('NFKC')].filter((c) => !SPACE.test(c)).length)
  for (const c of chars) {
    if (SPACE.test(c)) {
      glyphOf.push(null)
      continue
    }
    while (left === 0 && q < stream.length) left = textOf(stream[q++]!)
    glyphOf.push(left > 0 ? q - 1 : null)
    left--
  }
  const keyOf = glyphOf.map((g) => (g === null ? null : faceKeyOf(stream[g]!.style.base)))
  if (!keyOf.some((x) => x !== null && x !== base)) return { content: [{ t: 'text', s }], styles: [] }
  // (a space the run's on both sides of it, else its own style's)
  const key = keyOf.map((x, i) => {
    if (x !== null) return x
    let a = i - 1
    while (a >= 0 && keyOf[a] === null) a--
    let b = i + 1
    while (b < keyOf.length && keyOf[b] === null) b++
    return a >= 0 && b < keyOf.length && keyOf[a] === keyOf[b] ? (keyOf[a] as string) : base
  })
  const content: Piece[] = []
  const styles: [string, Style][] = []
  for (let i = 0; i < chars.length; ) {
    let j = i
    while (j < chars.length && key[j] === key[i]) j++
    const run = chars.slice(i, j).join('')
    if (key[i] === base) content.push({ t: 'text', s: run })
    else {
      const id = String(content.length)
      content.push({ t: 'span', id, style: changeOf(key[i] as string, base), content: [{ t: 'text', s: run }] })
      // (its style its own glyphs', at their size as locate reads a unit's: the median along the line)
      const gs = [...new Set(glyphOf.slice(i, j).filter((g): g is number => g !== null))].map((g) => stream[g]!.style)
      const { upper: _upper, ...st } = glyphStyleOf(gs)
      void _upper
      styles.push([id, { ...st, size: unitSize(gs) ?? st.size }])
    }
    i = j
  }
  return { content: runIns(content), styles }
}

// ---------------------------------------------------------------- B's marks on A
interface Carried {
  points: DocPoint[]
  paras: DocPoint[]
  paraEnds: (DocPoint & { point: number; para: number })[]
  regions: { kind: string; from: number; to: number }[]
  pictures: DocPoint[]
}

/** B's marks carried onto A's pages: a mark that stands before B glyph n stands before that glyph's partner on A (the first glyph
 *  of its page from n on that has one), else after the partner of the last one before n that has one; none where its page has
 *  no glyph with a partner. A paragraph end keeps the counts of its page's points and paragraph points before it */
export function carry(B: Doc, inkA: Doc, m: Mapping, pageA: Int32Array): Carried[] {
  const out: Carried[] = inkA.pages.map(() => ({ points: [], paras: [], paraEnds: [], regions: [], pictures: [] }))
  B.pages.forEach((pg, p) => {
    const n = pg.glyphs.length
    const o = m.offB[p] as number
    const next = new Int32Array(n + 1).fill(-1)
    for (let j = n - 1; j >= 0; j--)
      next[j] = (m.bToA[o + j] as number) >= 0 ? (m.bToA[o + j] as number) : (next[j + 1] as number)
    const prev = new Int32Array(n + 1).fill(-1)
    for (let j = 1; j <= n; j++)
      prev[j] = (m.bToA[o + j - 1] as number) >= 0 ? (m.bToA[o + j - 1] as number) : (prev[j - 1] as number)
    const at = (count: number): [number, number] | null => {
      const c = Math.max(0, Math.min(n, count))
      const a = next[c] as number
      if (a >= 0) {
        const P = pageA[a] as number
        return [P, a - (m.offA[P - 1] as number)]
      }
      const b = prev[c] as number
      if (b >= 0) {
        const P = pageA[b] as number
        return [P, b - (m.offA[P - 1] as number) + 1]
      }
      return null
    }
    // (its box count likewise: before the partner of the first box from it on that has one on its A page, else after the last
    // one before it that has one there, else the boxes before its glyph. A turned glyph's own box partners through its glyph,
    // which the alignment pairs: a label set turned stands in the stream where its show is, so a picture's end after it stays
    // after it on A where no box of the page's own comes between them, 2610.21880v1 p5's third "Overhead (%)")
    const nb = pg.kinds.length
    const bp = m.boxPage[p]
    const bi = m.boxIndex[p]
    const turnedBox = new Map<number, [number, number]>()
    ;(pg.turned ?? []).forEach((t, j) => {
      const ap = m.turnedPage[p]?.[j] ?? 0
      if (t.box < 0 || ap === 0) return
      const ab = inkA.pages[ap - 1]!.turned?.[m.turnedIndex[p]![j] as number]?.box ?? -1
      if (ab >= 0) turnedBox.set(t.box, [ap, ab])
    })
    const partnerOn = (P: number, x: number): number => {
      if (bp?.[x] === P) return bi![x] as number
      const t = turnedBox.get(x)
      return t && t[0] === P ? t[1] : -1
    }
    const boxOf = (P: number, g: number, count: number) => {
      for (let x = count; x < nb; x++) {
        const a = partnerOn(P, x)
        if (a >= 0) return a
      }
      for (let x = Math.min(count, nb) - 1; x >= 0; x--) {
        const a = partnerOn(P, x)
        if (a >= 0) return a + 1
      }
      const A = inkA.pages[P - 1]!
      return A.boxAt[g] ?? A.kinds.length
    }
    const put = (x: DocPoint): [number, DocPoint] | null => {
      const w = at(x.glyph)
      return w ? [w[0], { name: x.name, glyph: w[1], box: boxOf(w[0], w[1], x.box) }] : null
    }
    // (each A page's points and paragraph points before this B page's: a paragraph end counts its own page's)
    const ptsBefore = out.map((c) => c.points.length)
    const parasBefore = out.map((c) => c.paras.length)
    const ptPage: number[] = []
    for (const x of pg.points) {
      const w = put(x)
      ptPage.push(w ? w[0] : 0)
      if (w) out[w[0] - 1]!.points.push(w[1])
    }
    const marks = pg.marks
    if (!marks) return
    const paraPage: number[] = []
    for (const x of marks.paras) {
      const w = put(x)
      paraPage.push(w ? w[0] : 0)
      if (w) out[w[0] - 1]!.paras.push(w[1])
    }
    for (const x of marks.paraEnds) {
      const w = put(x)
      if (!w) continue
      const P = w[0]
      let point = ptsBefore[P - 1] as number
      for (let q = 0; q < x.point; q++) if (ptPage[q] === P) point++
      let para = parasBefore[P - 1] as number
      for (let q = 0; q < x.para; q++) if (paraPage[q] === P) para++
      out[P - 1]!.paraEnds.push({ ...w[1], point, para })
    }
    for (const r of marks.regions) {
      const f = at(r.from)
      const t = at(r.to)
      if (!f || !t) continue
      if (f[0] === t[0]) out[f[0] - 1]!.regions.push({ kind: r.kind, from: f[1], to: t[1] })
      else {
        out[f[0] - 1]!.regions.push({ kind: r.kind, from: f[1], to: inkA.pages[f[0] - 1]!.glyphs.length })
        out[t[0] - 1]!.regions.push({ kind: r.kind, from: 0, to: t[1] })
      }
    }
    for (const x of marks.pictures) {
      const w = put(x)
      if (w) out[w[0] - 1]!.pictures.push(w[1])
    }
  })
  return out
}

/** an A page as today's makers read one: pageInk's result for it, B's marks carried onto it, its glyphs' pictures (`pid`, a
 *  turned glyph's `pt` and `pid`) read again from those marks as pageInk reads them from its own (ink.mjs: a picture's id, its
 *  page's count of pictures opened, the innermost open) */
function pageOf(
  view: number[],
  raw: PageInk | null,
  c: Carried,
  turnedOwners: (string | null)[],
  formOf: (j: number) => { form: boolean; fid: number | undefined } | null,
  turnedForm: (boolean | null)[],
): TodayPage {
  const page = {
    view: [...view],
    points: c.points,
    paras: c.paras,
    paraEnds: c.paraEnds,
    regions: c.regions,
    pictures: c.pictures,
    turnedOwners,
  }
  if (!raw)
    return {
      ...page,
      glyphs: [],
      turned: [],
      boxes: [],
      paths: [],
      boxAt: [],
      shapes: new Map(),
      figures: new Map(),
      unseen: new Set(),
      cut: new Map(),
    }
  let glyphs: unknown[] = raw.glyphs.map((g, j) => {
    const f = formOf(j)
    if (!f || (!!g.form === f.form && (g as { fid?: number }).fid === f.fid)) return g
    const { fid: _, ...rest } = g as typeof g & { fid?: number }
    return { ...rest, form: f.form, ...(f.fid !== undefined ? { fid: f.fid } : {}) }
  })
  let turned: unknown[] = (raw.turned ?? []).map((t, j) => {
    const f = turnedForm[j]
    return f === null || f === undefined || !!t.form === f ? t : { ...t, form: f }
  })
  if (c.pictures.length) {
    const P = [...c.pictures].sort((a, b) => a.glyph - b.glyph)
    let seq = 0
    const stack: number[] = []
    const apply = (x: DocPoint) => {
      if (x.name === 'zs') stack.push(++seq)
      else if (x.name === 'ze') stack.pop()
    }
    let q = 0
    glyphs = (glyphs as typeof raw.glyphs).map((g, i) => {
      while (q < P.length && (P[q] as DocPoint).glyph <= i) apply(P[q++] as DocPoint)
      const { pid: _, ...rest } = g as typeof g & { pid?: number }
      return stack.length ? { ...rest, pid: stack.at(-1) } : rest
    })
    turned = (turned as NonNullable<typeof raw.turned>).map((t) => {
      seq = 0
      stack.length = 0
      let pt = 0
      // (a point before it: before the level glyphs it follows, or at their count and before its own box)
      for (const x of P)
        if (x.glyph < t.at || (x.glyph === t.at && (t.box < 0 || x.box <= t.box))) {
          apply(x)
          pt++
        }
      const { pid: _, ...rest } = t as typeof t & { pid?: number }
      return { ...rest, pt, ...(stack.length ? { pid: stack.at(-1) } : {}) }
    })
  }
  return {
    ...page,
    glyphs,
    turned,
    boxes: raw.boxes,
    paths: raw.paths ?? [],
    boxAt: raw.boxAt,
    shapes: raw.shapes ?? new Map(),
    figures: raw.figures ?? new Map(),
    unseen: raw.unseen ?? new Set(),
    cut: raw.cut ?? new Map(),
  }
}

// ---------------------------------------------------------------- today's pieces and the format's
const ENCODER = new TextEncoder()
const UTF8 = new TextDecoder('utf-8')
/** a text as today's front end holds a source's: its UTF-8 bytes read latin1 (ink-units.mjs sourceView) */
export function latin1View(s: string): string {
  const b = ENCODER.encode(s)
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return out
}
/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode; one already wide as it is (pipeline/instrument.mjs:28
 *  unicodeOf, ported) */
export function unicodeOf(s: unknown): string {
  if (typeof s !== 'string') return ''
  let ascii = true
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c > 0x7f) ascii = false
  }
  if (ascii) return s
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return UTF8.decode(b)
}
/** a unit's content as today's flat pieces (the makers read a source unit so): an element with the kind the instrument states */
export function flatOf(content: readonly Piece[], out: TodayPiece[] = []): TodayPiece[] {
  for (const p of content) {
    if (p.t === 'text') out.push({ t: 'text', s: latin1View(p.s) })
    else if (p.t === 'el') out.push({ t: 'ph', src: latin1View(p.src ?? ''), kind: p.kind })
    else if (p.t === 'unit') out.push({ t: 'nested' })
    else {
      if (p.open !== undefined) out.push({ t: 'open', src: latin1View(p.open) })
      flatOf(p.content, out)
      if (p.close !== undefined) out.push({ t: 'close', src: latin1View(p.close) })
    }
  }
  return out
}
/** the first element of a content, depth first (today's first `ph` piece) */
function firstEl(content: readonly Piece[]): string | null {
  for (const p of content) {
    if (p.t === 'el') return p.id
    if (p.t === 'span') {
      const x = firstEl(p.content)
      if (x !== null) return x
    }
  }
  return null
}
/** a group's style, read off its command (pipeline/instrument.mjs:43-52, ported) */
const SPAN_STYLES: [RegExp, string][] = [
  [/^\\(?:textbf|bfseries|bf|mathbf|boldsymbol)\b/, 'bold'],
  [/^\\(?:textit|itshape|it|emph|em|textsl|slshape|sl)\b/, 'italic'],
  [/^\\(?:texttt|ttfamily|tt|verb|lstinline)\b/, 'mono'],
  [/^\\(?:textsc|scshape)\b/, 'sc'],
  [/^\\(?:href|url|hyperlink|hyperref)\b/, 'link'],
  [/^\\(?:textcolor|color|colorbox)\b/, 'colour'],
  [/^\\(?:underline|uline)\b/, 'underline'],
]
export const groupStyleOf = (src: string) =>
  SPAN_STYLES.find(([re]) => re.test((src ?? '').trimStart()))?.[1] ?? 'other'
/** today's flat pieces ([open … close] pairs) as the format's nested ones (pipeline/instrument.mjs:56-82 contentOf, ported; an ink
 *  unit's pieces hold no nested unit): an element's kind today's classOf's, `other` for none; its run-in labels `must` */
export function contentOf(pieces: readonly TodayPiece[]): Piece[] {
  let level: Piece[] = []
  const stack: { outer: Piece[]; span: Extract<Piece, { t: 'span' }> }[] = []
  pieces.forEach((p, k) => {
    const id = String(k)
    switch (p.t) {
      case 'text':
        level.push({ t: 'text', s: unicodeOf(p.s) })
        break
      case 'ph':
        level.push({ t: 'el', id, kind: classOf(p) ?? 'other', src: unicodeOf(p.src) })
        break
      case 'open': {
        const style = groupStyleOf(unicodeOf(p.src))
        const span: Extract<Piece, { t: 'span' }> = {
          t: 'span',
          id,
          style,
          ...(style === 'link' ? { must: 1 as const } : {}),
          open: unicodeOf(p.src),
          content: [],
        }
        level.push(span)
        stack.push({ outer: level, span })
        level = span.content
        break
      }
      case 'close': {
        const top = stack.pop()
        if (top) {
          top.span.close = unicodeOf(p.src)
          level = top.outer
        } else level = [{ t: 'span', id, style: 'other', close: unicodeOf(p.src), content: level }]
        break
      }
      default:
        throw new Error(`a piece an ink unit does not make (${String(p.t).slice(0, 20)})`)
    }
  })
  // (its run-in labels `must`, as the source units': marks/run-ins.ts)
  return runIns(stack.length ? stack[0]!.outer : level)
}
/** an ink unit's colour group's open as its rule writes it (today/ink-units.mjs groupsOf: the fill its glyphs hold), in xcolor's
 *  HTML model, which names a colour by its red, green and blue, two hexadecimal digits each */
const HTML_COLOUR = /^\\textcolor\[HTML\]\{([0-9A-Fa-f]{6})\}\{$/
/** each group's command, the fill its colour group's run is set in, and a link group's target, by its open piece's id
 *  (pipeline/instrument.mjs:187-219 commandOf, spansOf, ported). A source unit's colour group states the fill TeX set its run in,
 *  read off the marked compile's log; an ink unit has no log, and its colour group's source names that fill itself, the one its
 *  glyphs hold on A: stated so, as a source unit's (2609.36054v2 p1's grey e-mails, drawn in their note's black with none) */
export function spansOf(pieces: readonly TodayPiece[]): [string, SpanClass][] {
  const out: [string, SpanClass][] = []
  pieces.forEach((p, k) => {
    if (p.t !== 'open') return
    const src = unicodeOf(p.src)
    const m = /^\\([A-Za-z]+\*?)/.exec(src)
    const to = linkTargetOf(pieces, k)
    const rgb = HTML_COLOUR.exec(src)?.[1]
    if (m)
      out.push([
        String(k),
        { cmd: m[1]!, ...(rgb !== undefined ? { colour: Number.parseInt(rgb, 16) } : {}), ...(to ? { to } : {}) },
      ])
  })
  return out
}
/**
 * The target a link group's source names (SpanClass.to, the part's SpanAt.to), by today's reading of it (layer-proto/links.mjs
 * linkKindOf and urlOf, the match's url and name tiers): an \href's address, its first argument with TeX's escapes undone (`\#`,
 * `\%`, `\_`, `\&`, `\~`, `\$`), or a \url's, its text as written, each in the WHATWG URL parser's form; a \hyperlink's
 * destination, its name, as the part states a named destination (PDF.js's dest as JSON, Link.to). None for any other group, a
 * \hyperref (its destination is its label's anchor, which TeX names), an address that is no absolute URL, and one the source
 * writes with a command or a group (only TeX expands it). `pieces` a unit's flat pieces (today's, strings as today's engine holds
 * them), `k` the group's open.
 */
export function linkTargetOf(
  pieces: readonly { t: string; s?: string; src?: string }[],
  k: number,
): { url: string } | { dest: string } | undefined {
  const open = unicodeOf(pieces[k]?.src)
  const href = /^\\href\*?\s*(?:\[[^\]]*\]\s*)?\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(open)
  const url = href
    ? href[1]!.replace(/\\([#%_&~$])/g, '$1')
    : /^\\url\*?\s*\{\s*$/.test(open)
      ? textOfGroup(pieces, k)
      : null
  if (url !== null) {
    if (/[\\{}]/.test(url)) return undefined
    try {
      return { url: new URL(url).href }
    } catch {
      return undefined
    }
  }
  const name = /^\\hyperlink\s*\{([^{}\\]*)\}/.exec(open)?.[1]?.trim()
  return name ? { dest: JSON.stringify(name) } : undefined
}
/** the text of the group opened at `k`, where it holds text alone up to its close (null where it holds anything else, or
 *  runs to the unit's end) */
function textOfGroup(pieces: readonly { t: string; s?: string }[], k: number): string | null {
  let s = ''
  for (let j = k + 1; j < pieces.length; j++) {
    const p = pieces[j]!
    if (p.t === 'close') return s
    if (p.t !== 'text') return null
    s += unicodeOf(p.s)
  }
  return null
}
