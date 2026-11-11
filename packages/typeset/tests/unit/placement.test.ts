// Where layPage sets a member's lines on arXiv's page, over hand-made parts modelled on the maintainer's cases of 2026-11-08
// (staging, 2303.11366v4 p1 and 1706.03762v7 p10): the paper's title set in fewer lines than its original keeps its first
// line on the original's first baseline, its block anchored at its top as the original's is; a section heading so set stands
// on its original's last lines (X.lastLines, the ruling of 2026-10-19), as today's (run.mjs:2135-2137).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const partOf = (flows: Placed[][]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows,
})
const rowsOf = (list: [number, string][]): Rows => {
  const by = new Map<string, Row>(
    list.map(([n, s]) => [idOf(n), { id: idOf(n), ok: true, by: 'test', content: [{ t: 'text', s }] }]),
  )
  return { get: (k) => by.get(k), done: true }
}
const laidOf = (p: ReturnType<typeof layPage>, ord: number) => p.members.find((m) => m.ord === ord)!

describe('a translation set in fewer lines than its original', () => {
  // (2303.11366v4 p1's title: two centred lines between two rules, its translation one line)
  const title: Placed = {
    ord: 0,
    kind: 'heading',
    text: idOf(1),
    lead: 19.92,
    style: { role: 'serif', size: 17.2154, bold: 1, design: 'NimbusRomNo9L-Medi' },
    align: 'c',
    title: 1,
    lines: [
      [1, 2, 183.78, 428.22, 678.95, 690.85, 675.41, 108, 504, 0, 17.22],
      [1, 2, 188.95, 422.43, 659.03, 670.92, 655.48, 108, 504, 0, 17.22],
    ],
    room: { below: 15.35, next: 55.76, side: [108, 504] },
  }
  it("keeps the title's first line on the original's first baseline, the part stating it the title (2303.11366v4 p1)", () => {
    const p = layPage(partOf([[title]]), rowsOf([[1, 'Reflexion: Sprachagenten']]), rules, metrics)
    const laid = laidOf(p, 0)
    expect(laid.state).toBe('laid')
    expect(laid.lines.length).toBe(1)
    expect(laid.lines[0]![0]).toBeCloseTo(678.95, 2)
  })
  it('sets a two-line section heading set in one line on its last line, as today’s (X.lastLines)', () => {
    const { title: _title, ...rest } = title
    const heading: Placed = {
      ...rest,
      ord: 3,
      text: idOf(2),
      align: 'l',
      style: { role: 'serif', size: 11.9552, bold: 1, design: 'NimbusRomNo9L-Medi' },
      lines: [
        [1, 0, 108, 480, 600, 609, 597, 108, 504, 0, 11.96],
        [1, 0, 108, 300, 585.65, 594.65, 582.65, 108, 504, 0, 11.96],
      ],
      room: { below: 18, next: 26, side: [108, 504] },
    }
    const p = layPage(partOf([[heading]]), rowsOf([[2, 'Einleitung kurz']]), rules, metrics)
    const laid = laidOf(p, 3)
    expect(laid.lines.length).toBe(1)
    expect(laid.lines[0]![0]).toBeCloseTo(585.65, 2)
  })
})

