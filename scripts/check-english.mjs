#!/usr/bin/env node
// The English gate: no Chinese (CJK) text may enter developer-visible files beyond what the allow-list already
// grants. The allow-list is a ratchet: each entry names a file and the number of lines with CJK characters it may
// hold — product copy quoted as evidence, multilingual test inputs, observed machine-translation outputs, the CJK
// ranges of regexes. A file over its allowance, or a file with CJK and no entry, fails the check — and so does an
// entry granting more than its file holds, or naming a file that holds none: the list says what is there, exactly, so
// the slack a removed line leaves cannot be spent on a new one unseen. Raising an entry is a review question. Locale
// packs, localisation data, fixtures, the figure recogniser's models with their character list (public/ocr: 6 174 of
// the 6 904 characters the model reads are CJK) and the read-only reference checkouts are outside the check altogether
// (they are product data, not prose). A pack's comments are English by convention like every other comment; telling a
// comment from a string exactly needs a parser, and the repository's TypeScript (7, native) exposes none to scripts,
// so review holds that line rather than a guess (Devin on #230).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/
const OUTSIDE = [/^src\/locales\//, /^public\/_locales\//, /^public\/ocr\//, /^tests\/fixtures\//, /^reference\//, /\.zh-CN\.md$/, /^README\.zh/, /^scripts\/check-english\.mjs$/, /\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|woff2?)$/]
const ALLOW_FILE = 'scripts/english-allowlist.txt'
const writing = process.argv.includes('--write')
const allow = new Map()
for (const raw of writing ? [] : readFileSync(ALLOW_FILE, 'utf8').split('\n')) {
  const line = raw.replace(/#.*$/, '').trim()
  if (!line) continue
  const m = /^(\S+)\s+(\d+)$/.exec(line)
  if (!m) throw new Error(`${ALLOW_FILE}: cannot parse "${raw}"`)
  allow.set(m[1], Number(m[2]))
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const problems = []
const seen = new Set()
for (const file of files) {
  if (OUTSIDE.some(re => re.test(file))) continue
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  const hits = []
  text.split('\n').forEach((l, i) => { if (CJK.test(l)) hits.push(i + 1) })
  if (hits.length === 0) continue
  seen.add(file)
  const allowed = allow.get(file) ?? 0
  if (hits.length > allowed) problems.push(`${file}: ${hits.length} lines with CJK, ${allowed} allowed (lines ${hits.slice(0, 8).join(', ')}${hits.length > 8 ? ', …' : ''})`)
  else if (hits.length < allowed) problems.push(`${ALLOW_FILE}: ${file} holds ${hits.length} lines with CJK, the entry grants ${allowed}; lower it to ${hits.length}`)
}
for (const file of allow.keys()) {
  if (seen.has(file)) continue
  problems.push(files.includes(file) ? `${ALLOW_FILE}: ${file} holds no CJK any more; drop its entry` : `${ALLOW_FILE}: ${file} no longer exists; drop its entry`)
}
if (writing) {
  // Regenerate the allow-list from the current tree (for the sweep that establishes the ratchet)
  const out = ['# Files that hold lines with CJK characters, and how many — exactly (scripts/check-english.mjs). Raise an entry only with a reason beside it.']
  for (const file of files) {
    if (OUTSIDE.some(re => re.test(file))) continue
    let n = 0
    try { n = readFileSync(file, 'utf8').split('\n').filter(l => CJK.test(l)).length } catch { continue }
    if (n) out.push(`${file} ${n}`)
  }
  writeFileSync(ALLOW_FILE, `${out.join('\n')}\n`)
  console.log(`wrote ${ALLOW_FILE} (${out.length - 1} files)`)
  process.exit(0)
}
if (problems.length) {
  console.error('Chinese text outside the allowance (developer-visible text is English; see CLAUDE.md § Language):')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`english check: ${seen.size} files within their allowance`)
