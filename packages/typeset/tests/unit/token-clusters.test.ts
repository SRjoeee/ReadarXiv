// B.tokens cuts a run that breaks between its characters between grapheme clusters, never inside one (PR #649's review
// 4593874142, docs/PDF-READER.md §18.92): a decomposed Hangul syllable, a kana and its combining voiced mark, a character and its
// variation selector are one token each, measured whole and never broken inside; an emoji's ZWJ sequence in a CJK line one too.
// Laid through layPage over a hand-made paragraph (korean-break.test.ts's), a face that shapes each cluster as one character: a
// CJK character (its first code point's class) 1 em, a space, full stop or comma 0.25 em, any other 0.5 em. Texts of our own.
// Composed text is tokenized as before, byte for byte: each sample's tokens hashed, the digests the base's (e43cb27a0's) tokens of
// the same samples gave.
import { createHash } from 'node:crypto'
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it, vi } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

/** every unit's tokens as B.tokens made them, in the order made */
const made = vi.hoisted(() => ({ tokens: [] as unknown[] }))
vi.mock('../../src/breaker/tokens.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/breaker/tokens.ts')>()
  return {
    ...m,
    tokens: (...a: Parameters<typeof m.tokens>) => {
      const out = m.tokens(...a)
      made.tokens.push(out.tokens)
      return out
    },
  }
})

