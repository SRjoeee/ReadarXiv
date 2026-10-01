// The typesetting rule chosen on 2026-10-01 — Flow, even, with option A in steps for CJK — as two steps a reader's
// compiles go through (records/typesetting.md in experiments/pdf-bilingual; the engineers' notes in
// experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md):
//   previewTypesetting — from the original's probes and the translation's text: one type for the paper, each unit's
//     leading along the original's flow, each float held to its original's page; the preview compile is set with it;
//   finalTypesetting — from what that preview measured: the type solved again, the leading corrected where the
//     preview's text stood, again after each forced break, and for CJK a late stretch at a smaller face; the final
//     compile is set with it.
// Pure: no compile, no file, no clock. Each returns `typeset`, which live.mjs translationFiles takes.
import { latin1 } from '../latex-front.mjs'
import { scriptOf } from '../scripts.mjs'
import { citeStyleOf, measureUnits, readSizeProbe, readWidthProbe } from './density.mjs'
import { flowType } from './flow.mjs'
import { drifts } from './places.mjs'
import { readForced, readLines, typesetting } from './tex.mjs'
import { correctUnits, DESIGN, heightAtSize, solveType, unitHeights, unitLines } from './type.mjs'

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
 * target; `fonts` readFontProbe of the font probe's log; `fontLog` that log, the font probe compiled with its width and
 * size probes (live.mjs probeFiles `{ width: true }`); `original` { log, marks }: the original compiled with its line
 * probes (originalFiles `{ lines: true }`) and its marks (places.mjs marksOf). Returns `typeset` for the preview's
 * translationFiles, and `state`, which finalTypesetting takes.
 */
export function previewTypesetting({ paper, translated, lang, fonts, fontLog, original }) {
  const { units, fsys } = paper, script = scriptOf(lang), cjk = DESIGN[script].cjk
  const read = re => fsys.list().filter(f => re.test(f)).map(f => latin1(fsys.read(f))).join('\n')
  const byIndex = new Map(units.map((u, i) => [i, translated.get(u)]).filter(([, pieces]) => pieces))
  const lo = readLines(original.log), sizes = readSizeProbe(fontLog)
  const list = measureUnits({ units, translated: byIndex, lines: lo, fonts, probe: readWidthProbe(fontLog), citeStyle: citeStyleOf(read(/\.(tex|sty|cls)$/i), read(/\.bbl$/i)), script })
  const type = solveType(list, script, sizes)
  const leads = flowType(list, script, unitHeights(list, script, type), { window: FLOW.window, horizon: FLOW.horizon, rate: FLOW.rate }).leads
  // each caption's float waits for its original's page and column (tex.mjs FLOAT_TEX)
  const om = original.marks, floatsAt = new Map()
  units.forEach((u, i) => { const m = om.marks.get(`${i}s`); if (u.kind === 'caption' && m) floatsAt.set(i, { page: m.page + 1, col: om.twoColumn && m.x >= om.width / 2 ? 1 : 0 }) })
  const state = { units, translated, script, cjk, type, sizes, list, lo, floatsAt, original }
  return { typeset: typesettingOf(state, type, leads, new Map()), type, state }
}

/**
 * The final's typesetting, from the preview `state` and what the preview compile gave: `preview` { log, marks } — its
 * log (line probes, forced breaks, size probe) and its marks (places.mjs marksOf). Returns `typeset` for the final's
 * translationFiles; the type, each unit's leading and face, and the flow's trace (flow.mjs flowType).
 */
export function finalTypesetting(state, preview) {
  const { script, cjk, type, list } = state
  const lines = readLines(preview.log), got = list.filter(u => lines.get(u.i))
  // the preview's measured height over the original's, at the preview's type: the paper's density as measured
  let o = 0, t = 0
  for (const u of got) { o += u.lo * u.bs; t += lines.get(u.i).lines * type.lead * (cjk ? 1 : type.size) * u.bs }
  const corrected = correctUnits(list, script, type, o ? t / o : 1), next = solveType(corrected, script, readSizeProbe(preview.log) ?? state.sizes)
  // each unit's measured lines carried to the new type by the prediction's change (none where only the leading changed)
  const before = unitLines(corrected, script, type), after = unitLines(corrected, script, next), cu = new Map(corrected.map(u => [u.i, u]))
  const heights = new Map(got.map(u => [u.i, ((lines.get(u.i).lines * after.get(u.i)) / before.get(u.i)) * (cjk ? 1 : next.size) * u.bs]))
  const measured = {
    drift: drifts(state.original.marks, preview.marks), preview: new Map(got.map(u => [u.i, lines.get(u.i).lines * lines.get(u.i).bs])),
    span: FLOW.span, snap: FLOW.snap * (median(got.map(u => u.bs)) ?? 12), breaks: readForced(preview.log),
  }
  const shrink = cjk ? { steps: FLOW.faces, lines: FLOW.faceLines, heightAt: (i, f) => (heights.get(i) * heightAtSize(cu.get(i), script, next, f)) / heightAtSize(cu.get(i), script, next, 1) } : null
  const flow = flowType(got, script, heights, { window: FLOW.window, horizon: FLOW.horizon, measured, rate: FLOW.rate, shrink })
  return { typeset: typesettingOf(state, next, flow.leads, flow.sizes), type: next, leads: flow.leads, faces: flow.sizes, trace: flow.trace }
}

// the plan tex.mjs typesetting takes: each unit's leading as \axtlead@ takes it — × its own size, so its original's
// leading over its size — and the sizes: an alphabet's type size on every translated unit that flows (paragraphs,
// captions and notes through their marks, a figure's text through its group), the faces a CJK flow set
function typesettingOf(state, type, leads, faces) {
  const { units, translated, cjk, lo, floatsAt } = state
  const factors = new Map([...leads].filter(([i]) => lo.get(i)?.size).map(([i, l]) => [i, (l * lo.get(i).bs) / lo.get(i).size]))
  const sizes = new Map(faces)
  if (!cjk) units.forEach((u, i) => { if (translated.has(u) && ((u.kind !== 'heading' && u.kind !== 'cell' && u.kind !== 'figure' && u.kind !== 'author' && !u.front) || (u.kind === 'figure' && !u.front))) sizes.set(i, type.size) })
  return typesetting(units, { cjk, type, leads: factors, sizes, floatsAt, tableMin: FLOW.tableMin })
}
