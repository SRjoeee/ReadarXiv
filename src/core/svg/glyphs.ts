// Text inside an SVG figure, recovered exactly (DESIGN §15.5, issue #121).
//
// arXiv's SVG figures carry no `<text>`: every character is an outline, drawn by a `<use>` that
// points at a glyph in `<defs>`. What makes them readable anyway is that each of those `<use>`
// elements is annotated with the character it draws, so the text is *read*, not recognised — the
// error rate is zero rather than whatever OCR would get wrong. Measured over 58045 glyphs in 316
// distinct figures, `data-text` is present on every one that is a glyph (DESIGN §15.5).
//
// The output is `OcrLine[]`, the same shape the recogniser of bitmaps returns, so everything downstream —
// `linesToBoxes`, the translate call, the overlay — is shared with the bitmap path and knows
// nothing about where the lines came from.
//
// **Read-only.** Nothing here writes to the embedded document. The overlay is built in the main
// document from normalised coordinates, which works because a figure's `viewBox` maps linearly onto
// its `<object>` element box (measured to four decimal places, DESIGN §15.5). §7.1's DOM invariant and
// `restore()` are untouched, and there is no second document to define restore semantics for.

import type { OcrLine, Quad } from '@/shared/ocr'

/** One glyph: what it draws, where, how big, and which way up. */
interface Glyph {
  text: string
  /** Position along the baseline direction, in viewBox units */
  along: number
  /** Position across it — glyphs of one line share this */
  across: number
  size: number
  /** Radians, from the transform matrix. Only 0 and -π/2 occur in the corpus. */
  angle: number
  /** The id of the outline in `<defs>` that draws it */
  outline: string
}

/** A run of glyphs sharing a baseline: one label, one tick, one line of a listing. */
export interface GlyphRun {
  text: string
  angle: number
  size: number
  /** Interval along the baseline, in viewBox units */
  from: number
  to: number
  /** Baseline position across, in viewBox units */
  across: number
  glyphs: number
}

/**
 * A gap wider than this many font sizes ends the run.
 *
 * Relative to the font size, not to an advance estimated from the run: advances vary enormously in
 * a proportional face, and a median taken over a few narrow letters breaks `wall time` after
 * `wall tim` because `m` is wide. Measured on the fixtures, gaps on a shared baseline fall into
 * three clearly separated regimes:
 *
 * | | |
 * |---|---|
 * | an ordinary advance | ~0.55 |
 * | a dropped space (one advance too many) | ~1.10 |
 * | an actual break between two labels | ≥ 3.86 |
 *
 * and the widest gap inside any run across both fixtures is 1.19. Anything in (1.2, 3.8) separates
 * them; 1.5 sits there with room on both sides.
 *
 * A dropped space therefore stays inside its run, which is what should happen — the fix for it is
 * to put the space back, not to cut the line in half, and that needs a per-run advance estimate
 * (DESIGN §15.5). Out of scope while code figures are skipped, and the failure it would
 * cause here is benign anyway: two very close ticks merging into `0.20.4`, which is numeric and
 * never reaches a translator.
 */
const RUN_BREAK = 1.5

