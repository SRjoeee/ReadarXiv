// The typesetting rule chosen on 2026-10-01 — Flow, even, with option A in steps for CJK — as two steps a reader's
// compiles go through (records/typesetting.md in experiments/pdf-bilingual; the engineers' notes in
// experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md):
//   previewTypesetting — from the original's probes and the translation's text: one type for the paper, each unit's
//     leading along the original's flow, each float held to its original's page; the preview compile is set with it;
//   finalTypesetting — from what that preview measured: the preview's type kept, each unit's leading set again from its
//     measured height and corrected where the preview's text stood, again after each forced break, and for CJK a late
//     stretch at a smaller face; the final compile is set with it.
// Pure: no compile, no file, no clock. Each returns `typeset`, which live.mjs translationFiles takes with the strategy
// the plan was made for (type.mjs designFor: a strategy sets the knobs it has; the chain moving on makes the plan again).
import { latin1 } from '../latex-front.mjs'
import { scriptOf } from '../scripts.mjs'
import { citeStyleOf, measureUnits, readSizeProbe, readWidthProbe } from './density.mjs'
import { flowType } from './flow.mjs'
import { columnOf, drifts } from './places.mjs'
import { completeLog, readForced, readLines, typesetting } from './tex.mjs'
import { designFor, heightAtSize, solveType, unitHeights } from './type.mjs'

/** The rule's parameters, each as the round of 34 chose it (records/typesetting.md) */
export const FLOW = {
  /** the window of the original's lines a unit's leading follows, and the lines a drift is taken back over */
  window: 46, horizon: 50,
  /** a preview reading is the median of this many; one is taken only past this many lines of the paper's leading */
  span: 5, snap: 8,
  /** what is taken back moves a unit's leading at most this fraction from the window's */
  rate: 0.05,
  /** CJK: a segment late by itself by more than these lines at the floor, its late stretch at one of these faces */
  faceLines: 3, faces: [0.975, 0.95],
  /** a table no taller than its original, never below this share of its width */
  tableMin: 0.85,
}

const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1]

/**
 * The preview's typesetting. `paper` openPaper's; `translated` Map(unit → pieces), the whole translation; `lang` its
 * target; `strategy` the one the compile sets it with (scripts.mjs strategiesFor), whose knobs the type is solved with;
 * `fonts` readFontProbe of the font probe's log; `fontLog` that log, the font probe compiled with its width and size
 * probes (live.mjs probeFiles `{ width: true }`); `original` { log, marks }: the original compiled with its line probes
 * (originalFiles `{ lines: true }`) and its marks (places.mjs marksOf). Returns `typeset` for the preview's
 * translationFiles, and `state`, which finalTypesetting takes — or, where an input the plan needs is missing or partial,
 * `typeset` null and what was `missing`: the translation is then set as it is today (translationFiles without one),
 * never from a part of its measures. Each input, and how it is told whole:
 *   a design for the target's script under the strategy (type.mjs designFor): there are knobs to set;
 *   the original's log: its last pass reached the document's end (tex.mjs completeLog) — a compile that stopped short
 *     reads lines for part of the paper — and the original's marks: there are unit marks, and every page's columns;
 *   the font probe's width probe (density.mjs readWidthProbe), which the density is measured by; for a face of fixed
 *     sizes, its size probe (readSizeProbe), which the type is chosen among;
 *   a translated unit whose original the line probes measured: of none, the type solved is the design's smallest.
 * The translation itself may be part of the paper: a progressive preview plans what it has.
 */
export function previewTypesetting({ paper, translated, lang, strategy, fonts, fontLog, original }) {
  const { units, fsys } = paper, script = scriptOf(lang), design = designFor(script, strategy)
  const read = re => fsys.list().filter(f => re.test(f)).map(f => latin1(fsys.read(f))).join('\n')
  const byIndex = new Map(units.map((u, i) => [i, translated.get(u)]).filter(([, pieces]) => pieces))
  const lo = readLines(original?.log), sizes = readSizeProbe(fontLog), probe = readWidthProbe(fontLog)
  const list = design && probe ? measureUnits({ units, translated: byIndex, lines: lo, fonts, probe, citeStyle: citeStyleOf(read(/\.(tex|sty|cls)$/i), read(/\.bbl$/i)), script }) : []
  const missing = !design ? `a design for ${script}` : !completeLog(original?.log) ? "the original's log, whole" : !whole(original?.marks) ? "the original's marks, every page's columns read"
    : !probe ? 'the width probe' : !design.cjk && !design.scalable && !sizes ? 'the size probe' : !list.length ? 'a translated unit the original measured' : null
  if (missing) return { typeset: null, type: null, state: null, missing }
  const type = solveType(list, design, sizes)
  const leads = flowType(list, design, unitHeights(list, design, type), { window: FLOW.window, horizon: FLOW.horizon, rate: FLOW.rate }).leads
  // each caption's float waits for its original's page and column (tex.mjs FLOAT_TEX)
  const om = original.marks, floatsAt = new Map()
  units.forEach((u, i) => { const m = om.marks.get(`${i}s`); if (u.kind === 'caption' && m) floatsAt.set(i, { page: m.page + 1, col: columnOf(om, m) }) })
  const state = { units, translated, design, strategy: strategy.name, type, list, lo, floatsAt, original, leads }
  state.typeset = typesettingOf(state, type, leads, new Map())
  return { typeset: state.typeset, type, state, missing: null }
}
/** the original's marks with something to read: unit marks, and every page's columns, which both documents' places are
 *  read on (places.mjs) */
