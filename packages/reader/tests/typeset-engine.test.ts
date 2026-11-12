// @vitest-environment node
// The reader's own typesetter, openReader's engine where its host gives none (compose/typeset.ts): a fixture's page laid by lane
// L3's layPage under the rule set's rules for the target, its translations on the laid lines; a toggle of "What to translate"
// lays it again under rules that leave the kinds it leaves; a page of a target whose patterns are still to come waits on them;
// the targets it sets are the rule set's.
import { readdirSync, readFileSync } from 'node:fs'
import { type Head, type Part, type Placed, read, type Row } from '@readarxiv/format'
import * as T from '@readarxiv/typeset'
import { describe, expect, it, vi } from 'vitest'
import { leftKinds } from '../src/compose/classes.ts'
import type { Rows } from '../src/compose/page.ts'
import { HYPH_WAIT } from '../src/compose/served.ts'
import { TYPESET_TARGETS } from '../src/compose/targets.ts'
import { pastFootOf, ruleTag, typesetLay, warmTypeset } from '../src/compose/typeset.ts'
import { DEFAULTS } from '../src/prefs.ts'

vi.mock('@readarxiv/typeset', async (load) => {
  const real = await load<typeof import('@readarxiv/typeset')>()
  return { ...real, layPage: vi.fn(real.layPage) }
})

const dir = new URL('../e2e/fixtures/', import.meta.url)
function fixture(name: string) {
  const at = (f: string) => new URL(`${name}/${f}`, dir)
  const ref = (readdirSync(at('bundle')).find((f) => f.endsWith('.head')) as string).slice(0, -5)
  const head = read('head', new Uint8Array(readFileSync(at(`bundle/${ref}.head`))), ref) as Head
  const parts = new Map<number, Part>()
  head.parts.forEach((p, i) => {
    if (p) parts.set(i + 1, read('part', new Uint8Array(readFileSync(at(`bundle/${p}.part`))), p) as Part)
  })
  const rows = (JSON.parse(readFileSync(at('de.rows.json'), 'utf8')) as { rows: Row[] }).rows
  return { head, parts, rows }
}
/** a Metrics every face of which is loaded, each character half its size wide (the typesetter's own entry test's) */
const metrics: T.Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
/** the served faces' part the lay reads: the Metrics, and the patterns, each language's read at once (none to be had here) */
const served = (o: { pending?: boolean } = {}) => {
  const read = new Set<string>()
  return {
    metrics,
    asked: [] as string[][],
    async hyph(langs: readonly string[]) {
      this.asked.push([...langs])
      for (const l of langs) read.add(l)
      return Object.fromEntries(langs.map((l) => [l, null]))
    },
    hyphNow: (l: string) => (o.pending && !read.has(l) ? undefined : null),
  }
}
const rowsOf = (list: Row[]): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (id) => by.get(id), done: true }
}
const textOf = (p: ReturnType<Awaited<ReturnType<typeof typesetLay>>>) =>
  p.members
    .filter((m) => m.state === 'laid')
    .flatMap((m) => m.lines.flatMap((l) => l[3].map((it) => it.s)))
    .join('')