describe('a URL TeX set whole on one line, its crop the original’s ink', () => {
  // (2303.11366v4 p1's abstract: "… datasets at https://github.com/noahshinn024/reflexion." The translation's line before the URL
  // was letter-spaced to its measure, the URL whole on the next; TeX's url package breaks it at its break points, El.breaks)
  const url: Placed = {
    ord: 2,
    kind: 'para',
    text: idOf(3),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [
      [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      [1, 0, 72, 296, 688, 695, 686, 72, 300, 0, 10],
    ],
    els: [
      [
        '1',
        {
          kind: 'other',
          cmd: 'url',
          literal: 1,
          copy: 'https://a.io/abcdefgh/ij',
          text: 'https://a.io/abcdefgh/ij',
          style: { role: 'mono', size: 10, design: 'SFTT1000' },
          ink: [[1, 72, 686, 292, 695, 688]],
          breaks: [
            [120, 8],
            [174, 13],
          ],
        },
      ],
    ],
    room: { below: 20, next: 24, side: [72, 300] },
  }
  const rows: Rows = {
    get: (k) =>
      k === idOf(3)
        ? {
            id: idOf(3),
            ok: true,
            by: 'test',
            content: [
              { t: 'text', s: 'Wir veroeffentlichen es unter ' },
              { t: 'el', id: '1' },
              { t: 'text', s: '.' },
            ],
          }
        : undefined,
    done: true,
  }
  it('breaks the URL at the last of its break points that fits the line, its crop cut between two glyphs there', () => {
    const p = layPage(partOf([[url]]), rows, rules, metrics)
    const laid = laidOf(p, 2)
    expect(laid.state).toBe('laid')
    const crops = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => (it as { src: number[] }).src))
    // (its head ends the first line at 120, between "https://" and "a.io"; its tail opens the second)
    expect(crops[0]!.length).toBe(1)
    expect(crops[0]![0]![3]).toBeCloseTo(120, 5)
    expect(crops[1]![0]![1]).toBeCloseTo(120, 5)
    expect(crops[1]![0]![3]).toBeCloseTo(292.4, 5)
    // (the cut edges said, which the reader draws with no antialiased margin: the next glyph's ink is a fraction of a point off)
    const cuts = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => (it as { cut?: number }).cut))
    expect(cuts).toEqual([[2], [1]])
  })
  it('cuts its copy text at the break’s code units, an astral character before it two (Devin on #630)', () => {
    // (El.breaks counts the copy text's UTF-16 code units, which String.slice cuts: "𠮷" is two, "profile" its seven letters
    // where the page set a ligature's one glyph)
    const [, el] = url.els![0]!
    const astral: Placed = {
      ...url,
      els: [
        [
          '1',
          {
            ...el,
            copy: 'https://𠮷.io/profile/ij',
            text: 'https://𠮷.io/profile/ij',
            breaks: [
              [100, 11],
              [118, 22],
            ],
          },
        ],
      ],
    }
    const laid = laidOf(layPage(partOf([[astral]]), rows, rules, metrics), 2)
    const texts = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => it.s))
    expect(texts).toEqual([['https://𠮷.io/profile/'], ['ij']])
  })
  it('keeps the URL whole on the next line where TeX set its unit flush left or centred, no line of it stretched', () => {
    // (2608.25210v2 p1's VLDB footnote, \raggedright: TeX's \rightskip stretch costs a short line nothing, and TeX breaks before
    // the URL, not inside it at its url package's penalty. The cut is for a justified line, which the URL whole on the next
    // would leave letter-spaced to its measure)
    for (const align of ['l', 'c'] as const) {
      const laid = laidOf(layPage(partOf([[{ ...url, align }]]), rows, rules, metrics), 2)
      expect(laid.state).toBe('laid')
      const crops = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => (it as { src: number[] }).src))
      expect(crops[0]!.length).toBe(0)
      expect(crops[1]!.length).toBe(1)
      // (the whole crop, uncut: its antialiased margin on both edges)
      expect(crops[1]![0]![1]).toBeCloseTo(71.6, 5)
      expect(crops[1]![0]![3]).toBeCloseTo(292.4, 5)
    }
  })
})

