// @vitest-environment node
// The reader's own typesetter, openReader's engine where its host gives none (compose/typeset.ts): a fixture's page laid by lane
// L3's layPage under the rule set's rules for the target, its translations on the laid lines; a toggle of "What to translate"
// lays it again under rules that leave the kinds it leaves; a page of a target whose patterns are still to come waits on them;
// the targets it sets are the rule set's.
import { readdirSync, readFileSync } from 'node:fs'
import { type Head, type Part, read, type Row } from '@readarxiv/format'
import * as T from '@readarxiv/typeset'
import { describe, expect, it, vi } from 'vitest'
import { leftKinds } from '../src/compose/classes.ts'
import type { Rows } from '../src/compose/page.ts'
import { HYPH_WAIT } from '../src/compose/served.ts'
import { TYPESET_TARGETS } from '../src/compose/targets.ts'
import { ruleTag, typesetLay } from '../src/compose/typeset.ts'
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
