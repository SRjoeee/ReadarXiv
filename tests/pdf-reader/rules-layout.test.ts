import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENGLISH_FAMILIES, FACES, rolesFor } from '@/pdf-reader/engine/font-roles.mjs'
import { scriptOf } from '@/pdf-reader/engine/layer-rules.mjs'
import { BUILTIN_RULES, parseRules, RULES_CAP, RULES_FIELDS, RULES_SCHEMA, RULES_VALUES, RulesRefusal, readRules, resolveRules, SCRIPTS, TARGETS, writeRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { babelTags, VERIFIED } from '@/pdf-reader/engine/scripts.mjs'

// The layout rule set (rules/layout.mjs, the rules-as-data plan §2): its built-in copy, its resolution to the fields v0 reads,
// and the refusals of a set read as data. Every value the migration moved out of the engine's code is held here against the
// frozen copy of the first version (rules/v1.json) and the Params the engine made before the migration (rules/params-v1.json,
// captured from layer2.mjs defaultParams and run.mjs's defaults), so that tuning the built-in set later cannot make the
// migration's proof vacuous. CJK text is written as \u escapes

const BUILTIN_FILE = resolve('src/pdf-reader/engine/rules/layout-rules.json')
const V1_FILE = resolve('tests/pdf-reader/rules/v1.json')
const text = (file: string) => readFileSync(file, 'utf8')
const bytesOf = (s: string) => new TextEncoder().encode(s)

/** the frozen first version, parsed afresh: a set to edit (any shape: the tests edit it into what they refuse) */
// biome-ignore lint/suspicious/noExplicitAny: a set under edit has no fixed shape
type Edit = any
const v1 = (edit?: (s: Edit) => void): Edit => { const s = JSON.parse(text(V1_FILE)); edit?.(s); return s }
const V1 = parseRules(v1())
const PARAMS_V1 = JSON.parse(text(resolve('tests/pdf-reader/rules/params-v1.json'))) as Record<string, Record<string, unknown>>

/** the refusal parseRules gives a set, or a failure where it is read */
function refusal(json: unknown): RulesRefusal {
  try { parseRules(json) } catch (e) { if (e instanceof RulesRefusal) return e; throw e }
  throw new Error('the set was read')
}
async function refusalOfBytes(bytes: Uint8Array, o?: { etag?: string | null }): Promise<RulesRefusal> {
  try { await readRules(bytes, o) } catch (e) { if (e instanceof RulesRefusal) return e; throw e }
  throw new Error('the set was read')
}

afterEach(() => { vi.restoreAllMocks() })

describe('the built-in set', () => {
  it('parses, is canonical (writeRules gives the file\'s bytes) and has a version of at least 1', () => {
    expect(RULES_SCHEMA).toBe(1)
    expect(BUILTIN_RULES.schema).toBe(1)
    expect(BUILTIN_RULES.version).toBeGreaterThanOrEqual(1)
    expect(BUILTIN_RULES.note.length).toBeGreaterThan(0)
    expect(writeRules(BUILTIN_RULES)).toBe(text(BUILTIN_FILE))
    expect(parseRules(JSON.parse(text(BUILTIN_FILE)))).toEqual(BUILTIN_RULES)
    // (the frozen first version is canonical too, and its version 1)
    expect(writeRules(V1)).toBe(text(V1_FILE))
    expect(V1.version).toBe(1)
    expect(V1.note).toBe('migrated from the engine\'s code')
  })

  it('is frozen: no run edits the set every run shares', () => {
    expect(Object.isFrozen(BUILTIN_RULES)).toBe(true)
    expect(Object.isFrozen(BUILTIN_RULES.scripts.Hans)).toBe(true)
    expect(Object.isFrozen(BUILTIN_RULES.scripts.Hans.order)).toBe(true)
    expect(Object.isFrozen(BUILTIN_RULES.scripts.Hans.adaptiveFill)).toBe(true)
    expect(Object.isFrozen(BUILTIN_RULES.languages.de)).toBe(true)
  })

  it('holds every target and every script, and the languages beside them the language wave will add to', () => {
    expect(TARGETS).toEqual(['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru'])
    expect(SCRIPTS).toEqual(['Hans', 'Hant', 'Jpan', 'Kore', 'Latn', 'Cyrl'])
    expect(RULES_CAP).toBe(65_536)
    expect(RULES_VALUES).toBe(20_000)
    for (const t of TARGETS) expect(Object.keys(BUILTIN_RULES.languages), t).toContain(t)
    expect(Object.keys(BUILTIN_RULES.scripts)).toEqual([...SCRIPTS])
    // (the file is about 8 KB: well within the cap, with room for the language wave)
    expect(text(BUILTIN_FILE).length).toBeLessThan(RULES_CAP / 4)
  })
})

describe('resolving a target (resolveRules)', () => {
  it('gives the Params the engine made before the migration, for every target: the resolver keeps today\'s meaning', () => {
    for (const t of TARGETS) {
      const params = resolveRules(V1, t).params as unknown as Record<string, unknown>
      const old = PARAMS_V1[t]!
      expect(Object.keys(old).length, t).toBeGreaterThan(15)
      expect(Object.fromEntries(Object.keys(old).map(k => [k, params[k]])), t).toEqual(old)
    }
  })

  it('adds, beside them, the fields the migration moved into Params, each the value of the condition it replaced', () => {
    // (the engine's own conditions, as written before: layer2.mjs tokensOf2 keepAll `to === 'ko' || !cjk`, centred `to === 'zh-TW'`,
    // cjkClassRe(to) the Korean class for 'ko', latinLang `to === 'de' ? 'de' : 'en'`; run.mjs's leadRel and fill defaults; the
    // 0.5 and 0.6 of cellBands; the even pass and the fill off, trackStart the face's own)
    for (const t of TARGETS) {
      const { params, patterns } = resolveRules(V1, t)
      const cjk = ['zh', 'zh-TW', 'ja', 'ko'].includes(t)
      expect(params.cjk, t).toBe(cjk)
      expect(params.keepAll, t).toBe(t === 'ko' || !cjk)
      expect(params.centredPunct, t).toBe(t === 'zh-TW')
      expect(params.cjkQuotes, t).toBe(t !== 'ko')
      expect(params.latinPatterns, t).toBe(t === 'de' ? 'de' : 'en')
      expect(patterns, t).toEqual(t === 'de' ? ['en', 'de'] : t === 'ru' ? ['en', 'ru'] : ['en'])
      expect([params.cellClear, params.cellCapMin, params.even, params.fillSize, params.trackStart], t).toEqual([0.5, 0.6, 0, 0, null])
      expect(params.hyphenation, t).toEqual({ minWord: 5, en: { left: 2, right: 3 }, de: { left: 2, right: 2 } })
    }
  })

  it('the line-break marks are the characters of the classes they replaced', () => {
    // (layer1.mjs's NO_START and NO_END as they were: one class for every target)
    const NO_START = /^[\u3001\u3002\uFF0C\uFF0E,.\uFF01\uFF1F!?\uFF09)\]\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017\u201D\u2019\uFF1A:\uFF1B;\u30FB\u30FC\u301C\u2026\u3005\u309D\u309E\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6%\uFF05]/
    const NO_END = /[\uFF08([\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016\u201C\u2018]$/
    for (const t of TARGETS) {
      const { noStart, noEnd } = resolveRules(V1, t).params
      const start = new Set([...noStart].map(c => c.codePointAt(0))), end = new Set([...noEnd].map(c => c.codePointAt(0)))
      expect(start.size, t).toBe([...noStart].length)
      expect(end.size, t).toBe([...noEnd].length)
      for (let c = 0; c < 0x10000; c++) {
        const ch = String.fromCharCode(c)
        if (NO_START.test(ch) !== start.has(c)) throw new Error(`${t}: noStart and the class differ at U+${c.toString(16)}`)
        if (NO_END.test(ch) !== end.has(c)) throw new Error(`${t}: noEnd and the class differ at U+${c.toString(16)}`)
      }
    }
  })

  it('gives the CJK family of a CJK script and none to an alphabet, and the light designs beside which it is light', () => {
    const family = { zh: ['shs-sc', 'fandolkai'], 'zh-TW': ['shs-tc', 'bkai00mp'], ja: ['haranoaji', null], ko: ['shs-k', null] } as Record<string, [string, string | null]>
    for (const t of TARGETS) {
      const { cjkFaces } = resolveRules(V1, t)
      if (family[t]) expect(cjkFaces, t).toEqual({ group: family[t]![0], kai: family[t]![1], light: ['cm', 'garamond'] })
      else expect(cjkFaces, t).toBeNull()
    }
  })

  it('takes the script of a tag by Intl.Locale: zh-TW is Traditional, its compressMax 0 against Simplified\'s 2', () => {
    expect(resolveRules(V1, 'zh').script).toBe('Hans')
    expect(resolveRules(V1, 'zh-TW').script).toBe('Hant')
    expect(resolveRules(V1, 'zh-TW').script).toBe(scriptOf('zh-TW'))
    expect([resolveRules(V1, 'zh').params.compressMax, resolveRules(V1, 'zh-TW').params.compressMax]).toEqual([2, 0])
    expect(resolveRules(V1, 'ru').script).toBe('Cyrl')
    expect(resolveRules(V1, 'de').script).toBe('Latn')
  })

  it('a language\'s field overrides its script\'s: de\'s latinPatterns is \'de\', fr\'s \'en\'', () => {
    expect(resolveRules(V1, 'de').params.latinPatterns).toBe('de')
    expect(resolveRules(V1, 'fr').params.latinPatterns).toBe('en')
    expect(resolveRules(V1, 'de').patterns).toEqual(['en', 'de'])
    const edited = parseRules(v1(s => { s.languages.fr.leadBase = 1.1; s.scripts.Latn.leadBase = 1.2 }))
    // (a language's value beats the script's, and the script's reaches the languages that name none)
    expect(resolveRules(edited, 'fr').params.leadBase).toBe(1.1)
    expect(resolveRules(edited, 'de').params.leadBase).toBe(1.2)
    expect(resolveRules(edited, 'es').params.leadBase).toBe(1.2)
    expect(resolveRules(edited, 'ru').params.leadBase).toBe(1)
  })

  it('a script\'s field reaches every language of it: an edited scripts.Latn.spaceMax reaches de, fr and es', () => {
    const edited = parseRules(v1(s => { s.scripts.Latn.spaceMax = 1.5 }))
    for (const t of ['de', 'fr', 'es']) expect(resolveRules(edited, t).params.spaceMax, t).toBe(1.5)
    for (const t of ['zh', 'zh-TW', 'ja', 'ko', 'ru']) expect(resolveRules(edited, t).params.spaceMax, t).toBe(resolveRules(V1, t).params.spaceMax)
    // (and a language the set adds follows its script's: Italian, Latin)
    const wave = parseRules(v1(s => { s.languages.it = { labels: null }; s.scripts.Latn.spaceMax = 1.5 }))
    expect(resolveRules(wave, 'it').params.spaceMax).toBe(1.5)
    expect(resolveRules(wave, 'it').labels).toBeNull()
    expect(resolveRules(wave, 'it').params.keepAll).toBe(true)
    expect(resolveRules(wave, 'pt').labels).toEqual({ figure: 'Figura', table: 'Tabela' })
  })

  it('an object field is replaced whole, never merged: languages.zh.adaptiveFill, cjkFaces and labels', () => {
    const edited = parseRules(v1(s => {
      s.languages.zh.adaptiveFill = { band: 0.2, track: 0, size: 1 }
      s.languages.zh.cjkFaces = { group: 'shs-tc', kai: null, light: [] }
      s.languages.ja.adaptiveFill = null
      s.languages.ko.labels = { figure: 'Fig', table: 'Tab' }
    }))
    const zh = resolveRules(edited, 'zh')
    expect(zh.params.adaptiveFill).toEqual({ band: 0.2, track: 0, size: 1 })
    expect(zh.cjkFaces).toEqual({ group: 'shs-tc', kai: null, light: [] })
    expect(zh.labels).toEqual({ figure: '\u56fe', table: '\u8868' })
    expect(resolveRules(edited, 'ja').params.adaptiveFill).toBeNull()
    expect(resolveRules(edited, 'ko').labels).toEqual({ figure: 'Fig', table: 'Tab' })
    // (an object over a script's null, and a null over a script's object, are the language's alone: nothing is merged in)
    const over = parseRules(v1(s => { s.scripts.Hans.adaptiveFill = null; s.languages.zh.adaptiveFill = { band: 0.1, track: 0.1, size: 1.2 }; s.scripts.Hans.cjkFaces.kai = null }))
    expect(resolveRules(over, 'zh').params.adaptiveFill).toEqual({ band: 0.1, track: 0.1, size: 1.2 })
    expect(resolveRules(parseRules(v1(s => { s.scripts.Hans.adaptiveFill = null })), 'zh').params.adaptiveFill).toBeNull()
    expect(resolveRules(over, 'zh').cjkFaces!.kai).toBeNull()
    // (the script's own is untouched: Traditional Chinese keeps the script's fill and faces)
    expect(resolveRules(edited, 'zh-TW').params.adaptiveFill).toEqual({ band: 0.05, track: 0.05, size: 1.1 })
    expect(resolveRules(edited, 'zh-TW').cjkFaces!.group).toBe('shs-tc')
  })

  it('gives fresh objects each call: a run changes its own parameters, never the set or the next run\'s', () => {
    const a = resolveRules(BUILTIN_RULES, 'zh'), b = resolveRules(BUILTIN_RULES, 'zh')
    expect(a.params).not.toBe(b.params)
    expect(a.params.adaptiveFill).not.toBe(b.params.adaptiveFill)
    expect(a.params.order).not.toBe(b.params.order)
    expect(a.cjkFaces).not.toBe(b.cjkFaces)
    expect(a.hyphenation).not.toBe(b.hyphenation)
    a.params.leadBase = 9
    a.params.order.length = 0
    a.params.adaptiveFill!.band = 9
    expect(resolveRules(BUILTIN_RULES, 'zh').params).toEqual(b.params)
    expect(BUILTIN_RULES.scripts.Hans.order).toHaveLength(4)
  })

  it('names the version of the set it resolved, and refuses a target or a script the set has no rules for', () => {
    expect(resolveRules(BUILTIN_RULES, 'zh').version).toBe(BUILTIN_RULES.version)
    for (const target of ['xx', 'zh-Hans', '', '__proto__', 'constructor']) {
      expect(() => resolveRules(BUILTIN_RULES, target), target).toThrow(RulesRefusal)
    }
    expect(() => resolveRules(BUILTIN_RULES, undefined as never)).toThrow(RulesRefusal)
    try { resolveRules(BUILTIN_RULES, 'xx') } catch (e) { expect((e as RulesRefusal).field).toBe('languages.xx') }
    // (a language of a script the set lacks: a set can omit none of SCRIPTS, so the edit is made on the parsed object)
    const odd = structuredClone(V1) as Edit
    odd.languages.el = { labels: null }
    delete odd.scripts.Latn
    expect(() => resolveRules(odd, 'fr')).toThrow(RulesRefusal)
    expect(() => resolveRules(odd, 'el')).toThrow(/no rules for this script/)
  })
})

describe('the float labels (babel 26.12\'s [captions])', () => {
  /** babel's tags as they were held in caption-names.mjs: each float's name, as \u escapes */
  const BABEL = {
    zh: { figure: '\u56fe', table: '\u8868' },
    'zh-Hant': { figure: '\u5716', table: '\u8868' },
    ja: { figure: '\u56f3', table: '\u8868' },
    ko: { figure: '\uadf8\ub9bc', table: '\ud45c' },
    de: { figure: 'Abbildung', table: 'Tabelle' },
    es: { figure: 'Figura', table: 'Cuadro' },
    fr: { figure: 'Figure', table: 'Table' },
    pt: { figure: 'Figura', table: 'Tabela' },
    ru: { figure: '\u0420\u0438\u0441.', table: '\u0422\u0430\u0431\u043b\u0438\u0446\u0430' },
  } as Record<string, { figure: string; table: string }>

  it('every target the reader typesets has the names babel gives it, found by the tags the final\'s babel tries', () => {
    // (the TeX path's own tag for Traditional Chinese, zh-Hant, is the reader's target zh-TW: the set keeps its names there)
    for (const lang of [...VERIFIED, 'zh-TW']) {
      const labels = resolveRules(BUILTIN_RULES, lang === 'zh-Hant' ? 'zh-TW' : lang).labels
      expect(labels, lang).not.toBeNull()
      const tag = babelTags(lang).find(t => Object.hasOwn(BABEL, t))
      expect(tag, lang).toBeDefined()
      expect(labels, lang).toEqual(BABEL[tag!])
    }
    expect(resolveRules(BUILTIN_RULES, 'zh-TW').labels).toEqual({ figure: '\u5716', table: '\u8868' })
    expect(resolveRules(BUILTIN_RULES, 'ja').labels).toEqual({ figure: '\u56f3', table: '\u8868' })
    expect(resolveRules(BUILTIN_RULES, 'es').labels).toEqual({ figure: 'Figura', table: 'Cuadro' })
    expect(resolveRules(BUILTIN_RULES, 'ru').labels!.figure).toBe('\u0420\u0438\u0441.')
  })

  it('the built-in set holds exactly babel\'s names: the tags as they were, pt kept as a language of the wave', () => {
    const held = Object.fromEntries(Object.entries(BUILTIN_RULES.languages).map(([tag, l]) => [tag === 'zh-TW' ? 'zh-Hant' : tag, l.labels]))
    expect(held).toEqual(BABEL)
  })
})

describe('reading a set from bytes (readRules)', () => {
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

  it('gives the set and the SHA-256 of the bytes, and holds the built-in file as the set', async () => {
    const bytes = bytesOf(text(BUILTIN_FILE))
    const { set, sha256 } = await readRules(bytes)
    expect(sha256).toBe(sha(bytes))
    expect(sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(set).toEqual(BUILTIN_RULES)
  })

  it('compares the server\'s etag with that digest: a differing etag is refused, a strong one of the digest is read', async () => {
    const bytes = bytesOf(text(V1_FILE))
    expect((await readRules(bytes, { etag: `"${sha(bytes)}"` })).sha256).toBe(sha(bytes))
    expect((await readRules(bytes, { etag: null })).sha256).toBe(sha(bytes))
    for (const etag of [`"${'0'.repeat(64)}"`, sha(bytes), `W/"${sha(bytes)}"`, '', '"x"']) expect((await refusalOfBytes(bytes, { etag })).field, etag).toBe('etag')
  })

  it('refuses more than RULES_CAP bytes before it decodes them', async () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    const r = await refusalOfBytes(new Uint8Array(RULES_CAP + 1).fill(0x20))
    expect(r.field).toBe('bytes')
    expect(decode).not.toHaveBeenCalled()
    // (exactly the cap is within it: refused later, as no set)
    expect((await refusalOfBytes(new Uint8Array(RULES_CAP).fill(0x20))).field).toBe('json')
  })

  it('refuses text that is not UTF-8', async () => {
    const good = bytesOf(text(V1_FILE))
    const bad = new Uint8Array(good.length + 1)
    bad.set(good)
    bad[good.length] = 0xff
    expect((await refusalOfBytes(bad)).field).toBe('utf8')
    expect((await refusalOfBytes(new Uint8Array([0xc3, 0x28]))).field).toBe('utf8')
  })

  it('refuses more than RULES_VALUES values before JSON.parse is called', async () => {
    const parse = vi.spyOn(JSON, 'parse')
    // 20,001 values in 40 KB: within the byte cap, over the values'
    const many = `[${'1,'.repeat(RULES_VALUES)}1]`
    expect(many.length).toBeLessThan(RULES_CAP)
    const r = await refusalOfBytes(bytesOf(many))
    expect(r.field).toBe('values')
    expect(parse).not.toHaveBeenCalled()
    // (strings and keys count too, and so does a set that is one deep nest)
    expect((await refusalOfBytes(bytesOf(`{${'"":0,'.repeat(RULES_VALUES / 2 + 1)}"z":0}`))).field).toBe('values')
    expect((await refusalOfBytes(bytesOf('['.repeat(1000)))).field).toBe('values')
    expect(parse).not.toHaveBeenCalled()
    // (a set within them is parsed)
    await readRules(bytesOf(text(V1_FILE)))
    expect(parse).toHaveBeenCalled()
  })

  it('refuses text that is not JSON, and JSON that is not a set, naming the field', async () => {
    expect((await refusalOfBytes(bytesOf('{"schema":'))).field).toBe('json')
    expect((await refusalOfBytes(bytesOf('null'))).field).toBe('set')
    expect((await refusalOfBytes(bytesOf('[]'))).field).toBe('set')
    expect((await refusalOfBytes(bytesOf(JSON.stringify(v1(s => { s.schema = 2 }))))).field).toBe('schema')
    expect((await refusalOfBytes(new Uint8Array(0))).field).toBe('json')
    await expect(readRules('{}' as never)).rejects.toThrow(RulesRefusal)
  })

  it('never uses a refused set partly: the set a refusal leaves behind is none', async () => {
    const bad = v1(s => { s.scripts.Hans.leadBase = 9 })
    await expect(readRules(bytesOf(JSON.stringify(bad)))).rejects.toMatchObject({ name: 'RulesRefusal', field: 'scripts.Hans.leadBase' })
  })
})

describe('the refusals of a set (parseRules), each naming its field', () => {
  const REFUSED: [name: string, edit: (s: Edit) => void, field: string][] = [
    // the shape: strict at every level
    ['an unknown key at the root', s => { s.extra = 1 }, 'extra'],
    ['an unknown key in the hyphenation', s => { s.hyphenation.extra = 1 }, 'hyphenation.extra'],
    ['an unknown key in a side of the hyphenation', s => { s.hyphenation.en.extra = 1 }, 'hyphenation.en.extra'],
    ['an unknown key in a script', s => { s.scripts.Hans.bogus = 1 }, 'scripts.Hans.bogus'],
    ['an unknown key in the adaptive fill', s => { s.scripts.Hans.adaptiveFill.extra = 1 }, 'scripts.Hans.adaptiveFill.extra'],
    ['an unknown key in a CJK family', s => { s.scripts.Hans.cjkFaces.extra = 1 }, 'scripts.Hans.cjkFaces.extra'],
    ['an unknown key in a language', s => { s.languages.de.bogus = 1 }, 'languages.de.bogus'],
    ['an unknown key in labels', s => { s.languages.de.labels.bogus = 1 }, 'languages.de.labels.bogus'],
    ['a script of the set missing', s => { delete s.scripts.Cyrl }, 'scripts.Cyrl'],
    ['a field of a script missing', s => { delete s.scripts.Latn.leadBase }, 'scripts.Latn.leadBase'],
    ['a language without its labels', s => { delete s.languages.de.labels }, 'languages.de.labels'],
    ['schema not 1', s => { s.schema = 2 }, 'schema'],
    ['schema a string', s => { s.schema = '1' }, 'schema'],
    ['version 0', s => { s.version = 0 }, 'version'],
    ['version not an integer', s => { s.version = 1.5 }, 'version'],
    ['version a string', s => { s.version = '1' }, 'version'],
    ['version negative', s => { s.version = -3 }, 'version'],
    ['a note that is not a string', s => { s.note = 7 }, 'note'],
    ['a note of more than 1,000 characters', s => { s.note = 'x'.repeat(1001) }, 'note'],
    ['a note with a line break (a C0 control)', s => { s.note = 'a\nb' }, 'note'],
    // the values: every number within its field's range, finite
    ['leadBase over its range', s => { s.scripts.Hans.leadBase = 2.01 }, 'scripts.Hans.leadBase'],
    ['leadBase under its range', s => { s.scripts.Hans.leadBase = 0.79 }, 'scripts.Hans.leadBase'],
    ['floor under its range', s => { s.scripts.Jpan.floor = 0.39 }, 'scripts.Jpan.floor'],
    ['borrowGap over its range', s => { s.scripts.Kore.borrowGap = 2.5 }, 'scripts.Kore.borrowGap'],
    ['trackMin above zero', s => { s.scripts.Latn.trackMin = 0.1 }, 'scripts.Latn.trackMin'],
    ['trackStart out of range', s => { s.scripts.Latn.trackStart = 1 }, 'scripts.Latn.trackStart'],
    ['a number that is not finite (Infinity)', s => { s.scripts.Hans.spaceMax = Number.POSITIVE_INFINITY }, 'scripts.Hans.spaceMax'],
    ['a number that is not a number (NaN)', s => { s.scripts.Hans.spaceMax = Number.NaN }, 'scripts.Hans.spaceMax'],
    ['a number given as a string', s => { s.scripts.Hans.step = '0.025' }, 'scripts.Hans.step'],
    ['a boolean given as a number', s => { s.scripts.Hans.leadRel = 0 }, 'scripts.Hans.leadRel'],
    ['grid out of its values', s => { s.scripts.Hans.grid = 2 }, 'scripts.Hans.grid'],
    ['compressMax out of its values', s => { s.scripts.Hans.compressMax = 3 }, 'scripts.Hans.compressMax'],
    ['latinPatterns out of its values', s => { s.languages.de.latinPatterns = 'fr' }, 'languages.de.latinPatterns'],
    ['an adaptive-fill band out of range', s => { s.scripts.Hans.adaptiveFill.band = 0.6 }, 'scripts.Hans.adaptiveFill.band'],
    ['a minimum word that is not an integer', s => { s.hyphenation.minWord = 5.5 }, 'hyphenation.minWord'],
    ['a hyphenation side of zero', s => { s.hyphenation.en.left = 0 }, 'hyphenation.en.left'],
    ['an override out of range in a language', s => { s.languages.fr.leadBase = 5 }, 'languages.fr.leadBase'],
    ['order that repeats a knob', s => { s.scripts.Hans.order = ['track', 'track', 'lead', 'shrink'] }, 'scripts.Hans.order'],
    ['order missing a knob', s => { s.scripts.Hans.order = ['track', 'borrow', 'lead'] }, 'scripts.Hans.order'],
    ['order with a knob that is none', s => { s.scripts.Hans.order = ['track', 'borrow', 'lead', 'grow'] }, 'scripts.Hans.order.3'],
    ['further out of order', s => { s.scripts.Hans.further = ['flow', 'widen'] }, 'scripts.Hans.further'],
    ['further repeating a step', s => { s.scripts.Hans.further = ['widen', 'widen'] }, 'scripts.Hans.further'],
    ['further naming a step that is none', s => { s.scripts.Hans.further = ['widen', 'hang'] }, 'scripts.Hans.further.1'],
    // the strings: no control, no bidirectional control, bounded
    ['a label with a C0 control', s => { s.languages.de.labels.figure = 'Abb\u0007' }, 'languages.de.labels.figure'],
    ['a label with a C1 control', s => { s.languages.de.labels.table = 'Tab\u0085' }, 'languages.de.labels.table'],
    ['a label with DEL', s => { s.languages.de.labels.table = 'Tab\u007f' }, 'languages.de.labels.table'],
    ['a label with U+202E (right-to-left override)', s => { s.languages.de.labels.figure = 'Abb\u202e' }, 'languages.de.labels.figure'],
    ['a label with U+2066 (left-to-right isolate)', s => { s.languages.de.labels.figure = '\u2066Abb' }, 'languages.de.labels.figure'],
    ['a label with U+2069 (pop directional isolate)', s => { s.languages.de.labels.figure = 'Abb\u2069' }, 'languages.de.labels.figure'],
    ['a label with U+061C (Arabic letter mark)', s => { s.languages.de.labels.figure = 'Abb\u061c' }, 'languages.de.labels.figure'],
    ['a label with U+200E (left-to-right mark)', s => { s.languages.de.labels.table = '\u200eTab' }, 'languages.de.labels.table'],
    ['a label with U+200F (right-to-left mark)', s => { s.languages.de.labels.table = 'Tab\u200f' }, 'languages.de.labels.table'],
    ['a note with U+200F (right-to-left mark)', s => { s.note = 'a\u200fb' }, 'note'],
    ['noStart with U+200E (left-to-right mark)', s => { s.scripts.Latn.noStart = '.\u200e' }, 'scripts.Latn.noStart'],
    ['a label of 33 code units', s => { s.languages.de.labels.figure = 'x'.repeat(33) }, 'languages.de.labels.figure'],
    ['a label that is not a string', s => { s.languages.de.labels.figure = ['Abb'] }, 'languages.de.labels.figure'],
    ['labels that are not an object', s => { s.languages.de.labels = 'Abbildung' }, 'languages.de.labels'],
    ['a family name with a control', s => { s.scripts.Hans.cjkFaces.group = 'shs-sc\n' }, 'scripts.Hans.cjkFaces.group'],
    ['noStart over 256 code points', s => { s.scripts.Latn.noStart = '\u3001'.repeat(257) }, 'scripts.Latn.noStart'],
    ['noEnd over 256 code points', s => { s.scripts.Latn.noEnd = '\u300c'.repeat(257) }, 'scripts.Latn.noEnd'],
    ['noStart holding a letter', s => { s.scripts.Latn.noStart = '.a' }, 'scripts.Latn.noStart'],
    ['noStart holding a digit', s => { s.scripts.Latn.noStart = '.7' }, 'scripts.Latn.noStart'],
    ['noEnd holding a letter', s => { s.scripts.Hans.noEnd = '(\u0416' }, 'scripts.Hans.noEnd'],
    ['noStart holding a control', s => { s.scripts.Latn.noStart = '.\u0000' }, 'scripts.Latn.noStart'],
    ['noEnd that is not a string', s => { s.scripts.Latn.noEnd = ['('] }, 'scripts.Latn.noEnd'],
    ['a tag that is not a tag', s => { s.languages['not a tag'] = { labels: null } }, 'languages.not a tag'],
    // the cross-checks against the face catalog and the targets
    ['a CJK group that is no group of the catalog', s => { s.scripts.Hans.cjkFaces.group = 'comic-sans' }, 'scripts.Hans.cjkFaces.group'],
    ['a CJK group of a Latin family', s => { s.scripts.Hans.cjkFaces.group = 'lm-roman' }, 'scripts.Hans.cjkFaces.group'],
    ['a Kai that is no face of the catalog', s => { s.scripts.Hans.cjkFaces.kai = 'comic-sans' }, 'scripts.Hans.cjkFaces.kai'],
    ['a light design that is none of the role table\'s', s => { s.scripts.Hans.cjkFaces.light = ['cm', 'comic'] }, 'scripts.Hans.cjkFaces.light.1'],
    ['a CJK group in a language that is no group', s => { s.languages.ja.cjkFaces = { group: 'nope', kai: null, light: [] } }, 'languages.ja.cjkFaces.group'],
    ['a CJK script without its CJK faces', s => { s.scripts.Kore.cjkFaces = null }, 'scripts.Kore.cjkFaces'],
    ['a CJK language without its CJK faces', s => { s.languages.zh.cjkFaces = null }, 'languages.zh.cjkFaces'],
    ...TARGETS.map((t): [string, (s: Edit) => void, string] => [`a set without ${t}`, s => { delete s.languages[t] }, `languages.${t}`]),
  ]

  it.each(REFUSED)('refuses %s', (_name, edit, field) => {
    const r = refusal(v1(edit))
    expect(r.field).toBe(field)
    expect(r.name).toBe('RulesRefusal')
    expect(r.message).toContain(field)
    expect(r.why.length).toBeGreaterThan(0)
  })

  it('refuses a set that is no object, naming the set', () => {
    for (const json of [null, undefined, 3, 'set', [], true]) expect(refusal(json).field, String(json)).toBe('set')
  })

  it('refuses a language the schema\'s tag shape does not allow, __proto__ among them, and never edits Object.prototype', () => {
    const hostile = JSON.parse(text(V1_FILE).replace('"languages": {', '"languages": {\n    "__proto__": { "labels": null },'))
    expect(Object.hasOwn(hostile.languages, '__proto__')).toBe(true)
    expect(refusal(hostile).field).toBe('languages.__proto__')
    expect(({} as Record<string, unknown>).labels).toBeUndefined()
    for (const tag of ['x', 'toolong-tag-subtag-subtag-subtag-subtag', 'de_DE', 'de ', 'Intl.Locale']) expect(refusal(v1(s => { s.languages[tag] = { labels: null } })).field, tag).toBe(`languages.${tag.slice(0, 20)}`)
  })

  it('a set without ru is refused; a set with pt besides is read', () => {
    expect(refusal(v1(s => { delete s.languages.ru })).field).toBe('languages.ru')
    expect(Object.keys(V1.languages)).toContain('pt')
    expect(parseRules(v1(s => { s.languages['pt-BR'] = { labels: { figure: 'Figura', table: 'Tabela' } } })).languages['pt-BR']).toEqual({ labels: { figure: 'Figura', table: 'Tabela' } })
    expect(parseRules(v1(s => { delete s.languages.pt })).languages.pt).toBeUndefined()
  })

  it('refuses every bidirectional control character of Unicode, and lets the other invisible characters of a text through', () => {
    // (the property itself, not a list: U+061C, U+200E, U+200F, U+202A to U+202E and U+2066 to U+2069, all in the BMP)
    const bidi = [] as number[]
    for (let c = 0; c < 0x10000; c++) if (/\p{Bidi_Control}/u.test(String.fromCodePoint(c))) bidi.push(c)
    expect(bidi).toEqual([0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
    for (const c of bidi) expect(refusal(v1(s => { s.languages.de.labels.figure = `a${String.fromCodePoint(c)}` })).field, c.toString(16)).toBe('languages.de.labels.figure')
    // (a zero width joiner and a soft hyphen are not bidirectional controls: a name may hold them)
    for (const c of ['\u200b', '\u200c', '\u200d', '\u00ad']) expect(() => parseRules(v1(s => { s.languages.de.labels.figure = `Ab${c}b` })), c).not.toThrow()
  })

  it('names a wrong type by its type and converts nothing', () => {
    expect(refusal(v1(s => { s.scripts.Hans.leadBase = '1.3' })).why).toBe('number, not string')
    expect(refusal(v1(s => { s.scripts.Hans.leadBase = null })).why).toBe('number, not null')
    expect(refusal(v1(s => { s.scripts.Hans.leadBase = [1.3] })).why).toBe('number, not array')
    expect(refusal(v1(s => { s.scripts.Hans.leadRel = 0 })).why).toBe('boolean, not number')
    expect(refusal(v1(s => { s.scripts.Hans.spaceMax = Number.NaN })).why).toBe('number, not NaN')
    expect(refusal(v1(s => { s.scripts.Hans.noStart = 7 })).why).toBe('string, not number')
    expect(refusal(v1(s => { delete s.scripts.Hans.leadBase })).why).toBe('number missing')
    expect(refusal(v1(s => { s.scripts.Hans.hyphen = true })).field).toBe('scripts.Hans.hyphen')
    expect(refusal(v1(s => { s.version = [1] })).field).toBe('version')
    expect(refusal(v1(s => { s.version = 1.5 })).why).toBe('int, not number')
    // (the words of a range and of a list of values; a hostile value is named by its type, never shown)
    expect(refusal(v1(s => { s.scripts.Hans.leadBase = 2.5 })).why).toBe('above 2')
    expect(refusal(v1(s => { s.scripts.Hans.floor = 0.1 })).why).toBe('below 0.4')
    expect(refusal(v1(s => { s.scripts.Hans.grid = 2 })).why).toBe('not one of 0, 1')
    expect(refusal(v1(s => { s.languages.de.labels.figure = 'x'.repeat(40) })).why).toBe('more than 32 characters')
    expect(refusal(v1(s => { s.scripts.Hans.leadBase = '<img src=x onerror=alert(1)>' })).why).not.toContain('onerror')
  })

  it('words the bound of an integer as a bound of a number: zod reports it with the origin `int`, and no value is a count of characters', () => {
    // (the safe-integer bound, past which a version or a count is no integer a reader can hold)
    expect(refusal(v1(s => { s.version = 1e300 })).why).toBe('above 9007199254740991')
    expect(refusal(v1(s => { s.version = 2 ** 53 })).why).toBe('above 9007199254740991')
    expect(refusal(v1(s => { s.version = -1e300 })).why).toBe('below -9007199254740991')
    expect(refusal(v1(s => { s.version = 0 })).why).toBe('below 1')
    expect(refusal(v1(s => { s.hyphenation.minWord = 1e300 })).why).toBe('above 9007199254740991')
    expect(refusal(v1(s => { s.hyphenation.en.left = -1e300 })).why).toBe('below -9007199254740991')
    for (const [edit, field] of [[(s: Edit) => { s.version = 1e300 }, 'version'], [(s: Edit) => { s.hyphenation.minWord = 1e300 }, 'hyphenation.minWord']] as const) expect(refusal(v1(edit)).field).toBe(field)
  })

  it('shows a key of the file\'s own only escaped and cut: a hostile key is no line break and no override', () => {
    const r = refusal(v1(s => { s.languages.de['x\n\u202eevil-key-longer-than-twenty-characters'] = 1 }))
    expect(r.field.startsWith('languages.de.')).toBe(true)
    expect(r.field).not.toMatch(/[\p{Cc}\u202a-\u202e]/u)
    expect(r.field.length).toBeLessThan(60)
    const root = refusal(v1(s => { s['\u202e'] = 1 }))
    expect(root.field).not.toMatch(/[\u202e]/)
  })

  it('reads every valid edit of every number within its field\'s range, and refuses just past it (the lab\'s sliders write what the schema reads)', () => {
    const numeric = RULES_FIELDS.filter(f => f.kind === 'number' && f.scope === 'script')
    expect(numeric.length).toBeGreaterThan(10)
    for (const f of numeric) {
      for (const [at, ok] of [[f.min!, true], [f.max!, true], [f.min! - f.step!, false], [f.max! + f.step!, false]] as const) {
        const edit = (s: Edit) => { s.scripts.Hans[f.path] = at }
        if (ok) expect(() => parseRules(v1(edit)), `${f.path} = ${at}`).not.toThrow()
        else expect(refusal(v1(edit)).field, `${f.path} = ${at}`).toBe(`scripts.Hans.${f.path}`)
      }
    }
  })
})

describe('the fields the lab shows (RULES_FIELDS)', () => {
  it('names every field of a script, once, with its group, its kind and a line of words, and the language\'s own and the set\'s', () => {
    const paths = RULES_FIELDS.map(f => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    const script = RULES_FIELDS.filter(f => f.scope === 'script').map(f => f.path)
    expect(script).toEqual(Object.keys(V1.scripts.Hans))
    expect(RULES_FIELDS.filter(f => f.scope === 'language').map(f => f.path)).toEqual(['labels'])
    expect(RULES_FIELDS.filter(f => f.scope === 'set').map(f => f.path)).toEqual(['hyphenation.minWord', 'hyphenation.en.left', 'hyphenation.en.right', 'hyphenation.de.left', 'hyphenation.de.right'])
    for (const f of RULES_FIELDS) {
      expect(f.words.length, f.path).toBeGreaterThan(10)
      expect(['fit', 'breaking', 'cells', 'faces', 'labels', 'hyphenation'], f.path).toContain(f.group)
      expect(Object.isFrozen(f), f.path).toBe(true)
    }
  })

  it('every value the built-in set holds lies within its field\'s range, on a step of it', () => {
    for (const f of RULES_FIELDS) {
      if ((f.kind !== 'number' && f.kind !== 'integer') || f.scope === 'language') continue
      const values: unknown[] = f.scope === 'set' ? [f.path.split('.').reduce((o: Edit, k) => o[k], BUILTIN_RULES)] : SCRIPTS.map(s => (BUILTIN_RULES.scripts[s] as unknown as Record<string, unknown>)[f.path])
      for (const v of values) {
        if (v === null) { expect(f.nullable, f.path).toBe(true); continue }
        expect(v, f.path).toBeGreaterThanOrEqual(f.min!)
        expect(v, f.path).toBeLessThanOrEqual(f.max!)
        const steps = ((v as number) - f.min!) / f.step!
        expect(Math.abs(steps - Math.round(steps)), `${f.path} = ${v} on a step of ${f.step}`).toBeLessThan(1e-6)
      }
    }
  })

  it('the enumerations name the values the schema reads', () => {
    const by = Object.fromEntries(RULES_FIELDS.map(f => [f.path, f]))
    expect(by.order!.values).toEqual(['track', 'borrow', 'lead', 'shrink'])
    expect(by.further!.values).toEqual(['widen', 'flow', 'shrink'])
    for (const [path, ok] of [['grid', [0, 1]], ['compressMax', [0, 1, 2]], ['even', [0, 1, 2]], ['hyphen', [0, 1]], ['borrow', [0, 1]], ['latinPatterns', ['en', 'de']]] as const) {
      expect(by[path]!.values, path).toEqual(ok)
      for (const v of ok) expect(() => parseRules(v1(s => { s.scripts.Hans[path] = v })), `${path} = ${v}`).not.toThrow()
    }
  })
})

describe('writing a set (writeRules)', () => {
  it('writes keys in the schema\'s order, one field a line, LF, a final newline, and reads back to the same set', () => {
    const out = writeRules(V1)
    expect(out.endsWith('}\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
    expect(out).not.toContain('\r')
    expect(JSON.parse(out)).toEqual(JSON.parse(text(V1_FILE)))
    expect(parseRules(JSON.parse(out))).toEqual(V1)
    expect(Object.keys(JSON.parse(out))).toEqual(['schema', 'version', 'note', 'hyphenation', 'scripts', 'languages'])
    expect(Object.keys(JSON.parse(out).scripts.Hans)).toEqual(RULES_FIELDS.filter(f => f.scope === 'script').map(f => f.path))
  })

  it('writes an edited set canonically whatever order its keys were made in: a changed value is one line of a diff', () => {
    const edited = parseRules(v1(s => {
      s.languages = { ru: s.languages.ru, ...s.languages }
      s.languages.fr = { leadBase: 1.1, labels: s.languages.fr.labels }
      s.version = 2
    }))
    const canon = writeRules(edited)
    expect(writeRules(parseRules(JSON.parse(canon)))).toBe(canon)
    expect(Object.keys(JSON.parse(canon).languages)).toEqual([...Object.keys(JSON.parse(canon).languages)].sort())
    // (against the frozen file: the lines that are new are the version's and the one value's)
    const before = text(V1_FILE).split('\n')
    expect(canon.split('\n').filter(l => !before.includes(l))).toEqual(['  "version": 2,', '      "labels": { "figure": "Figure", "table": "Table" },', '      "leadBase": 1.1'])
  })

  it('writes a language\'s overrides in the script\'s field order, after its labels, and an unset object field as null', () => {
    const out = writeRules(parseRules(v1(s => { s.languages.zh.adaptiveFill = null; s.languages.zh.latinPatterns = 'de'; s.languages.zh.leadBase = 1.4 })))
    const zh = out.slice(out.indexOf('    "zh": {'), out.indexOf('    "zh-TW"'))
    expect(zh.split('\n').map(l => l.trim()).filter(Boolean)).toEqual([
      '"zh": {',
      '"labels": { "figure": "\u56fe", "table": "\u8868" },',
      '"leadBase": 1.4,',
      '"adaptiveFill": null,',
      '"latinPatterns": "de"',
      '},',
    ])
  })
})

describe('the face a host asks for first (firstFaceOf)', () => {
  it('is the set\'s CJK body for a CJK target (light beside the families the set names), and none for an alphabet', async () => {
    const { firstFaceOf } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const { OPEN_FAMILY } = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
    expect(OPEN_FAMILY).toBe('times')
    // (the open family is Times, beside which the built-in set sets Regular)
    expect(firstFaceOf('zh')).toBe('shs-sc-regular')
    expect(firstFaceOf('zh')).toBe(rolesFor('zh', 'times', resolveRules(BUILTIN_RULES, 'zh').cjkFaces).cjk!.body)
    expect(firstFaceOf('zh', BUILTIN_RULES)).toBe(firstFaceOf('zh'))
    expect(firstFaceOf('zh-TW')).toBe('shs-tc-regular')
    expect(firstFaceOf('ja')).toBe('haranoaji-regular')
    expect(firstFaceOf('ko')).toBe('shs-k-regular')
    for (const t of ['de', 'fr', 'es', 'ru']) expect(firstFaceOf(t), t).toBeNull()
    // (a set that says light beside Times: the first face is the light one, and Hant\'s is untouched)
    const set = parseRules(v1(s => { s.scripts.Hans.cjkFaces.light = ['times'] }))
    expect(firstFaceOf('zh', set)).toBe('shs-sc-light')
    expect(firstFaceOf('zh-TW', set)).toBe('shs-tc-regular')
    // (and a set that gives a language another family)
    const other = parseRules(v1(s => { s.languages.zh.cjkFaces = { group: 'shs-tc', kai: null, light: [] } }))
    expect(firstFaceOf('zh', other)).toBe('shs-tc-regular')
    expect(() => firstFaceOf('xx', set)).toThrow(RulesRefusal)
  })
})

describe('the catalog the set\'s faces are checked against', () => {
  it('holds the CJK groups the built-in set names, each in all four weights, and the Kais', () => {
    for (const script of ['Hans', 'Hant', 'Jpan', 'Kore'] as const) {
      const { group, kai, light } = BUILTIN_RULES.scripts[script].cjkFaces!
      for (const w of ['light', 'regular', 'semibold', 'bold']) expect(Object.hasOwn(FACES, `${group}-${w}`), `${group}-${w}`).toBe(true)
      if (kai) expect(Object.hasOwn(FACES, kai), kai).toBe(true)
      for (const d of light) expect(ENGLISH_FAMILIES, d).toContain(d)
    }
  })
})
