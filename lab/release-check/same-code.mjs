#!/usr/bin/env node
// lab/release-check/same-code.mjs: the proof that a change moved no code (the reduction round's design §3e: a typing lane's
// diff, a comment lane's, a citation rewrite's). Each version of a file is passed through esbuild's transform with white space
// minified and comments dropped, imports kept as written (verbatimModuleSyntax: an import a type alone used is erased only when
// it says `import type`, so an unused one is never dropped on one side only); type annotations, `!`, `as`, `satisfies`, type
// declarations and declaration files erase to nothing. Two versions are "same code" when the two outputs are byte-identical once
// each relative or aliased import specifier of the old one is mapped through the change's renames (a file moved or made
// TypeScript keeps its importers' code the same). A deleted facade (a module that only re-exports another's values under their
// own names, facadeOf) is the same code, and its importers' specifiers are read as naming the module it re-exported. A style
// sheet is compared the same way, its comments and white space out.
// Reads git and the files only; no network, no slot. Not shipped.
//
//   node lab/release-check/same-code.mjs <base ref> [<head ref>]   every file the change touches (head omitted: the working tree,
//                                                                   untracked files included)
//   node lab/release-check/same-code.mjs <old file> <new file>     two versions of one file
//   --rename=<old path>:<new path>   a pair the diff's rename detection missed (repeatable; repository paths)
//   --all                            judge tests, the lab and tooling too (default: product files, the others listed)
//   --json                           the rows as JSON
// Exit 0 when every judged file is "same code", 1 when one is not, 2 on a usage error.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from '@babel/parser'
import { transformSync } from 'esbuild'
import { placeOf } from './census-lib.mjs'
import { ENGINE_PROFILE } from './census-profile.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const JS = /\.(?:m|c)?jsx?$/
const TS = /\.(?:m|c)?tsx?$/
const DECL = /\.d\.(?:m|c)?ts$/

/** what a file's kind is to this proof: `code` (JavaScript or TypeScript), `types` (a declaration file: no code), `style`, or
 *  `other` (not judged) */
export function proofKindOf(path) {
  if (DECL.test(path)) return 'types'
  if (JS.test(path) || TS.test(path)) return 'code'
  if (path.endsWith('.css')) return 'style'
  return 'other'
}

/** a file's code with its types, comments and white space out: esbuild's transform as §3e states it ('' for a declaration file;
 *  null where esbuild cannot read it) */
export function erasedOf(text, path) {
  const kind = proofKindOf(path)
  if (kind === 'types') return ''
  if (kind === 'other') return null
  const loader = kind === 'style' ? 'css' : /\.(?:m|c)?tsx$/.test(path) ? 'tsx' : TS.test(path) ? 'ts' : /\.jsx$/.test(path) ? 'jsx' : 'js'
  try {
    return transformSync(text, { loader, minifyWhitespace: true, legalComments: 'none', target: 'esnext', tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true, useDefineForClassFields: true } } }).code
  } catch {
    return null
  }
}

const stem = p => p.replace(/\.(?:d\.)?(?:m|c)?[jt]sx?$/, '')

/**
 * The erased code of a file at `from` with each import specifier written as the file at `to` would write it after the renames:
 * a relative or aliased specifier is resolved from `from`, the path mapped through `renames` (an old path to its new one; a
 * specifier without an extension maps by the path less its extension), and written again from `to` in the form it had.
 */
