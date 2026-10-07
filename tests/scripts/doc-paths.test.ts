// The documents' paths, and the directory the tree no longer has. Three promises, tested so that a move cannot quietly
// leave the prose behind:
//   - every repository path the documents put in backticks is a file or a directory of the tree, or lies under the
//     ignored data/ and out/ of a lab (the machine's own data, never in the repository);
//   - no tracked file names the old experiment directory, but as an archive pointer into the freeze's tag
//     (`git show exp-freeze-2026-10-07:<path>`), which is how its plans and report are read now;
//   - nothing under src/ imports from lab/: the extension never depends on a measurement.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
const tracked = git('ls-files', '-z').split('\0').filter(Boolean)

/** the documents under test: the project's rules, the documents of docs/ (not those in its folders), the two READMEs of the lab and the parked tree */
const DOCUMENTS = ['CLAUDE.md', ...tracked.filter(file => /^docs\/[^/]+\.md$/.test(file)), 'lab/pdf/README.md', 'parked/README.md']

/** the directories of the tree a document may name a path in (reference/, .output/ and the like are ignored directories, not the tree) */
const ROOTS = new Set(tracked.filter(file => file.includes('/')).map(file => file.split('/')[0]!))
const FILES = new Set(tracked)
/** a module named without its extension (`src/shared/messages`) names the file that has the stem */
const STEMS = new Set(tracked.map(file => file.replace(/\.[^./]+$/, '')))
/** written into the package by the build, not kept in the tree (scripts/third-party-notices.mjs makes it) */
const GENERATED = new Set(['licenses/third-party.txt'])
const DIRECTORIES = new Set(tracked.flatMap(file => { const parts = file.split('/'); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')) }))

/** what a lab keeps on the machine and not in the repository (its .gitignore says so, checked below) */
const MACHINE = /^(?:lab\/pdf\/(?:data|out|node_modules|poc-reader\/papers)|parked\/(?:lab|tex-page)\/(?:data|out))(?:\/|$)/
const IGNORED: Record<string, string[]> = { 'lab/pdf': ['data/', 'out/', 'node_modules/', 'poc-reader/papers/'], parked: ['data/', 'out/'] }

/** the words of a document that sit in backticks: a code span's words, and every word of a fenced block */
function backticked(text: string): string[] {
  const words: string[] = []
  let fenced = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue }
    const pieces = fenced ? [line] : [...line.matchAll(/`([^`]+)`/g)].map(m => m[1]!)
    for (const piece of pieces) words.push(...piece.split(/\s+/).filter(Boolean))
  }
  return words
}

/** a word as a path of the tree, or null for anything else (a command, a glob, a placeholder, a path outside the tree) */
function repositoryPath(word: string): string | null {
  const path = word.replace(/^[("'[]+|[)"',;.\]]+$/g, '').replace(/[:#]\S*$/, '')
  if (!/^[\w.@/-]+$/.test(path) || !path.includes('/')) return null
  // `<path>@<commit>` names a file of a reference project at a commit (docs/THIRD_PARTY.md), whatever its directories are called
  if (/@[0-9a-f]{7,}$/.test(path)) return null
  return ROOTS.has(path.split('/')[0]!) ? path : null
}

describe('the paths in the documents', () => {
  it('finds a path of the tree among the words, and nothing else', () => {
    const found = backticked('see `src/a.ts` and `pnpm e2e` and `a b/c` here\n```\nnode tests/x.mjs  # out/y\n```').map(repositoryPath)
    expect(found.filter(Boolean)).toEqual(['src/a.ts', 'tests/x.mjs'])
    expect(repositoryPath('src/a.ts:12')).toBe('src/a.ts')
    expect(repositoryPath('src/<kind>/x.ts')).toBeNull()
    expect(repositoryPath('src/*.ts')).toBeNull()
    expect(repositoryPath('reference/kiss/x.ts')).toBeNull()
    expect(repositoryPath('src/utils/x.ts@9b44f82')).toBeNull()
    expect(repositoryPath('exp-freeze-2026-10-07:docs/DESIGN.md')).toBeNull()
  })

  it('has each of the documents', () => {
    expect(DOCUMENTS).toEqual(expect.arrayContaining(['CLAUDE.md', 'docs/DESIGN.md', 'docs/PDF-READER.md', 'lab/pdf/README.md', 'parked/README.md']))
    for (const doc of DOCUMENTS) expect([doc, FILES.has(doc)]).toEqual([doc, true])
  })

  it('names, in backticks, only paths that exist or lie under the ignored directories of a lab (data/, out/, …)', () => {
    const missing: string[] = []
    for (const doc of DOCUMENTS) {
      if (!FILES.has(doc)) continue
      for (const word of backticked(readFileSync(join(ROOT, doc), 'utf8'))) {
        const path = repositoryPath(word)
        if (path === null || MACHINE.test(path) || FILES.has(path) || STEMS.has(path) || DIRECTORIES.has(path.replace(/\/$/, '')) || GENERATED.has(path)) continue
        missing.push(`${doc}: ${path}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('has the generated paths made by the script that is said to make them', () => {
    expect(readFileSync(join(ROOT, 'scripts/third-party-notices.mjs'), 'utf8')).toContain('licenses/third-party.txt')
  })

  it('has what it calls ignored ignored', () => {
    for (const [dir, entries] of Object.entries(IGNORED)) {
      const lines = readFileSync(join(ROOT, dir, '.gitignore'), 'utf8').split('\n').map(line => line.trim())
      expect([dir, entries.filter(entry => !lines.includes(entry))]).toEqual([dir, []])
    }
  })
})

describe('the old experiment directory', () => {
  const OLD = ['experiments', 'pdf-bilingual'].join('/')
  /** an archive pointer: a path read out of the freeze's tag, `git show exp-freeze-2026-10-07:<path>` */
  const POINTER = new RegExp(`exp-freeze-\\d{4}-\\d{2}-\\d{2}:${OLD}`, 'g')

  it('is not in the tree', () => {
    expect(existsSync(join(ROOT, 'experiments'))).toBe(false)
  })

  /** the files whose bytes the layer gate hashes into every run it records (`measures`, layer-gate.mjs): one changed byte
   *  makes the record "not comparable", so their first line still names the directory they were made in */
  const HASHED = ['measure.mjs', 'score.mjs', 'page.mjs', 'proto.mjs'].map(file => `lab/pdf/spikes/layer-gate/${file}`)

  it('is named by no tracked file but as an archive pointer (parked/ keeps the spelling it ran under, parked/README.md, Roots)', () => {
    let hits = ''
    try { hits = git('grep', '-I', '-n', '-F', OLD, '--', '.', ':!parked') } catch { /* git grep exits 1 for no match */ }
    const named = hits.split('\n').filter(Boolean)
      .filter(hit => !HASHED.some(file => hit.startsWith(`${file}:`)))
      .filter(hit => hit.replace(POINTER, '').includes(OLD))
    expect(named).toEqual([])
  })

  it('leaves the old spelling only in the files the layer gate hashes, which it names itself', () => {
    expect(readFileSync(join(ROOT, 'lab/pdf/spikes/layer-gate.mjs'), 'utf8')).toContain("['measure.mjs', 'score.mjs', PROTO ? 'proto.mjs' : 'page.mjs'].map(f => readFileSync(join(GATE, f)))")
    for (const file of HASHED) expect([file, FILES.has(file)]).toEqual([file, true])
  })
})

describe('the lab and the extension', () => {
  const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew URL\(\s*)(['"`])(\.{1,2}\/[^'"`\n]*)\1/g
  const sources = tracked.filter(file => /^src\/.*\.(?:[cm]?[jt]sx?|d\.mts)$/.test(file))

  it('has no file under src/ that imports from lab/', () => {
    // a scan that reads nothing would pass for the wrong reason
    expect(sources.length).toBeGreaterThan(300)
    const importing = sources.filter(file => [...readFileSync(join(ROOT, file), 'utf8').matchAll(SPECIFIER)].some(m => {
      const landed = relative(ROOT, resolve(ROOT, dirname(file), m[2]!))
      return landed === 'lab' || landed.startsWith('lab/')
    }))
    expect(importing).toEqual([])
  })
})
