import { describe, expect, it } from 'vitest'
import { plainSource, plainTranslated, serialize, unitText } from '@/pdf-reader/engine/mt.mjs'

// A unit's plain text as the PDF shows it, which the reader locates it by (anchors.mjs)

describe('unitText: the plain text, and where its placeholders stood', () => {
  it('the text is plainSource\'s, the offsets where a formula or a citation was', () => {
    const u = { pieces: [{ t: 'text', s: 'Round ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ': Results of ' }, { t: 'ph', src: '\\cite{x}' }, { t: 'ph', src: '$m$' }] }
    expect(unitText(u.pieces)).toEqual({ text: plainSource(u), gaps: [6, 18] })
    expect(plainSource(u)).toBe('Round : Results of')
  })

  it('a translation\'s pieces: plainTranslated\'s text, and a formatting pair is no placeholder', () => {
    const pieces = [{ t: 'text', tr: true, s: '第 ' }, { t: 'ph', src: '$n$' }, { t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', tr: true, s: '轮' }, { t: 'close', id: 1, src: '}' }]
    expect(unitText(pieces)).toEqual({ text: plainTranslated(pieces), gaps: [2] })
  })

  it('no placeholder, no offsets', () => {
    expect(unitText([{ t: 'text', s: '  Plain  words ' }])).toEqual({ text: 'Plain words' })
  })
})

describe('serialize: a marker that touches a word is set apart from it on the wire', () => {
  const wire = (pieces: { t: string; s?: string; src?: string }[]) => serialize({ pieces }).wire

  it('after a word, and after a full stop: `models.@a#` is one token to the engine, which left the word in English (09c25622, the HTML page\'s same fix)', () => {
    expect(wire([{ t: 'text', s: 'useful tools for calibrating theoretical models.' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' However, this' }])).toBe('useful tools for calibrating theoretical models. @a# However, this')
    expect(wire([{ t: 'text', s: 'as reported for BERT' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' on larger corpora.' }])).toBe('as reported for BERT @a# on larger corpora.')
  })

  it('not after other punctuation, nor between two markers', () => {
    expect(wire([{ t: 'text', s: 'follows (' }, { t: 'ph', src: '\\ref{a}' }, { t: 'ph', src: '\\ref{b}' }, { t: 'text', s: '), so' }])).toBe('follows (@a#@b#), so')
  })
})
