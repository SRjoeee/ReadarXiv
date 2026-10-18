#!/usr/bin/env node
// The review-citation gate (issue #236). A comment says what holds and why; who found it, in which review, is history,
// and the history is in the pull request. So no source under src/pdf-reader names a reviewer: a comment keeps the
// invariant in plain words, and a design decision moves into docs/PDF-READER.md (or docs/DESIGN.md where it concerns the
// extension as a whole), cited from the code by its section. The rest of src/ is counted per directory and never fails
// the check: it is the work left, and a directory joins the held one when its comments are cleaned.
//
// One form is matched, the one every citation takes: a reviewer's name as a word (Codex, Devin, Copilot) in a source
// file. That covers `Codex on #301`, `Codex and Devin on #317`, `Copilot on #12`, `Codex's review of #306`, `Codex's
// review of PR A`, `(Devin, #297)`, `per Codex on #306`, `Codex's second medium`, `Codex 6 on #306` and a bare `(Codex)`.
// No parser and no comment scanner: a name in a string would be flagged too, and no source of the held directory has any
// reason to hold one. A review round named without a reviewer (`the F2 review's I1`) is not matched.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The directory held at zero */
export const HELD = 'src/pdf-reader'
/** A reviewer's name as a word: Codex, Devin or Copilot, capitalised as a name is */
export const REVIEWER = /\b(?:Codex|Devin|Copilot)\b/
/** The files read: sources, styles and the data and prose that sit beside them */
const SOURCE = /\.(?:[cm]?[jt]sx?|css|html|md|json)$/

/** The lines of a text that name a reviewer: `{ line, name }`, line numbers from 1 */
export function citationsIn(text) {
  const found = []
  text.split('\n').forEach((text, i) => {
    const m = REVIEWER.exec(text)
    if (m) found.push({ line: i + 1, name: m[0], text: text.trim() })
  })
  return found
}

/** Every source file under `dir` (repository-relative, forward slashes), node_modules and dot directories left out */
export function sourceFiles(root, dir = 'src') {
  const out = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) out.push(...sourceFiles(root, path)) }
    else if (entry.isFile() && SOURCE.test(entry.name)) out.push(path)
  }
  return out.sort()
}

/** The group a file is counted in: its directory directly under src/ (src/core, src/providers), or src itself */
export const groupOf = file => (file.split('/').length > 2 ? file.split('/').slice(0, 2).join('/') : 'src')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The check on a tree: the citations under the held directory, and the counts of every other group */
export function check(root = '.') {
  const held = [], elsewhere = new Map()
  for (const file of sourceFiles(root)) {
    const found = citationsIn(readFileSync(join(root, file), 'utf8'))
    if (found.length === 0) continue
    if (file.startsWith(`${HELD}/`)) held.push(...found.map(c => ({ file, ...c })))
    else {
      const group = elsewhere.get(groupOf(file)) ?? { lines: 0, files: 0 }
      group.lines += found.length
      group.files += 1
      elsewhere.set(groupOf(file), group)
    }
  }
  return { held, elsewhere }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { held, elsewhere } = check()
  if (held.length > 0) {
    console.error(`A comment under ${HELD} names a reviewer (keep the invariant in plain words, drop who found it; move a design decision into docs/PDF-READER.md):`)
    for (const c of held) console.error(`  ${c.file}:${c.line}: ${c.name} — ${c.text.length > 110 ? `${c.text.slice(0, 107)}...` : c.text}`)
    process.exit(1)
  }
  const counts = [...elsewhere].sort(([a], [b]) => a.localeCompare(b)).map(([group, n]) => `${group} ${plural(n.lines, 'line')} in ${plural(n.files, 'file')}`)
  console.log(`review citations: ${HELD} holds none; ${counts.length === 0 ? 'none elsewhere in src/' : `counted, not held: ${counts.join(', ')}`}`)
}