/**
 * In a figure that draws **no space glyph**, this much air between the ink of two glyphs, in font sizes, is a space.
 *
 * A figure made by TeX — pgfplots, TikZ compiled on its own, matplotlib under `usetex` — has none: to TeX a space is
 * glue, not a character, and the converter can only write down the glyphs there are. Every label of such a figure
 * arrived as one glued word (`CameraRepairManagementSystemReplication`), which an engine gives back unchanged, and a
 * translation equal to its source draws nothing: the reader saw the title and an axis left in English (reported on
 * 2607.24653v2, where 2 of the 11 figures are such; the 7.28 % of glyphs that are spaces (§15.5) is the corpus's
 * average, not every file's).
 *
 * The air is measured between **outlines**, which the file holds in the font's own unit square, not between origins:
 * an advance says nothing without the letter's width (`m` is four `i`s wide). Measured on the two figures, 269 pairs
 * on a shared baseline:
 *
 * | | |
 * |---|---|
 * | letters of one word | ≤ 0.20 (side bearings; the widest a `1.`) |
 * | a word gap | ≥ 0.26 in a sans face, ≥ 0.30 in Computer Modern |
 *
 * **Only where no space is drawn.** A figure that draws its spaces is exact as it stands.
 *
 * **And not in a fixed-pitch face**, where air says nothing: every glyph stands in a cell of one width, a full stop
 * in as much as an `m`. Read by air, the listing fixture with its space glyphs deleted came out `self . cms` and
 * `kwlist [ ]` — 81 spaces where none was drawn, though not one inside a word (Codex on #274). There a space is a
 * **skipped cell**, which is exact: all 122 of the fixture's own come back that way and none is added, and the ones
 * its syntax colouring dropped come back with them, their cells being there, empty (`staticint` → `static int`).
 */
const WORD_GAP = 0.22

/**
 * How far from a whole number of cells an advance may be and the face still be fixed-pitch, in font sizes, and how
 * many advances it takes to say so. Measured on five figures: the listing's face strays 0.033 at its worst over 737
 * advances (the coordinates are rounded), and the worst of each of the 14 proportional faces is 0.25 to 0.37
 */
const CELL_TOLERANCE = 0.05
const CELL_EVIDENCE = 8

/**
 * Decomposes `transform="matrix(a,b,c,d,e,f)"`.
 *
 * The size is `hypot(a,b)` and the angle `atan2(b,a)` — **not** `a`, which is only the size when
 * the glyph is upright. Reading `a` puts every rotated axis label at size 0 and loses its
 * orientation, and 8.95% of glyphs in the surveyed figures are rotated.
 */
function decompose(transform: string | null): { x: number; y: number; size: number; angle: number } | undefined {
  const m = /matrix\(([^)]*)\)/.exec(transform ?? '')
  if (!m) return undefined
  const parts = m[1]!.split(/[\s,]+/).map(Number)
  if (parts.length < 6 || parts.some(n => !Number.isFinite(n))) return undefined
  const [a, b, , , e, f] = parts as [number, number, number, number, number, number]
  const size = Math.hypot(a, b)
  if (size <= 0) return undefined
  return { x: e, y: f, size, angle: Math.atan2(b, a) }
}

/**
 * Whether anything between this glyph and the figure's root carries a transform of its own.
 *
 * A glyph's own matrix is relative to its parent's coordinate system, so a transformed ancestor
 * would make every number derived from it — baseline, angle, size, position — wrong. Measured over
 * every fetchable file in the corpus (276 files, 54344 glyphs): **not one glyph has one**. Grouping
 * itself is common — 21.1% of glyphs sit below the root, nested up to four deep — so the safe
 * statement is not "the converter emits a flat tree" but "it puts the whole transform on the glyph"
 * (Codex asked about the composition on #133).
 *
 * Skipping rather than composing: composition would be untested code for a case that does not occur,
 * and a label placed from a matrix that is missing half its transform lands somewhere arbitrary on
 * the figure. Dropping the run leaves it untranslated, which is the failure the reader can see past.
 */
function underTransformedAncestor(use: Element, root: Element): boolean {
  for (let node = use.parentElement; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute('transform')) return true
  }
  return false
}

