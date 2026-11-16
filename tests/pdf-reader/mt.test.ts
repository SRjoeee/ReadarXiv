import { describe, expect, it } from 'vitest'
import { latin1Bytes } from '@/pdf-reader/engine/source/latex-front.mjs'
import { plainSource, plainTranslated, unitText, utf8 } from '@/pdf-reader/engine/translate/mt.mjs'

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

// Sentence level (plans/2026-10-01-pdf-highlight.md, B3): Microsoft's own sentence lengths for the wire the reader sent
// (sentLen, kept by the extension's service as `alignment`), cleaned into where each sentence after the first begins in
// the unit's plain source and in its translation's plain text — the texts each side is anchored by

describe('utf8: the source\'s bytes as the front end reads them', () => {
  it('is the front end\'s latin1Bytes decoded as UTF-8, for every byte and for a character past the first plane', () => {
    const all = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
    for (const s of ['caf\u00c3\u00a9', 'plain', all, 'a\u{1F600}b']) expect(utf8(s)).toBe(new TextDecoder().decode(latin1Bytes(s)))
    expect(utf8('caf\u00c3\u00a9')).toBe('caf\u00e9')
  })
})

