import { describe, expect, it } from 'vitest'
import { setLocale } from '@/ui/strings'
import { S, parseFatal, reasonText, serviceName } from '@/ui/strings'

// The copy tables of UI.md §3 are the Chinese ones; this file checks that pack
setLocale('zh-CN')

describe('reasonText', () => {
  it('has a reader-facing sentence for every kind, free of implementation words', () => {
    const kinds = ['no-key', 'network', 'rate-limit', 'auth', 'bad-request', 'invalid-response', 'timeout', 'aborted', 'unknown'] as const
    for (const kind of kinds) {
      const text = reasonText(kind)
      expect(text, kind).not.toMatch(/引擎|降级|块|会话|provider|fallback|helper/)
    }
    expect(reasonText('auth')).toBe('API Key 无效或已过期')
    expect(reasonText('aborted')).toBe('')
  })
})

describe('parseFatal', () => {
  it('splits the "kind: message" run.ts writes', () => {
    expect(parseFatal('auth: User not found.')).toEqual({ kind: 'auth', message: 'User not found.' })
  })
  it('treats an unrecognised prefix as unknown', () => {
    expect(parseFatal('something odd')).toEqual({ kind: 'unknown', message: 'something odd' })
  })
})

describe('serviceName', () => {
  it("shows the reader's own name for a service and the built-in names for the rest", () => {
    expect(serviceName('svc-abcd1234', [{ id: 'svc-abcd1234', name: 'DeepSeek V4 Flash' }])).toBe('DeepSeek V4 Flash')
    expect(serviceName('openai-compat')).toBe(S.service.llm)
    expect(serviceName('google-web')).toBe('Google 翻译')
    expect(serviceName('chrome-builtin')).toBe('Chrome 翻译')
    expect(serviceName('microsoft')).toBe('Microsoft 翻译')
    expect(serviceName('mystery')).toBe('mystery')
  })
})

describe('the strings themselves', () => {
  it('carry the product name and no implementation words', () => {
    expect(S.brand).toBe('Read arXiv')
    // Values only: keys are code (S.helper is a key, 识别助手 is the word a reader sees)
    const values = (v: unknown): string => typeof v === 'string' ? v : typeof v === 'function' ? String(v('x', 'y', 'z')) : v && typeof v === 'object' ? Object.values(v).map(values).join(' ') : ''
    const all = values(S)
    expect(all).not.toMatch(/引擎|降级|块|会话|provider|fallback|helper/)
    // No casual register either: a button is a noun or a verb, not a spoken phrase
    expect(all).not.toMatch(/去填|去修|去查看|没翻出来|翻完/)
  })
})

describe('fallbackText', () => {
  // The zod messages are diagnostics; the reader sees the pack's sentence for the field that failed (the owner's
  // decision of 2026-09-13 to move the reader-visible strings into the packs)
  const invalid = (where: string, message = 'zod said so') => ({ kind: 'invalid' as const, where, message })
  it('names the field in the interface language and leaves the zod diagnostic out when the pack knows the field', async () => {
    // The namespace, not a destructured copy: S and O are live bindings that setLocale reassigns
    const strings = await import('@/ui/strings')
    setLocale('zh-CN')
    expect(strings.fallbackText(invalid('provider'))).toBe(`provider：${strings.O.fallbackWhy.field.provider}`)
    expect(strings.fallbackText(invalid('appearance.styles.2.color'))).toBe(`appearance.styles.2.color：${strings.O.fallbackWhy.field.color}`)
    expect(strings.fallbackText(invalid('provider'))).not.toContain('zod said so')
    setLocale('en')
    expect(strings.fallbackText(invalid('services.0.baseURL'))).toBe(`services.0.baseURL: ${strings.O.fallbackWhy.field.baseURL}`)
    setLocale('zh-CN')
  })
  it('falls back to the diagnostic for a field the pack has no sentence for', async () => {
    const strings = await import('@/ui/strings')
    expect(strings.fallbackText(invalid('reading.margin', 'Too big'))).toBe('reading.margin：Too big')
  })
})

