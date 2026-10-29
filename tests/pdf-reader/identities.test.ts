import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheKeyFor } from '@/cache/key'
import { translateCall } from '@/core/run/call'
import type { TranslateCall } from '@/providers/translate-service'
import { bundleKey, CTAG, VTAG } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { LAYOUT, LayoutRefusal, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { type RuleField, RULES_FIELDS } from '@/pdf-reader/engine/rules/layout.mjs'
import { CJK } from '@/pdf-reader/engine/pipeline/scripts.mjs'
import { scriptOf } from '@/pdf-reader/engine/rules/script.mjs'

// The three kinds of rule and their identities (the rules-as-data plan, §1 and §9): extraction, layout and translation
// each name their own change, and nothing names another's. The reader's refusals follow the identities: a layout file
// is refused by its own schema, never by the version of what made it.

afterEach(() => {
  vi.doUnmock('@/pdf-reader/engine/translate/version.mjs')
  vi.doUnmock('@/core/rules/latexml')
  vi.resetModules()
})

const utf8 = (s: string) => new TextEncoder().encode(s)
const bytesOf = (v: unknown) => utf8(JSON.stringify(v))

describe('the declared literal constants', () => {
  it('are the values their modules export: a version raised in its .mjs is raised in its .d.mts (the review of #415)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = 'src/pdf-reader/engine', found: string[] = []
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.d.mts') ? [p] : [] })
    for (const d of walk(root)) {
      for (const m of readFileSync(d, 'utf8').matchAll(/^export declare const ([A-Za-z0-9_]+): '([^']*)'\s*$/gm)) {
        const mod = (await import(/* @vite-ignore */ `/${d.replace(/\.d\.mts$/, '.mjs')}`)) as Record<string, unknown>
        expect(mod[m[1]!], `${d}: ${m[1]}`).toBe(m[2])
        found.push(m[1]!)
      }
    }
    expect(found).toEqual(expect.arrayContaining(['TRANSLATE_VERSION', 'BUNDLE5', 'BUNDLE', 'LAYOUT', 'REMOVAL']))
  })
})

describe('TRANSLATE_VERSION', () => {
  it('is exported by translate/, and mt.mjs re-exports that one constant', async () => {
    const { TRANSLATE_VERSION } = await import('@/pdf-reader/engine/translate/version.mjs')
    expect(TRANSLATE_VERSION).toBe('8')
    // (a token of the form the web's identity and a bundle's versions take)
    expect(TRANSLATE_VERSION).toMatch(/^[0-9a-z.]{1,16}$/)
    const mt = await import('@/pdf-reader/engine/translate/mt.mjs')
    expect(mt.TRANSLATE_VERSION).toBe(TRANSLATE_VERSION)
  })

  it("enters no bundle's key: bundleKey, CTAG and VTAG are the same whatever it is", async () => {
    const was = { key: bundleKey('1706.03762', 7), ctag: CTAG, vtag: VTAG }
    vi.resetModules()
    vi.doMock('@/pdf-reader/engine/translate/version.mjs', () => ({ TRANSLATE_VERSION: '999' }))
    const again = await import('@/pdf-reader/engine/layer-proto/bundle.mjs')
    expect({ key: again.bundleKey('1706.03762', 7), ctag: again.CTAG, vtag: again.VTAG }).toEqual(was)
    expect(was.vtag).not.toMatch(/-t\d/)
  })
})