export function mappedOf(code, from, to, renames = new Map(), aliases = ENGINE_PROFILE.aliases) {
  if (!code) return code
  let ast
  try {
    ast = parse(code, { sourceType: 'module', errorRecovery: true, plugins: ['jsx', 'importAttributes'] })
  } catch {
    return code
  }
  const byStem = new Map([...renames].map(([a, b]) => [stem(a), stem(b)]))
  const map = p => renames.get(p) ?? (stem(p) === p ? byStem.get(p) : undefined) ?? p
  const write = spec => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const path = map(posix.normalize(posix.join(posix.dirname(from), spec)))
      const rel = posix.relative(posix.dirname(to), path)
      return rel.startsWith('.') ? rel : `./${rel}`
    }
    const a = aliases.find(x => spec.startsWith(x.from))
    if (a) return `${a.from}${map(`${a.to}${spec.slice(a.from.length)}`).slice(a.to.length)}`
    return spec
  }
  const spots = []
  const visit = node => {
    if (!node || typeof node.type !== 'string') return
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) spots.push(node.source)
    else if (node.type === 'ImportExpression' && node.source?.type === 'StringLiteral') spots.push(node.source)
    else if (node.type === 'CallExpression' && node.callee?.type === 'Import' && node.arguments[0]?.type === 'StringLiteral') spots.push(node.arguments[0])
    else if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments[0]?.type === 'StringLiteral' && code.slice(node.arguments[1]?.start ?? 0, node.arguments[1]?.end ?? 0) === 'import.meta.url') spots.push(node.arguments[0])
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue
      const v = node[k]
      if (Array.isArray(v)) v.forEach(visit)
      else if (v && typeof v.type === 'string') visit(v)
    }
  }
  visit(ast.program)
  let out = code
  for (const s of spots.sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + JSON.stringify(write(s.value)) + out.slice(s.end)
  return out
}

/** where two outputs first differ: the byte and a little of each side around it */
function firstDifference(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return { at: i, old: a.slice(Math.max(0, i - 30), i + 50), new: b.slice(Math.max(0, i - 30), i + 50) }
}

/**
 * One file's verdict: `old` and `new` its two versions ({ path, text, at? } or null where it was added or deleted; `at`, where
 * the old version's specifiers are read from, its path unless said). `same` when the erased codes are byte-identical, the old
 * one's specifiers mapped through `renames`; a file added or deleted whole is the same code where it holds none (types alone, a
 * declaration file).
 */
export function verdictOf(old, next, renames = new Map()) {
  const path = next?.path ?? old.path
  const kind = proofKindOf(path)
  const oldKind = old ? proofKindOf(old.path) : kind
  if (kind === 'other' && oldKind === 'other') return { old: old?.path ?? null, new: next?.path ?? null, verdict: 'not code' }
  const a = old ? erasedOf(old.text, old.path) : ''
  const b = next ? erasedOf(next.text, next.path) : ''
  if (a == null || b == null) return { old: old?.path ?? null, new: next?.path ?? null, verdict: 'unreadable' }
  const mapped = old && next ? mappedOf(a, old.at ?? old.path, next.path, renames) : a
  // (the new side's specifiers written the same way, so that a specifier is compared as a path, not as a spelling)
  const written = next ? mappedOf(b, next.path, next.path, new Map()) : b
  if (mapped === written) return { old: old?.path ?? null, new: next?.path ?? null, verdict: 'same code' }
  const verdict = !old ? 'code added' : !next ? 'code removed' : 'code changed'
  return { old: old?.path ?? null, new: next?.path ?? null, verdict, difference: firstDifference(mapped, written) }
}

const git = (repo, args, input) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] })

/** the change from `base` to `head` (null: the working tree) as pairs of paths: git's own renames, a JavaScript file deleted and
 *  a TypeScript file of its stem added (in its directory, else the one such pair of that name anywhere), and `extra` pairs */