describe('the settings drawer issue sentence', () => {
  it('speaks each language with its own punctuation and wraps an unknown field in that language', async () => {
    const strings = await import('@/ui/strings')
    setLocale('en')
    expect(strings.O.services.issue('baseURL', 'Invalid URL')).toBe(`baseURL: ${strings.O.fallbackWhy.field.baseURL}`)
    expect(strings.O.services.issue('thinking', 'Invalid enum')).toBe('thinking: Invalid enum')
    setLocale('zh-CN')
    expect(strings.O.services.issue('baseURL', 'Invalid URL')).toBe(`baseURL：${strings.O.fallbackWhy.field.baseURL}`)
    expect(strings.O.services.issue('thinking', 'Invalid enum')).toBe('thinking：不合法（Invalid enum）')
  })
})

describe('helperInstallCommand', () => {
  it('names the same ref twice — the script and the sources come from one place — and that ref is a commit, a release tag or main (issue #158)', async () => {
    const { helperInstallCommand } = await import('@/ui/strings')
    const { BUILD_REF } = await import('@/shared/build')
    const command = helperInstallCommand('abcdefghijklmnopabcdefghijklmnop')
    expect(command).toBe(`curl -fsSL https://raw.githubusercontent.com/SRjoeee/ReadarXiv/${BUILD_REF}/helper/install-remote.sh | bash -s -- abcdefghijklmnopabcdefghijklmnop ${BUILD_REF}`)
    // main, a commit, or a release tag — the three things readBuildRef stamps (scripts/build-ref.mjs)
    expect(BUILD_REF === 'main' || /^[0-9a-f]{40}$/.test(BUILD_REF) || /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(BUILD_REF)).toBe(true)
  })
})

describe('the built-in appearance profiles and the packs', () => {
  it('every pack names every built-in profile, and the Chinese pack\'s names are the ones the configuration ships', async () => {
    // A built-in is stored with its shipped (Chinese) name and shown by id in the interface language as long as the
    // reader has not renamed it (`profileName` compares the stored name with the shipped one). An id without a name in
    // a pack would show Chinese in that language; a shipped name that drifted from the Chinese pack's would show two
    // names for one profile — in the settings' list and in a copy made from it
    const { BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES } = await import('@/config/appearance')
    const { LOCALES } = await import('@/locales')
    for (const [code, pack] of Object.entries(LOCALES)) {
      expect(Object.keys(pack.O.reading.builtInStyles).sort(), code).toEqual(BUILT_IN_STYLES.map(p => p.id).sort())
      expect(Object.keys(pack.O.reading.builtInHighlights).sort(), code).toEqual(BUILT_IN_HIGHLIGHTS.map(p => p.id).sort())
    }
    const zh = LOCALES['zh-CN'].O.reading
    for (const p of BUILT_IN_STYLES) expect([p.id, (zh.builtInStyles as Record<string, string>)[p.id]]).toEqual([p.id, p.name])
    for (const p of BUILT_IN_HIGHLIGHTS) expect([p.id, (zh.builtInHighlights as Record<string, string>)[p.id]]).toEqual([p.id, p.name])
  })
})

describe('the English pack', () => {
  it('speaks to a reader: no word that names how the extension is built (issue #155\'s first principle)', async () => {
    const { LOCALES } = await import('@/locales')
    const texts: { path: string; text: string }[] = []
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string') texts.push({ path, text: value })
      else if (typeof value === 'function') {
        // A sentence built from arguments: any arguments will do, the words around them are what is read
        try { walk((value as (...args: unknown[]) => unknown)('x', 'y', 'z'), path) } catch { /* a function that needs a real argument says nothing here */ }
      } else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`)
    }
    walk(LOCALES.en, 'en')
    expect(texts.length).toBeGreaterThan(200)
    const BUILT = /\bhelper\b|\bendpoints?\b|\bproviders?\b|\bfallback chain\b|\bwire format\b|\bbackground\b|\bbatch(es)?\b|\bengines?\b|\bsessions?\b|\bcache key\b|\bcontent script\b|\bservice worker\b/i
    // The reading section's “Background highlight” is the reader's word for a coloured band, not the extension's background
    const found = texts.filter(t => BUILT.test(t.text) && !/highlight/i.test(t.text)).map(t => `${t.path}: ${t.text}`)
    expect(found).toEqual([])
  })
})

