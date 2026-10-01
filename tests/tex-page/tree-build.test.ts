// Building the TeX page's index and the tree's version (experiments/pdf-bilingual/tex-page/tree.mjs): every file of
// the tree in ls-R's order, which kpathsea's choice among files of one name follows
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseIndex } from '../../experiments/pdf-bilingual/poc-site/tex-tree.mjs'
import { hashTree, indexName, indexText, programDependent, treeVersion, versionOf, walk } from '../../experiments/pdf-bilingual/tex-page/tree.mjs'

describe('indexText', () => {
  it('lists every file, the directories in ls-R\'s order and each one\'s files sorted, after its search paths', () => {
    const text = indexText(['tex/latex/mmap/t1.cmap', 'tex/latex-dev/base/a.sty', 'tex/latex/cmap/t1.cmap', 'ls-R', 'tex/latex/cmap/b.sty'], { 26: { '*': ['tex//'] } })
    expect(text.split('\n')).toEqual(['#axt-index 2', '#paths {"26":{"*":["tex//"]}}', './', 'ls-R', 'tex/latex/cmap/', 'b.sty', 't1.cmap', 'tex/latex/mmap/', 't1.cmap', 'tex/latex-dev/base/', 'a.sty'])
  })
})

describe('programDependent', () => {
  it('names the basenames whose answer depends on the program asking, and only those', () => {
    const paths = { 26: { '*': ['tex/latex//', 'tex//'], xelatex: ['tex/xelatex//', 'tex/latex//', 'tex//'] } }
    const index = parseIndex(indexText(['tex/latex/t/thesis.cls', 'tex/xelatex/t/thesis.cls', 'tex/latex/a/same.sty', 'tex/generic/a/same.sty', 'tex/latex/b/one.sty'], paths))
    expect(programDependent(index, ['pdflatex', 'xelatex'])).toEqual(['thesis.cls'])
    expect(indexText(['a/x'], paths, ['thesis.cls']).split('\n')[2]).toBe('#dependent ["thesis.cls"]')
  })
})

describe('walk', () => {
  it('leaves out the operating systems\' own files: they are not TeX Live\'s, and a Finder visit must not change the tree\'s version', () => {
    const root = mkdtempSync(join(tmpdir(), 'walk-'))
    try {
      mkdirSync(join(root, 'tex/latex/base'), { recursive: true })
      for (const f of ['.DS_Store', 'tex/.DS_Store', 'tex/latex/base/._article.cls', 'tex/Thumbs.db', 'tex/desktop.ini', 'tex/latex/base/article.cls']) writeFileSync(join(root, f), '')
      expect(walk(root)).toEqual(['tex/latex/base/article.cls'])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('lists a directory\'s files before its subdirectories\' files, relative to the root', () => {
    const root = mkdtempSync(join(tmpdir(), 'walk-'))
    try {
      mkdirSync(join(root, 'tex/latex/base'), { recursive: true })
      writeFileSync(join(root, 'ls-R'), '')
      writeFileSync(join(root, 'tex/latex/base/article.cls'), '')
      writeFileSync(join(root, 'tex/top.tex'), '')
      const paths = walk(root)
      expect(paths.sort()).toEqual(['ls-R', 'tex/latex/base/article.cls', 'tex/top.tex'])
      expect(walk(root).indexOf('tex/top.tex')).toBeLessThan(walk(root).indexOf('tex/latex/base/article.cls'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe('versionOf', () => {
  it('is a 12-digit content address that changes with any part', () => {
    expect(versionOf('a', 'b')).toMatch(/^[0-9a-f]{12}$/)
    expect(versionOf('a', 'b')).toBe(versionOf('a', 'b'))
    expect(versionOf('a', 'b')).not.toBe(versionOf('ab'))
  })
})

// The tree's every file lives at t/<tid>/<path> for good (uploaded once to the CDN): its version depends on the files
// alone, so that a change of the index's rules touches one small file, the index, versioned on its own
describe('the tree\'s version and the index\'s', () => {
  const files: [string, string][] = [['tex/latex/base/article.cls', 'aa'], ['fonts/tfm/public/cm/cmr10.tfm', 'bb']]

  it('the tree\'s version is its files\' paths and contents, in any order', () => {
    expect(treeVersion(files)).toMatch(/^[0-9a-f]{12}$/)
    expect(treeVersion([...files].reverse())).toBe(treeVersion(files))
  })

  it('changes with a file\'s content, its path, or a file more; and with nothing else', () => {
    expect(treeVersion([['tex/latex/base/article.cls', 'ab'], files[1]!])).not.toBe(treeVersion(files))
    expect(treeVersion([['tex/latex/base/article2.cls', 'aa'], files[1]!])).not.toBe(treeVersion(files))
    expect(treeVersion([...files, ['ls-R', 'cc']])).not.toBe(treeVersion(files))
  })

  it('the index is named by its own content', () => {
    expect(indexName('a/\nb')).toMatch(/^index-[0-9a-f]{12}\.txt$/)
    expect(indexName('a/\nb')).toBe(indexName('a/\nb'))
    expect(indexName('a/\nc')).not.toBe(indexName('a/\nb'))
  })

  it('hashes the tree\'s files by content, and again only those whose size or time changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'hash-'))
    try {
      writeFileSync(join(root, 'a.sty'), 'one')
      const cache = join(root, 'cache.json')
      const first = hashTree(root, ['a.sty'], cache)
      expect(first.get('a.sty')).toMatch(/^[0-9a-f]{64}$/)
      writeFileSync(join(root, 'a.sty'), 'two')
      expect(hashTree(root, ['a.sty'], cache).get('a.sty')).not.toBe(first.get('a.sty'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('a file replaced with one of the same size and time (cp -p, rsync -a) is hashed again: its change time and inode say so', () => {
    const root = mkdtempSync(join(tmpdir(), 'hash-'))
    try {
      writeFileSync(join(root, 'a.sty'), 'one')
      utimesSync(join(root, 'a.sty'), 1767225600, 1767225600)
      const cache = join(root, 'cache.json')
      const first = hashTree(root, ['a.sty'], cache).get('a.sty')
      const before = statSync(join(root, 'a.sty'))
      writeFileSync(join(root, 'b.sty'), 'two')
      utimesSync(join(root, 'b.sty'), 1767225600, 1767225600)
      renameSync(join(root, 'b.sty'), join(root, 'a.sty'))
      const after = statSync(join(root, 'a.sty'))
      expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs])
      expect(hashTree(root, ['a.sty'], cache).get('a.sty')).not.toBe(first)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('hashes every file again when asked (a build for publishing)', () => {
    const root = mkdtempSync(join(tmpdir(), 'hash-'))
    try {
      writeFileSync(join(root, 'a.sty'), 'one')
      const cache = join(root, 'cache.json')
      const first = hashTree(root, ['a.sty'], cache).get('a.sty')
      const st = statSync(join(root, 'a.sty'))
      writeFileSync(cache, JSON.stringify({ 'a.sty': [st.size, st.mtimeMs, st.ctimeMs, st.ino, 'stale'] }))
      expect(hashTree(root, ['a.sty'], cache).get('a.sty')).toBe('stale')
      expect(hashTree(root, ['a.sty'], cache, { rehash: true }).get('a.sty')).toBe(first)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