describe("the reader's own typesetter (openReader's engine where the host gives none)", () => {
  it("lays a fixture's page by layPage under the target's rules, its translations on the laid lines", async () => {
    const { parts, rows } = fixture('s1-columns')
    const s = served()
    const lay = await typesetLay({ served: s, target: () => 'de', classes: () => DEFAULTS.classes })
    // (the target's patterns read before the first page: English's for every Latin word, German's own)
    expect(s.asked).toEqual([T.rulesFor('de').patterns])
    const part = parts.get(1) as Part
    const page = lay(part, rowsOf(rows))
    const call = vi.mocked(T.layPage).mock.calls.at(-1)
    expect(call?.[0]).toBe(part)
    expect(call?.[2]).toMatchObject({ target: 'de', leave: leftKinds(DEFAULTS.classes) })
    expect(call?.[3]).toBe(metrics)
    expect(page.wait).toEqual({ rows: [], faces: [] })
    const laid = page.members.filter((m) => m.state === 'laid')
    expect(laid.length).toBeGreaterThan(0)
    expect(laid.every((m) => m.off & 1)).toBe(true)
    // (the translation's own words on the page, a row's text among them)
    const said = textOf(page).replace(/\s+/g, ' ')
    const row = rows.find((r) => r.ok && r.content.some((p) => p.t === 'text' && p.s.length > 20)) as Row & { ok: true }
    const words = (row.content.find((p) => p.t === 'text' && p.s.length > 20) as { s: string }).s
      .split(/\s+/)
      .slice(0, 2)
    expect(said).toContain(words.join(' '))
  })
  it('a toggle of "What to translate" lays the page again under rules that leave the kinds it leaves', async () => {
    const { parts, rows } = fixture('s1-columns')
    let classes: Readonly<Record<string, boolean>> = DEFAULTS.classes
    const lay = await typesetLay({ served: served(), target: () => 'de', classes: () => classes })
    const part = parts.get(1) as Part
    lay(part, rowsOf(rows))
    const before = vi.mocked(T.layPage).mock.calls.at(-1)?.[2] as T.Rules
    expect(before.leave).toEqual(['inkreferences', 'reference', 'refnames', 'affiliation', 'author', 'inknames'].sort())
    classes = { ...DEFAULTS.classes, figures: false, references: true }
    lay(part, rowsOf(rows))
    const after = vi.mocked(T.layPage).mock.calls.at(-1)?.[2] as T.Rules
    expect(after.leave).toEqual(['affiliation', 'author', 'figure', 'inkfigures', 'inknames'])
    // (the same toggles again: the same rules, made once)
    lay(part, rowsOf(rows))
    expect(vi.mocked(T.layPage).mock.calls.at(-1)?.[2]).toBe(after)
  })
  it("a page of a target whose patterns are still to come waits on them as on a face; a target the rule set has none for stays arXiv's", async () => {
    const { parts, rows } = fixture('s1-columns')
    let target = 'de'
    const s = served({ pending: true })
    const lay = await typesetLay({ served: s, target: () => target, classes: () => null })
    const part = parts.get(1) as Part
    expect(lay(part, rowsOf(rows)).wait.faces).toEqual([])
    target = 'ru'
    const waiting = lay(part, rowsOf(rows))
    expect(waiting.wait.faces).toEqual([[HYPH_WAIT, T.rulesFor('ru').patterns.find((l) => l !== 'en')]])
    await s.hyph(T.rulesFor('ru').patterns)
    expect(lay(part, rowsOf(rows)).members.some((m) => m.state === 'laid')).toBe(true)
    target = 'xx'
    expect(lay(part, rowsOf(rows))).toMatchObject({ wait: { rows: [], faces: [] }, members: [] })
  })
  it("asks, as the code loads, the target's patterns and the tables of its CJK faces (its body's, its bold's), no slice", () => {
    const hyph: string[][] = [],
      warm: string[][] = []
    const s = {
      hyph: async (langs: readonly string[]) => {
        hyph.push([...langs])
        return {}
      },
      warm: async (fonts: readonly string[]) => {
        warm.push([...fonts])
      },
    }
    warmTypeset(s, 'zh-CN')
    expect(hyph).toEqual([T.rulesFor('zh').patterns])
    expect(warm).toEqual([['400 100px "axt-shs-sc"', '700 100px "axt-shs-sc"']])
    warmTypeset(s, 'de')
    expect(hyph.at(-1)).toEqual(T.rulesFor('de').patterns)
    expect(warm.at(-1)).toEqual([])
    // (a target the rule set has none for: the faces' index alone)
    warmTypeset(s, 'tlh')
    expect(hyph).toHaveLength(2)
    expect(warm.at(-1)).toEqual([])
  })
  it('lays a page with the borrow past TeX’s bottom the address sets: none, the rule; `axt-borrow=0`, off (PDF-READER §18.37)', async () => {
    // (the owner's switch, read on a website's page alone: 0 off, a number to PAST_FOOT_MAX the bound, anything else nothing)
    const at = (href: string) => {
      const u = new URL(href)
      return pastFootOf({ protocol: u.protocol, search: u.search })
    }
    expect(at('https://readarxiv.com/abs/2608.16117v1?to=de')).toBeUndefined()
    expect(at('https://readarxiv.com/abs/2608.16117v1?to=de&axt-borrow=0')).toBe(0)
    expect(at('http://localhost:8787/abs/2608.16117v1?axt-borrow=1.5&to=de')).toBe(1.5)
    for (const v of ['-1', 'x', '', '7', 'Infinity'])
      expect(at(`https://readarxiv.com/abs/1?axt-borrow=${v}`)).toBeUndefined()
    expect(at('chrome-extension://abcdefghijklmnop/pdf-reader.html?axt-borrow=0')).toBeUndefined()
    // (a paragraph of two lines at 10 pt whose translation is three characters too long for them, TeX's text block bottom 11 pt
    // under its last line and no ink under it: a third line at the pitch of 12 stands 1 pt past the bottom. The rule lays it
    // there at its size, which the page's fill, the page's one paragraph, then grows to 1.1 on that line; off, it shrinks a
    // step onto its two lines)
    const id = 'a'.repeat(64)
    const member: Placed = {
      ord: 0,
      kind: 'para',
      text: id,
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
      ],
      room: { below: 0, next: 300, runs: [[1, 200, 11]], sep: 12 },
    }
    const part: Part = {
      format: 1,
      page: 1,
      paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
      flows: [[member]],
    }
    const row: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: `${'wort '.repeat(18)}xxx` }] }
    const laid = async (href: string) => {
      const pastFoot = at(href)
      const lay = await typesetLay({
        served: served(),
        target: () => 'de',
        classes: () => DEFAULTS.classes,
        ...(pastFoot !== undefined ? { pastFoot } : {}),
      })
      const m = lay(part, rowsOf([row])).members[0]!
      return [m.fit?.size, m.lines.map(([y]) => y)]
    }
    expect(await laid('https://readarxiv.com/abs/1?to=de')).toEqual([11, [700, 688, 676]])
    expect(await laid('https://readarxiv.com/abs/1?to=de&axt-borrow=0')).toEqual([9.75, [700, 688]])
  })
  it("sets the rule set's languages, Chinese by its script too", () => {
    expect(TYPESET_TARGETS.filter((t) => Object.hasOwn(T.LANGUAGES, t)).sort()).toEqual(Object.keys(T.LANGUAGES).sort())
    expect(TYPESET_TARGETS.map(ruleTag).every((t) => t !== null && Object.hasOwn(T.LANGUAGES, t))).toBe(true)
    expect([ruleTag('zh-Hans'), ruleTag('zh-Hant'), ruleTag('pt-BR'), ruleTag('en'), ruleTag('?')]).toEqual([
      'zh',
      'zh-TW',
      'pt',
      null,
      null,
    ])
  })
})
