import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// scripts/check-review-citations.mjs on a tree made here. The reader's sources (src/pdf-reader) are held at zero comments
// that cite a review round: what a comment keeps is what holds and why, never who asked, and a design decision lives in
// the documents. The rest of src/ is counted per directory and never fails the check.

const SCRIPT = resolve('scripts/check-review-citations.mjs')
let root: string

const put = (path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}
const run = (cwd = root) => {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'axt-citations-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('a tree whose reader comments cite no review round', () => {
  it('passes, and says the reader holds none', () => {
    put('src/pdf-reader/session/a.mjs', '// a reply names its service: the cache must not mix two (PDF-READER §10.3)\nexport const a = 1\n')
    put('src/pdf-reader/ui/B.tsx', '/** the thumb is released however the pointer goes */\nexport const B = 2\n')
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toContain('src/pdf-reader holds none')
  })
  it('does not read a word that merely starts with a reviewer\'s name, or a lower-case use of it', () => {
    put('src/pdf-reader/a.mjs', '// Devinci wheels and the codex format are no reviewer; Copilots fly planes\nexport const a = 1\n')
    expect(run().code).toBe(0)
  })
  it('reads src/ alone: a document or a test that names a reviewer is no source', () => {
    put('src/pdf-reader/a.mjs', 'export const a = 1\n')
    put('docs/PDF-READER.md', 'The thumb is released however the pointer goes (Codex on #301).\n')
    put('tests/x.test.ts', "// Codex on #301\n")
    expect(run().code).toBe(0)
  })
})

describe('a citation under src/pdf-reader fails the check', () => {
  // every form the reader's comments used, each on the second line of a file of its kind
  const FORMS: Array<[string, string]> = [
    ['a reviewer on a pull request', '// the thumb is released (Codex on #301)'],
    ['two reviewers on one', '// the lang is hidden with it (Codex and Devin on #317)'],
    ['Devin on a pull request', '/** a page closed while that call was out (Devin on #296) */'],
    ['Copilot on a pull request', ' * the scope is withdrawn (Copilot on #12)'],
    ['a reviewer\'s review of a pull request', "// the mark is left once translation ended (Codex's review of #306)"],
    ['a reviewer\'s review of a lettered round', "// a partial cell was taken as whole (Codex's review of PR A)"],
    ['a reviewer with the number after a comma', '// the frame goes (Devin, #297)'],
    ['a reviewer cited with per', '// kept apart, per Codex on #306'],
    ['a reviewer\'s numbered finding', "// counted as one (Codex's first medium, both rounds)"],
    ['a reviewer with a finding number', '// tried again (Codex 6 on #306)'],
    ['a reviewer named bare', '// is tried again (Codex).'],
  ]
  for (const [name, comment] of FORMS) {
    it(`names the file and the line, for ${name}`, () => {
      put('src/pdf-reader/engine/pipeline/x.mjs', `export const a = 1\n${comment}\nexport const b = 2\n`)
      const { code, err } = run()
      expect(code).toBe(1)
      expect(err).toContain('src/pdf-reader/engine/pipeline/x.mjs:2')
    })
  }
  it('names every citation, in every kind of source file', () => {
    put('src/pdf-reader/a.mjs', '// one (Codex on #1)\n\n// two (Devin on #2)\n')
    put('src/pdf-reader/ui/B.tsx', '// three (Copilot on #3)\n')
    put('src/pdf-reader/c.ts', 'export const c = 1 // four (Codex on #4)\n')
    put('src/pdf-reader/d.css', '/* five (Codex on #5) */\n')
    put('src/pdf-reader/e.d.mts', '/** six (Devin on #6) */\n')
    const { code, err } = run()
    expect(code).toBe(1)
    for (const at of ['a.mjs:1', 'a.mjs:3', 'ui/B.tsx:1', 'c.ts:1', 'd.css:1', 'e.d.mts:1']) expect(err).toContain(`src/pdf-reader/${at}`)
  })
  it('fails although the rest of src/ is clean, and although another citation elsewhere is merely counted', () => {
    put('src/pdf-reader/a.mjs', '// the thumb (Codex on #301)\n')
    put('src/core/b.ts', '// elsewhere (Codex on #230)\n')
    const { code, err } = run()
    expect(code).toBe(1)
    expect(err).toContain('src/pdf-reader/a.mjs:1')
    expect(err).not.toContain('src/core')
  })
})

describe('a citation elsewhere in src/ is counted and never fails', () => {
  it('counts the lines and the files of each directory', () => {
    put('src/pdf-reader/a.mjs', 'export const a = 1\n')
    put('src/core/a.ts', '// one (Codex on #1)\n// two (Devin on #2)\nexport const a = 1\n')
    put('src/core/protector/b.ts', '// three (Codex on #3)\n')
    put('src/providers/c.ts', '// four (Copilot on #4)\n')
    put('src/config/clean.ts', 'export const c = 1\n')
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toContain('src/pdf-reader holds none')
    expect(out).toContain('src/core 3 lines in 2 files')
    expect(out).toContain('src/providers 1 line in 1 file')
    expect(out).not.toContain('src/config')
  })
  it('says so when there is none elsewhere', () => {
    put('src/pdf-reader/a.mjs', 'export const a = 1\n')
    put('src/core/a.ts', 'export const a = 1\n')
    expect(run().out).toContain('none elsewhere in src/')
  })
})

describe('the repository', () => {
  it('holds src/pdf-reader at zero', () => {
    const { code, err } = run(process.cwd())
    expect(err).toBe('')
    expect(code).toBe(0)
  })
})