const whole = m => !!m?.marks.size && m.columns.length === m.pages && m.columns.every(c => c > 0)

/**
 * The final's typesetting, from the preview `state` and what the preview compile gave: `preview` { log, marks } — its
 * log (line probes, forced breaks) and its marks (places.mjs marksOf). The type stays the preview's: each unit's height
 * is what the preview measured, and only its leading moves, which breaks no line again. Solved again from the preview's
 * measured density, a type that changed the size, the glue or the face broke lines no prediction could follow (Korean
 * 2608.18090 a page more, Chinese 2608.23586 a page fewer; on the papers the rule was not tuned on, 11 of 13 pages equal
 * and start drift 0.136 against 12 and 0.105 kept). Returns `typeset` for the final's translationFiles; the type, each
 * unit's leading and face, and the flow's trace (flow.mjs flowType). Where the preview's measurement is missing or
 * partial — its log not whole (tex.mjs completeLog), its marks missing, no unit it measured — the final is set as the
 * preview was, uncorrected (`missing` says why): that plan had every input it needs. With no plan (`state` null), none.
 */
export function finalTypesetting(state, preview) {
  if (!state) return { typeset: null, type: null, leads: new Map(), faces: new Map(), trace: [], missing: 'a plan' }
  const { design, type, list } = state, cjk = design.cjk
  const lines = readLines(preview?.log), got = list.filter(u => lines.get(u.i))
  const missing = !completeLog(preview?.log) ? "the preview's log, whole" : !preview?.marks?.marks.size ? "the preview's marks" : !got.length ? 'a unit the preview measured' : null
  if (missing) return { typeset: state.typeset, type, leads: state.leads, faces: new Map(), trace: [], missing }
  // each unit's height at leading one as the preview set it: its measured lines at the type's size
  const heights = new Map(got.map(u => [u.i, lines.get(u.i).lines * (cjk ? 1 : type.size) * u.bs])), cu = new Map(list.map(u => [u.i, u]))
  const measured = {
    drift: drifts(state.original.marks, preview.marks), preview: new Map(got.map(u => [u.i, lines.get(u.i).lines * lines.get(u.i).bs])),
    span: FLOW.span, snap: FLOW.snap * (median(got.map(u => u.bs)) ?? 12), breaks: readForced(preview.log),
  }
  const shrink = cjk ? { steps: FLOW.faces, lines: FLOW.faceLines, heightAt: (i, f) => (heights.get(i) * heightAtSize(cu.get(i), design, type, f)) / heightAtSize(cu.get(i), design, type, 1) } : null
  const flow = flowType(got, design, heights, { window: FLOW.window, horizon: FLOW.horizon, measured, rate: FLOW.rate, shrink })
  return { typeset: typesettingOf(state, type, flow.leads, flow.sizes), type, leads: flow.leads, faces: flow.sizes, trace: flow.trace, missing: null }
}

// the plan tex.mjs typesetting takes: each unit's leading as \axtlead@ takes it — × its own size, so its original's
// leading over its size — and the sizes: an alphabet's type size (CJK's under CJKutf8) on every translated unit that
// flows (paragraphs, captions and notes through their marks, a figure's text through its group), the faces a CJK flow set
function typesettingOf(state, type, leads, faces) {
  const { units, translated, design, strategy, lo, floatsAt } = state, cjk = design.cjk
  const factors = new Map([...leads].filter(([i]) => lo.get(i)?.size).map(([i, l]) => [i, (l * lo.get(i).bs) / lo.get(i).size]))
  const sizes = new Map(faces)
  if (!cjk) units.forEach((u, i) => { if (translated.has(u) && ((u.kind !== 'heading' && u.kind !== 'cell' && u.kind !== 'figure' && u.kind !== 'author' && !u.front) || (u.kind === 'figure' && !u.front))) sizes.set(i, type.size) })
  return typesetting(units, { design, strategy, type, leads: factors, sizes, floatsAt, tableMin: FLOW.tableMin })
}
