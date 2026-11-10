// lab/source/names-vs-today.mjs: the paper's own words SourceDoc `names` reads from TeX's definitions, against today's regex
// reader of them (src/pdf-reader/engine/source/paper-names.mjs: theoremNames; paperNames' reference words, less its theorem names and the rules' gap words), paper by paper.
//   node --experimental-strip-types lab/source/names-vs-today.mjs --papers=<papers.json> --set=87 --defs=<dir> [--list]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { analyze } from '../../src/pdf-reader/engine/source/paper-meta.mjs'
import { paperNames, theoremNames } from '../../src/pdf-reader/engine/source/paper-names.mjs'
import { inMemory, texFilesOf } from '../../src/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'
import { CONJUNCTION_GAPS, NAME_GAPS } from '../../src/pdf-reader/engine/rules/tex-names.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const GAPS = new Set([...NAME_GAPS, ...CONJUNCTION_GAPS])
const t = { papers: 0, theorems: { both: 0, today: 0, mine: 0 }, words: { both: 0, today: 0, mine: 0 }, babel: 0, keys: 0 }
const lists = []
for (const p of papers) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const fsys = inMemory(files), main = analyze(fsys).main
  const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  try { files.set(`${stem}.bbl`, new Uint8Array(readFileSync(join(arg('defs'), `${p.id}.bbl`)))) } catch {}
  const doc = readSource({ main, files }, readDefinitions(readFileSync(join(arg('defs'), `${p.id}.axtdefs`), 'utf8')))
  const texts = texFilesOf(fsys, main)
  const tThm = new Set(theoremNames(texts).map(s => new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0) & 0xff))))
  // (the reference words alone: today's list less its theorem names and the rules' gap words, which no paper writes)
  const tAll = new Set(paperNames(texts).filter(w => !GAPS.has(w)).map(s => new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0) & 0xff))).filter(w => !tThm.has(w)))
  const mThm = new Set(doc.names.filter(([k]) => k.startsWith('theorem:')).map(([, w]) => w))
  const mAll = new Set(doc.names.filter(([k]) => /^(?:c|C)ref:|^autoref:/.test(k)).map(([, w]) => w))
  const cmp = (a, b, into, what) => {
    for (const w of a) if (b.has(w)) into.both++; else { into.today++; lists.push(`${p.id} ${what} only today: ${w}`) }
    for (const w of b) if (!a.has(w)) { into.mine++; lists.push(`${p.id} ${what} only TeX's: ${w}`) }
  }
  cmp(tThm, mThm, t.theorems, 'theorem')
  cmp(tAll, mAll, t.words, 'word')
  t.babel += doc.names.filter(([k]) => k.startsWith('babel:')).length
  t.keys += doc.names.length
  t.papers++
}
console.log(JSON.stringify(t))
if (process.argv.includes('--list')) for (const l of lists) console.log(l)