/** Glyphs in document order, projected onto their own baseline. */
function glyphsOf(svg: Element): Glyph[] {
  const out: Glyph[] = []
  for (const use of Array.from(svg.querySelectorAll('use[data-text]'))) {
    const text = use.getAttribute('data-text')
    // Entities in the attribute are already decoded by the parser; an empty one draws nothing
    if (text === null || text === '') continue
    if (underTransformedAncestor(use, svg)) continue
    const t = decompose(use.getAttribute('transform'))
    if (!t) continue
    const cos = Math.cos(t.angle)
    const sin = Math.sin(t.angle)
    out.push({
      text,
      along: t.x * cos + t.y * sin,
      across: -t.x * sin + t.y * cos,
      size: t.size,
      angle: t.angle,
      outline: (use.getAttribute('xlink:href') ?? use.getAttribute('href') ?? '').replace(/^#/, ''),
    })
  }
  return out
}

/** Whether a glyph belongs on the baseline a run is already sitting on. */
function sameLine(run: { angle: number; size: number; across: number }, g: Glyph): boolean {
  if (Math.abs(run.angle - g.angle) > 1e-6) return false
  if (Math.abs(run.size - g.size) > 1e-6) return false
  // Superscripts and subscripts have their own baseline, and separating them is correct: `10` and
  // `15` of a `10^15` tick are not one word
  return Math.abs(run.across - g.across) <= 0.05 * g.size
}

const PATH_COMMAND = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g
const PATH_NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/**
 * How far an outline reaches along the baseline, in font sizes, read from its path data alone — no layout, and the
 * same under happy-dom. The converter writes absolute commands only (M L H V C Z over 260 outlines in five files):
 * every pair's first number is an x, `H` holds nothing but, `V` none. A curve's control points stand in for the
 * curve, which they bound. Anything else — a relative command, an arc — and the outline is not read, its glyph
 * taking no part in the measure
 */
function reachOf(d: string): { from: number; to: number } | undefined {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const [, command, args] of d.matchAll(PATH_COMMAND)) {
    if (command === 'Z' || command === 'z' || command === 'V') continue
    if (!'MLHCSQT'.includes(command!)) return undefined
    const numbers = (args!.match(PATH_NUMBER) ?? []).map(Number)
    for (let i = 0; i < numbers.length; i += command === 'H' ? 1 : 2) {
      from = Math.min(from, numbers[i]!)
      to = Math.max(to, numbers[i]!)
    }
  }
  return from <= to ? { from, to } : undefined
}

/**
 * Every outline's reach by the id a glyph names, read once per figure and only for a figure whose spaces are gaps.
 *
 * The converter writes an outline in one of two forms, by the kind of font and not by who made the figure: a Type 1
 * face as `<path id>` in the unit square, a TrueType one as `<g id><path transform="matrix(.001,0,0,.001,0,0)">` in
 * font units under a scale (the plot fixture is all of the second form; Codex and Devin on #274). So the id may be the
 * path's or its group's, and a path's own matrix scales and shifts its reach. A matrix that turns or shears the
 * outline has no reach along the baseline to speak of, and is left out
 */
function outlinesOf(svg: Element): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>()
  for (const path of Array.from(svg.querySelectorAll('defs path'))) {
    const id = path.id || path.parentElement?.id
    const reach = reachOf(path.getAttribute('d') ?? '')
    if (!id || !reach) continue
    const [a = 1, b = 0, c = 0, , e = 0] = /matrix\(([^)]*)\)/.exec(path.getAttribute('transform') ?? '')?.[1]?.split(/[\s,]+/).map(Number) ?? []
    if (b !== 0 || c !== 0 || !(a > 0)) continue
    const from = reach.from * a + e
    const to = reach.to * a + e
    // A glyph drawn by several paths reaches as far as they do together
    const so = out.get(id)
    out.set(id, so ? { from: Math.min(so.from, from), to: Math.max(so.to, to) } : { from, to })
  }
  return out
}

/** The face a glyph is set in: the converter names an outline `font_<face>_<glyph>` (all five files read) */
const faceOf = (outline: string): string => outline.slice(0, outline.lastIndexOf('_'))

/**
 * The cell width of every fixed-pitch face in the figure, in font sizes: a face whose every advance — origin to
 * origin, between two glyphs that follow each other on one line — is a whole number of cells, the cell being the
 * median advance (the smallest carries the rounding of one pair into every other). A proportional face fails on its
 * second letter (`i` 0.28, `m` 0.83); too few advances to tell, and the face is taken for proportional, which a face
 * in a figure nearly always is. A face that draws only digits passes, digits being of one width in any face: a
 * number holds no space, and read by cells none is put into one
 */
