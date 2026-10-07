// What the TeX page is told a visit will use (hints.mjs texHints): the hints the reader's compilers send, and the ones
// the warm-up downloads ahead for the reader's target language — the same rule, so that a warm-up fetches what a first
// visit's compiles ask for; and the rule kept equal to the typesetting's own (scripts.mjs strategiesFor), which the
// offscreen document cannot load
import { describe, expect, it } from 'vitest'
import { CJK_SCRIPTS, texHints } from '@/pdf-reader/engine/hints.mjs'
import { CJK, scriptOf, strategiesFor, VERIFIED } from '@/pdf-reader/engine/scripts.mjs'

describe('texHints', () => {
  it('a CJK language: the paper\'s engine and XeLaTeX (its first strategy, xeCJK), and the script\'s faces', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'zh')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Hans'] })
    expect(texHints({ compiler: 'pdflatex' }, 'zh-Hant')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Hant'] })
    expect(texHints({ compiler: 'pdflatex' }, 'ja')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Jpan'] })
    expect(texHints({ compiler: 'xelatex' }, 'ko')).toEqual({ engines: ['xelatex'], fonts: ['Kore'] })
  })

  it('Latin: the paper\'s own engine, no faces; Cyrillic: XeLaTeX from pdfLaTeX (the role table\'s faces), a Unicode engine its own', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'de')).toEqual({ engines: ['pdflatex'], fonts: [] })
    expect(texHints({ compiler: 'pdflatex' }, 'ru')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: [] })
    expect(texHints({ compiler: 'lualatex' }, 'ru')).toEqual({ engines: ['lualatex'], fonts: [] })
    expect(texHints({ compiler: 'xelatex' }, 'fr')).toEqual({ engines: ['xelatex'], fonts: [] })
  })

  it('classic LaTeX is compiled by pdfLaTeX', () => {
    expect(texHints({ compiler: 'latex' }, 'de')).toEqual({ engines: ['pdflatex'], fonts: [] })
  })

  it('the marked original: the paper as it is, in its own engine alone', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'zh', true)).toEqual({ engines: ['pdflatex'], fonts: [] })
  })

  it('a language with no typesetting yet: the paper\'s engine alone', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'ar')).toEqual({ engines: ['pdflatex'], fonts: [] })
  })

  it('agrees with the typesetting\'s strategies for every language the reader sets and every engine a paper is set with', () => {
    expect([...CJK_SCRIPTS].sort()).toEqual(Object.keys(CJK).sort())
    const engineOf = (name: string) => (name === 'latex' ? 'pdflatex' : name)
    for (const lang of [...VERIFIED, 'zh-TW', 'sr', 'bg']) {
      for (const compiler of ['pdflatex', 'latex', 'xelatex', 'lualatex']) {
        const first = strategiesFor({ compiler }, lang)[0]
        expect(texHints({ compiler }, lang), `${lang} ${compiler}`).toEqual({
          engines: [...new Set([engineOf(compiler), engineOf(first?.engine ?? compiler)])],
          fonts: CJK[scriptOf(lang)] ? [scriptOf(lang)] : [],
        })
      }
    }
  })
})