describe('an address that fits a line whole goes to the next whole, unless the line it leaves would be justified and stretched', () => {
  // (the coordinator's ruling of 2026-11-12, PDF-READER §18.50: an address is one thing to a reader. A CJK line closed before it
  // is set ragged by placement where its stretch would pass cjkJust (0.25 em a gap), and reads as not stretched up to
  // STRETCH_MIN (0.05 em a gap): in both the address goes whole to the next line; only between the two, a justified line
  // letter-spaced to its measure, is it cut at its own break points, as is one longer than a line. The test's metrics set a
  // character at half an em, and the fit sets these paragraphs at its tracking floor, -0.03 em: 4.7 pt a character at 10 pt)
  const zh = rulesFor('zh')
  const body =
    '本文提出的方法在多个公开数据集上均取得了稳定提升并且训练开销更低所有代码模型权重以及评测脚本和使用说明均已整理完毕并公开发布于以下地址'
  const addressOf = (width: number, breaks: number[]): Placed['els'] => [
    [
      '1',
      {
        kind: 'other',
        cmd: 'url',
        literal: 1,
        copy: 'https://example.org/lab/models/release',
        text: 'https://example.org/lab/models/release',
        style: { role: 'mono', size: 10, design: 'SFTT1000' },
        ink: [[1, 72, 686, 72 + width, 695, 688]],
        // (each break's x past the address's start, and the copy text's code units before it: "https://", ".org/", "/lab/",
        // "/models/")
        breaks: breaks.map((b, k): [number, number] => [72 + b, [8, 20, 24, 31][k]!]),
      },
    ],
  ]
  /** a paragraph of `n` characters of the body, the address and a full stop, justified on two lines of the measure 72 to `x1` */
  const caseOf = (n: number, x1: number, width: number, breaks: number[]) => {
    const para: Placed = {
      ord: 6,
      kind: 'para',
      text: idOf(7),
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: [
        [1, 0, 72, x1, 700, 707, 698, 72, x1, 0, 10],
        [1, 0, 72, x1, 688, 695, 686, 72, x1, 0, 10],
      ],
      els: addressOf(width, breaks),
      room: { below: 20, next: 24, side: [72, x1] },
    }
    const rows: Rows = {
      get: (k) =>
        k === idOf(7)
          ? {
              id: idOf(7),
              ok: true,
              by: 'test',
              content: [
                { t: 'text', s: body.slice(0, n) },
                { t: 'el', id: '1' },
                { t: 'text', s: '。' },
              ],
            }
          : undefined,
      done: true,
    }
    const laid = laidOf(layPage(partOf([[para]]), rows, zh, metrics), 6)
    expect(laid.state).toBe('laid')
    expect(laid.fit?.track).toBeCloseTo(-0.03, 6)
    const crops = laid.lines.map(
      (l) => l[3].filter((it) => 'src' in it) as { s: string; src: number[]; cut?: number }[],
    )
    return { laid, crops }
  }
  it('keeps it whole where the line before would be set ragged (30 characters on a measure of 325: 0.63 em a gap)', () => {
    // (the line closed before it: 141 pt of text, 184 of slack over 29 gaps, past cjkJust: placement sets it ragged, unstretched;
    // the address's first three pieces would fit beside it)
    const { crops } = caseOf(30, 397, 250, [20, 50, 150, 220])
    expect(crops[0]!.length).toBe(0)
    expect(crops[1]!.map((c) => [c.s, c.cut ?? 0])).toEqual([['https://example.org/lab/models/release', 0]])
  })
  it('keeps it whole where the line before is nearly full (60 characters on 307: 0.042 em a gap)', () => {
    // (282 pt of text, 25 of slack over 59 gaps, under STRETCH_MIN: justified, it reads as unstretched; "https://" would fit)
    const { crops } = caseOf(60, 379, 250, [20, 50, 150, 220])
    expect(crops[0]!.length).toBe(0)
    expect(crops[1]!.map((c) => [c.s, c.cut ?? 0])).toEqual([['https://example.org/lab/models/release', 0]])
  })
  it('cuts it at its last break point that fits where the line before would be justified and stretched (50 on 325: 0.18 em)', () => {
    // (235 pt of text, 90 of slack over 49 gaps: between STRETCH_MIN and cjkJust, a line letter-spaced to its measure)
    const { crops } = caseOf(50, 397, 250, [20, 50, 150, 220])
    expect(crops[0]!.map((c) => [c.s, c.cut])).toEqual([['https://example.org/', 2]])
    expect(crops[1]!.map((c) => [c.s, c.cut])).toEqual([['lab/models/release', 1]])
  })
  it('cuts one longer than a line at its last break point that fits, whatever the line before (400 pt on 325)', () => {
    const { crops } = caseOf(30, 397, 400, [20, 50, 150, 330])
    expect(crops[0]!.map((c) => [c.s, c.cut])).toEqual([['https://example.org/lab/', 2]])
    expect(crops[1]!.map((c) => c.cut)).toEqual([1])
  })
  it('still cuts 2303.11366v4 p1’s: its line before at 0.205 em a gap, after the cut 0.035 (a8c36be1f)', () => {
    // (the maintainer's case of 2026-11-08: the abstract's last line before "https://github.com/noahshinn024/reflexion" was
    // justified at 0.205 em a gap, under cjkJust, the URL whole on the next; with "https://" cut onto it, 0.035 em a gap. Here
    // 26 characters, 122.2 pt, on a measure of 173.45: 51.25 pt of slack over 25 gaps, 0.205 em, between the two bounds; with
    // "https://" (41.75 pt) on the line, 9.1 pt over 26 gaps)
    const { laid, crops } = caseOf(26, 245.45, 160, [41.75, 70, 110, 140])
    const advance = 5 + laid.fit!.track * 10
    expect((245.45 - 72 - 26 * advance) / 25 / 10).toBeCloseTo(0.205, 6)
    expect(crops[0]!.map((c) => [c.s, c.cut])).toEqual([['https://', 2]])
    const first = laid.lines[0]![3][0] as { dx?: number[] }
    expect((first.dx![1]! - first.dx![0]! - advance) / 10).toBeCloseTo(0.035, 4)
  })
})

