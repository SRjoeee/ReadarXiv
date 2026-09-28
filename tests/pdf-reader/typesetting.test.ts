import { describe, expect, it } from 'vitest'
import { openPaper, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'

// How a translation is typeset around its text: the leading of translated units and the hyphenation of the English left

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[] }
const META = { compiler: 'pdflatex', main: 'main.tex' }
/** the first strategy strategiesFor offers, the one tried first */
function first(meta: { compiler?: string }, lang: string) {
  const [strategy] = strategiesFor(meta, lang)
  if (!strategy) throw new Error(`no strategy for ${lang}`)
  return strategy
}
const SOURCE = '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\end{document}\n'

/** the main file as typeset with the paragraphs `pick` chooses translated (their words replaced by a mark of their own) */
function typeset(lang: string, pick: (paragraphs: number[]) => number[]) {
  const p = openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
  const units = p.units as Unit[]
  const paragraphs = units.flatMap((u, i) => (u.kind === 'para' ? [i] : []))
  const chosen = new Set(pick(paragraphs))
  const translated = new Map(units.flatMap((u, i) => (chosen.has(i) ? [[u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]] : [])))
  const strategy = first({ ...META, ...p.meta }, lang)
  const files = translationFiles(p, translated as Map<(typeof p.units)[number], unknown[]>, { strategy, fonts: null, draft: false, aux: null, bbl: null })
  return { paragraphs, tex: new TextDecoder().decode(files.get('main.tex')) }
}

describe('strategies: CJK leading as a factor for translated units, English hyphenation kept', () => {
  it('Chinese: 1.3 × the paper\'s spacing, given to the units, and no \\linespread for the whole document', () => {
    const xe = first(META, 'zh')
    expect(xe.leading).toBe(1.3)
    expect(xe.pre(null)).not.toContain('linespread')
  })

  it('CJK targets keep the English hyphenation for the Latin text left; an alphabet takes its own', () => {
    for (const lang of ['zh', 'zh-TW', 'ja', 'ko']) expect(first(META, lang).pre(null)).toContain('hyphenrules=english')
    expect(first(META, 'de').pre(null)).not.toContain('hyphenrules')
  })

  it('Japanese and Korean at the paper\'s own spacing carry no factor', () => {
    expect(first(META, 'ja').leading).toBeUndefined()
    expect(first(META, 'ko').leading).toBeUndefined()
  })
})

describe('translationFiles: the leading goes to translated units alone', () => {
  it('a translated paragraph gets \\axtlead before its start mark; one left in English and the heading do not', () => {
    const { paragraphs, tex } = typeset('zh', ps => ps.slice(0, 1))
    const [done = -1, left = -1] = paragraphs
    expect(tex).toContain(`\\axtlead{${done}}\\leavevmode\\axtmark{${done}s}`)
    expect(tex).not.toContain(`\\axtlead{${left}}`)
    expect(tex).toContain('\\section{Method}')
    expect(tex).toContain('\\protected\\def\\axtlead#1{')
    expect(tex).toContain('1.3\\baselineskip')
  })

  it('a strategy with no factor adds neither the macro nor a call', () => {
    const { tex } = typeset('ja', ps => ps)
    expect(tex).not.toContain('axtlead')
  })
})
