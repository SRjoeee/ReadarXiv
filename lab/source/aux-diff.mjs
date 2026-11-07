// lab/source/aux-diff.mjs <with dir> <plain dir>: what a first pass with the ask file and the probe writes against the paper's
// own first pass (lab/source/definitions.mjs --digests, with and with --plain): each file either wrote, by digest; the papers
// whose files differ, and which files (review of #608, 4). Not shipped.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [WITH, PLAIN] = process.argv.slice(2)
const t = { papers: 0, same: 0, differ: [], files: 0 }
for (const f of readdirSync(WITH).filter(f => /^\d.*\.json$/.test(f) && !f.endsWith('.probe.json'))) {
  let a, b
  try { a = JSON.parse(readFileSync(join(WITH, f), 'utf8')); b = JSON.parse(readFileSync(join(PLAIN, f), 'utf8')) } catch { continue }
  if (!a.files || !b.files) continue
  t.papers++
  t.files += Object.keys(b.files).length
  const names = new Set([...Object.keys(a.files), ...Object.keys(b.files)])
  const bad = [...names].filter(n => a.files[n] !== b.files[n]).map(n => `${n}${!(n in a.files) ? ' (plain only)' : !(n in b.files) ? ' (with only)' : ''}`)
  if (bad.length) t.differ.push(`${a.id}: ${bad.join(', ')}`)
  else t.same++
}
console.log(JSON.stringify(t, null, 1))
