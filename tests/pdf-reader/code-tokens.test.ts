import { describe, expect, it } from 'vitest'
import { codeTextsOf, isCode, isName, nameCells } from '@/pdf-reader/engine/translate/mt.mjs'
import { figureUnits } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { FIGURE_KIND } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { UNIT_FLAG_BITS } from '@/pdf-reader/engine/layer-proto/units.mjs'

// Code-like tokens keep their source (the owner's option A of 2026-11-02: every figure label translated, but a token of code is
// no word to translate): a markup token, a word in angle brackets as a model's special tokens are written (1706.03762v7's
// "<pad>", which Microsoft gave back as a Chinese word for a cushion; "<EOS>"; 2503.06072v3's "<think>"), and in a figure, text the paper itself sets as
// code (\texttt, \verb, \lstinline, \code, \path, \mintinline, \Verb: 2610.38366v1's ordering cue `after`, 2608.08350v2's
// `tanh`). Names keep their rule (isName): its capitalisation reading is what keeps HellaSwag and Aegis from being translated as words

describe('code-like tokens keep their source (mt.mjs isCode, codeTextsOf)', () => {
  it('a markup token, every word of a text in angle brackets, is code wherever it stands', () => {
    for (const t of ['<pad>', '<EOS>', '</s>', '<|endoftext|>', '<think> </think>']) expect(isCode(t), t).toBe(true)
    for (const t of ['pad', '< pad >', 'a <b>', '<', 'x < y', '']) expect(isCode(t), t).toBe(false)
    // (isName alone left "<pad>" to the translator: its capitals are none)
    expect(isName('<pad>', 'We pad the sequence.')).toBe(false)
  })

  it('reads the code a paper sets: each code command\'s argument, its escapes read, nested pieces too', () => {
    const units = [
      { kind: 'para', pieces: [{ t: 'text', s: 'The cue is ' }, { t: 'ph', src: '\\texttt{after}' }, { t: 'text', s: ' or ' }, { t: 'ph', src: '\\verb|max_tokens|' }] },
      { kind: 'para', pieces: [{ t: 'ph', src: '\\texttt{max\\_new\\_tokens}' }, { t: 'nested', unit: { kind: 'footnote', pieces: [{ t: 'ph', src: '\\lstinline[language=Python]{import torch}' }] } }] },
      { kind: 'para', pieces: [{ t: 'ph', src: '\\textbf{after}' }, { t: 'ph', src: '\\mintinline{python}{len(x)}' }] },
    ]
    expect([...codeTextsOf(units)].sort()).toEqual(['after', 'import torch', 'len(x)', 'max_new_tokens', 'max_tokens'])
    // (#561's review: minted's options before its language; an escaped brace inside the argument; a verbatim command's body
    // literal, its backslashes kept, where \texttt's escapes are read; a UTF-8 paper's text, which the front end holds byte for
    // byte, decoded)
    const latin1 = (t: string) => { let o = ''; for (const b of new TextEncoder().encode(t)) o += String.fromCharCode(b); return o }
    const more = [{ kind: 'para', pieces: [
      { t: 'ph', src: '\\mintinline[breaklines]{python}{zip(a, b)}' },
      { t: 'ph', src: '\\texttt{\\}x}' },
      { t: 'ph', src: '\\verb|a\\_b|' },
      { t: 'ph', src: '\\path{c\\_d}' },
      { t: 'ph', src: latin1('\\texttt{café}') },
    ] }]
    expect([...codeTextsOf(more)].sort()).toEqual(['a\\_b', 'c\\_d', 'café', 'zip(a, b)', '}x'])
    expect(isCode('after', codeTextsOf(units))).toBe(true)
    expect(isCode('before', codeTextsOf(units))).toBe(false)
  })

  it('a table\'s cell keeps a markup token\'s source, and only that: its words the paper also sets as code elsewhere are words there', () => {
    const units = [
      { kind: 'para', pieces: [{ t: 'text', s: 'Levels are ' }, { t: 'ph', src: '\\texttt{easy}' }, { t: 'text', s: ' and harder ones; we use HellaSwag.' }] },
      { kind: 'cell', pieces: [{ t: 'text', s: '<pad>' }] },
      { kind: 'cell', pieces: [{ t: 'text', s: 'easy' }] },
      { kind: 'cell', pieces: [{ t: 'text', s: 'HellaSwag' }] },
      { kind: 'cell', pieces: [{ t: 'text', s: 'Average' }] },
    ]
    expect([...nameCells(units as never)].map(u => (u as { pieces: { s: string }[] }).pieces[0]!.s)).toEqual(['<pad>', 'HellaSwag'])
  })

  it('a figure\'s label keeps its source where it is a markup token or code the paper sets (page-pass.mjs figureUnits)', () => {
    const unit = (text: string) => ({ page: 1, group: 'f0', text, font: 'ArialMT', size: 8, fill: 0, angle: 0, x: 10, y: 10, ux: 1, uy: 0, length: 40, ascent: 0.88, descent: -0.2, anchor: 'centre', form: true })
    const bundle: unknown[][] = [['para', 0, null, null, null, [[0, 'Text.']]]]
    figureUnits({ units: ['<pad>', '<EOS>', 'after', 'Validation loss', 'law'].map(unit) }, { bundle, undrawable: [], M: 1, views: [[0, 0, 612, 792]], prose: 'The law will never be perfect.', code: new Set(['after']) })
    expect(bundle.slice(1).map(u => [u[0], u[1]])).toEqual([[FIGURE_KIND, UNIT_FLAG_BITS.KEPT], [FIGURE_KIND, UNIT_FLAG_BITS.KEPT], [FIGURE_KIND, UNIT_FLAG_BITS.KEPT], [FIGURE_KIND, 0], [FIGURE_KIND, 0]])
  })
})
