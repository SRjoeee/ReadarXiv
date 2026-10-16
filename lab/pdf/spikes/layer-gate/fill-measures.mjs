// lab/pdf/spikes/layer-gate/fill-measures.mjs
// What the page-local fill (1b-C, run.mjs pageTarget) leaves on a paper, read from a model run's dump (`layer-gate.mjs
// --dump=<dir>`, one JSON an output) and never from a drawing. Reported beside the gate's measures, not gated, and not one of
// the four files whose bytes the record hashes (score.mjs, measure.mjs, page.mjs, proto.mjs): a change here is not a new
// instrument.
//   purity       each page's target recomputed from its units' records alone (the fill leading, the kind, the pages, the lines)
//                as pageTarget reads them, against the target the run recorded: no mismatch, or a page's target read
//                something else. A record's line count is the unit's after the fill; pageTarget reads the fit's, so a mismatch
//                can also be a unit the fill moved across the two-line mark (none is expected)
//   fillStep     the target steps between consecutive body pages that exceed the band: how many, and the largest
//   rhythmSpread the paper-wide p90 - p10 of the pages' drawn rhythms (the median drawn leading of the multi-line body
//                paragraphs drawn on the page), and rhythmDrift, the largest change from one page's to the next's
//   moved        with a base dump: the pages whose target differs from the base's, `page:from->to`, and the units whose drawn
//                leading differs
//   node lab/pdf/spikes/layer-gate/fill-measures.mjs <dump-dir> [--base=<dump-dir>] [--band=0.05]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const EVEN = new Set(['para', 'abstract', 'list', 'item'])
const r3 = x => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000)
/** the upper median, as the engine's (layer1.mjs median) */
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const quantile = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null }

/**
 * One output's fill numbers from its dump's records (`stats`): { pages, targets (page → recorded target), purity: { checked,
 * mismatches: [{ page, recorded, recomputed }] }, fillStep: { steps, max }, rhythmSpread, rhythmDrift }
 */
export function fillMeasures(dump, band = 0.05) {
  const byPage = new Map()
  for (const s of dump.stats ?? []) for (const pg of s.pages) (byPage.get(pg) ?? byPage.set(pg, []).get(pg)).push(s)
  const pages = [...byPage.keys()].sort((a, b) => a - b)
  const targets = new Map(), purity = { checked: 0, mismatches: [] }
  const rhythms = []
  let last = null, steps = 0, max = 0
  for (const pg of pages) {
    const all = byPage.get(pg)
    const begun = all.filter(s => s.pages[0] === pg && s.fill)
    const lines = s => s.lines.length
    // (pageTarget, from the records: the units begun on the page that tell a fill leading, the body kinds first)
    const telling = begun.filter(s => lines(s) >= 2), body = telling.filter(s => EVEN.has(s.kind))
    const leads = (body.length ? body : telling.length ? telling : begun).map(s => s.fill.lead)
    const present = all.filter(s => EVEN.has(s.kind) && s.fill && lines(s) >= 2)
    const anchor = present.length ? r3(median(present.map(s => s.fill.lead))) : null
    const recorded = begun[0]?.fill.target ?? null
    if (leads.length) {
      const own = median(leads)
      const target = r3(anchor === null ? own : Math.min(anchor + band, Math.max(anchor - band, own)))
      purity.checked++
      if (begun.some(s => s.fill.target !== recorded) || Math.abs(target - recorded) > 1e-9) purity.mismatches.push({ page: pg, recorded, recomputed: target })
      targets.set(pg, recorded)
      if (body.length) {
        if (last !== null && Math.abs(recorded - last) > band + 1e-9) { steps++; max = Math.max(max, Math.abs(recorded - last)) }
        last = recorded
      }
    }
    // (the rhythm a reader sees: the drawn leading of the multi-line body paragraphs with lines on this page)
    const drawn = all.filter(s => EVEN.has(s.kind) && s.fill && s.lines.filter(l => l[0] === pg).length >= 2).map(s => s.lead)
    if (drawn.length) rhythms.push(median(drawn))
  }
  let drift = 0
  for (let i = 1; i < rhythms.length; i++) drift = Math.max(drift, Math.abs(rhythms[i] - rhythms[i - 1]))
  return {
    pages: pages.length, targets, purity, fillStep: { steps, max: r3(max) },
    rhythmSpread: rhythms.length ? r3(quantile(rhythms, 0.9) - quantile(rhythms, 0.1)) : null, rhythmDrift: r3(drift),
  }
}

/** the pages whose recorded target differs between two dumps of one output, `page:from->to`, and the units (by id) of more than
 *  one line whose drawn leading differs (a unit of one line draws the same at any leading) */
export function movedBetween(base, head) {
  const a = fillMeasures(base).targets, b = fillMeasures(head).targets
  const pages = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y).filter(pg => (a.get(pg) ?? null) !== (b.get(pg) ?? null)).map(pg => `${pg}:${a.get(pg) ?? null}->${b.get(pg) ?? null}`)
  const lead = new Map((base.stats ?? []).map(s => [s.id, s.lead]))
  const units = (head.stats ?? []).filter(s => s.lines.length >= 2 && lead.has(s.id) && lead.get(s.id) !== s.lead).map(s => s.id)
  return { pages, units }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = k => process.argv.slice(2).find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
  const dir = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!dir) throw new Error('usage: fill-measures.mjs <dump-dir> [--base=<dump-dir>] [--band=0.05]')
  const band = Number(arg('band') ?? 0.05), base = arg('base')
  let bad = 0
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const head = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const m = fillMeasures(head, band)
    bad += m.purity.mismatches.length
    const row = [f.replace('.json', ''), `pages ${m.pages}`, `purity ${m.purity.checked - m.purity.mismatches.length}/${m.purity.checked}`, `fillStep ${m.fillStep.steps} (max ${m.fillStep.max})`, `rhythmSpread ${m.rhythmSpread}`, `rhythmDrift ${m.rhythmDrift}`]
    if (base) { const mv = movedBetween(JSON.parse(readFileSync(join(base, f), 'utf8')), head); row.push(`moved ${mv.pages.length} pages, ${mv.units.length} units`, mv.pages.join(' ')) }
    console.log(row.join(' | '))
    for (const x of m.purity.mismatches) console.log(`  MISMATCH p${x.page}: recorded ${x.recorded}, recomputed ${x.recomputed}`)
  }
  process.exitCode = bad ? 1 : 0
}