describe('the kept rule lives in translate/', () => {
  it('authorsTranslated answers for the scripts the TeX path sets with xeCJK, and scripts.mjs no longer exports it', async () => {
    const { authorsTranslated } = await import('@/pdf-reader/engine/translate/kept.mjs')
    expect(['zh', 'zh-CN', 'zh-TW', 'ja', 'ko'].map(authorsTranslated)).toEqual([true, true, true, true, true])
    expect(['en', 'ru', 'de', 'fr', 'es', 'vi', 'uk'].map(authorsTranslated)).toEqual([false, false, false, false, false, false, false])
    // the rule is the translation's and no longer reads the TeX path's table; a script added to that table is a decision
    // about whether its authors are translated, taken here (and a change of TRANSLATE_VERSION)
    expect(['zh', 'zh-TW', 'ja', 'ko'].map(scriptOf).sort()).toEqual(Object.keys(CJK).sort())
    expect(await import('@/pdf-reader/engine/pipeline/scripts.mjs')).not.toHaveProperty('authorsTranslated')
  })
})

describe('the per-text cache key (rules as data, §9.1)', () => {
  const identity = { providerId: 'p', model: 'm', promptKey: '', target: 'zh-CN', renderPath: 'tags' as const, text: 'Hello <x id="1"/> world.' }
  /** the keys of one text from an HTML block and from a PDF, under a module whose RULES_VERSION is `rules` */
  async function keysUnder(rules: string) {
    vi.resetModules()
    vi.doMock('@/core/rules/latexml', () => ({ RULES_VERSION: rules }))
    const { cacheKeyFor } = await import('@/cache/key')
    return { html: await cacheKeyFor({ ...identity, source: 'html' }), pdf: await cacheKeyFor({ ...identity, source: 'pdf' }) }
  }

  it("a PDF text's key does not move when RULES_VERSION moves; an HTML block's does", async () => {
    const before = await keysUnder('0.11.0'), after = await keysUnder('0.12.0')
    expect(after.pdf).toBe(before.pdf)
    expect(after.html).not.toBe(before.html)
    expect(before.pdf).not.toBe(before.html)
    expect(before.pdf).toMatch(/^[0-9a-f]{64}$/)
  })

  it("a PDF text's key still moves with everything else it is made of", async () => {
    vi.resetModules()
    const { cacheKeyFor } = await import('@/cache/key')
    const pdf = await cacheKeyFor({ ...identity, source: 'pdf' })
    for (const change of [{ providerId: 'q' }, { model: 'n' }, { promptKey: 'custom' }, { target: 'ja' }, { renderPath: 'markers' as const }, { text: 'Another text.' }]) {
      expect(await cacheKeyFor({ ...identity, ...change, source: 'pdf' }), JSON.stringify(change)).not.toBe(pdf)
    }
  })

  it('CACHE_KEY_VERSION stays 6: no HTML key changes meaning, and the PDF texts\' old entries (a rules string in the slot) orphan themselves', async () => {
    vi.resetModules()
    const { CACHE_KEY_VERSION } = await import('@/cache/key')
    expect(CACHE_KEY_VERSION).toBe(6)
  })

  it('a key and a cache descriptor name their source: a caller that leaves it out does not type-check, and the HTML page\'s says html', () => {
    // (pnpm typecheck holds these two: an unused @ts-expect-error is an error)
    // @ts-expect-error source is required
    void cacheKeyFor({ ...identity })
    // @ts-expect-error source is required
    const unnamed: TranslateCall['cache'] = { paper: 'p', renderPath: 'tags' }
    void unnamed
    const call = translateCall({ target: 'zh-CN', paper: '2608.04322' }, [{ id: 'a', text: 'x' }], 'tags')
    expect(call.cache).toEqual({ paper: '2608.04322', renderPath: 'tags', source: 'html' })
  })
})

/** an empty layout file of one page, as a maker of `layout` writes it */
const layoutFile = (over: Record<string, unknown> = {}) => ({
  schema: 5, layout: LAYOUT, pdfjs: '6.3.289', paper: { id: '2608.04322', version: 1, pages: 1 }, left: '', views: [0, 0, 612, 792], fonts: [],
  units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [], lineskip: null, ...over,
})

