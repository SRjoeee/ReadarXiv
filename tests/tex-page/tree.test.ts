// The TeX page's file index (experiments/pdf-bilingual/poc-site/tex-tree.mjs): BusyTeX asks for a file by kpathsea
// format and name; the index, shipped beside the tree, says which file of the TeX Live tree answers, or that none does —
// answered on the spot, with no request. It answers as kpathsea does (texk/kpathsea, TeX Live 2026): the format's
// suffixes (tex-file.c), the program's search path for the format (texmf.cnf), and ls-R's order within a path element
import { describe, expect, it } from 'vitest'
import { candidates, inElement, parseIndex, resolve, treeFetcher } from '../../experiments/pdf-bilingual/poc-site/tex-tree.mjs'
import { indexText } from '../../experiments/pdf-bilingual/tex-page/tree.mjs'

const TEX = 26
const TFM = 3
const TYPE1 = 32
const OPENTYPE = 47
const CMAP = 45

/** search paths as build.mjs computes them from texmf.cnf: pdfLaTeX's TEXINPUTS, XeLaTeX's, and TFMFONTS */
const PATHS = {
  [TEX]: { '*': ['tex/latex//', 'tex/generic//', 'tex//'], xelatex: ['tex/xelatex//', 'tex/latex//', 'tex/xetex//', 'tex/generic//', 'tex//'] },
  [TFM]: { '*': ['fonts/tfm//'] },
  [CMAP]: { '*': ['fonts/cmap//'] },
}
const indexOf = (files: string[]) => parseIndex(indexText(files, PATHS))

describe('candidates', () => {
  it('a name without a suffix of its format: the format\'s suffixes first, then the name itself (try_std_extension_first)', () => {
    expect(candidates(TFM, 'ptmr7t')).toEqual(['ptmr7t.tfm'])
    expect(candidates(TYPE1, 'cmr10')).toEqual(['cmr10.pfa', 'cmr10.pfb', 'cmr10'])
    expect(candidates(TEX, 'xkeyval')).toEqual(['xkeyval.tex', 'xkeyval'])
  })

  it('a name that already ends in one of the format\'s suffixes or alternative suffixes is looked for as it is, in its own case', () => {
    expect(candidates(TEX, 'article.cls')).toEqual(['article.cls'])
    expect(candidates(TEX, 'amsmath.sty')).toEqual(['amsmath.sty'])
    expect(candidates(OPENTYPE, 'FandolSong-Regular.OTF')).toEqual(['FandolSong-Regular.OTF'])
  })

  it('a format searched by suffix only (TFM, OpenType) never looks for the bare name', () => {
    expect(candidates(TFM, 'README')).toEqual(['README.tfm'])
    expect(candidates(OPENTYPE, 'bsmi00lp.ttf')).toEqual(['bsmi00lp.ttf.otf'])
  })

  it('a dotted name whose suffix is not the format\'s still gets the suffixes first', () => {
    expect(candidates(TEX, 'pgfmath.code')).toEqual(['pgfmath.code.tex', 'pgfmath.code'])
  })

  it('a format with no suffixes: the name alone', () => {
    expect(candidates(CMAP, 'UniGB-UTF16-H')).toEqual(['UniGB-UTF16-H'])
  })
})

describe('inElement', () => {
  it('a path element ending in // holds its directory and every directory below; without, its directory alone', () => {
    expect(inElement('tex/latex', 'tex/latex//')).toBe(true)
    expect(inElement('tex/latex/cmap', 'tex/latex//')).toBe(true)
    expect(inElement('tex/latex-dev/base', 'tex/latex//')).toBe(false)
    expect(inElement('dvipdfmx', 'dvipdfmx')).toBe(true)
    expect(inElement('dvipdfmx/x', 'dvipdfmx')).toBe(false)
    expect(inElement('a/x/y/b', 'a//b')).toBe(true)
  })
})

