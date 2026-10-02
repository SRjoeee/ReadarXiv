import { describe, expect, it } from 'vitest'
import { rehydrate, serialize } from '@/pdf-reader/engine/mt.mjs'

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

// The space the wire sets beside a digit is the wire's, not the source's: rehydrate takes it off again as it
// takes off the one after a full stop (the evaluation of the rule, 2026-10-01: 95\% came back "95 %" in Chinese, 20 of 53
// units with a percent after a number)
const back = (u: ReturnType<typeof unit>, reply: string, tolerant = false) => {
  const r = rehydrate(reply, serialize(u), tolerant)
  return 'pieces' in r ? r.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('') : r.error
}

describe('rehydrate: the space the wire set beside a digit is taken off again', () => {
  const percent = unit({ t: 'text', s: 'We reach 95' }, { t: 'ph', src: '\\%' }, { t: 'text', s: ' accuracy.' })
  it('before the marker, while the text there still ends in the digit', () => {
    expect(serialize(percent).wire).toBe('We reach 95 @a# accuracy.')
    expect(back(percent, '我们达到了 95 @a# 的准确率。')).toBe('我们达到了 95\\% 的准确率。')
    expect(back(percent, 'Wir erreichen 95 @a# Genauigkeit.')).toBe('Wir erreichen 95\\% Genauigkeit.')
  })
  it('not where the engine set something else before the marker: its space is its own', () => {
    expect(back(percent, 'Wir erreichen eine Genauigkeit von 95 Prozent @a#.')).toBe('Wir erreichen eine Genauigkeit von 95 Prozent \\%.')
  })
  it('after the marker, while the text there still begins with the digit', () => {
    const times = unit({ t: 'text', s: 'a 3' }, { t: 'ph', src: '$\\times$' }, { t: 'text', s: '10 speed-up' })
    expect(serialize(times).wire).toBe('a 3 @a# 10 speed-up')
    expect(back(times, '3 @a# 10 倍的加速')).toBe('3$\\times$10 倍的加速')
    expect(back(times, 'eine 3 @a# 10-fache Beschleunigung')).toBe('eine 3$\\times$10-fache Beschleunigung')
  })
  it('before a piece a space never goes before, whatever the engine left before it', () => {
    const tied = unit({ t: 'text', s: 'Stage 2' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' trains it.' })
    expect(serialize(tied).wire).toBe('Stage 2 @a#@b# trains it.')
    expect(back(tied, 'Stufe 2 @a#@b# trainiert es.')).toBe('Stufe 2~\\cite{x} trainiert es.')
  })
  it('a word\'s space stays as it was (#254): a letter before a marker keeps the space the engine left', () => {
    const word = unit({ t: 'text', s: 'as reported for BERT' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' on larger corpora.' })
    expect(back(word, 'wie für BERT @a# auf größeren Korpora berichtet.')).toBe('wie für BERT \\cite{x} auf größeren Korpora berichtet.')
  })
})
