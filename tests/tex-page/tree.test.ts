// The TeX page's file index (experiments/pdf-bilingual/poc-site/tex-tree.mjs): BusyTeX asks for a file by kpathsea
// format and name; the index, shipped with the page, says which file of the TeX Live tree answers, or that none does —
// answered on the spot, with no request. The suffixes are kpathsea's (texk/kpathsea/tex-file.c, TeX Live 2026)
import { describe, expect, it } from 'vitest'
import { candidates, indexText, parseIndex, resolve, treeFetcher } from '../../experiments/pdf-bilingual/poc-site/tex-tree.mjs'

const TEX = 26
const TFM = 3
const TYPE1 = 32
const OPENTYPE = 47
const CMAP = 45

describe('candidates', () => {
  it('a name without a suffix of its format: the format\'s suffixes first, then the name itself (try_std_extension_first)', () => {
    expect(candidates(TFM, 'ptmr7t')).toEqual(['ptmr7t.tfm', 'ptmr7t'])
    expect(candidates(TYPE1, 'cmr10')).toEqual(['cmr10.pfa', 'cmr10.pfb', 'cmr10'])
    expect(candidates(TEX, 'xkeyval')).toEqual(['xkeyval.tex', 'xkeyval'])
  })

  it('a name that already ends in one of the format\'s suffixes or alternative suffixes is looked for as it is', () => {
    expect(candidates(TEX, 'article.cls')).toEqual(['article.cls'])
    expect(candidates(TEX, 'amsmath.sty')).toEqual(['amsmath.sty'])
    expect(candidates(OPENTYPE, 'FandolSong-Regular.OTF')).toEqual(['fandolsong-regular.otf'])
  })

  it('a dotted name whose suffix is not the format\'s still gets the suffixes first', () => {
    expect(candidates(TEX, 'pgfmath.code')).toEqual(['pgfmath.code.tex', 'pgfmath.code'])
  })

  it('a format with no suffixes: the name alone, case folded as the tree is looked up', () => {
    expect(candidates(CMAP, 'UniGB-UTF16-H')).toEqual(['unigb-utf16-h'])
  })
})

describe('the index', () => {
  const files = ['fonts/tfm/adobe/times/ptmr7t.tfm', 'tex/latex/base/article.cls', 'tex/latex/xkeyval/xkeyval.tex', 'tex/latex/xkeyval/xkeyval.sty', 'ls-R']
  const index = parseIndex(indexText(files))

  it('round-trips through its text: grouped by directory, one line per file', () => {
    expect([...index.values()].sort()).toEqual([...files].sort())
    expect(indexText(files).split('\n')).toContain('tex/latex/xkeyval/')
  })

  it('resolves a request as the file server did: by lowercase basename, then with the format\'s suffixes', () => {
    expect(resolve(index, TFM, 'ptmr7t')).toBe('fonts/tfm/adobe/times/ptmr7t.tfm')
    expect(resolve(index, TEX, 'Article.cls')).toBe('tex/latex/base/article.cls')
    expect(resolve(index, TEX, 'xkeyval')).toBe('tex/latex/xkeyval/xkeyval.tex')
    expect(resolve(index, TEX, 'xkeyval.sty')).toBe('tex/latex/xkeyval/xkeyval.sty')
  })

  it('answers a name the tree does not hold with null: not found, and nothing to fetch', () => {
    expect(resolve(index, TEX, 'nosuchpackage.sty')).toBeNull()
    expect(resolve(index, TFM, 'nosuchfont')).toBeNull()
  })

  it('holds the first path given for a lowercase basename: the builder orders them', () => {
    const twice = parseIndex(indexText(['tex/latex/cmap/t1.cmap', 'tex/latex/mmap/t1.cmap']))
    expect(resolve(twice, TEX, 't1.cmap')).toBe('tex/latex/cmap/t1.cmap')
  })
})

describe('treeFetcher', () => {
  const index = parseIndex(indexText(['tex/latex/base/article.cls', 'fonts/tfm/public/cm/cmr10.tfm']))
  const bytes = new Uint8Array([1, 2, 3])
  const scripted = (...statuses: number[]) => {
    const asked: string[] = []
    return { asked, get: (url: string) => { asked.push(url); const status = statuses.shift() ?? 0; return { status, bytes: status === 200 ? bytes : null } } }
  }

  it('fetches a file the index holds from the tree, by its path', () => {
    const s = scripted(200)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    expect(tree.fetch('article.cls', TEX)).toEqual({ bytes, path: 'tex/latex/base/article.cls' })
    expect(s.asked).toEqual(['/t/abc/tex/latex/base/article.cls'])
  })

  it('answers a name the index lacks as not found without a request', () => {
    const s = scripted()
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    expect(tree.fetch('nosuch.sty', TEX)).toEqual({ missing: true })
    expect(s.asked).toEqual([])
  })

  it('retries a request that failed for a network reason once, and then reports it, never as not found', () => {
    for (const status of [0, 500, 503, 408, 429]) {
      const s = scripted(status, status)
      const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
      expect(tree.fetch('cmr10', TFM)).toEqual({ network: true })
      expect(s.asked).toHaveLength(2)
      expect(tree.failures()).toEqual(['cmr10'])
    }
  })

  it('a file that failed is not asked again in the same compile (kpathsea looks a file up several times), and is in the next', () => {
    const s = scripted(0, 0, 200)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    expect(tree.fetch('cmr10', TFM)).toEqual({ network: true })
    expect(tree.fetch('cmr10', TFM)).toEqual({ network: true })
    expect(s.asked).toHaveLength(2)
    tree.takeFailures()
    expect(tree.fetch('cmr10', TFM)).toEqual({ bytes, path: 'fonts/tfm/public/cm/cmr10.tfm' })
  })

  it('a retry that succeeds is no failure', () => {
    const s = scripted(0, 200)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    expect(tree.fetch('cmr10', TFM)).toEqual({ bytes, path: 'fonts/tfm/public/cm/cmr10.tfm' })
    expect(tree.failures()).toEqual([])
  })

  it('a 404 from the tree is not found (the index and the tree disagree), with no retry', () => {
    const s = scripted(404)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    expect(tree.fetch('cmr10', TFM)).toEqual({ missing: true })
    expect(s.asked).toHaveLength(1)
    expect(tree.failures()).toEqual([])
  })

  it('takes the failures of one compile at a time', () => {
    const s = scripted(0, 0)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    tree.fetch('cmr10', TFM)
    expect(tree.takeFailures()).toEqual(['cmr10'])
    expect(tree.failures()).toEqual([])
  })

  it('escapes each segment of a path', () => {
    const odd = parseIndex(indexText(['fonts/opentype/public/a b/x+y.otf']))
    const s = scripted(200)
    treeFetcher({ index: odd, base: '/t/abc/', get: s.get }).fetch('x+y.otf', OPENTYPE)
    expect(s.asked).toEqual(['/t/abc/fonts/opentype/public/a%20b/x%2By.otf'])
  })
})
