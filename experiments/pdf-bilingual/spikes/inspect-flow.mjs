// experiments/pdf-bilingual/spikes/inspect-flow.mjs
// A final's flow replayed from its inputs (visual-eval.mjs, AXT_FLOW_DUMP=<file>): unit by unit where the flow put the
// text at the unit's start and end, in points behind the original, the leading and the face it set, and each
// segment's end (before a forced break, at the paper's end) — where option A looks for what is left late.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/inspect-flow.mjs <dump.json> [<from unit>]
import { readFileSync } from 'node:fs'
import { flowType } from './generic-type.mjs'

const [file, from = '0'] = process.argv.slice(2)
const d = JSON.parse(readFileSync(file, 'utf8'))
const heights = new Map(d.heights), measured = d.measured && { ...d.measured, drift: new Map(d.measured.drift), preview: new Map(d.measured.preview), breaks: new Set(d.measured.breaks ?? []) }
const faceHeights = d.faces && Object.fromEntries(Object.entries(d.faces.heights).map(([f, hs]) => [f, new Map(hs)]))
const shrink = d.faces && { steps: d.faces.steps, lines: d.faces.lines, heightAt: (i, f) => faceHeights[f].get(i) }
const r = flowType(d.list, d.script, heights, { window: d.window, horizon: d.horizon, ahead: d.ahead, measured, rate: d.rate ?? Infinity, shrink })
const breaks = measured?.breaks ?? new Set()
console.log(' unit   start     end   leading  face   preview')
r.trace.forEach((t, k) => {
  if (t.i < Number(from)) return
  const end = k === r.trace.length - 1 || breaks.has(r.trace[k + 1].i)
  console.log(`${String(t.i).padStart(5)} ${t.at.toFixed(0).padStart(7)} ${t.end.toFixed(0).padStart(7)}   ${t.x.toFixed(3)}  ${(r.sizes.get(t.i) ?? 1).toFixed(3)}  ${String(measured?.drift.get(t.i) != null ? Math.round(measured.drift.get(t.i)) : '-').padStart(7)}${end ? '   <- segment end' : ''}`)
})
