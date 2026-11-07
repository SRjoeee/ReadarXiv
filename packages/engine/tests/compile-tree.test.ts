import { describe, expect, it } from 'vitest'
import { bannerTree, declaredTree, treeOf } from '../src/compile/tree.ts'

const served = ['2023', '2025']
describe('treeOf: the tree a paper is compiled with, decided once', () => {
  it('takes the paper’s declaration where a tree serves it', () => {
    expect(
      treeOf({
        readme: '{"texlive_version": 2023}',
        banner: 'This is pdfTeX (TeX Live 2025)',
        served,
        fallback: '2025',
      }),
    ).toEqual({ tree: '2023', why: 'readme', declared: '2023' })
  })
  it('takes the banner of arXiv’s PDF where the paper declares nothing', () => {
    expect(
      treeOf({
        readme: null,
        banner: 'This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) kpathsea version 6.3.5',
        served,
        fallback: '2025',
      }).tree,
    ).toBe('2023')
    expect(treeOf({ readme: '{"sources": []}', banner: null, served, fallback: '2025' })).toEqual({
      tree: '2025',
      why: 'default',
      declared: null,
    })
  })
  it('keeps the default for a declared year no tree serves, whatever the banner says', () => {
    expect(
      treeOf({ readme: '{"texlive_version": "2019"}', banner: 'TeX Live 2023', served, fallback: '2025' }),
    ).toEqual({ tree: '2025', why: 'default', declared: '2019' })
  })
  it('reads nothing from a file that is not JSON, nor from a banner without a year', () => {
    expect(declaredTree('not json')).toBeNull()
    expect(bannerTree('This is pdfTeX, Version 3.14')).toBeNull()
  })
})
