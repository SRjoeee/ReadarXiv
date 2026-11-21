// U.marks on synthetic texts: a held line's marks dropped (a branch the corpus never takes), a display's, the tail merged.
// The droppedHeld expectations are today's answers (engine 065c1d973) on the same texts.
import { describe, expect, it } from 'vitest'
import type { Token } from '../../src/breaker/tokens.ts'
import { droppedHeld, dropMarks, type MarksTrace, mergeTail } from '../../src/unit/marks.ts'

const trace = (): MarksTrace => ({ drops: [], tail: null })

describe('U.marks', () => {
  it('drops after a held line’s mark those that stand for one the line shows, keeping the others', () => {
    expect(droppedHeld('\u3002 next', ['.'])).toBe(' next')
    expect(droppedHeld('\uff0c\u3002 next', ['.'])).toBe('\uff0c next')
    expect(droppedHeld(', . next', ['.', ','])).toBe(' next')
    expect(droppedHeld(' ; x', ['.'])).toBe(' ; x')
    expect(droppedHeld('x.', ['.'])).toBe('x.')
    const t = trace()
    expect(dropMarks('\u3002 next', { held: ['.'] }, t)).toBe(' next')
    expect(t.drops).toEqual([['held', '\u3002 next', ' next']])
  })

  it('drops after a display every leading mark no line starts with, unless the original sets one after it', () => {
    const t = trace()
    expect(dropMarks(' \uff0c\u3002 next', { origAfter: null }, t)).toBe(' next')
    expect(dropMarks('\uff0c next', { origAfter: '.' }, t)).toBe('\uff0c next')
    expect(dropMarks('next', { origAfter: null }, t)).toBe('next')
    expect(t.drops).toEqual([['display', ' \uff0c\u3002 next', ' next']])
  })

  it('takes the translation’s end marks of the tail’s kinds off, less the unit’s own there', () => {
    const toks = (): Token[] => [
      { s: 'word', w100: 0 },
      { s: '\u3002', w100: 0 },
      { space: true, s: ' ', w100: 0 },
    ]
    const a = toks()
    expect(mergeTail(a, [{ ch: '.' }], null)).toBe(1)
    expect(a).toEqual([{ s: 'word', w100: 0 }])
    const b = toks()
    expect(mergeTail(b, [{ ch: '.' }], ['.'])).toBe(0)
    expect(b).toEqual([
      { s: 'word', w100: 0 },
      { s: '\u3002', w100: 0 },
    ])
    const c: Token[] = [{ s: 'word.)', w100: 0 }]
    expect(mergeTail(c, [{ ch: ')' }], null)).toBe(1)
    expect(c).toEqual([{ s: 'word.', w100: 0 }])
    // (a placeholder's token ends the scan: its marks are its own)
    const d: Token[] = [{ s: '.', ph: 'orig-text', w100: 0 }]
    expect(mergeTail(d, [{ ch: '.' }], null)).toBe(0)
  })
})
