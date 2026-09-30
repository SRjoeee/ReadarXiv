import { describe, expect, it } from 'vitest'
import { plainSource, plainTranslated, unitText } from '@/pdf-reader/engine/mt.mjs'

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