describe('a layout file is refused by its schema, not by its maker (decision 4)', () => {
  it('reads a schema-5 file whose `layout` is a newer maker\'s, and refuses a schema-4 or a schema-6 file', () => {
    expect(parseLayout(bytesOf(layoutFile({ layout: '9' }))).layout).toBe('9')
    expect(parseLayout(bytesOf(layoutFile({ layout: '1' }))).layout).toBe('1')
    expect(() => parseLayout(bytesOf(layoutFile({ schema: 6 })))).toThrow(LayoutRefusal)
    expect(() => parseLayout(bytesOf(layoutFile({ schema: 6, layout: '9' })))).toThrow(/schema/)
    // (a file before a placeholder's fill, before JOINED and OUTSIDE, before the interline glue, or before the names:
    // refused by its schema, as no reader holds an older one's meaning)
    expect(() => parseLayout(bytesOf(layoutFile({ schema: 4, layout: '7' })))).toThrow(/^schema/)
    expect(() => parseLayout(bytesOf(layoutFile({ schema: 3, layout: '5' })))).toThrow(/^schema/)
    const { lineskip: _, ...two } = layoutFile({ schema: 2 })
    expect(() => parseLayout(bytesOf(two))).toThrow(/^schema/)
    const { names: __, lineskip: ___, ...old } = layoutFile({ schema: 1 })
    expect(() => parseLayout(bytesOf(old))).toThrow(/^schema/)
  })

  it('still reads `layout` for its shape: a version token of 1 to 32 letters, digits or points, as a bundle names one', () => {
    for (const bad of ['', 'a b', 'a-b', 'x'.repeat(33), 4, null, ['3'], { v: 3 }]) {
      expect(() => parseLayout(bytesOf(layoutFile({ layout: bad }))), JSON.stringify(bad)).toThrow(/^layout:/)
    }
    expect(parseLayout(bytesOf(layoutFile({ layout: 'x'.repeat(32) }))).layout).toBe('x'.repeat(32))
    expect(parseLayout(bytesOf(layoutFile({ layout: '3.1' }))).layout).toBe('3.1')
  })
})

// ---------------------------------------------------------------- the table in docs/PDF-READER.md

const ENGINE = 'src/pdf-reader/engine'
const sourcesIn = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sourcesIn(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []))
/** what an identity is: the engine's `*_VERSION`s, the layout maker's, the remover's, the bundles' formats (the one-file
 *  bundle's and the layer route's), the PDF.js the geometry is read with and the rule set's schema */
const IDENTITY = /_VERSION$|^(LAYOUT|REMOVAL|BUNDLE|BUNDLE5|PDFJS|RULES_SCHEMA)$/

/** the names the engine exports (a `export const` or a re-export) that are identities */
function identitiesExported(): Set<string> {
  const names = new Set<string>()
  for (const file of sourcesIn(ENGINE)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/^export const ([A-Z][A-Z0-9_]*)\b/gm)) if (IDENTITY.test(m[1] as string)) names.add(m[1] as string)
    for (const m of text.matchAll(/^export \{([^}]*)\}/gm)) {
      for (const part of (m[1] as string).split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop() as string
        if (IDENTITY.test(name)) names.add(name)
      }
    }
  }
  return names
}