export function changesOf(repo, base, head = null, extra = []) {
  const raw = git(repo, ['diff', '--name-status', '-M', '-z', base, ...(head ? [head] : [])]).split('\0').filter(Boolean)
  const pairs = []
  const added = []
  const deleted = []
  for (let i = 0; i < raw.length; ) {
    const status = raw[i++]
    if (status.startsWith('R') || status.startsWith('C')) {
      const from = raw[i++]
      const to = raw[i++]
      if (status.startsWith('R')) pairs.push([from, to])
      else added.push(to)
    } else {
      const path = raw[i++]
      if (status === 'A') added.push(path)
      else if (status === 'D') deleted.push(path)
      else pairs.push([path, path])
    }
  }
  if (!head) for (const p of git(repo, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) added.push(p)
  const take = (from, to) => {
    pairs.push([from, to])
    deleted.splice(deleted.indexOf(from), 1)
    added.splice(added.indexOf(to), 1)
  }
  for (const [from, to] of extra) if (deleted.includes(from) && added.includes(to)) take(from, to)
  const name = p => posix.basename(stem(p))
  for (const d of [...deleted].filter(p => JS.test(p))) {
    const here = added.find(a => TS.test(a) && !DECL.test(a) && stem(a) === stem(d))
    if (here) take(d, here)
  }
  for (const d of [...deleted].filter(p => JS.test(p))) {
    const there = added.filter(a => TS.test(a) && !DECL.test(a) && name(a) === name(d))
    const rivals = deleted.filter(p => JS.test(p) && name(p) === name(d))
    if (there.length === 1 && rivals.length === 1) take(d, there[0])
  }
  return { pairs, added, deleted }
}

/**
 * The module a deleted file was a facade of, or null: a facade's erased code only imports one module as a namespace and exports
 * that module's values under their own names (`import * as m from './x.mjs'`, `export const A = m.A`, `export { A } from
 * './x.mjs'`), none of them a `let` or a `var` of the module (whose binding a snapshot would not follow). `moduleText` reads the
 * module's old text by its path.
 */
export function facadeOf(text, path, moduleText) {
  const code = erasedOf(text, path)
  if (!code) return null
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['importAttributes'] })
  } catch {
    return null
  }
  const sources = new Set()
  const spaces = new Set()
  const names = []
  for (const s of ast.program.body) {
    if (s.type === 'ImportDeclaration' && s.specifiers.length === 1 && s.specifiers[0].type === 'ImportNamespaceSpecifier') {
      sources.add(s.source.value)
      spaces.add(s.specifiers[0].local.name)
    } else if (s.type === 'ExportNamedDeclaration' && s.source && s.specifiers.every(x => x.type === 'ExportSpecifier' && x.local.name === (x.exported.name ?? x.exported.value))) {
      sources.add(s.source.value)
      names.push(...s.specifiers.map(x => x.local.name))
    } else if (s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'VariableDeclaration' && s.declaration.kind === 'const') {
      for (const d of s.declaration.declarations) {
        const i = d.init
        if (d.id.type !== 'Identifier' || i?.type !== 'MemberExpression' || i.computed || i.object.type !== 'Identifier' || !spaces.has(i.object.name) || i.property.name !== d.id.name) return null
        names.push(d.id.name)
      }
    } else return null
  }
  if (sources.size !== 1) return null
  const [spec] = sources
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null
  const module = posix.normalize(posix.join(posix.dirname(path), spec))
  const mod = moduleText(module)
  if (mod == null) return null
  const modCode = erasedOf(mod, module)
  let modAst
  try {
    modAst = parse(modCode ?? '', { sourceType: 'module', plugins: ['jsx', 'importAttributes'] })
  } catch {
    return null
  }
  const changing = new Set(modAst.program.body.flatMap(s => {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s
    return d?.type === 'VariableDeclaration' && d.kind !== 'const' ? d.declarations.flatMap(x => (x.id.type === 'Identifier' ? [x.id.name] : [])) : []
  }))
  return names.some(n => changing.has(n)) ? null : module
}

