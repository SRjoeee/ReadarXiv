// The TeX page's manifest of common files (experiments/pdf-bilingual/tex-page/manifest.mjs), from what the corpus's
// compiles fetched from the tree: for each engine, the files most of its visits fetch; for each CJK script, the files
// only that script's visits fetch (its faces), downloaded only when the reader says it will set that script
import { describe, expect, it } from 'vitest'
import { buildManifest, slimSets } from '../../experiments/pdf-bilingual/tex-page/manifest.mjs'

const visit = (paper: string, engine: string, script: string, ...keys: string[]) => ({ paper, engine, script, first: true, keys: new Set(keys) })

describe('buildManifest', () => {
  const visits = [
    visit('a', 'pdflatex', 'Latn', '3/cmr10', '26/article.cls', '26/rare.sty'),
    visit('b', 'pdflatex', 'Latn', '3/cmr10', '26/article.cls'),
    visit('c', 'pdflatex', 'Latn', '3/cmr10', '26/article.cls'),
    visit('d', 'pdflatex', 'Latn', '3/cmr10'),
    visit('a', 'xelatex', 'Hans', '26/xecjk.sty', '47/FandolSong-Regular.otf'),
    visit('b', 'xelatex', 'Hans', '26/xecjk.sty', '47/FandolSong-Regular.otf'),
    visit('a', 'xelatex', 'Jpan', '26/xecjk.sty', '36/ipaexm.ttf'),
    visit('b', 'xelatex', 'Jpan', '26/xecjk.sty', '36/ipaexm.ttf'),
    { ...visit('a', 'pdflatex', 'Hans', '3/gbsnu4e'), first: false },
  ]

  it('an engine\'s files are those at least the threshold\'s share of its visits fetched', () => {
    const m = buildManifest(visits, { threshold: 0.5 })
    expect(m.engines.pdflatex).toEqual(['26/article.cls', '3/cmr10'])
  })

  it('a file fetched by only one CJK script\'s visits is that script\'s, not the engine\'s', () => {
    const m = buildManifest(visits, { threshold: 0.5 })
    expect(m.engines.xelatex).toEqual(['26/xecjk.sty'])
    expect(m.fonts).toEqual({ Hans: ['47/FandolSong-Regular.otf'], Jpan: ['36/ipaexm.ttf'] })
  })

  it('a fallback strategy\'s visits (CJKutf8 under pdfLaTeX) count for nothing: only first strategies\' files are fetched ahead', () => {
    const m = buildManifest(visits, { threshold: 0.5 })
    expect(m.engines.pdflatex).not.toContain('3/gbsnu4e')
    expect(Object.values(m.fonts).flat()).not.toContain('3/gbsnu4e')
  })

  it('a paper counts once for a group, however many of its compiles fetched the file', () => {
    const twice = [visit('a', 'pdflatex', 'Latn', '3/x'), visit('a', 'pdflatex', 'Latn', '3/x'), visit('b', 'pdflatex', 'Latn'), visit('c', 'pdflatex', 'Latn')]
    expect(buildManifest(twice, { threshold: 0.5 }).engines.pdflatex).toEqual([])
  })
})

describe('slimSets', () => {
  it('splits the preloaded tier by the engines whose compiles open each file: common, each engine\'s own, the rest', () => {
    const basic = ['/texlive/a.cfg', '/texlive/p.fmt', '/texlive/x.fmt', '/texlive/l.fmt', '/texlive/icudt78l.dat']
    const opened = { pdflatex: new Set(['/texlive/a.cfg', '/texlive/p.fmt']), xelatex: new Set(['/texlive/a.cfg', '/texlive/x.fmt', '/texlive/icudt78l.dat']) }
    expect(slimSets(basic, opened, { leave: { xelatex: p => p.endsWith('icudt78l.dat') } })).toEqual({
      common: ['/texlive/a.cfg'],
      pdftex: ['/texlive/p.fmt'],
      xetex: ['/texlive/x.fmt'],
      rest: ['/texlive/l.fmt', '/texlive/icudt78l.dat'],
    })
  })

  it('files kept always go to the common part', () => {
    const basic = ['/etc/fonts/fonts.conf', '/texlive/p.fmt']
    expect(slimSets(basic, { pdflatex: new Set(['/texlive/p.fmt']), xelatex: new Set() }, { always: p => p.startsWith('/etc/') }).common).toEqual(['/etc/fonts/fonts.conf'])
  })
})
