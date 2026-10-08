// Calibration of the pseudo-translation (latex-front.mjs: SAMPLES, RATIO): how long a real translation is in each
// target language against the English it comes from. Prose units — their text, a placeholder standing as a space, as
// plainSource gives it — spread over papers of four document classes, go to Microsoft's free endpoint (the
// extension's default engine); the ratio is the translation's grapheme clusters over the English letters, the measure
// pseudoTranslate fills by. One fixed English sentence goes along, to give a language with no sample text one.
//   node spikes/lang-ratio.mjs [lang ...]          → out/lang-ratio.json (the languages measured replace their entries)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { plainSource, translateTexts } from '../../../src/pdf-reader/engine/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const root = new URL('..', import.meta.url).pathname
const LANGS = process.argv.length > 2 ? process.argv.slice(2) : ['zh', 'ja', 'ko', 'ar', 'ru', 'hi', 'de']
// article (CS), revtex4-2 (physics), amsart (mathematics), IEEEtran (engineering)
const PAPERS = (process.env.PAPERS ?? '2608.11761 2608.08350 2608.00812 2608.06701').split(' ')
const PER_PAPER = 12
const SENTENCE = 'This paper proposes a new method for analysing data and verifies its effectiveness on several benchmarks; the experimental results show that the method outperforms existing work in both accuracy and efficiency.'
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
const graphemes = s => [...segmenter.segment(s)].length
const letters = s => (s.match(/\p{L}/gu) ?? []).length
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }

const texts = []
for (const id of PAPERS) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const prose = openPaper(files).units
    .filter(u => u.kind === 'para')
    .map(plainSource)
    .filter(t => t.length >= 200 && t.length <= 900 && !/[\\{}$]/.test(t))
  const n = Math.min(PER_PAPER, prose.length)
  for (let k = 0; k < n; k++) texts.push(prose[Math.floor((k * prose.length) / n)])
  console.log(`${id}: ${prose.length} prose units, ${n} taken`)
}

const FILE = join(root, 'out/lang-ratio.json')
const result = { papers: PAPERS, units: texts.length, englishLetters: texts.reduce((a, t) => a + letters(t), 0), langs: existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).langs : {} }
for (const lang of LANGS) {
  const out = await translateTexts([...texts, SENTENCE], lang, { parallel: 2 })
  const pairs = texts.map((t, i) => [t, out[i]]).filter(([, o]) => o)
  const per = pairs.map(([t, o]) => graphemes(o) / letters(t))
  const overall = pairs.reduce((a, [, o]) => a + graphemes(o), 0) / pairs.reduce((a, [t]) => a + letters(t), 0)
  result.langs[lang] = { translated: pairs.length, ratio: +overall.toFixed(3), p25: +quantile(per, 0.25).toFixed(3), median: +quantile(per, 0.5).toFixed(3), p75: +quantile(per, 0.75).toFixed(3), sample: out.at(-1) }
  console.log(lang.padEnd(3), `${pairs.length}/${texts.length}`, 'ratio', overall.toFixed(3), `(p25 ${quantile(per, 0.25).toFixed(3)}, median ${quantile(per, 0.5).toFixed(3)}, p75 ${quantile(per, 0.75).toFixed(3)})`)
}
mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(FILE, JSON.stringify(result, null, 1))