function cellsOf(glyphs: readonly Glyph[]): Map<string, number> {
  const advances = new Map<string, number[]>()
  for (let i = 1; i < glyphs.length; i++) {
    const before = glyphs[i - 1]!
    const g = glyphs[i]!
    const advance = (g.along - before.along) / before.size
    if (!sameLine({ angle: before.angle, size: before.size, across: before.across }, g) || advance <= 0 || advance > RUN_BREAK) continue
    const face = faceOf(before.outline)
    advances.set(face, [...(advances.get(face) ?? []), advance])
  }
  const cells = new Map<string, number>()
  for (const [face, seen] of advances) {
    if (seen.length < CELL_EVIDENCE) continue
    const cell = [...seen].sort((a, b) => a - b)[Math.floor(seen.length / 2)]!
    if (seen.every(advance => Math.abs(advance - Math.max(1, Math.round(advance / cell)) * cell) <= CELL_TOLERANCE)) cells.set(face, cell)
  }
  return cells
}

/**
 * Glyphs to runs.
 *
 * The converter emits every glyph as a direct child of `<svg>` with no grouping whatsoever — one
 * figure is a flat list where ticks, axis titles and legend entries run together as
 * `"110100Number of terms N1015…"`. Document order within a run is exact, including the
 * spaces where they are glyphs of their own; where the figure draws none they are put back from
 * the air between two outlines (`WORD_GAP`). What is left to recover is where one run ends.
 */
export function runsOf(svg: Element): GlyphRun[] {
  const runs: GlyphRun[] = []
  let current: GlyphRun | undefined
  let last: Glyph | undefined
  const glyphs = glyphsOf(svg)
  const gaps = !glyphs.some(g => g.text === ' ')
  const outlines = gaps ? outlinesOf(svg) : undefined
  const cells = gaps ? cellsOf(glyphs) : undefined
  /** Whether the figure left a space between the glyph before and this one: a skipped cell in a fixed-pitch face, air between the outlines in any other */
  const spaceBefore = (g: Glyph): boolean => {
    if (!last || !outlines || !cells) return false
    const cell = cells.get(faceOf(last.outline))
    if (cell !== undefined) return (g.along - last.along) / last.size >= 1.5 * cell
    const before = outlines.get(last.outline)
    const after = outlines.get(g.outline)
    if (!before || !after) return false
    return g.along + after.from * g.size - (last.along + before.to * last.size) >= WORD_GAP * g.size
  }

  for (const g of glyphs) {
    const gap = current ? g.along - current.to : 0
    if (current && sameLine(current, g) && gap >= 0 && gap <= RUN_BREAK * current.size) {
      current.text += spaceBefore(g) ? ` ${g.text}` : g.text
      current.to = g.along
      current.glyphs++
      last = g
      continue
    }
    if (current) runs.push(current)
    current = { text: g.text, angle: g.angle, size: g.size, from: g.along, to: g.along, across: g.across, glyphs: 1 }
    last = g
  }
  if (current) runs.push(current)
  return runs
}

/** The figure's user-unit box, from `viewBox` or the width/height pair it usually matches. */
export function viewBoxOf(svg: Element): { x: number; y: number; w: number; h: number } | undefined {
  const raw = svg.getAttribute('viewBox')
  if (raw) {
    const [x, y, w, h] = raw.trim().split(/[\s,]+/).map(Number)
    if ([x, y, w, h].every(n => Number.isFinite(n)) && w! > 0 && h! > 0) return { x: x!, y: y!, w: w!, h: h! }
  }
  const w = Number.parseFloat(svg.getAttribute('width') ?? '')
  const h = Number.parseFloat(svg.getAttribute('height') ?? '')
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { x: 0, y: 0, w, h }
  return undefined
}

