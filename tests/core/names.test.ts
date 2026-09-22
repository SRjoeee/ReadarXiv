import { describe, expect, it } from 'vitest'
import { isName, nameEvidence } from '@/core/names'

// Whether a figure's box is only a name (DESIGN §15.1), judged against the paper's own prose

const PROSE = [
  'We compare against Aegis [16] and BeaverTails, and report the score of every model on GSM8K.',
  'The input is a pretrained model; each timestep is one call. Compute grows with the input length.',
  'Results are in Table 2, where the accuracy of CRL is highest.',
].join('\n')
const evidence = nameEvidence(PROSE)
const name = (text: string) => isName(text, evidence)

describe('nameEvidence', () => {
  it('collects the words written in lower case, and the capitalised words set as proper nouns: mid-sentence, or the head of a longer name', () => {
    expect(evidence.lower.has('score')).toBe(true)
    expect(evidence.lower.has('aegis')).toBe(false)
    // After a lower-case letter and a space, and after a comma
    expect(evidence.proper.has('Aegis')).toBe(true)
    expect(evidence.proper.has('BeaverTails')).toBe(true)
    // The head of BeaverTails at its inner capital
    expect(evidence.proper.has('Beaver')).toBe(true)
    // At the start of a sentence a capital says nothing
    expect(evidence.proper.has('Compute')).toBe(false)
    expect(evidence.proper.has('We')).toBe(false)
  })
})

describe('isName', () => {
  it('a word with a digit, and a panel letter beside one, is a name', () => {
    expect(name('GSM8K')).toBe(true)
    expect(name('Llama3-8B-Instruct')).toBe(true)
    expect(name('cube-single-noisy-v0')).toBe(true)
    expect(name('(a) Llama3')).toBe(true)
  })

  it('a word in capitals, or with an inner capital, is a name unless the prose writes its letters in lower case', () => {
    expect(name('CRL')).toBe(true)
    expect(name('WikiText')).toBe(true)
    // Set in capitals or run together in the figure, written in lower case in the prose: words
    expect(name('INPUT')).toBe(false)
    expect(name('PRETRAINED MODEL')).toBe(false)
    expect(name('TimeStep')).toBe(false)
  })

  it('a word with only its first capital is a name where the prose treats it as one and never writes it in lower case', () => {
    expect(name('Aegis')).toBe(true)
    expect(name('Beaver')).toBe(true)
    // Written in lower case: a word in title case
    expect(name('Score')).toBe(false)
    // Never in lower case, but never mid-sentence either — a heading's word
    expect(name('Compute')).toBe(false)
  })

  it('a word in lower case, a box with one word that is not a name, and a box of more than three words are not names', () => {
    expect(name('accuracy')).toBe(false)
    expect(name('Accuracy CRL')).toBe(false)
    expect(name('Aegis BeaverTails GSM8K CRL')).toBe(false)
  })

  it('lone letters are no evidence of a word: an expression of single letters stays a name', () => {
    expect(name('C(τ)/∑S')).toBe(true)
    expect(name('x = y')).toBe(true)
  })

  it('with no prose to go by only the forms of a name are left: digits, capitals, inner capitals', () => {
    const none = nameEvidence('')
    expect(isName('GSM8K', none)).toBe(true)
    expect(isName('CRL', none)).toBe(true)
    expect(isName('Aegis', none)).toBe(false)
    expect(isName('accuracy', none)).toBe(false)
  })
})
