// B.tokens: a title the engine states set in the line (SpanAt.runin: the display design's F40, the coordinator's variant C) is
// kept apart from the sentence after it by the script's own separation between two sentences, where the row holds no closing
// mark there: one CJK character's width in a script that writes no spaces between its words, in place of any space the row set
// there; in a script that writes them, the row's own space, nothing added. Laid through layPage over hand-made parts, the
// mark-space test's metric: a CJK character 1 em, a space, a full stop or a comma 0.25 em, any other character 0.5 em. Words of
// our own.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/u
const em = (size: number, t: string) =>
  [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : /[ .,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'e'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
/** a paragraph of two lines on a measure of 300 pt from x 72, at 10 pt on a 12 pt pitch, its group `1` stated or not; its
 *  element `2` of the kind given (a citation, a formula), drawn as its ink on page 1 */
const para = (runin: boolean, kind?: string): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  lines: [0, 1].map((k) => [1, 0, 72, 372, 700 - 12 * k, 707 - 12 * k, 698 - 12 * k, 72, 372, 0, 10]),
  room: { below: 40, next: 44 },
  spans: [['1', runin ? { cmd: 'textbf', runin: 1 } : { cmd: 'textbf' }]],
  ...(kind ? { els: [['2', { kind, ink: [[1, 150, 698, 170, 707, 700]] }]] as Placed['els'] } : {}),
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
type Drawn = readonly (readonly [string, number, number])[]
/** the first line's characters, each at the x it is drawn at, and the size it is drawn at; an element's crop as `#` */
const lineOf = (content: Content, runin: boolean, tag = 'zh', kind?: string): Drawn =>
  layPage(part(para(runin, kind)), rowsOf(content), rulesFor(tag), metrics).members[0]!.lines[0]![3].flatMap((it) =>
    'src' in it
      ? [['#', Math.round(it.x * 100) / 100, 0] as const]
      : it.dx
        ? [...it.s].map((ch, k) => [ch, Math.round((it.x + (it.dx?.[k] ?? 0)) * 100) / 100, it.size] as const)
        : [[it.s, Math.round(it.x * 100) / 100, it.size] as const],
  )
const xOf = (line: Drawn, ch: string) => line.find(([c]) => c === ch)?.[1] as number
/** the white between `a` and `b`, two characters drawn one after the other: their distance less a character's step on the line */
const gapOf = (line: Drawn, a: string, b: string, step: [string, string] = ['全', '局']) =>
  Math.round((xOf(line, b) - xOf(line, a) - (xOf(line, step[1]) - xOf(line, step[0]))) * 100) / 100
const title = (s: string): Content => [
  { t: 'span', id: '1', content: [{ t: 'text', s: '全局匹配' }] },
  { t: 'text', s },
]

describe('a title set in the line (SpanAt.runin): the script’s separation after it where the row holds no mark', () => {
  it('Chinese and Japanese: one character’s width (of the size drawn) after the title; not stated, flush as today', () => {
    for (const tag of ['zh', 'ja']) {
      const line = lineOf(title('我们利用模型。'), true, tag)
      expect(gapOf(line, '配', '我')).toBe(line[0]![2])
      expect(gapOf(lineOf(title('我们利用模型。'), false, tag), '配', '我')).toBe(0)
    }
  })
  it('a space the row set there is the separation’s place: one width, not two', () => {
    const line = lineOf(title(' 我们利用模型。'), true)
    expect(gapOf(line, '配', '我')).toBe(line[0]![2])
  })
  it('the row’s own colon after the title: nothing added, laid as today', () => {
    expect(lineOf(title('：我们利用模型。'), true)).toEqual(lineOf(title('：我们利用模型。'), false))
  })
  it('a title after a sentence its paragraph’s row ends first (a group TeX opened a paragraph at): one width', () => {
    const line = lineOf([{ t: 'text', s: '上一段结束。' }, ...title('我们利用模型。')], true)
    expect(gapOf(line, '配', '我')).toBe(line[0]![2])
  })
  it('a title the translation moved into a sentence (text before it that ends none): nothing added, laid as today', () => {
    // (2111.09276v1 u103: "\textbf{wikiHow} We treat wikiHow as …" came back as one sentence, the group its object)
    const moved: Content = [{ t: 'text', s: '我们将' }, ...title('视为模式库。')]
    expect(lineOf(moved, true)).toEqual(lineOf(moved, false))
  })
  it('a citation between the title and its sentence (T5~\\cite{…} We …): the gap after the citation, before the text', () => {
    const cited = (runin: boolean) =>
      lineOf(
        title('').concat([
          { t: 'el', id: '2' },
          { t: 'text', s: '我们提出模型。' },
        ]),
        runin,
        'zh',
        'cite',
      )
    const [on, off] = [cited(true), cited(false)]
    expect(xOf(on, '#')).toBe(xOf(off, '#'))
    expect(Math.round((xOf(on, '我') - xOf(off, '我')) * 100) / 100).toBe(on[0]![2])
  })
  it('an element the row begins the sentence with (a formula): the gap before it', () => {
    const formula = (runin: boolean) =>
      lineOf(
        title('').concat([
          { t: 'el', id: '2' },
          { t: 'text', s: '是相似度。' },
        ]),
        runin,
        'zh',
        'math',
      )
    const [on, off] = [formula(true), formula(false)]
    expect(Math.round((xOf(on, '#') - xOf(off, '#')) * 100) / 100).toBe(on[0]![2])
    expect(Math.round((xOf(on, '是') - xOf(off, '是')) * 100) / 100).toBe(on[0]![2])
  })
  it('the row’s own mark after the title with a space before it: laid as today, its spaces too', () => {
    for (const s of [' ：我们利用模型。', ' : we use it.'])
      expect(lineOf(title(s), true)).toEqual(lineOf(title(s), false))
  })
  it('a script that writes spaces: the row’s own space, nothing added', () => {
    const de: Content = [
      { t: 'span', id: '1', content: [{ t: 'text', s: 'Globales Matching' }] },
      { t: 'text', s: ' Wir nutzen das Modell.' },
    ]
    expect(lineOf(de, true, 'de')).toEqual(lineOf(de, false, 'de'))
  })
})