/**
 * How far off horizontal a run may sit and still be treated as upright.
 *
 * Upright is not just a layout: an upright line may be **merged** with the line above it
 * (`linesToBoxes`), which is what puts a wrapped label back together. Real data reaches this
 * tolerance — 17 runs in the corpus sit within 1e-4° of horizontal without being exactly
 * horizontal — and letting a residual of a thousandth of a degree through once drew a horizontal
 * label as a tall narrow strip (Codex on #134).
 *
 * Everything else keeps **its own angle**, and the overlay places it along its own axis (§15.5).
 * That is new: v1 accepted only the two quarter turns and dropped the rest, which over the sampled
 * set was 1.160% of glyphs across 42 angles — and on 2609.10326v1 it was `reheating` (6°) and
 * `radiation domination` (5°), the two annotations that carry the figure (reported 2026-09-11).
 * The old reason for dropping them was real but was a property of the overlay, not of the angle:
 * a label described by its axis-aligned bounding box only *is* that box at a quarter turn. Now the
 * label carries its own length and thickness instead (`len` / `thick`), so any angle can be drawn.
 */
const UPRIGHT_TOLERANCE = 0.02

/** The run's angle, or 0 when it is within a rounding error of horizontal */
function drawAngle(angle: number): number {
  const quarters = angle / (Math.PI / 2)
  // Just below horizontal `Math.round` yields `-0`; normalising it away keeps upright exactly 0,
  // which is what every consumer downstream tests for
  return Math.abs(quarters) < UPRIGHT_TOLERANCE ? 0 : angle
}

/**
 * A run's four corners in the figure's own coordinates, before normalising.
 *
 * The box is the text's own: `from`..`to` along the baseline plus one advance for the last glyph,
 * and `size` tall sitting above the baseline. For an upright run that is the familiar box; for a
 * rotated one it is rotated with the text, which is what keeps a vertical axis label from claiming
 * a wide horizontal strip of the plot.
 */
function cornersOf(run: GlyphRun): [number, number][] {
  const cos = Math.cos(run.angle)
  const sin = Math.sin(run.angle)
  // The last glyph's own width is not recorded; a nominal width stands in. 0.70 em was measured: the white box has to
  // cover the source text it translates, and at 0.55 em a label ending in a capital showed about 0.7% of the figure width
  // (`training cost C`); 0.70 brings it to 0.09% (sub-pixel), and going up to 0.80 improves nothing and only makes the box of a narrow ending stick out more
  const end = run.to + 0.7 * run.size
  const top = run.across - run.size * 0.78
  const bottom = run.across + run.size * 0.22
  const at = (along: number, across: number): [number, number] => [along * cos - across * sin, along * sin + across * cos]
  return [at(run.from, top), at(end, top), at(end, bottom), at(run.from, bottom)]
}

/**
 * Runs as `OcrLine`s in normalised coordinates, ready for `linesToBoxes`.
 *
 * `conf` is 1 because the text was read rather than recognised — there is nothing to be uncertain
 * about. `linesToBoxes` filters on confidence for the OCR path; here it never removes anything.
 */
export function linesOf(svg: Element): OcrLine[] {
  const box = viewBoxOf(svg)
  if (!box) return []
  const out: OcrLine[] = []
  for (const run of runsOf(svg)) {
    const angle = drawAngle(run.angle)
    // The corners keep the run's true angle: the box is then the text's own, and the axis-aligned
    // bounds taken downstream cover it whichever way the residual leans
    const quad = cornersOf(run).map(([x, y]) => [(x - box.x) / box.w, (y - box.y) / box.h] as [number, number])
    // An upright run carries no angle at all, exactly the shape the OCR backend produces
    if (angle === 0) {
      out.push({ text: run.text, quad: quad as Quad, conf: 1 })
      continue
    }
    // A tilted run also carries its own box, both axes measured against the figure's width so the
    // overlay can lay it out along the text's own direction (§15.5)
    const len = (run.to - run.from + 0.7 * run.size) / box.w
    const thick = run.size / box.w
    out.push({ text: run.text, quad: quad as Quad, conf: 1, angle, len, thick })
  }
  return out
}
