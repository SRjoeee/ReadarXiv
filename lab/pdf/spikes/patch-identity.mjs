// Gate, no compiling: for every C0-clean paper, patching with no translation but with unit marks, then taking the marks
// out again, gives exactly what patching without marks gives — the marks add nothing else to the source.
//   node spikes/patch-identity.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadProject, markUnits, patch } from './latex-front.mjs'
import { analyze } from './paper-meta.mjs'
// a unit's start mark and its end mark (latex-front.mjs markUnits)
const MARK = /\\leavevmode\\axtmark\{\d+s\}|\\axtend\{\d+e\}/g
const root = new URL('..', import.meta.url).pathname
const ids = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
let ok = 0, bad = [], marks = 0, units = 0
for (const id of ids) {
  const src = join(root, 'data/corpus', id, 'src')
  let project
  try { project = loadProject(src, analyze(src).main) } catch (e) { bad.push([id, 'load ' + e.message]); continue }
  const plain = patch(project, new Map()), marked = patch(project, new Map(), { mark: markUnits(project.units) })
  let same = true
  for (const [rel, bytes] of plain) {
    // comments inside a unit are dropped by any patch; the marks must add nothing else
    const m = Buffer.from(marked.get(rel)).toString('latin1'), n = (m.match(MARK) ?? []).length
    marks += n
    if (m.replace(MARK, '') !== Buffer.from(bytes).toString('latin1')) { same = false; bad.push([id, 'marked ' + rel]); break }
  }
  units += project.units.filter(u => u.kind !== 'heading' && u.kind !== 'cell').length
  if (same) ok++
}
console.log({ papers: ids.length, ok, bad: bad.slice(0, 10), marks, markableUnits: units })
