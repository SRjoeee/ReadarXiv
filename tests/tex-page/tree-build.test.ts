// Building the TeX page's index (experiments/pdf-bilingual/tex-page/tree.mjs): one path for each lowercase basename,
// the walk's first unless a preferred path (a file today's preloaded tier holds) has the same basename
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chooseIndex, hashTree, indexName, treeVersion, versionOf, walk } from '../../experiments/pdf-bilingual/tex-page/tree.mjs'

describe('chooseIndex', () => {
  it('keeps the first path of each lowercase basename, in the walk\'s order', () => {
    expect(chooseIndex(['tex/latex/mmap/t1.cmap', 'tex/latex/cmap/t1.cmap', 'tex/latex/base/article.cls'])).toEqual(['tex/latex/mmap/t1.cmap', 'tex/latex/base/article.cls'])
  })

  it('folds case: README and readme are one basename', () => {
    expect(chooseIndex(['a/README', 'b/readme'])).toEqual(['a/README'])
  })

  it('a preferred path wins over the walk\'s order, and the first preferred one over a later one', () => {
    const basic = new Set(['tex/latex/cmap/t1.cmap', 'tex/latex/other/t1.cmap'])
    expect(chooseIndex(['tex/latex/mmap/t1.cmap', 'tex/latex/cmap/t1.cmap', 'tex/latex/other/t1.cmap'], p => basic.has(p))).toEqual(['tex/latex/cmap/t1.cmap'])
  })
})

describe('walk', () => {
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
})
