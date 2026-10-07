// The highlight's sentences for the papers its gates run on (plans/2026-10-01-pdf-highlight.md, B3): each unit's
// sentences as the reader keeps them — Microsoft's answer for the very wire the reader sends (mt.mjs serialize), its
// sentence lengths kept (as the extension's service keeps them: verifyAlignment), read back strictly or tolerantly as
// translateUnits reads it, and cut by mt.mjs sentencesOf — where that answer is the translation the run typeset (its
// pieces, `pieces/<id>.json` beside the runs, or the run's final texts); a unit whose answer differs, or has none, gets
// none, and is lit whole.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/highlight-sentences.mjs [id …]   → <RUNS>/sentences/<id>.json
//   RUNS=<dir> another set of runs (default data/runs/highlight-ten); FROM=en for runs translated from English (B's
//   ground-truth compiles); MAX_REQUESTS=<n> caps the requests a run may make (default 200; 0 for the caches alone)
// Answers are kept in out/highlight/B3/ms-cache-zh-<from>.json (git-ignored; the auto one seeded from the draft round's,
// A2's, and the English one read with investigator B's, out/highlight/B/ms-cache-zh.json); only a wire neither has is
// asked, two requests at a time. Counts only, no paper text, are printed. The highlight's gate makes the files again
// from those answers by the reader's own path (sentences-path.mjs: the extension's provider, engine.mjs, translateUnits)
// and fails where one differs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyAlignment } from '../../../src/providers/alignment'
import { plainTranslated, rehydrate, sentencesOf, serialize } from '../../../src/pdf-reader/engine/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { runPaper, samePieces } from './highlight-runs.mjs'

const root = new URL('..', import.meta.url).pathname
const RUNS = process.env.RUNS ?? join(root, 'data/runs/highlight-ten')
const FROM = process.env.FROM ?? ''
const MAX = Number(process.env.MAX_REQUESTS ?? 200)
const TEN = ['2608.02163', '2608.02785', '2608.02991', '2608.03063', '2608.06701', '2608.07683', '2608.08350', '2608.09746', '2608.12502', '2608.29181']
const ids = process.argv.slice(2).length ? process.argv.slice(2) : TEN
const OUT = join(root, 'out/highlight/B3')
mkdirSync(OUT, { recursive: true })
const cacheFile = join(OUT, `ms-cache-zh-${FROM || 'auto'}.json`)
const seeds = FROM ? [join(root, 'out/highlight/B/ms-cache-zh.json')] : []
const cache = new Map(existsSync(cacheFile) ? Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))) : [])
for (const f of seeds) if (existsSync(f)) for (const [w, a] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) if (a && !cache.has(w)) cache.set(w, a)
let requests = 0

/** one request as the extension's Microsoft provider makes it, `from` as the runs were made (live-node: auto) */
async function ask(texts) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      requests++
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: FROM, to: 'zh-Hans', isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => { const t = item?.translations?.[0]; return t ? { text: t.text, src: t.sentLen?.srcSentLen ?? null, tgt: t.sentLen?.transSentLen ?? null } : null })
    } catch (e) { if (attempt === 4) throw e; await new Promise(r => setTimeout(r, 2000 * (attempt + 1))) }
  }
}
/** the answers for these wires: cached, else asked in requests of at most 2000 characters or 100 texts (the reader's) */
async function answers(wires) {
  const todo = [...new Set(wires.filter(w => !cache.has(w)))]
  const batches = []
  let cur = [], chars = 0
  for (const w of todo) { if (cur.length && (chars + w.length > 2000 || cur.length >= 100)) { batches.push(cur); cur = []; chars = 0 } cur.push(w); chars += w.length }
  if (cur.length) batches.push(cur)
  let next = 0
  await Promise.all([0, 1].map(async () => {
    while (next < batches.length && requests < MAX) {
      const b = batches[next++], got = await ask(b)
      b.forEach((w, k) => { if (got[k]) cache.set(w, got[k]) })
    }
  }))
  writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache)))
  return wires.map(w => cache.get(w) ?? null)
}

/** whether lengths cut a text anywhere but inside a marker at its end */
const boundaries = (ls, text) => {
  const end = text.trimEnd().length, markers = [...text.matchAll(/@@|@[a-z]+#?/g)].map(m => [m.index, m.index + m[0].length])
  let at = 0
  return ls.slice(0, -1).some(n => { at += n; let c = at; for (const [a, b] of markers) if (c > a && c < b) c = b; return c < end })
}
const total = { units: 0, sent: 0, answered: 0, same: 0, aligned: 0, multi: 0, multiAligned: 0, sentences: 0 }
for (const id of ids) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = runPaper(id, files), units = paper.units
  const pf = join(RUNS, 'pieces', `${id}.json`), typeset = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const tf = join(RUNS, id, 'final-texts.json'), finals = existsSync(tf) ? new Map(JSON.parse(readFileSync(tf, 'utf8')).map(t => [t.id, t.text])) : new Map()
  const todo = units.map((u, i) => i).filter(i => !paper.kept.has(units[i]))
  const sers = new Map(todo.map(i => [i, serialize(units[i])]))
  const got = await answers(todo.map(i => sers.get(i).wire))
  const out = {}, n = { units: units.length, sent: todo.length, answered: 0, same: 0, aligned: 0, multi: 0, multiAligned: 0, sentences: 0 }
  todo.forEach((i, k) => {
    const a = got[k], ser = sers.get(i)
    if (!a) return
    n.answered++
    // read back as translateUnits reads it, and only the very translation the run typeset
    let tolerant = false, back = rehydrate(a.text, ser)
    if (back.error) { tolerant = true; back = rehydrate(a.text, ser, true) }
    if (back.error) return
    const same = typeset[i] ? samePieces(back.pieces, typeset[i]) : finals.get(i) === plainTranslated(back.pieces)
    if (!same) return
    n.same++
    const alignment = a.src && a.tgt ? verifyAlignment({ source: a.src, target: a.tgt }, ser.wire, a.text) : undefined
    // a unit of more than one sentence as investigator B counted them: a boundary that, out of a marker, is not at
    // either text's end (report-B §2(a): the closing marker's `#` at a unit's end is no sentence)
    if (alignment && boundaries(alignment.source, ser.wire) && boundaries(alignment.target, a.text)) n.multi++
    const s = sentencesOf(units[i], ser, a.text, alignment, back.pieces, tolerant)
    if (!s) return
    out[i] = s
    n.aligned++
    if (s.src.length) { n.multiAligned++; n.sentences += s.src.length + 1 }
  })
  mkdirSync(join(RUNS, 'sentences'), { recursive: true })
  writeFileSync(join(RUNS, 'sentences', `${id}.json`), JSON.stringify(out))
  console.log(id, JSON.stringify(n))
  for (const f of Object.keys(total)) total[f] += n[f]
}
console.log('all', JSON.stringify(total), 'requests', requests)
