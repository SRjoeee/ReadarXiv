// What the TeX page fetches ahead (experiments/pdf-bilingual/tex-page/manifest.mjs), from what the corpus's compiles
// fetched from the tree and opened of the preloaded tier: for each engine, the files worth fetching at start-up; for
// each CJK script, the files only that script's visits fetch (its faces), downloaded only when the reader says it will
// set that script; and the preloaded tier split by the engines that keep each file
import { describe, expect, it } from 'vitest'
import { buildManifest, sharesOf, slimSets, worth } from '../../experiments/pdf-bilingual/tex-page/manifest.mjs'

const visit = (paper: string, engine: string, script: string, ...keys: string[]) => ({ paper, engine, script, first: true, keys: new Set(keys) })
const atLeast = (n: number) => (_key: string, share: number) => share >= n

describe('worth', () => {
  const link = worth({ mbit: 50, rtt: 30 })

  it('a small file is worth fetching ahead even when few visits need it: a round trip outweighs its bytes', () => {
    // 5 KB at 50 Mbit/s: 0.8 ms; 10 % of visits × (30 + 0.8) ms > 0.8 ms
    expect(link(5_000, 0.1)).toBe(true)
    expect(link(5_000, 0.02)).toBe(false)
  })

  it('a large one only when nearly every visit needs it', () => {
    // 2 MB: 320 ms — fetched ahead by everyone, needed by 90 %: 0.9 × 350 > 320
    expect(link(2_000_000, 0.95)).toBe(true)
    expect(link(2_000_000, 0.6)).toBe(false)
  })

  it('everything every visit needs', () => {
    expect(link(20_000_000, 1)).toBe(true)
  })
})

describe('sharesOf and buildManifest', () => {
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
  const shares = sharesOf(visits)

  it('says the share of each group\'s papers that fetched each file, and of all the engine\'s', () => {
    expect(shares.groups['pdflatex|Latn']).toEqual({ papers: 4, shares: { '26/article.cls': 0.75, '26/rare.sty': 0.25, '3/cmr10': 1 } })
    expect(shares.pooled.xelatex?.shares['26/xecjk.sty']).toBe(1)
    expect(shares.pooled.xelatex?.shares['47/FandolSong-Regular.otf']).toBe(0.5)
  })

  it('an engine\'s files are those kept at their share', () => {
    expect(buildManifest(shares, atLeast(0.5)).engines.pdflatex).toEqual(['26/article.cls', '3/cmr10'])
  })

  it('a file kept by only one CJK script\'s visits is that script\'s, not the engine\'s', () => {
    const m = buildManifest(shares, atLeast(0.5))
    expect(m.engines.xelatex).toEqual(['26/xecjk.sty'])
    expect(m.fonts).toEqual({ Hans: ['47/FandolSong-Regular.otf'], Jpan: ['36/ipaexm.ttf'] })
  })

  it('a fallback strategy\'s visits (CJKutf8 under pdfLaTeX) count for nothing: only first strategies\' files are fetched ahead', () => {
    expect(shares.groups['pdflatex|Hans']).toBeUndefined()
    const m = buildManifest(shares, atLeast(0.5))
    expect(Object.values(m.fonts).flat()).not.toContain('3/gbsnu4e')
  })

  it('a paper counts once for a group, however many of its compiles fetched the file', () => {
    const twice = sharesOf([visit('a', 'pdflatex', 'Latn', '3/x'), visit('a', 'pdflatex', 'Latn', '3/x'), visit('b', 'pdflatex', 'Latn'), visit('c', 'pdflatex', 'Latn')])
    expect(twice.pooled.pdflatex?.shares['3/x']).toBeCloseTo(1 / 3)
  })
})

describe('slimSets', () => {
  it('splits the preloaded tier by the engines that keep each file: common, each engine\'s own, the rest', () => {
    const basic = ['/texlive/a.cfg', '/texlive/p.fmt', '/texlive/x.fmt', '/texlive/l.fmt']
    const kept = { pdflatex: new Set(['/texlive/a.cfg', '/texlive/p.fmt']), xelatex: new Set(['/texlive/a.cfg', '/texlive/x.fmt']) }
    expect(slimSets(basic, kept)).toEqual({ common: ['/texlive/a.cfg'], pdftex: ['/texlive/p.fmt'], xetex: ['/texlive/x.fmt'], rest: ['/texlive/l.fmt'] })
  })

  it('files kept always go to the common part', () => {
    const basic = ['/etc/fonts/fonts.conf', '/texlive/p.fmt']
    expect(slimSets(basic, { pdflatex: new Set(['/texlive/p.fmt']), xelatex: new Set() }, { always: p => p.startsWith('/etc/') }).common).toEqual(['/etc/fonts/fonts.conf'])
  })
})
