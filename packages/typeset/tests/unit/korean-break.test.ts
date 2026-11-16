// B.tokens and B.break for Korean (the owner's choice of 2026-11-16, docs/PDF-READER.md §18.90): a Korean line may break between
// two Hangul syllables, as xetexko's default breaks it (xetexko.sty:1849, :1851, \XeTeXlinebreaklocale "ko"; \typesetmodern
// :322-332), and a line so broken is justified by the breaker's own rule for the scripts that break between characters (its slack
// spread over its gaps within `cjkJust`): no line but a paragraph's last is left short because a word did not fit. Korean still
// writes spaces between its words (`spaced`): nothing is added after a title set in the line (§18.85), and a formula set against
// a syllable with no space between is held to it (xetexko sets no glue between a Hangul syllable and the math after it). Laid
// through layPage over hand-made parts, the run-in test's metric: a CJK character 1 em, a space, a full stop or a comma 0.25 em,
// any other character 0.5 em. Sentences of our own.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

const CJK = /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/u
const HANGUL = /^[가-힣]$/u
const em = (size: number, t: string) =>
  [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : /[ .,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'e'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
/** a paragraph set justified on `n` lines of a measure `w` pt wide from x 72, at 10 pt on a 12 pt pitch; its group `1` stated
 *  set in the line where `runin`; its element `2` a formula drawn as its ink on page 1, 20 pt wide */
const para = (w: number, n: number, runin = false): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: Array.from({ length: n }, (_, k) => [
    1,
    0,
    72,
    72 + w,
    700 - 12 * k,
    707 - 12 * k,
    698 - 12 * k,
    72,
    72 + w,
    0,
    10,
  ]),
  room: { below: 40, next: 44 },
  spans: [['1', runin ? { cmd: 'textbf', runin: 1 } : { cmd: 'textbf' }]],
  els: [['2', { kind: 'math', ink: [[1, 150, 698, 170, 707, 700]] }]] as Placed['els'],
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (content: Content): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
const contentOf = (c: Content | string): Content => (typeof c === 'string' ? [{ t: 'text', s: c }] : c)
const lay = (c: Content | string, tag: string, w: number, n = 12, runin = false): Laid =>
  layPage(part(para(w, n, runin)), rowsOf(contentOf(c)), rulesFor(tag), metrics).members[0]!
type Line = { text: string; used: number; items: { s: string; x: number }[] }
/** each laid line: its text (a crop `#`), the width it sets (x1 - x0), its items (a crop's text `#`) where they stand */
const linesOf = (m: Laid): Line[] =>
  m.lines.map(([, x0, x1, items]) => {
    const its = items.map((it) => ({ s: 'src' in it ? '#' : it.s, x: Math.round(it.x * 100) / 100 }))
    return {
      text: its
        .map((it) => it.s)
        .join('')
        .trim(),
      used: Math.round((x1 - x0) * 100) / 100,
      items: its,
    }
  })

// (three sentences of our own: "We propose a new method for translating sentences. This method processes long documents quickly
// while keeping the original's structure. The results of the experiment are better than the existing method's.")
const KO =
  '우리는 문장을 번역하는 새로운 방법을 제안합니다. 이 방법은 원문의 구조를 보존하면서 긴 문서를 빠르게 처리합니다. ' +
  '실험 결과는 기존 방법보다 좋습니다.'

describe('Korean: a line may break between two Hangul syllables, and is set to the measure (§18.90)', () => {
  it('a paragraph in a narrow column: every line but the last set to the measure', () => {
    // (a column of 10.5 em: words of two to five syllables. Broken at spaces alone, a line whose next word does not fit is short
    // by up to a word, its slack past what its one or two spaces may take: set ragged)
    for (const w of [105, 96, 118]) {
      const lines = linesOf(lay(KO, 'ko', w))
      expect(lines.length).toBeGreaterThan(3)
      for (const l of lines.slice(0, -1)) expect(l.used).toBeCloseTo(w, 2)
    }
  })
  it('a word split between two syllables at a line’s end', () => {
    // (the lines read back against the row's text: a line that ends where the text holds no space, between two syllables)
    const lines = linesOf(lay(KO, 'ko', 105))
    let at = 0,
      split = 0
    for (const l of lines) {
      while (KO[at] === ' ') at++
      expect(KO.startsWith(l.text, at)).toBe(true)
      at += l.text.length
      if (at < KO.length && HANGUL.test(KO[at - 1]!) && HANGUL.test(KO[at]!)) split++
    }
    expect(at).toBe(KO.length)
    expect(split).toBeGreaterThan(0)
  })
  it('a mark no line starts with still starts none, at every measure', () => {
    // ("In short, first the sentences are short, second the words are many. But the result (Table 1) differs. Finally, the end.")
    const marked = '정리하면, 첫째로 문장이 짧고, 둘째로 단어가 많다. 그러나 결과는 (표 1) 다르다. 마지막으로, 끝이다.'
    const barred = new Set([...rulesFor('ko').set.noStart, ',', '.', ')'])
    for (let w = 60; w <= 130; w += 1)
      for (const l of linesOf(lay(marked, 'ko', w, 20))) expect(barred.has([...l.text][0]!)).toBe(false)
  })
  it('a Latin word inside Korean text is not split between its letters, at every measure', () => {
    // ("This model follows the Transformer architecture and learns as BERT does.": the longer word 55 pt at 10 pt)
    const latin = '이 모델은 Transformer 구조를 따르며 BERT와 같은 방식으로 학습한다.'
    for (let w = 70; w <= 130; w += 1) {
      const lines = linesOf(lay(latin, 'ko', w, 20))
      for (const word of ['Transformer', 'BERT']) expect(lines.filter((l) => l.text.includes(word)).length).toBe(1)
    }
  })
})

describe('Korean still writes spaces between its words (`spaced`, §18.90)', () => {
  it('a title set in the line: the row’s own space after it, nothing added (§18.85: not Korean)', () => {
    // ("Global matching", then "We use the model.")
    const titled: Content = [
      { t: 'span', id: '1', content: [{ t: 'text', s: '전역 정합' }] },
      { t: 'text', s: ' 우리는 모델을 사용합니다.' },
    ]
    expect(linesOf(lay(titled, 'ko', 300, 2, true))).toEqual(linesOf(lay(titled, 'ko', 300, 2, false)))
  })
  it('a formula set against a syllable with no space between is held to it: no line opens with it', () => {
    // ("We define a new function f and prove its properties.": the particle after the formula, the noun before it, no space)
    for (let w = 60; w <= 130; w += 1) {
      const lines = linesOf(
        lay(
          [
            { t: 'text', s: '우리는 새로운 함수' },
            { t: 'el', id: '2' },
            { t: 'text', s: '를 정의하고 그 성질을 증명합니다.' },
          ],
          'ko',
          w,
          20,
        ),
      )
      for (const l of lines) expect(l.items[0]!.s).not.toBe('#')
    }
  })
  it('Chinese: a formula after a Han character may still open a line (xeCJK’s \\CJKecglue, PR #438)', () => {
    const opens = [60, 70, 80, 90, 100].some((w) =>
      linesOf(
        lay(
          [
            { t: 'text', s: '我们定义一个新的函数' },
            { t: 'el', id: '2' },
            { t: 'text', s: '并证明它的性质。' },
          ],
          'zh',
          w,
          20,
        ),
      ).some((l, k) => k > 0 && l.items[0]!.s === '#'),
    )
    expect(opens).toBe(true)
  })
})

describe('Chinese, Japanese and the alphabets as before', () => {
  // (each as the base laid it, 2026-11-16, rebuild/converge-16 9410a0ca9: line by line, the text and the width it sets)
  it('Chinese', () => {
    const zh = '我们提出一种翻译文档的新方法。该方法在保留原文结构的同时，快速处理长文档。实验结果优于现有方法。'
    expect(linesOf(lay(zh, 'zh', 105, 8)).map((l) => [l.text, l.used])).toEqual([
      ['我们提出一种翻译文档', 105],
      ['的新方法。该方法在保', 105],
      ['留原文结构的同时，快', 105],
      ['速处理长文档。实验结', 105],
      ['果优于现有方法。', 84],
    ])
  })
  it('Japanese', () => {
    const ja =
      '私たちは文書を翻訳する新しい方法を提案します。この方法は原文の構造を保ちながら、長い文書を速く処理します。'
    expect(linesOf(lay(ja, 'ja', 105, 8)).map((l) => [l.text, l.used])).toEqual([
      ['私たちは文書を翻訳す', 105],
      ['る新しい方法を提案し', 105],
      ['ます。この方法は原文の', 105],
      ['構造を保ちながら、長い', 105],
      ['文書を速く処理します。', 110],
    ])
  })
  it('Spanish', () => {
    const es =
      'Proponemos un nuevo método para traducir documentos largos. El método conserva la estructura del original y procesa ' +
      'documentos extensos con rapidez.'
    expect(linesOf(lay(es, 'es', 105, 8)).map((l) => [l.text, l.used])).toEqual([
      ['Proponemos un nuevo', 105],
      ['método para traducir', 105],
      ['documentos largos.', 93.5],
      ['El método conserva', 93.5],
      ['la estructura del', 88],
      ['original y procesa', 93.5],
      ['documentos extensos', 105],
      ['con rapidez.', 60.5],
    ])
  })
})
