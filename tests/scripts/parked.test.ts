// The parked tree (parked/README.md): code and records kept in the repository, no longer part of the product — not built,
// not type-checked, not tested, and checked by the English gate alone. Three promises are tested here so that parking
// cannot quietly break them:
//   - nothing that ships or is kept up imports from parked/ (a kept file reaching into parked/ would make it half alive);
//   - the TeX page's published versions carry an offer of their source (AGPL, DESIGN §16), made by tex-page/build.mjs
//     from the files its SOURCE list names, and parked/tex-page/ must still hold every one of them;
//   - each parked part names the commit where it last ran, so that reviving it starts from something that worked.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const PARKED = join(ROOT, 'parked')
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const CODE = /\.(?:[cm]?[jt]sx?)$/
const SKIP = new Set(['node_modules', '.git', '.output', '.wxt', 'fixtures', 'data', 'out'])

/** every code file under `dir` (a path from the root), as paths from the root; nothing for a directory that is not there */
function codeUnder(dir: string): string[] {
  const at = join(ROOT, dir)
  if (!existsSync(at)) return []
  return readdirSync(at, { withFileTypes: true }).flatMap(entry => {
    if (SKIP.has(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? codeUnder(path) : CODE.test(entry.name) ? [path] : []
  })
}

/** the relative specifiers of a file's imports, re-exports, dynamic imports, requires and `new URL(…)`s */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew URL\(\s*)(['"`])(\.{1,2}\/[^'"`\n]*)\1/g
const specifiersOf = (text: string): string[] => [...text.matchAll(SPECIFIER)].map(m => m[2]!)

/** the files among `files` (paths from `root`) whose relative imports land inside root/parked/ */
function importingParked(root: string, files: string[]): string[] {
  return files.filter(file => specifiersOf(readFileSync(join(root, file), 'utf8')).some(spec => {
    const landed = relative(root, resolve(root, dirname(file), spec))
    return landed === 'parked' || landed.startsWith('parked/')
  }))
}

describe('what imports from parked/', () => {
  it('finds a relative import that lands there, in every spelling, and none that merely names it', () => {
    const root = mkdtempSync(join(tmpdir(), 'parked-scan-'))
    try {
      const at = (name: string, ...lines: string[]) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), lines.join('\n')) }
      // the specifiers are put together here, so that this file holds no import of its own for the scan below to find
      const to = (path: string) => `'${['..', '..', 'parked', path].join('/')}'`
      at('src/a/static.mjs', `import x from ${to('a.mjs')}`)
      at('src/a/reexport.mjs', `export * from ${to('b.mjs')}`)
      at('src/a/dynamic.mjs', `const m = await import(${to('c.mjs')})`)
      at('src/a/url.mjs', `const u = new URL(${to('d.json')}, import.meta.url)`)
      at('src/a/require.cjs', `const r = require(${to('e.cjs')})`)
      at('src/a/clean.mjs', "import y from './sibling.mjs'", `// see ${to('f.md')} for why`, "const s = 'parked/g.md'")
      at('src/a/elsewhere.mjs', "import z from '../../experiments/h.mjs'")
      const files = ['static', 'reexport', 'dynamic', 'url', 'clean', 'elsewhere'].map(name => `src/a/${name}.mjs`).concat('src/a/require.cjs')
      expect(importingParked(root, files)).toEqual(['src/a/static.mjs', 'src/a/reexport.mjs', 'src/a/dynamic.mjs', 'src/a/url.mjs', 'src/a/require.cjs'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('is no file under src/, tests/, scripts/, lab/ or experiments/, nor the build configuration', () => {
    const files = [...['src', 'tests', 'scripts', 'lab', 'experiments'].flatMap(codeUnder), 'wxt.config.ts']
    // a scan that reads nothing would pass for the wrong reason
    expect(files.length).toBeGreaterThan(200)
    expect(importingParked(ROOT, files)).toEqual([])
  })
})

describe('parked/tex-page/ and the source offer of the published TeX page', () => {
  const build = join(PARKED, 'tex-page/tex-page/build.mjs')
  // build.mjs resolves its SOURCE list against EXP, the directory above its own: parked/tex-page/
  const exp = resolve(dirname(build), '..')
  const source = (): string[] => {
    const list = /const SOURCE = \[([^\]]*)\]/.exec(readFileSync(build, 'utf8'))?.[1]
    if (!list) throw new Error('build.mjs holds no SOURCE list')
    return [...list.matchAll(/'([^']+)'/g)].map(m => m[1]!)
  }

  it('holds every file the SOURCE list of build.mjs names, as tracked files', () => {
    const named = source()
    expect(named.length).toBeGreaterThan(10)
    expect(named).toContain('tex-page/build.mjs')
    const tracked = new Set(git('ls-files', '-z', 'parked/tex-page').split('\0'))
    const missing = named.filter(file => !tracked.has(relative(ROOT, join(exp, file))))
    expect(missing).toEqual([])
  })

  it('finds the GPL text the offer copies from the repository root, two directories above its own', () => {
    expect(relative(ROOT, resolve(exp, '../../LICENSE'))).toBe('LICENSE')
    expect(existsSync(join(ROOT, 'LICENSE'))).toBe(true)
  })

  it('took the programs out of experiments/ and tests/, so that nothing is left in two places', () => {
    for (const gone of ['poc-site', 'tex-page', 'busytex', 'upstream', 'setup.mjs', 'spikes/make-metafont.mjs', 'spikes/serve-live.mjs']) {
      expect([gone, existsSync(join(ROOT, 'experiments/pdf-bilingual', gone))]).toEqual([gone, false])
    }
    expect(existsSync(join(ROOT, 'tests/tex-page'))).toBe(false)
    expect(readdirSync(join(PARKED, 'tex-page/tests')).filter(name => name.endsWith('.test.ts')).length).toBeGreaterThan(0)
  })
})

describe('parked/README.md', () => {
  const readme = () => readFileSync(join(PARKED, 'README.md'), 'utf8')
  const parts = () => readdirSync(PARKED, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  /** the commit a part's section names: "commit `<hex>`" under a heading that names the part's directory */
  const commitOf = (part: string): string | undefined => {
    const section = readme().split(/^## /m).find(s => s.split('\n')[0]!.includes(`parked/${part}/`))
    return section && /commit `([0-9a-f]+)`/.exec(section)?.[1]
  }

  it('has a section for each parked part, and in it a commit (7 to 40 hex digits)', () => {
    expect(parts().sort()).toEqual(['lab', 'tex-page'])
    for (const part of parts()) {
      const commit = commitOf(part)
      expect([part, commit]).toEqual([part, expect.stringMatching(/^[0-9a-f]{7,40}$/)])
    }
  })

  // CI checks out one commit deep: there the history is cut, and a commit that is real is not found
  const shallow = git('rev-parse', '--is-shallow-repository') === 'true'
  it.skipIf(shallow)('names commits that HEAD descends from (not checked in a shallow clone, where the history is cut)', () => {
    for (const part of parts()) {
      const commit = commitOf(part)!
      let reachable = true
      try { git('merge-base', '--is-ancestor', commit, 'HEAD') } catch { reachable = false }
      expect([part, commit, reachable]).toEqual([part, commit, true])
    }
  })
})

describe('the policy of parked/', () => {
  it('keeps it out of the linter, the type check and the test run, which are what the English gate stands in for', () => {
    const biome = JSON.parse(readFileSync(join(ROOT, 'biome.json'), 'utf8')) as { files: { includes: string[] } }
    expect(biome.files.includes).toContain('!parked')
    const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')) as { exclude?: string[] }
    expect(tsconfig.exclude).toContain('parked')
    expect(readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')).toMatch(/exclude:[^\]]*'parked\/\*\*'/)
  })
})