const G = new Intl.Segmenter('en', { granularity: 'grapheme' })
const CJK = /^[\u{1100}-\u{11ff}\u{2e80}-\u{9fff}\u{ac00}-\u{d7af}\u{ff00}-\u{ffef}\u{20000}-\u{3ffff}]/u
/** every text the lay measured */
const measured: string[] = []
const em = (size: number, t: string) => {
  let w = 0
  for (const { segment: g } of G.segment(t)) w += size * (CJK.test(g) ? 1 : /^[ .,]$/u.test(g) ? 0.25 : 0.5)
  return w
}
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => {
    measured.push(t)
    return em(size, t)
  },
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'd'.repeat(64)
/** a paragraph set justified on `n` lines of a measure `w` pt wide from x 72, at 10 pt on a 12 pt pitch */
const para = (w: number, n: number): Placed => ({
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
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (s: string): Rows => {
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
const lay = (s: string, tag: string, w: number, n = 12): Laid => {
  made.tokens.length = 0
  measured.length = 0
  return layPage(part(para(w, n)), rowsOf(s), rulesFor(tag), metrics).members[0]!
}
type Line = { text: string; used: number; items: { s: string; x: number }[] }
/** each laid line: its text, the width it sets, its items where they stand */
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
/** the text tokens B.tokens made, `s` and class */
const texts = () =>
  (made.tokens.at(-1) as { s?: string; cls?: string; space?: boolean }[])
    .filter((t) => !t.space && typeof t.s === 'string')
    .map((t) => [t.s, t.cls])
/** where a line ends inside a cluster of the text: its last character and the next line's first make one cluster */
const cutInside = (lines: Line[]) =>
  lines.slice(0, -1).filter((l, k) => {
    const a = [...G.segment(l.text)].at(-1)?.segment ?? '',
      b = [...G.segment(lines[k + 1]!.text)][0]?.segment ?? ''
    return a && b && [...G.segment(a + b)].length < 2
  })
/**
 * Each laid line as it is drawn, character by character: its width, and each character (a grapheme cluster, read through `read`)
 * with the place it is drawn at, a run's own (`dx`, a run of characters each at its own place) or its start for its first; a
 * character a run places by its own advance after its first, at null. White space is not drawn
 */
const drawnOf = (m: Laid, read: (g: string) => string = (g) => g) =>
  m.lines.map(([, x0, x1, items]) => ({
    used: Math.round((x1 - x0) * 100) / 100,
    chars: items.flatMap((it): [string, number | null][] => {
      if ('src' in it) return [['#', Math.round(it.x * 100) / 100]]
      const dx = (it as { dx?: number[] }).dx
      const out: [string, number | null][] = []
      let k = 0
      for (const { segment: g } of G.segment(it.s)) {
        const x = dx ? it.x + dx[k]! : k === 0 ? it.x : null
        k += [...g].length
        if (!/^\s+$/u.test(g)) out.push([read(g), x === null ? null : Math.round(x * 100) / 100])
      }
      return out
    }),
  }))
const nfc = (g: string) => g.normalize('NFC')

// (sentences of our own. Korean: "We propose a new method for translating sentences. This method processes long documents
// quickly while keeping the original's structure." Japanese: "The learning data is a small set that was chosen. The results
// are shown in the table." Chinese: "We use the tool for experiments; the character 辻 with its variant selector is a name.")
const KO =
  '우리는 문장을 번역하는 새로운 방법을 제안합니다. 이 방법은 원문의 구조를 보존하면서 긴 문서를 빠르게 처리합니다.'
const JA = 'がくしゅうデータはごく少数のえらばれたデータです。けっかはひょうにしめされています。'

describe('a decomposed Hangul syllable is one token, measured whole, never broken inside (Korean breaks between syllables)', () => {
  it('one syllable', () => {
    const han = '한'.normalize('NFD')
    expect([...han]).toHaveLength(3)
    const m = lay(han, 'ko', 300, 2)
    expect(texts()).toEqual([[han, 'cjk']])
    expect(linesOf(m).map((l) => l.items.map((it) => it.s))).toEqual([[han]])
    // (measured whole: no text measured holds a letter of the syllable without the whole syllable)
    expect(measured.filter((t) => [...han].some((c) => t.includes(c)) && !t.includes(han))).toEqual([])
    expect(measured).toContain(han)
  })
  it('a word: a token a syllable', () => {
    const word = '한국어'.normalize('NFD')
    lay(word, 'ko', 300, 2)
    expect(texts()).toEqual(['한', '국', '어'].map((s) => [s.normalize('NFD'), 'cjk']))
  })
  it('a paragraph laid at every measure exactly as its composed form: no line ends inside a syllable', () => {
    for (let w = 60; w <= 130; w += 1) {
      const composed = lay(KO, 'ko', w),
        decomposed = lay(KO.normalize('NFD'), 'ko', w)
      expect(cutInside(linesOf(decomposed)), `w ${w}`).toEqual([])
      expect(drawnOf(decomposed, nfc), `w ${w}`).toEqual(drawnOf(composed))
    }
  })
})

describe('a kana and its combining voiced mark (U+3099) are one token', () => {
  it('one token, never broken inside, laid at every measure as the composed kana', () => {
    lay('か\u{3099}く', 'ja', 300, 2)
    expect(texts()).toEqual([
      ['か\u{3099}', 'cjk'],
      ['く', 'cjk'],
    ])
    for (let w = 60; w <= 130; w += 1) {
      const composed = lay(JA, 'ja', w),
        decomposed = lay(JA.normalize('NFD'), 'ja', w)
      expect(cutInside(linesOf(decomposed)), `w ${w}`).toEqual([])
      expect(drawnOf(decomposed, nfc), `w ${w}`).toEqual(drawnOf(composed))
    }
  })
})

describe('a Han character and its variation selector are one token', () => {
  it('one CJK token, its selector never a line’s start, laid as the character alone', () => {
    const ivs = '辻\u{e0100}'
    const text = `我们在实验中使用这个工具。名字中的${ivs}字带有异体字选择符。`
    lay(text, 'zh', 300, 3)
    expect(texts().filter(([s]) => (s as string).includes('\u{e0100}'))).toEqual([[ivs, 'cjk']])
    for (let w = 40; w <= 130; w += 1) {
      const m = lay(text, 'zh', w),
        lines = linesOf(m)
      expect(cutInside(lines), `w ${w}`).toEqual([])
      expect(
        lines.some((l) => l.text.startsWith('\u{e0100}')),
        `w ${w}`,
      ).toBe(false)
      const plain = lay(text.replace('\u{e0100}', ''), 'zh', w)
      expect(
        drawnOf(m, (g) => g.replace('\u{e0100}', '')),
        `w ${w}`,
      ).toEqual(drawnOf(plain))
    }
  })
})

describe('an emoji ZWJ sequence in a CJK line is one token', () => {
  it('never broken inside, at every measure', () => {
    const coder = '👩\u{200d}💻'
    const text = `我们使用${coder}工具进行实验，结果很好。`
    lay(text, 'zh', 300, 3)
    expect(texts().filter(([s]) => (s as string).includes('\u{200d}'))).toEqual([[coder, 'latin']])
    for (let w = 40; w <= 130; w += 1) {
      const lines = linesOf(lay(text, 'zh', w))
      expect(cutInside(lines), `w ${w}`).toEqual([])
      expect(
        lines.filter((l) => l.text.includes(coder)),
        `w ${w}`,
      ).toHaveLength(1)
    }
  })
})

describe('composed text is tokenized as before, byte for byte', () => {
  // (each sample's tokens as JSON, hashed; the digests e43cb27a0's B.tokens gave the same samples laid the same way)
  const samples: [string, string, string][] = [
    ['zh', '我们使用BERT模型（Devlin等，2019）进行实验，结果见表1。“引号”和——破折号……', '1887e78aae29b6cf'],
    ['ja', 'がくしゅうデータは「ImageNet」です。けっか：ひょう1をみてください！', 'c09ee6dd6ddd3924'],
    ['ko', '한국어 문장을 번역합니다. 결과는 표 1에 있습니다(참고).', '20c7449931c811c0'],
  ]
  for (const [tag, text, want] of samples)
    it(tag, () => {
      lay(text, tag, 120)
      const got = createHash('sha256').update(JSON.stringify(made.tokens)).digest('hex').slice(0, 16)
      if (process.env.AXT_TOKENS_GOLDEN) console.log(`golden ${tag} ${got}`)
      expect(got).toBe(want)
    })
})