/** every changed file's verdict between `base` and `head` (null: the working tree) of the checkout at `repo` */
export function compareRefs(repo, base, head = null, extra = []) {
  const { pairs, added, deleted } = changesOf(repo, base, head, extra)
  const renames = new Map(pairs.filter(([a, b]) => a !== b))
  const at = (ref, path) => ({ path, text: git(repo, ['show', `${ref}:${path}`]) })
  const now = path => ({ path, text: head ? git(repo, ['show', `${head}:${path}`]) : readFileSync(resolve(repo, path), 'utf8') })
  const old = path => {
    try {
      return git(repo, ['show', `${base}:${path}`])
    } catch {
      return null
    }
  }
  // (a facade deleted: its importers' specifiers read as naming its module, wherever the change moved it)
  const facades = new Map()
  for (const d of deleted) {
    if (proofKindOf(d) !== 'code') continue
    const module = facadeOf(old(d), d, old)
    if (module) facades.set(d, renames.get(module) ?? module)
  }
  const mapping = new Map([...renames, ...facades])
  const rows = [
    ...pairs.map(([a, b]) => verdictOf(at(base, a), now(b), mapping)),
    ...added.map(p => verdictOf(null, now(p), mapping)),
    ...deleted.map(p => (facades.has(p) ? { old: p, new: null, verdict: 'same code', facade: facades.get(p) } : verdictOf(at(base, p), null, mapping))),
  ]
  for (const r of rows) r.role = placeOf(r.new ?? r.old, ENGINE_PROFILE).role
  return rows.sort((a, b) => (a.new ?? a.old).localeCompare(b.new ?? b.old))
}

/** the rows' summary: judged (product files, or every code file with `all`), and how many of them are not the same code */
export function summaryOf(rows, all = false) {
  const judged = rows.filter(r => r.verdict !== 'not code' && (all || r.role === 'product'))
  const changed = judged.filter(r => r.verdict !== 'same code')
  return { judged: judged.length, same: judged.length - changed.length, changed: changed.length, others: rows.filter(r => r.verdict !== 'not code' && !judged.includes(r)).length, notCode: rows.filter(r => r.verdict === 'not code').length }
}

// ---------------------------------------------------------------- the command

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const plain = argv.filter(a => !a.startsWith('--'))
  const flag = name => argv.includes(`--${name}`)
  const extra = argv.filter(a => a.startsWith('--rename=')).map(a => a.slice('--rename='.length).split(':'))
  const bad = argv.filter(a => a.startsWith('--') && !['--all', '--json'].includes(a) && !a.startsWith('--rename='))
  if (plain.length < 1 || plain.length > 2 || bad.length || extra.some(p => p.length !== 2)) {
    console.error('usage: same-code.mjs <base ref> [<head ref>] | <old file> <new file>  [--rename=<old>:<new>]… [--all] [--json]')
    process.exit(2)
  }
  let rows
  if (plain.length === 2 && plain.every(p => existsSync(p))) {
    // (two files: the old one's specifiers read as if it stood where the new one does)
    const [a, b] = plain.map(p => resolve(p))
    rows = [verdictOf({ path: a, at: b, text: readFileSync(a, 'utf8') }, { path: b, text: readFileSync(b, 'utf8') })]
    rows[0].role = 'product'
  } else {
    try {
      rows = compareRefs(ROOT, plain[0], plain[1] ?? null, extra)
    } catch (e) {
      console.error(`same-code: ${String(e.stderr || e.message).trim()}`)
      process.exit(2)
    }
  }
  const s = summaryOf(rows, flag('all'))
  if (flag('json')) console.log(JSON.stringify({ summary: s, rows }, null, 1))
  else {
    for (const r of rows) {
      const name = r.old && r.new && r.old !== r.new ? `${r.old} → ${r.new}` : (r.new ?? r.old)
      console.log(`${r.verdict.padEnd(13)} ${name}${r.facade ? ` (a facade of ${r.facade})` : ''}${r.role === 'product' || r.verdict === 'not code' ? '' : ` (${r.role})`}`)
      if (r.difference) console.log(`              first difference at byte ${r.difference.at}: old …${JSON.stringify(r.difference.old)}… new …${JSON.stringify(r.difference.new)}…`)
    }
    console.log(`same-code: ${s.judged} ${flag('all') ? 'code' : 'product'} files judged, ${s.same} the same code, ${s.changed} not; ${s.others} other code files listed, ${s.notCode} files not code`)
  }
  process.exit(s.changed ? 1 : 0)
}
