// experiments/pdf-bilingual/spikes/typeset-translate.mjs
// A paper's translation for the typesetting gate (spikes/typeset-gate.mjs), once, through Microsoft's free engine as the
// reader sends it (mt.mjs translateUnits on the markers wire, translateTexts): the units not yet cached are asked for
// and added to <AXT_DATA>/runs/visual-eval/<lang>/<id>/translation.json, the cache the experiment's visual-eval.mjs keeps
// (by each unit's kind and source). The gate's fresh holdout — the 13 Chinese-unseen papers in Japanese, Korean, German
// and Russian — was made with it on 2026-10-01.
//   AXT_DATA=<data> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-translate.mjs <lang>/<id>...
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { keptFor, openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/translate/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const DATA = process.env.AXT_DATA ?? join(new URL('..', import.meta.url).pathname, 'data')
// a unit as the cache keys it: its kind and its source, pieces by kind and text, pair ids aside (visual-eval.mjs)
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`

for (const spec of process.argv.slice(2)) {
  const [lang, id] = spec.split('/'), dir = join(DATA, 'runs/visual-eval', lang, id), cache = join(dir, 'translation.json')
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))
  const paper = openPaper(files), kept = keptFor(paper, lang)
  const byKey = new Map((existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')).entries ?? [] : []).map(e => [e.key, e.pieces]))
  const todo = paper.units.filter(u => !kept.has(u) && !byKey.has(unitKey(u)))
  const t0 = Date.now()
  if (todo.length) {
    const { results, how } = await translateUnits(todo, texts => translateTexts(texts, lang).then(r => r.map(text => (text == null ? null : { text, by: null }))), 'markers')
    for (const [u, r] of results) if (r.pieces) byKey.set(unitKey(u), r.pieces)
    mkdirSync(dir, { recursive: true })
    writeFileSync(cache, JSON.stringify({ entries: [...byKey].map(([key, pieces]) => ({ key, pieces })) }))
    console.log(`${spec}: ${todo.length} units asked, ${JSON.stringify(how)}, ${Math.round((Date.now() - t0) / 1000)} s`)
  } else console.log(`${spec}: cached`)
}