describe('a URL TeX broke over lines, drawn as its text in a CJK line: no stretch at its break points', () => {
  // (2608.25210v2 p17 with the references on: the line ending "https://www.databricks.com/blog/2023/04/18/introducing-ai-" set to the
  // column's full measure, 1.9-2.7 pt after each "/": a CJK line spreads its slack over the gaps between its items, and a URL
  // whose line ends are joins (lane url-join) is cut at its break points into items of one word. TeX's url package breaks a
  // URL at a penalty, no glue (\Urlmuskip 0mu): nothing inside a word stretches)
  const zh = rulesFor('zh')
  const long = 'https://www.example.com/blog/2023/04/18/introducing-ai-functions-integrating-large-language-models.html'
  const ref: Placed = {
    ord: 4,
    kind: 'reference',
    text: idOf(5),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [
      [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
      [1, 0, 72, 200, 676, 683, 674, 72, 300, 0, 10],
    ],
    els: [
      [
        '1',
        {
          kind: 'other',
          cmd: 'url',
          literal: 1,
          copy: long,
          text: long,
          style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
          ink: [
            [1, 150, 686, 300, 695, 688],
            [1, 72, 674, 200, 683, 676],
          ],
        },
      ],
    ],
    room: { below: 20, next: 24, side: [72, 300] },
  }
  const rows: Rows = {
    get: (k) =>
      k === idOf(5)
        ? {
            id: idOf(5),
            ok: true,
            by: 'test',
            content: [
              { t: 'text', s: '介绍人工智能函数集成。' },
              { t: 'el', id: '1' },
              { t: 'text', s: '。访问于二零二五年六月。' },
            ],
          }
        : undefined,
    done: true,
  }
  it('sets the URL’s pieces on a line at their natural advances, the line’s slack in the gaps TeX has glue in', () => {
    const laid = laidOf(layPage(partOf([[ref]]), rows, zh, metrics), 4)
    expect(laid.state).toBe('laid')
    const line = laid.lines.find((l) => l[3].some((it) => it.s?.startsWith('https://')))!
    const items = line[3].filter((it) => typeof it.s === 'string' && 'x' in it) as {
      s: string
      x: number
      size: number
    }[]
    const first = items.findIndex((it) => it.s.startsWith('https://'))
    const url = items.slice(first)
    expect(url.length).toBeGreaterThan(2)
    // (each piece where the one before it ends: its advance, the metrics' half an em a character, and nothing more)
    for (let n = 1; n < url.length; n++)
      expect(url[n]!.x - url[n - 1]!.x).toBeCloseTo((url[n - 1]!.size * [...url[n - 1]!.s].length) / 2, 5)
  })
})

describe('a head or a name and its follower on one line: each the original’s separation after the one before it', () => {
  // (a name the part binds to its follower, the follower's own label the joint TeX set between: "Figure 1: text")
  const name: Placed = {
    ord: 0,
    kind: 'name',
    text: { name: 'figure' },
    plain: 'Figure',
    bound: 1,
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [[1, 0, 72, 102, 700, 707, 698, 72, 300, 0, 10]],
    room: { below: 12, next: 20, side: [72, 102] },
  }
  const caption: Placed = {
    ord: 1,
    kind: 'caption',
    text: idOf(5),
    join: [2.5, 1],
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    label: {
      kind: 'float',
      ink: [1, 104.5, 698, 112, 707, 700],
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      num: ['1', [1, 104.5, 698, 109.5, 707, 700]],
      punct: [':', [1, 109.5, 698, 112, 707, 700]],
    },
    lines: [
      [1, 0, 117, 300, 700, 707, 698, 72, 300, 0, 10],
      [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
    ],
    room: { below: 12, next: 20, side: [72, 300] },
  }
  it('keeps the separation between a name and its numbered joint, as before the text (Codex on #624: "Abbildung1:")', () => {
    const p = layPage(partOf([[name, caption]]), rowsOf([[5, 'eine Beschriftung']]), rules, metrics)
    const first = laidOf(p, 1).lines[0]!
    // (toy metrics: 5 pt a character at size 10; "Abbildung" from 72 to 117, then 2.5 pt, then "1:")
    const at = (s: string) => {
      for (const it of first[3]) {
        const k = it.s.indexOf(s)
        if (k < 0) continue
        const dx = (it as { dx?: number[] }).dx
        return it.x + (dx ? dx[k]! : 5 * k)
      }
      return Number.NaN
    }
    expect(first[3].map((it) => it.s).join('')).toMatch(/^Abbildung\s*1:/)
    expect(at('1:') - at('Abbildung')).toBeCloseTo(45 + 2.5, 1)
  })
  it('sets the follower of a name the reader leaves the original’s after it, pinned by it, never over it (Devin on #624)', () => {
    // (a one-line caption centred on its line, after the name: widened as far to either side, it ran over the name)
    const one: Placed = { ...caption, align: 'c', lines: [[1, 0, 117, 200, 700, 707, 698, 72, 300, 0, 10]] }
    const p = layPage(
      partOf([[name, one]]),
      rowsOf([[5, 'eine Beschriftung die we']]),
      rulesFor('de', { leave: ['name'] }),
      metrics,
    )
    expect(laidOf(p, 0).state).toBe('left')
    const laid = laidOf(p, 1)
    expect(laid.state).toBe('laid')
    expect(Math.min(...laid.lines.map((l) => l[1]))).toBeGreaterThanOrEqual(102)
  })
})
