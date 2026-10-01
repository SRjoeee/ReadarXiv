// Building the TeX page's index (experiments/pdf-bilingual/tex-page/tree.mjs): one path for each lowercase basename,
// the walk's first unless a preferred path (a file today's preloaded tier holds) has the same basename
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chooseIndex, versionOf, walk } from '../../experiments/pdf-bilingual/tex-page/tree.mjs'

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
