// @vitest-environment node
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { holdsNoWord, keptAsWritten, onlyNames, paperNamesOf, tokenKind } from '../src/instrument/language.ts'

// R1's token classes and R2's names (docs/PDF-READER.md §18.72): the definitions, held case by case.
const text = (s: string): Piece[] => [{ t: 'text', s }]
const el = (kind: string, src: string): Piece => ({ t: 'el', id: src, kind, src })

describe('R1: a token is a symbol, a number, an identifier or a word', () => {
  it('symbols: no letter and no digit, or one letter alone', () => {
    for (const t of ['--', '±', '(', 'B', 'N+', 'x', '✓']) expect([t, tokenKind(t)]).toEqual([t, 'symbol'])
  })
  it('numbers: a digit anywhere (a version, a size, a count joined to a word)', () => {
    for (const t of ['79.86', '4,099', 'Qwen3-4B', 'GPT-4o', 'ViT-B/16', '18-layer', 'test1', 'top-1', '9.5B'])
      expect([t, tokenKind(t)]).toEqual([t, 'number'])
  })
  it('identifiers: all capitals, a capital after a letter, an underscore, a dot between letters, a joined part that is one', () => {
    for (const t of [
      'AULC',
      'BLEU',
      'MedQA',
      'CaseHOLD',
      'DeepSeek',
      'iPhone',
      'CNNs',
      "VGG's",
      'run_all',
      'torch.nn',
      'Aes.Qual',
      's.e.',
      'Howto-GEN',
      'Lean-GAP',
      'MNLI-(m/mm)',
      'w/o',
      'T(s)',
      'Non-IID',
      'EN-FR',
    ])
      expect([t, tokenKind(t)]).toEqual([t, 'identifier'])
  })
  it('words: lower case or title case, joined parts that are words, a word in brackets or with its stop', () => {
    for (const t of [
      'Avg.',
      'Recovery',
      '(ours)',
      '+schema',
      'Self-Attention',
      'Precision/Recall',
      'Unsafe/labeled',
      'Gemini',
      'model’s',
      'données',
    ])
      expect([t, tokenKind(t)]).toEqual([t, 'word'])
  })
  it('a text holds no word where every token is one of the three; text in a code face and every element are no words', () => {
    expect(holdsNoWord(text(' MedQA '))).toBe(true)
    expect(holdsNoWord(text('Avg. Recovery'))).toBe(false)
    expect(holdsNoWord([{ t: 'span', id: '0', style: 'mono', content: text('resnet run') }])).toBe(true)
    expect(holdsNoWord([...text('BERT'), el('cite', '\\cite{x}')])).toBe(true)
    expect(holdsNoWord([el('math', '$k$'), ...text('-means')])).toBe(false)
    expect(holdsNoWord([el('code', '\\texttt{x}'), ...text(' GPU')])).toBe(true)
  })
})

describe('R2: the paper’s own names, from its running text', () => {
  const para = (s: string) => ({ kind: 'para', content: text(s) })
  it('a title-case word capitalised mid-sentence and never in lower case is a name', () => {
    const names = paperNamesOf([para('We compare Claude and Mistral. Claude is better than the baseline.')])
    expect([...names].sort()).toEqual(['Claude', 'Mistral'])
  })
  it('one the text also writes in lower case is a word; one capitalised only where a sentence begins is no name', () => {
    const names = paperNamesOf([para('Results on the Test split. The test set is small. Oracle scores bound it.')])
    expect(names.has('Test')).toBe(false)
    expect(names.has('Oracle')).toBe(false)
    expect(names.has('Results')).toBe(false)
  })
  it('the sentence starts are the shared cutter’s: an abbreviation ends none, a citation opening one is read as it stands', () => {
    const names = paperNamesOf([
      {
        kind: 'para',
        content: [
          ...text('As in Fig. 2, Tukey fences hold. '),
          el('cite', '\\citet{t}'),
          ...text(' Tukey proposed them.'),
        ],
      },
    ])
    expect(names.has('Tukey')).toBe(true)
  })
  it('only the running text is read: a heading, a cell, the bibliography are not', () => {
    const names = paperNamesOf([
      { kind: 'heading', content: text('Related Work and Experimental Setup') },
      { kind: 'cell', content: text('Average Score') },
      { kind: 'reference', content: text('A. Smith. Deep Learning for Graphs. In Proc. of the Conference.') },
      para('we study the learning rate and the average score.'),
    ])
    expect([...names]).toEqual([])
  })
  it('a text of such names and R1’s tokens is kept; one with any other word is sent', () => {
    const names = new Set(['Claude', 'Opus', 'Gemini'])
    expect(onlyNames(text('Claude Opus 4.8'), names)).toBe(true)
    expect(keptAsWritten(text('Gemini'), names)).toBe('names')
    expect(keptAsWritten(text('Gemini (ours)'), names)).toBe(null)
    expect(keptAsWritten(text('GPT-4o'), names)).toBe('words')
  })
})
