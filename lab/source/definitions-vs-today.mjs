// lab/source/definitions-vs-today.mjs: what today's front end reads of a paper's definitions with its regexes, against what
// TeX holds at the document's start (the definitions pass, lab/source/definitions.mjs). For every control sequence the
// source uses, today's reading of how many arguments it takes (the paper's macros, paperMacros, else the role table,
// paperParams) against TeX's \meaning; for every conditional today knows, today's value at the document's start
// (newifValues) against TeX's; today's theorem environments and display shorthands against what their meanings run.
//   node --experimental-strip-types lab/source/definitions-vs-today.mjs --papers=<papers.json> --set=87 --defs=<dir> [--examples]
// Today's internals are read from a copy of src/pdf-reader/engine/{source,rules} in a temporary directory, with their
// internal readers exported: nothing in the repository is changed.
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const DEFS = arg('defs')
const ENGINE = new URL('../../src/pdf-reader/engine/', import.meta.url).pathname
const tmp = mkdtempSync(join(tmpdir(), 'axt-l2-today-'))
cpSync(join(ENGINE, 'source'), join(tmp, 'source'), { recursive: true })
cpSync(join(ENGINE, 'rules'), join(tmp, 'rules'), { recursive: true })
const lf = join(tmp, 'source/latex-front.mjs')
writeFileSync(lf, `${readFileSync(lf, 'utf8')}\nexport { paperMacros, newifValues, theoremsOf, texCommands }\nexport const setPaper = p => { paper = p }\n`)
const today = await import(join(tmp, 'source/latex-front.mjs'))
const roles = await import(join(tmp, 'rules/arg-roles.mjs'))
const { unpackSource } = await import(join(tmp, 'source/tar.mjs'))
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))

