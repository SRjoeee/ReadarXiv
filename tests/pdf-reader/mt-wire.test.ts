import { describe, expect, it } from 'vitest'
import { serialize } from '@/pdf-reader/engine/mt.mjs'

// The markers wire the PDF reader sends a machine translator (mt.mjs): what an engine reads as part of a word

const unit = (...pieces: { t: string; s?: string; src?: string; id?: number }[]) => ({ kind: 'para', pieces })
const bold = (text: string, rest: string) => unit({ t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: text }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: rest })

describe('serialize: a marker is set apart from what an engine would read with it', () => {
  it('after a period: the run-in label ending in one keeps its last word translated (RT-1\'s "Action tokenization.")', () => {
    expect(serialize(bold('Action tokenization.', ' To tokenize actions.')).wire).toBe('@a# Action tokenization. @b# To tokenize actions.')
  })

  it('after a letter or a digit, and before one', () => {
    expect(serialize(bold('Service Auto-Scaling', 'To accommodate loads.')).wire).toBe('@a# Service Auto-Scaling @b# To accommodate loads.')
    expect(serialize(bold('Stage 2', ' next.')).wire).toBe('@a# Stage 2 @b# next.')
  })

  it('not after other punctuation, which the engine reads apart', () => {
    expect(serialize(bold('Setup:', ' we train.')).wire).toBe('@a# Setup:@b# we train.')
  })
})
