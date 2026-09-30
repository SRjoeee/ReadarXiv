// The line predictor (density.mjs) against measured lines (plans/2026-09-30-generic-type.md, step 1). For every paper
// with a marked original and a translation compiled at base typography (a visual-eval `fit-1`, or `base` from
// density-data.mjs), each unit's lines are measured by the line probes in both; the predictor sees only the original's
// lines (its ruler) and the two texts. Per paper, density = the translation's lines over the original's; errors are
// leave-one-paper-out, with one factor per writing system (how full its lines run against English ones) learned from
// the other papers. Read-only: no compile, no translation.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/density-check.mjs [--data=<runs dir>]... [--variant=<name>] [--json=<file>]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { plainSource, plainTranslated } from '../../../src/pdf-reader/engine/mt.mjs'
import { readLines } from './lock.mjs'
import { citeStyleOf, facesOf, linesAt, measureUnits, piecesWidth, readWidthProbe } from './density.mjs'

const root = new URL('..', import.meta.url).pathname
const opt = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.slice(k.length + 3))
const DATA = opt('data').length ? opt('data') : [join(root, 'data/runs/visual-eval')]
export const SCRIPT = { zh: 'Hans', ja: 'Jpan', ko: 'Kore', de: 'Latn', ru: 'Cyrl' }
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const DISPLAY = /^(\$\$|\\\[|\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat|dmath))/
const logIn = d => { const f = existsSync(d) && readdirSync(d).find(x => x.endsWith('.log')); return f ? readFileSync(join(d, f), 'latin1') : null }

/** the crude model of the first look (every non-CJK character half an em, atoms nothing) */
const WIDE = /[\u1100-\u11ff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/
const crude = s => { let w = 0; for (const c of s) w += WIDE.test(c) ? 1 : /\s/.test(c) ? 0.28 : 0.5; return w }

/** every paper with both compiles: its units' measured lines and both texts */
export async function loadPapers(dirs) {
  const out = []
  for (const data of dirs) for (const lang of Object.keys(SCRIPT)) {
    if (!existsSync(join(data, lang))) continue
    for (const id of readdirSync(join(data, lang))) {
      const W = join(data, lang, id, 'work')
      const base = logIn(join(W, 'base')) ?? logIn(join(W, 'fit-1')), orig = logIn(join(W, 'original'))
      if (!base || !orig || !existsSync(join(data, lang, id, 'translation.json'))) continue
      const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
      const paper = openPaper(files)
      const cache = new Map(JSON.parse(readFileSync(join(data, lang, id, 'translation.json'), 'utf8')).entries.map(e => [e.key, e.pieces]))
      const fonts = readFontProbe(logIn(join(W, 'probe')) ?? ''), width = readWidthProbe(logIn(join(W, 'width')))
      const sources = [...files].filter(([p]) => /\.(tex|sty|cls)$/i.test(p)).map(([, b]) => latin1(b)).join('\n')
      const bbl = [...files].filter(([p]) => /\.bbl$/i.test(p)).map(([, b]) => latin1(b)).join('\n')
      const Lo = readLines(orig), Lt = readLines(base)
      const units = []
      paper.units.forEach((u, i) => {
        const tr = cache.get(unitKey(u)), o = Lo.get(i), t = Lt.get(i)
        if (!tr || !o || !t || !tr.some(p => p.tr) || u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src ?? ''))) return
        units.push({ i, kind: u.kind, lo: o.lines, lt: t.lines, source: u.pieces, translated: tr })
      })
      const byIndex = new Map(paper.units.map((u, i) => [i, cache.get(unitKey(u))]).filter(([, p]) => p))
      out.push({ lang, id, data, fonts, width, citeStyle: citeStyleOf(sources, bbl), units, paperUnits: paper.units, byIndex, Lo, Lt })
    }
  }
  return out
}

/** predicted lines of each unit's translation: its width over the capacity of the original's own lines (the unit's
 *  when it has three or more, else the median of its paper's units of its kind, else of all) */
