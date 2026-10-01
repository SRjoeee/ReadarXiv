// Does the index choose among files of one name as TeX Live does? For every lowercase basename the tree holds more
// than once, every format whose search path reaches one of its files, and every program BusyTeX runs: the index's
// answer (poc-site/tex-tree.mjs resolve, its kpathsea pass) against TeX Live's own kpsewhich on the same tree — the
// tree's native binaries (bin/aarch64-linux of the release ISO the tree was installed from), run in a container of the
// texlive image with the tree mounted read-only, TEXMF the distribution tree alone, ls-R its database. Also reports the
// keys whose answer differs between programs (BusyTeX caches a fetched file by format and name, for every program).
//   node experiments/pdf-bilingual/tex-page/kpathsea-check.mjs        (docker; TEXLIVE_TREE as build.mjs)
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { candidates, inElement, parseIndex, resolve } from '../poc-site/tex-tree.mjs'
import { PROGRAMS } from './kpathsea.mjs'
import { treeIndex } from './tree.mjs'

const EXP = new URL('..', import.meta.url).pathname
const TREE = process.env.TEXLIVE_TREE ?? join(dirname(realpathSync(join(EXP, 'data/corpus'))), 'tl2026/2026/texmf-dist')
const TL = dirname(dirname(TREE))
const YEAR = relative(TL, dirname(TREE))
/** kpsewhich's names of the formats (tex-file.c INIT_FORMAT) */
const NAMES = { 3: 'tfm', 4: 'afm', 6: 'bib', 7: 'bst', 11: 'map', 13: 'mf', 20: 'ofm', 23: 'ovf', 26: 'tex', 30: 'PostScript header', 32: 'type1 fonts', 33: 'vf', 35: 'ist', 36: 'truetype fonts', 39: 'other text files', 41: 'misc fonts', 44: 'enc files', 45: 'cmap files', 46: 'subfont definition files', 47: 'opentype fonts', 48: 'pdftex config', 51: 'lua', 52: 'font feature files', 53: 'cid maps', 34: 'dvips config' }

const { text } = treeIndex(TREE, readFileSync(join(EXP, 'data/busytex-site/busytex/texmf.cnf'), 'utf8'))
const index = parseIndex(text)
const dirOf = p => p.slice(0, Math.max(0, p.lastIndexOf('/')))
const baseOf = p => p.slice(p.lastIndexOf('/') + 1)
/** the kpathsea pass alone: exactly this name, within the search path; null when TeX Live would not find it */
const kpathsea = (format, name, program) => {
  const paths = index.paths[format] ?? {}
  for (const e of paths[program] ?? paths['*'] ?? []) for (const t of candidates(format, name)) for (const p of index.names.get(t.toLowerCase()) ?? []) if (baseOf(p) === t && inElement(dirOf(p), e)) return p
  return null
}
const duplicates = [...index.names].filter(([, ps]) => ps.length > 1)
// the queries: each distinct file name of a duplicated basename, under each format and program that can reach one
const queries = new Map() // `${program}|${format}` → Set names
for (const [, ps] of duplicates) {
  for (const [format, byProgram] of Object.entries(index.paths)) {
    if (!NAMES[format]) continue
    for (const program of Object.keys(PROGRAMS)) {
      const elements = byProgram[program] ?? byProgram['*']
      if (!ps.some(p => elements.some(e => inElement(dirOf(p), e)))) continue
      const key = `${program}|${format}`
      if (!queries.has(key)) queries.set(key, new Set())
      for (const p of ps) queries.get(key).add(baseOf(p))
    }
  }
}
// TeX Live's answers, one kpsewhich per program and format, every name in one call; a name's answer is the line whose
// file is that name or that name with one of the format's suffixes
const script = [...queries].map(([key, names]) => {
  const [program, format] = key.split('|')
  const engine = PROGRAMS[program].engine ? `-engine=${PROGRAMS[program].engine}` : ''
  return `echo "@@ ${key}"; kpsewhich -progname=${PROGRAMS[program].progname} ${engine} -format='${NAMES[format]}' ${[...names].map(n => `'${n}'`).join(' ')}`
}).join('\n')
const out = execFileSync('docker', ['run', '--rm', '-i', '-v', `${TL}:/tl:ro`, '-w', '/tmp', '-e', 'TEXMF={!!$TEXMFDIST}', 'texlive/texlive:latest', 'sh', '-c', `export PATH=/tl/${YEAR}/bin/aarch64-linux:$PATH; sh`], { input: script, encoding: 'utf8', maxBuffer: 1 << 26 })
const native = new Map()
let current = null
for (const line of out.split('\n')) {
  if (line.startsWith('@@ ')) { current = line.slice(3); continue }
  if (!line || !current) continue
  const rel = line.replace(`/tl/${YEAR}/texmf-dist/`, '')
  const format = current.split('|')[1]
  for (const name of queries.get(current)) if (candidates(Number(format), name).includes(baseOf(rel)) && !native.has(`${current}|${name}`)) native.set(`${current}|${name}`, rel)
}
let compared = 0, same = 0
const differ = []
for (const [key, names] of queries) {
  const [program, format] = key.split('|')
  for (const name of names) {
    compared++
    const mine = kpathsea(Number(format), name, program), theirs = native.get(`${key}|${name}`) ?? null
    if (mine === theirs) same++
    else differ.push({ program, format: Number(format), name, index: mine, kpsewhich: theirs })
  }
}
console.log(`${duplicates.length} basenames held more than once; ${compared} questions (program, format, name): ${same} answered as kpsewhich, ${differ.length} not`)
for (const d of differ.slice(0, 40)) console.log(JSON.stringify(d))
// the keys BusyTeX would cache across programs: one name, one format, different files for different programs
const across = []
for (const [, ps] of duplicates) {
  for (const name of new Set(ps.map(baseOf))) {
    for (const format of Object.keys(index.paths).map(Number)) {
      const answers = new Set(Object.keys(PROGRAMS).map(program => resolve(index, format, name, program)).filter(Boolean))
      if (answers.size > 1) across.push({ format, name, answers: [...answers] })
    }
  }
}
console.log(`keys answered differently by different programs: ${across.length}`)
for (const a of across.slice(0, 40)) console.log(JSON.stringify(a))
process.exit(differ.length ? 1 : 0)