/** TeX's arity of a command: { n, opt, how } from its meaning (and LaTeX's internals) */
function texArity(d) {
  const m = d.meaning
  if (m.k === 'undefined') return { how: 'undefined' }
  if (m.k !== 'macro') return { how: 'not a macro', n: 0 }
  if (d.spec !== undefined) {
    const spec = d.spec.replace(/[{][^{}]*[}]/g, '').replace(/[+!>=]/g, '')
    const letters = spec.match(/[mrRvbodDOeEsStTlu]/g) ?? []
    return { how: 'xparse', n: letters.length, opt: /^[oOdDsStT]/.test(letters[0] ?? '') }
  }
  const body = m.body
  if (/^\\@protected@testopt |^\\@testopt |^\\kernel@ifnextchar \[|^\\@ifnextchar \[/.test(body) && d.opt?.k === 'macro') {
    const n = (d.opt.params.match(/#\d/g) ?? []).length
    return { how: 'optional', n, opt: true }
  }
  if (/^\\protect \\/.test(body) && d.robust?.k === 'macro') return texArity({ meaning: d.robust })
  const n = (m.params.match(/#\d/g) ?? []).length
  const delimited = m.params.replace(/#\d/g, '') !== ''
  if (delimited) return { how: 'delimited', n }
  if (n === 0 && /^\\@ifnextchar |^\\@ifstar |^\\kernel@ifnextchar |^\\@protected@testopt |^\\@testopt |^\\@dblarg /.test(body)) return { how: 'reads on', n: 0 }
  return { how: 'plain', n }
}

const tally = {}
const add = (k, ex) => { const t = (tally[k] ??= { n: 0, papers: new Set(), ex: [] }); t.n++; t.papers.add(ex[0]); if (t.ex.length < 3) t.ex.push(ex.join(' ')) }
for (const p of papers) {
  const defsFile = join(DEFS, `${p.id}.axtdefs`)
  if (!existsSync(defsFile)) continue
  const tex = readDefinitions(readFileSync(defsFile, 'utf8'))
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const text = f => today.texText(files.get(f))
  const own = [...files.keys()].filter(f => /\.(tex|sty|cls)$/i.test(f)).map(f => ({ file: f, text: text(f) }))
  const sources = [...files.keys()].filter(f => /\.(tex|sty)$/i.test(f)).map(text)
  const paper = roles.paperOf(own.map(x => x.text))
  today.setPaper(paper)
  const macros = today.paperMacros(own)
  const ifs = new Set([...sources.join('\n').matchAll(/\\newif\s*\\(if[A-Za-z@]+)/g)].map(m => m[1]))
  const ifValues = today.newifValues(sources, ifs)
  const theorems = today.theoremsOf(own.map(x => x.text))
  today.setPaper(null)
  for (const [name, d] of tex.names) {
    const t = texArity(d)
    const mine = paper.own.has(name) ? macros.get(name) : null
    const table = paper.own.has(name) ? null : roles.paperParams(name, paper)
    // the paper's own macros as today reads them
    if (paper.own.has(name)) {
      if (!mine) { add(`own: today no reading (every adjacent group) / TeX ${t.how}`, [p.id, name, t.n ?? '']); continue }
      if (t.how === 'undefined') { add('own: today a macro / TeX undefined', [p.id, name]); continue }
      if (t.how === 'not a macro') { add('own: today a macro / TeX not a macro', [p.id, name, d.meaning.text.slice(0, 40)]); continue }
      const agree = t.n === mine.params && !!t.opt === !!mine.opt
      add(`own: ${t.how}: ${agree ? 'agree' : 'arity differs'}`, [p.id, name, `today ${mine.params}${mine.opt ? 'o' : ''} TeX ${t.n}${t.opt ? 'o' : ''}`])
      continue
    }
    // a command today reads by the role table: its parameters' count against TeX's, where TeX's is a plain or optional macro
    if (table && (t.how === 'plain' || t.how === 'optional' || t.how === 'xparse')) {
      const req = table.filter(q => q.shape === '{' || q.shape === 'g').length, opt = table.some(q => q.shape === '[')
      const texReq = t.n - (t.opt ? 1 : 0)
      add(`table: ${t.how}: ${req === texReq ? 'required agree' : 'required differ'}`, [p.id, name, `table ${table.map(q => q.shape).join('')} TeX ${t.n}${t.opt ? 'o' : ''}`])
      void opt
    }
  }
  for (const name of ifs) {
    const d = tex.names.get(name)
    if (!d) continue
    const texValue = d.meaning.k === 'other' && d.meaning.text === '\\iftrue' ? true : d.meaning.k === 'other' && d.meaning.text === '\\iffalse' ? false : null
    const mine = ifValues.has(name) ? ifValues.get(name) : null
    const k = texValue === null ? `if: TeX not a newif value (${d.meaning.k === 'other' ? d.meaning.text : d.meaning.k})` : mine === null ? 'if: today unknown / TeX knows' : mine === texValue ? 'if: agree' : 'if: today wrong'
    add(k, [p.id, name, `today ${mine} TeX ${texValue}`])
  }
  for (const env of theorems) {
    const d = tex.names.get(env)
    if (!d) continue
    const body = d.meaning.k === 'macro' ? d.meaning.body : ''
    add(`theorem: today one / TeX ${/\\@thm |\\@spthm|\\@begintheorem|\\thmt@|\\@xnthm|\\@ynthm/.test(body) ? 'a theorem' : d.meaning.k === 'undefined' ? 'undefined' : 'other'}`, [p.id, env, body.slice(0, 40)])
  }
  for (const [name, d] of tex.names) {
    if (theorems.has(name) || d.meaning.k !== 'macro') continue
    if (/^\\@thm |^\\@spthm/.test(d.meaning.body)) add('theorem: TeX one / today not', [p.id, name, d.meaning.body.slice(0, 40)])
  }
}
const rows = Object.entries(tally).sort((a, b) => a[0].localeCompare(b[0]))
for (const [k, t] of rows) console.log(`${String(t.n).padStart(6)} ${String(t.papers.size).padStart(3)}p  ${k}${process.argv.includes('--examples') ? `\n         ${t.ex.join('\n         ')}` : ''}`)