export function predict(p, { variant = 'full' } = {}) {
  if (['full', 'tables', 'probe', 'waste'].includes(variant)) {
    return measureUnits({ units: p.paperUnits, translated: p.byIndex, lines: p.Lo, fonts: p.fonts, probe: variant === 'tables' ? null : p.width, citeStyle: p.citeStyle, script: SCRIPT[p.lang], geometry: variant !== 'probe', cjkWaste: variant === 'waste' ? 0.5 : 0 })
      .filter(x => p.Lt.get(x.i)).map(x => ({ ...x, lt: p.Lt.get(x.i).lines, pred: linesAt(x.width(), x.cap) }))
  }
  const faces = facesOf(p.fonts), ctx = { script: SCRIPT[p.lang], citeStyle: p.citeStyle }
  const widths = p.units.map(x => variant === 'crude'
    ? { o: crude(plainSource({ pieces: x.source })), t: crude(plainTranslated(x.translated)) }
    : { o: piecesWidth(x.source, faces, { script: 'Latn', citeStyle: p.citeStyle }), t: piecesWidth(x.translated, faces, ctx) })
  const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }
  const caps = p.units.map((x, k) => (x.lo >= 3 && widths[k].o > 0 ? widths[k].o / (x.lo - 0.5) : null))
  const byKind = new Map(), all = median(caps)
  for (const kind of new Set(p.units.map(x => x.kind))) byKind.set(kind, median(p.units.map((x, k) => (x.kind === kind ? caps[k] : null))))
  return p.units.map((x, k) => {
    const cap = variant === 'paper-ruler' ? all : caps[k] ?? byKind.get(x.kind) ?? all
    return { ...x, pred: cap ? linesAt(widths[k].t, cap) : x.lo, wo: widths[k].o, wt: widths[k].t, cap }
  })
}

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0)
const MIN = 20
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.round(p * (s.length - 1))] }
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length

/** per language: each paper's measured and predicted density, and the leave-one-out error with the script's factor */
export function score(papers, variant) {
  // a paper with fewer than MIN measured units says little about its density; listed, not scored
  const all = papers.map(p => { const us = predict(p, { variant }); return { lang: p.lang, id: p.id, meas: sum(us, x => x.lt) / sum(us, x => x.lo), pred: sum(us, x => x.pred) / sum(us, x => x.lo), us } })
  const rows = all.filter(r => r.us.length >= MIN)
  for (const r of all) if (r.us.length < MIN) console.log(`  (${variant}: ${r.lang} ${r.id} has ${r.us.length} measured units, not scored)`)
  const out = {}
  for (const lang of Object.keys(SCRIPT)) {
    const r = rows.filter(x => x.lang === lang)
    if (r.length < 2) continue
    const raw = r.map(x => x.meas / x.pred - 1)
    const loo = r.map((x, k) => { const f = mean(r.filter((_, j) => j !== k).map(y => y.meas / y.pred)); return x.meas / (x.pred * f) - 1 })
    const alone = r.map((x, k) => x.meas / mean(r.filter((_, j) => j !== k).map(y => y.meas)) - 1)
    const unitErr = r.flatMap(x => x.us.filter(u => u.lo >= 3).map(u => (u.pred * x.meas) / x.pred - u.lt))
    out[lang] = { papers: r.length, factor: mean(r.map(x => x.meas / x.pred)), raw, loo, alone, unitErr, rows: r.map(({ us, ...x }) => x) }
  }
  return out
}

const pct = x => `${(100 * x).toFixed(1)}%`
if (import.meta.url === `file://${process.argv[1]}`) {
  const papers = await loadPapers(DATA)
  const variants = opt('variant').length ? opt('variant') : ['crude', 'paper-ruler', 'tables', 'full']
  const report = {}
  for (const v of variants) {
    report[v] = score(papers, v)
    console.log(`\n== ${v}`)
    for (const [lang, s] of Object.entries(report[v])) {
      const abs = xs => xs.map(Math.abs)
      console.log(`${lang} ${String(s.papers).padStart(2)} papers  factor ${s.factor.toFixed(3)}  raw |err| median ${pct(q(abs(s.raw), 0.5))} max ${pct(Math.max(...abs(s.raw)))}  leave-one-out median ${pct(q(abs(s.loo), 0.5))} max ${pct(Math.max(...abs(s.loo)))}  (language mean alone: median ${pct(q(abs(s.alone), 0.5))} max ${pct(Math.max(...abs(s.alone)))})  unit |err| lines p50 ${q(abs(s.unitErr), 0.5).toFixed(2)} p90 ${q(abs(s.unitErr), 0.9).toFixed(2)}`)
    }
  }
  if (opt('json').length) writeFileSync(opt('json')[0], JSON.stringify(report, null, 1))
}
