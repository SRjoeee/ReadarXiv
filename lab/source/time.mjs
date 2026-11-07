// lab/source/time.mjs: readSource against today's front end (loadProject) on one paper, warm, the median of --runs runs
// each (the tree and definitions read once, outside the timing)
//   node --experimental-strip-types --stack-size=4000 lab/source/time.mjs --papers=<papers.json> --defs=<dir> --id=<id> [--runs=7]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { inMemory, loadProject } from '../../src/pdf-reader/engine/source/latex-front.mjs'
import { analyze } from '../../src/pdf-reader/engine/source/paper-meta.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const p = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.find(x => x.id === arg('id'))
const runs = Number(arg('runs') ?? 7)
const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
const main = analyze(inMemory(files)).main
const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
try { files.set(`${stem}.bbl`, new Uint8Array(readFileSync(join(arg('defs'), `${p.id}.bbl`)))) } catch {}
const defs = readDefinitions(readFileSync(join(arg('defs'), `${p.id}.axtdefs`), 'utf8'))
const median = xs => xs.sort((a, b) => a - b)[xs.length >> 1]
const time = f => { const out = []; for (let k = 0; k < runs; k++) { const t = performance.now(); f(); out.push(performance.now() - t) } return median(out) }
const mine = time(() => readSource({ main, files }, defs))
const today = time(() => loadProject(inMemory(files), main, { tables: true }))
const doc = readSource({ main, files }, defs)
const bytes = doc.files.reduce((n, f) => n + (files.get(f)?.length ?? 0), 0)
console.log(JSON.stringify({ id: p.id, files: doc.files.length, bytes, units: doc.units.length, readSourceMs: Math.round(mine * 10) / 10, todayMs: Math.round(today * 10) / 10, runs }))