const doc = readFileSync('docs/PDF-READER.md', 'utf8')
/** the lines of the section under `heading`, to the next heading of its level or above */
function sectionOf(heading: string): string[] {
  const lines = doc.split('\n'), at = lines.findIndex(l => l.startsWith(heading))
  if (at < 0) return []
  const level = heading.match(/^#+/)?.[0].length ?? 1
  const out: string[] = []
  for (let i = at + 1; i < lines.length; i++) {
    const h = lines[i]?.match(/^(#+) /)
    if (h && (h[1] as string).length <= level) break
    out.push(lines[i] as string)
  }
  return out
}
/** the code names of a table's first column */
const firstColumn = (lines: string[]) => lines.filter(l => l.startsWith('|')).map(l => (l.split('|')[1] ?? '')).flatMap(cell => [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1] as string))

/** the cells of a table's rows (the header and its rule left out), trimmed */
const tableOf = (lines: string[]) => lines.filter(l => l.startsWith('|')).slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
/** how §18.5 writes a field's "Range or values" from the field itself */
function rangeCell(f: RuleField): string {
  const none = f.nullable ? ', or none' : ''
  switch (f.kind) {
    case 'number': return `${f.min} to ${f.max}, step ${f.step}${none}`
    case 'integer': return `${f.min} to ${f.max}${none}`
    case 'boolean': return 'yes or no'
    case 'enum': return (f.values ?? []).map(v => `\`${v}\``).join(', ')
    case 'order': return `an ordering of ${(f.values ?? []).join(', ')}`
    case 'subset': return `some of ${(f.values ?? []).join(', ')}, in that order`
    case 'chars': return 'a list of characters'
    case 'object': return `${(f.members ?? []).map(m => m.key).join(', ')}${f.nullable ? '; or none' : ''}`
  }
}

describe("docs/PDF-READER.md: the table of identities (rules as data, §9.4)", () => {
  const rows = firstColumn(sectionOf('### 18.2'))

  it('has a row for every identity the engine exports', () => {
    const exported = identitiesExported()
    // (the ones the plan names, so that a pattern that stopped matching would fail here and not pass for want of names)
    for (const name of ['PIPELINE_VERSION', 'TRANSLATE_VERSION', 'TYPESETTING_VERSION', 'LAYOUT', 'REMOVAL', 'BUNDLE', 'BUNDLE5', 'PDFJS', 'RULES_SCHEMA']) expect(exported, name).toContain(name)
    for (const name of exported) expect(rows, `${name} is not a row of the table`).toContain(name)
  })

  it("says what the code says: each row's value the one the file it names exports", async () => {
    // (a row names its constant's file under the engine and its value, `NAME` (`<file>`, `'value'`…: a value raised in the
    // code and not in the table fails here, as `pnpm tokens` keeps the style tokens)
    const cells = [...sectionOf('### 18.2').join('\n').matchAll(/`([A-Z][A-Z0-9_]+)` \(`([a-z][a-z0-9/-]*\.mjs)`, `'?([^`']+)'?`/g)].map(m => ({ name: m[1]!, file: m[2]!, value: m[3]! }))
    expect(cells.map(c => c.name)).toEqual(expect.arrayContaining(['BUNDLE5', 'BUNDLE', 'PDFJS', 'PIPELINE_VERSION', 'LAYOUT', 'REMOVAL', 'TRANSLATE_VERSION', 'RULES_SCHEMA']))
    for (const { name, file, value } of cells) {
      const mod = (await import(/* @vite-ignore */ `/src/pdf-reader/engine/${file}`)) as Record<string, unknown>
      expect(mod, `${file} exports ${name}`).toHaveProperty(name)
      expect(String(mod[name]), `§18.2's ${name} (${file})`).toBe(value)
    }
  })

  it('names no identity the code does not have', () => {
    const exported = identitiesExported(), html = readFileSync('src/core/rules/latexml.ts', 'utf8')
    for (const name of rows.filter(r => /^[A-Z][A-Z0-9_]+$/.test(r))) {
      expect(exported.has(name) || new RegExp(`^export const ${name}\\b`, 'm').test(html), `${name} is not an identity`).toBe(true)
    }
  })

  it('lists every field of the rule set (RULES_FIELDS) with its scope, group, range and words, and no other', () => {
    const table = tableOf(sectionOf('### 18.5'))
    expect(table.map(r => r[0]?.replaceAll('`', ''))).toEqual(RULES_FIELDS.map(f => f.path))
    for (const [i, field] of RULES_FIELDS.entries()) {
      // (a range is a change of schema: the cell is derived from the field's bounds, so that the two cannot drift)
      expect(table[i]?.slice(1), field.path).toEqual([field.scope, field.group, rangeCell(field), field.words])
    }
  })
})
