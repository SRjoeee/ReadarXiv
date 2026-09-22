// The name rule over boxes sent one by one (the extension's way with a free engine), per target language: of the boxes
// it keeps (isName, with all-capital words the paper also writes in lower case counted as words), those the engine
// changed are a save when the box is a name and a spoil when it is a word. The verdicts, name or word, are a reading of
// every distinct box by hand: the words are listed here, every other box the rule keeps was read as a name.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName } from '../poc-reader/mt.mjs'
const root = new URL('..', import.meta.url).pathname
const papers = new Map(JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8')).map(p => [p.id, p.prose]))
export const WORDS = new Set(['LLM-based', 'Germanic', 'Sinitic Semitic', 'EEG', 'BabyLM-100M 2-layer', 'BabyLM-100M 4-layer', 'BabyLM-10M 2-layer', 'BabyLM-10M 4-layer', 'BabyLM-10M 2layer', 'BabyLM-10M 4layer', 'BabyLM-100M 2layer', 'BabyLM-100M 4layer', 'Less', 'ASR (Harm)', 'Paraphrase', 'Random Forest', 'CONTENTS', 'CPU', 'TimeStep', 'Probability', 'United States', 'China', 'United Kingdom', 'Switzerland', 'France Canada', 'Fixed-5', 'TBD', 'LLM', '⊕: 𝐶ℎ𝑎𝑛𝑛𝑒𝑙 𝐶𝑜𝑛𝑐𝑎𝑡', '8×8 Patch', '4×4 Patch', 'Mismatch', 'Table', 'Template', 'Inpainting', 'Outpainting', 'SKUs', 'Expressive Candid', 'Candid', 'Expressive', 'LTGOV INTL', 'Softmax', 'REFERENCES', 'En', 'EN', 'CN', 'RH', 'LH', 'PRETRAINED MODEL', 'Forward-Backward', 'w/ DQC', 'w/ AC', 'w/ MASD', 'w/ DCI', 'Self-Distill', 'Dirac--Fock', 'Dirac–Padé', 'Content-Scrambled'])
const quote = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const capsCommon = (text, prose) => isName(text, prose) && text.replace(/\s+/g, ' ').trim().split(' ').every(w => {
  const bare = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
  if (!/^[A-Z][A-Z-]*[A-Z]$/.test(bare)) return true
  return bare.split('-').some(p => !new RegExp(`(^|[^A-Za-z])${quote(p.toLowerCase())}($|[^A-Za-z])`).test(prose))
})
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、：:;；（）()「」]/g, '').toLowerCase()
const same = (a, b) => norm(a) === norm(b)
if (import.meta.url === `file://${process.argv[1]}`) for (const L of ["zh", "ja", "de"]) {
  const rows = JSON.parse(readFileSync(join(root, `out/eval-join2-${L}.json`), 'utf8')).rows['10-dedupe']
  const all = rows.length, flagged = rows.filter(r => capsCommon(r.text, papers.get(r.id)))
  const changed = flagged.filter(r => !same(r.alone, r.text))
  const saves = changed.filter(r => !WORDS.has(r.text)), spoils = changed.filter(r => WORDS.has(r.text))
  const u = xs => new Set(xs.map(r => r.text)).size
  console.log(`${L}: boxes ${all}, kept by the rule ${flagged.length}, of them changed by the engine ${changed.length}: saves ${saves.length} (${u(saves)} distinct), spoils ${spoils.length} (${u(spoils)} distinct)`)
}
