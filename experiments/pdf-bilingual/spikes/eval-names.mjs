// The name rule against the engine: every figure line the rule calls a name, translated alone (as the HTML mode sends
// a box). Unchanged → the rule makes no difference there; changed → either a name the engine mistranslated (the rule
// helps) or a word it translated (the rule harms). Writes the changed ones, unique, for review.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName, translateTexts } from '../../../src/pdf-reader/engine/mt.mjs'
import { isTranslatable } from '../../../src/core/image/boxes.ts'
const root = new URL('..', import.meta.url).pathname
const lang = process.argv[2] ?? 'zh'
const papers = JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8'))
let lines = 0, translatable = 0
const named = new Map() // text → papers
for (const p of papers) for (const f of p.figures) for (const l of f.lines) {
  lines++
  if (!isTranslatable(l.text)) continue
  translatable++
  if (isName(l.text, p.prose)) (named.get(l.text) ?? named.set(l.text, new Set()).get(l.text)).add(p.id)
}
const texts = [...named.keys()]
const got = await translateTexts(texts, lang)
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、]/g, '').toLowerCase()
const changed = texts.map((t, i) => ({ text: t, tr: got[i], papers: [...named.get(t)] })).filter(x => x.tr != null && norm(x.tr) !== norm(x.text))
writeFileSync(join(root, `out/eval-names-${lang}.json`), JSON.stringify({ lines, translatable, namedLines: [...named.values()].reduce((a, s) => a + s.size, 0), unique: texts.length, changed }, null, 1))
console.log({ lines, translatable, uniqueNamed: texts.length, changedByEngine: changed.length })
