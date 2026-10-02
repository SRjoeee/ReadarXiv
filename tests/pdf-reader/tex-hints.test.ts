// What the TeX page is told a visit will use (scripts.mjs texHints): the hints the reader's compilers send, and the ones
// the warm-up downloads ahead for the reader's target language — the same rule, so that a warm-up fetches what a first
// visit's compiles ask for
import { describe, expect, it } from 'vitest'
import { texHints } from '@/pdf-reader/engine/scripts.mjs'

describe('texHints', () => {
  it('a CJK language: the paper\'s engine and XeLaTeX (its first strategy, xeCJK), and the script\'s faces', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'zh')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Hans'] })
    expect(texHints({ compiler: 'pdflatex' }, 'zh-Hant')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Hant'] })
    expect(texHints({ compiler: 'pdflatex' }, 'ja')).toEqual({ engines: ['pdflatex', 'xelatex'], fonts: ['Jpan'] })
    expect(texHints({ compiler: 'xelatex' }, 'ko')).toEqual({ engines: ['xelatex'], fonts: ['Kore'] })
  })

  it('an alphabet: the paper\'s own engine, no faces', () => {
    expect(texHints({ compiler: 'pdflatex' }, 'de')).toEqual({ engines: ['pdflatex'], fonts: [] })
    expect(texHints({ compiler: 'pdflatex' }, 'ru')).toEqual({ engines: ['pdflatex'], fonts: [] })
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
})