describe('the index', () => {
  it('round-trips through its text: every file of the tree, its search paths', () => {
    const files = ['fonts/tfm/adobe/times/ptmr7t.tfm', 'tex/latex/base/article.cls', 'ls-R']
    const index = indexOf(files)
    expect([...index.names.values()].flat().sort()).toEqual([...files].sort())
    expect(index.paths).toEqual(JSON.parse(JSON.stringify(PATHS)))
  })

  it('resolves a request by the format\'s suffixes, then the name as it is', () => {
    const index = indexOf(['fonts/tfm/adobe/times/ptmr7t.tfm', 'tex/latex/base/article.cls', 'tex/latex/xkeyval/xkeyval.tex', 'tex/latex/xkeyval/xkeyval.sty'])
    expect(resolve(index, TFM, 'ptmr7t', 'pdflatex')).toBe('fonts/tfm/adobe/times/ptmr7t.tfm')
    expect(resolve(index, TEX, 'xkeyval', 'pdflatex')).toBe('tex/latex/xkeyval/xkeyval.tex')
    expect(resolve(index, TEX, 'xkeyval.sty', 'pdflatex')).toBe('tex/latex/xkeyval/xkeyval.sty')
  })

  it('among files of one name, the first path element of the program\'s search path that holds one wins', () => {
    const index = indexOf(['tex/generic/x/foo.sty', 'tex/latex/y/foo.sty', 'tex/xelatex/z/foo.sty'])
    expect(resolve(index, TEX, 'foo.sty', 'pdflatex')).toBe('tex/latex/y/foo.sty')
    expect(resolve(index, TEX, 'foo.sty', 'xelatex')).toBe('tex/xelatex/z/foo.sty')
  })

  it('within a path element, ls-R\'s order: a directory before its subdirectories, siblings sorted bytewise — whatever order the files came in', () => {
    expect(resolve(indexOf(['tex/latex/mmap/t1.cmap', 'tex/latex/cmap/t1.cmap']), TEX, 't1.cmap', 'pdflatex')).toBe('tex/latex/cmap/t1.cmap')
    expect(resolve(indexOf(['tex/latex/a-c/f.sty', 'tex/latex/a/b/f.sty']), TEX, 'f.sty', 'pdflatex')).toBe('tex/latex/a/b/f.sty')
  })

  it('each path element in turn, and within it each name: an element\'s file without the suffix beats a later element\'s with it', () => {
    expect(resolve(indexOf(['tex/generic/y/foo.tex', 'tex/latex/x/foo']), TEX, 'foo', 'pdflatex')).toBe('tex/latex/x/foo')
  })

  it('the name in its own case first, as ls-R\'s database holds it', () => {
    const index = indexOf(['fonts/tfm/a/Cherokee.tfm', 'fonts/tfm/b/cherokee.tfm'])
    expect(resolve(index, TFM, 'cherokee', 'pdflatex')).toBe('fonts/tfm/b/cherokee.tfm')
    expect(resolve(index, TFM, 'Cherokee', 'pdflatex')).toBe('fonts/tfm/a/Cherokee.tfm')
  })

  it('beyond kpathsea, as the file server answered before: another case, the bare name, then a directory outside the search path', () => {
    expect(resolve(indexOf(['tex/latex/base/article.cls']), TEX, 'Article.cls', 'pdflatex')).toBe('tex/latex/base/article.cls')
    expect(resolve(indexOf(['fonts/truetype/arphic/bsmi00lp.ttf']), OPENTYPE, 'bsmi00lp.ttf', 'xelatex')).toBe('fonts/truetype/arphic/bsmi00lp.ttf')
    expect(resolve(indexOf(['doc/latex/foo/foo.sty']), TEX, 'foo.sty', 'pdflatex')).toBe('doc/latex/foo/foo.sty')
  })

  it('answers a name the tree does not hold with null: not found, and nothing to fetch', () => {
    const index = indexOf(['tex/latex/base/article.cls'])
    expect(resolve(index, TEX, 'nosuchpackage.sty', 'pdflatex')).toBeNull()
    expect(resolve(index, TFM, 'nosuchfont', 'pdflatex')).toBeNull()
  })
})

