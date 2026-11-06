import { describe, expect, it } from 'vitest'
import { DEFAULTS, type WritablePrefs } from '@readarxiv/reader'
import { LANG_CODES, toBcp47 } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { codeOf, prefsOf, withPrefs } from '@/pdf-reader/host/prefs'
import { READER_LANGUAGES } from '@/pdf-reader/host/languages'
import { displayOf } from '@/pdf-reader/settings'

const config = (patch: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...patch })

describe('the reader preferences over the extension configuration', () => {
  it('reads every field from its stored key', () => {
    const c = config({ mode: 'only', theme: 'dark', uiLanguage: 'ja', targetLanguage: 'deu', reading: { sentenceHighlight: false, openIn: 'same-tab' }, pdfReader: { ...DEFAULT_CONFIG.pdfReader, sync: false, swapped: true, dimPages: false, classes: { ...DEFAULT_CONFIG.pdfReader.classes, references: true } } })
    const p = prefsOf(c, { revision: 'r1', languages: ['en'] })
    expect(p).toMatchObject({ display: 'translation', target: 'de', sync: false, theme: 'dark', swapped: true, dim: false, ui: 'ja', links: 'same-tab', translator: 'r1', highlight: { on: false, band: c.appearance.activeHighlight } })
    expect(p.classes.references).toBe(true)
  })
  it('names a built-in band under its shipped name as none, a renamed one by its name', () => {
    const highlights = DEFAULT_CONFIG.appearance.highlights.map((h, i) => (i === 1 ? { ...h, name: 'mine' } : h))
    const p = prefsOf(config({ appearance: { ...DEFAULT_CONFIG.appearance, highlights } }))
    expect(p.bands[0]?.name).toBeNull()
    expect(p.bands[1]?.name).toBe('mine')
  })
  it('takes the interface language from the browser where the setting is auto', () => {
    expect(prefsOf(config({ uiLanguage: 'auto' }), { languages: ['zh-TW'] }).ui).toBe('zh-TW')
  })
  it('the defaults are the default configuration read (the reader before its settings land)', () => {
    const p = prefsOf(DEFAULT_CONFIG, { languages: ['en'] })
    for (const k of ['display', 'sync', 'classes', 'theme', 'swapped', 'dim', 'links'] as const) expect(p[k]).toEqual(DEFAULTS[k])
  })
  it('writes a patch back to each key and leaves every other field as it was', () => {
    const c = config()
    const cases: [Partial<WritablePrefs>, (n: Config) => unknown, unknown][] = [
      [{ display: 'original' }, n => n.pdfReader.original, true],
      [{ display: 'translation' }, n => n.mode, 'only'],
      [{ target: 'ja' }, n => n.targetLanguage, 'jpn'],
      [{ sync: false }, n => n.pdfReader.sync, false],
      [{ swapped: true }, n => n.pdfReader.swapped, true],
      [{ dim: false }, n => n.pdfReader.dimPages, false],
      [{ theme: 'light' }, n => n.theme, 'light'],
      [{ classes: { ...c.pdfReader.classes, names: true } }, n => n.pdfReader.classes.names, true],
      [{ highlight: { on: false, band: c.appearance.activeHighlight } }, n => n.reading.sentenceHighlight, false],
      [{ highlight: { on: true, band: 'sky' } }, n => n.appearance.activeHighlight, 'sky'],
    ]
    for (const [patch, read, want] of cases) {
      const next = withPrefs(c, patch)
      expect(read(next)).toEqual(want)
      // what the patch does not name is the configuration's
      const back = prefsOf(next, { languages: ['en'] }), before = prefsOf(c, { languages: ['en'] })
      for (const k of Object.keys(before) as (keyof typeof before)[]) if (!(k in patch)) expect(back[k]).toEqual(before[k])
    }
  })
  it('writes the chrome\'s own patches as the configuration changes its controls wrote before (packages/reader tests/chrome): a field by the field it names', () => {
    const c = config({ targetLanguage: 'cmn' })
    // the highlight's switch, and its band: the other half as it was
    expect(withPrefs(c, { highlight: { on: false } })).toMatchObject({ reading: { ...c.reading, sentenceHighlight: false }, appearance: c.appearance })
    const sky = withPrefs(c, { highlight: { band: 'sky' } })
    expect([sky.appearance.activeHighlight, sky.appearance.highlights, sky.reading]).toEqual(['sky', c.appearance.highlights, c.reading])
    // one toggle of what to translate: the others, and the HTML page's figure text, as they were
    const names = withPrefs(c, { classes: { names: true } })
    expect(names.pdfReader.classes).toEqual({ ...c.pdfReader.classes, names: true })
    expect([names.image, names.pdfReader.sync, names.pdfReader.swapped, names.pdfReader.dimPages]).toEqual([c.image, c.pdfReader.sync, c.pdfReader.swapped, c.pdfReader.dimPages])
    // the appearance, the dark pages, the swap, the target and the display
    expect(withPrefs(c, { theme: 'dark' }).theme).toBe('dark')
    expect(withPrefs(c, { dim: false }).pdfReader).toEqual({ ...c.pdfReader, dimPages: false })
    expect(withPrefs(c, { swapped: !c.pdfReader.swapped }).pdfReader).toEqual({ ...c.pdfReader, swapped: !c.pdfReader.swapped })
    expect(withPrefs(c, { target: 'de' }).targetLanguage).toBe('deu')
    expect(withPrefs(c, { display: 'translation' }).mode).toBe('only')
    // an empty patch writes nothing
    expect(withPrefs(c, {})).toBe(c)
  })
  it('round-trips every display through mode and the original flag as withDisplay and displayOf do', () => {
    for (const mode of ['side', 'stack', 'only'] as const) for (const d of ['original', 'bilingual', 'translation'] as const) expect(displayOf(withPrefs(config({ mode }), { display: d }))).toBe(d)
  })
  it('a target tag goes back to the code it came from: every code the reader offers, and the code stored', () => {
    for (const code of READER_LANGUAGES) expect(codeOf(toBcp47(code))).toBe(code)
    for (const code of LANG_CODES) expect(codeOf(toBcp47(code), code)).toBe(code)
  })
})