describe('treeFetcher', () => {
  const index = indexOf(['tex/latex/base/article.cls', 'fonts/tfm/public/cm/cmr10.tfm'])
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

  it('retries a request that failed for a network reason once, and then reports its path, never as not found', () => {
    for (const status of [0, 500, 503, 408, 429]) {
      const s = scripted(status, status)
      const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
      expect(tree.fetch('cmr10', TFM)).toEqual({ network: true })
      expect(s.asked).toHaveLength(2)
      expect(tree.failures()).toEqual(['fonts/tfm/public/cm/cmr10.tfm'])
    }
  })

  it('a 404 or 410 for a file the index holds is a deployment\'s fault, not TeX\'s verdict: the network\'s, never not found', () => {
    for (const status of [404, 410]) {
      const s = scripted(status, status)
      const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
      expect(tree.fetch('cmr10', TFM)).toEqual({ network: true })
      expect(s.asked).toHaveLength(2)
      expect(tree.failures()).toEqual(['fonts/tfm/public/cm/cmr10.tfm'])
    }
  })

  it('remembers a failure by the file\'s path: the same name asked for another file is asked for', () => {
    const two = { ...indexOf(['tex/latex/a/x.sty', 'tex/xelatex/b/x.sty']), dependent: new Set(['x.sty']) }
    let program = 'pdflatex'
    const asked: string[] = []
    const tree = treeFetcher({ index: two, base: '/t/abc/', get: url => { asked.push(url); return url.includes('/latex/') ? { status: 0, bytes: null } : { status: 200, bytes } }, program: () => program })
    expect(tree.fetch('x.sty', TEX)).toEqual({ network: true })
    program = 'xelatex'
    expect(tree.fetch('x.sty', TEX)).toEqual({ bytes, path: 'tex/xelatex/b/x.sty' })
    expect(tree.failures()).toEqual(['tex/latex/a/x.sty'])
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

  it('takes the failures of one compile at a time', () => {
    const s = scripted(0, 0)
    const tree = treeFetcher({ index, base: '/t/abc/', get: s.get })
    tree.fetch('cmr10', TFM)
    expect(tree.takeFailures()).toEqual(['fonts/tfm/public/cm/cmr10.tfm'])
    expect(tree.failures()).toEqual([])
  })

  it('keys a name whose answer depends on the program by the program too: BusyTeX keeps a fetched file by its key for every program', () => {
    const index = { ...indexOf(['tex/latex/t/thesis.cls', 'tex/xelatex/t/thesis.cls']), dependent: new Set(['thesis.cls']) }
    let program = 'xelatex'
    const tree = treeFetcher({ index, base: '/t/abc/', get: () => ({ status: 200, bytes }), program: () => program })
    expect(tree.keyOf('thesis.cls', TEX)).toBe('thesis.cls@xelatex')
    expect(tree.fetch('thesis.cls', TEX)).toEqual({ bytes, path: 'tex/xelatex/t/thesis.cls' })
    program = 'pdflatex'
    expect(tree.keyOf('thesis.cls', TEX)).toBe('thesis.cls@pdflatex')
    expect(tree.fetch('thesis.cls', TEX)).toEqual({ bytes, path: 'tex/latex/t/thesis.cls' })
    expect(tree.keyOf('article.cls', TEX)).toBe('article.cls')
  })

  it('escapes each segment of a path', () => {
    const odd = indexOf(['fonts/opentype/public/a b/x+y.otf'])
    const s = scripted(200)
    treeFetcher({ index: odd, base: '/t/abc/', get: s.get }).fetch('x+y.otf', OPENTYPE)
    expect(s.asked).toEqual(['/t/abc/fonts/opentype/public/a%20b/x%2By.otf'])
  })
})
