import { describe, expect, it } from 'vitest'
import { LOCALES, LOCALE_CODES, LOCALE_NAMES, type LocaleCode, isLocaleCode, localeOfTag, pickLocale, S, localeInUse, setLocale } from '@readarxiv/ui'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { derivePopupView } from '@/entrypoints/popup/view-model'
import { copyName } from '@/ui/strings'
import { NAME_MAX } from '@/config/appearance'
import { styleSample } from '@/ui/style-sample'

/** Every leaf of a pack, with the path that leads to it, so a failure names the key */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  // A sentence built from parts: call it with stand-ins to see the words around them
  if (typeof value === 'function') return [[path, String((value as (...a: unknown[]) => string)(1, 'A', 'B'))]]
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  return []
}

const HAN = /\p{Script=Han}/u
const HANGUL = /\p{Script=Hangul}/u
const KANA_OR_HANGUL = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
/** Characters Simplified Chinese alone writes so, drawn from its pack: Japanese and Taiwan write each another way
 *  (内 and 条 are Japanese too, so they are Taiwan's check alone) */
const SIMPLIFIED_ONLY = '设译页链扩载选滚缓导删级务览换这们为时对显认语词应读错误开关闭请输连线样颜纸际个处项种复获择齐签击'
/** The mainland's interface words in Traditional characters: what a character conversion leaves behind (the glossary's §K) */
const MAINLAND_WORDS = ['設置', '默認', '鏈接', '加載', '搜索', '支持', '信息', '緩存', '導入', '導出', '撤銷', '窗口', '標籤頁', '內置', '自定義', '新建', '滾動', '收起', '頁眉', '頁腳', '界面', '訪問', '超時', '請求', '識別', '粘貼', '反饋', '刷新', '下劃線', '賬號', '登錄', '文件', '視頻', '屏幕', '鼠標', '光標', '保存', '配置', '數據', '網絡', '聯網', '地址', '懸停', '花括號', '選擇器']

describe('locale packs', () => {
  it('every language has its own name in the table, codes and packs one to one', () => {
    expect(LOCALE_CODES.length).toBeGreaterThan(1)
    for (const code of LOCALE_CODES) {
      expect(LOCALE_NAMES[code], code).toBeTruthy()
      expect(LOCALES[code], code).toBeTruthy()
    }
  })

  it('every pack has exactly the same keys: a missing key fails the types, guarded here at runtime too', () => {
    const paths = (code: (typeof LOCALE_CODES)[number]) => leaves(LOCALES[code]).map(([p]) => p).sort()
    const first = paths(LOCALE_CODES[0]!)
    for (const code of LOCALE_CODES.slice(1)) expect(paths(code), code).toEqual(first)
  })

  it('no CJK left in the English pack: an untranslated entry leaks straight through, and the type check cannot see it', () => {
    for (const [path, text] of leaves(LOCALES.en)) {
      // The preview sentence is the one exception: it is a sample of a *translation*, so it stays
      // in the language being previewed
      if (path.endsWith('previewTarget')) continue
      expect(CJK.test(text), `${path}: ${text}`).toBe(false)
    }
  })

  it('no placeholder English sentences left in a CJK pack (brand names, protocol words and examples excepted)', () => {
    // Sentences assembled from parameters alone excepted: called with placeholders their result is naturally all English
    const allowed = /^(S\.brand|S\.service\.(llm|microsoft|google|chrome)|S\.find\.paper|O\.services\.(apiKey|namePlaceholder)|O\.reading\.previewSource|O\.reading\.pdf$|O\.fallbackWhy\.invalid)/
    const own: Record<Exclude<LocaleCode, 'en'>, RegExp> = { 'zh-CN': HAN, 'zh-TW': HAN, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, ko: HANGUL }
    for (const [code, script] of Object.entries(own) as [Exclude<LocaleCode, 'en'>, RegExp][]) {
      for (const [path, text] of leaves(LOCALES[code])) {
        if (allowed.test(path) || text === '') continue
        // A copy string of pure ASCII can hardly be anything but forgotten
        expect(/[A-Za-z]/.test(text) && !script.test(text), `${code} ${path}: ${text}`).toBe(false)
      }
    }
  })

  it('each CJK pack is written in its own script: no kana or hangul in Chinese, no hangul in Japanese, no Han in Korean', () => {
    const foreign: Record<Exclude<LocaleCode, 'en'>, RegExp> = { 'zh-CN': KANA_OR_HANGUL, 'zh-TW': KANA_OR_HANGUL, ja: HANGUL, ko: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u }
    for (const [code, script] of Object.entries(foreign) as [Exclude<LocaleCode, 'en'>, RegExp][]) {
      for (const [path, text] of leaves(LOCALES[code])) {
        if (path.endsWith('previewTarget')) continue
        expect(script.test(text), `${code} ${path}: ${text}`).toBe(false)
      }
    }
  })

  it('Japanese is not Chinese left untranslated: no Simplified-only character, and nothing the Chinese pack says word for word but the few terms the two share', () => {
    const zh = new Map(leaves(LOCALES['zh-CN']))
    // terms Japanese writes as Chinese does
    const shared = new Set(['原文', '参考文献', '上下', '左右', '原文 PDF'])
    for (const [path, text] of leaves(LOCALES.ja)) {
      if (path.endsWith('previewTarget')) continue
      expect([...text].filter(c => SIMPLIFIED_ONLY.includes(c)), `${path}: ${text}`).toEqual([])
      if (HAN.test(text) && !shared.has(text)) expect(text, path).not.toBe(zh.get(path))
    }
  })

  it('Traditional Chinese is Taiwan\'s, never a character conversion of the Simplified pack: no Simplified character, none of the mainland\'s interface words (the glossary\'s §K)', () => {
    for (const [path, text] of leaves(LOCALES['zh-TW'])) {
      if (path.endsWith('previewTarget')) continue
      expect([...text].filter(c => `${SIMPLIFIED_ONLY}内条`.includes(c)), `${path}: ${text}`).toEqual([])
      // the search words are typed, never drawn: one a reader may know from elsewhere is welcome there
      if (!path.startsWith('O.search.keywords')) expect(MAINLAND_WORDS.filter(word => text.includes(word)), `${path}: ${text}`).toEqual([])
    }
  })

  it('the abstract page\'s link carries the current product name in every language: the old name was once hard-coded in that entry (Codex on #161)', () => {
    for (const code of LOCALE_CODES) {
      const { S } = LOCALES[code]
      expect(S.page.abstractLink(S.brand), code).toContain(S.brand)
      expect(S.page.abstractLink(S.brand), code).not.toMatch(/ArxivTranslate/)
    }
  })

  it('pickLocale: the reader\'s choice first, then each browser language in order, finally English', () => {
    expect(pickLocale('zh-CN', ['en'])).toBe('zh-CN')
    expect(pickLocale('ja', ['zh-CN'])).toBe('ja')
    expect(pickLocale('auto', ['zh-CN', 'en'])).toBe('zh-CN')
    expect(pickLocale(undefined, ['en-GB'])).toBe('en')
    expect(pickLocale('auto', ['fr-FR'])).toBe('en')
    // a tag no pack is near gives way to the next one
    expect(pickLocale('auto', ['fr-FR', 'ko-KR', 'en'])).toBe('ko')
    // A code that no longer exists must not lock up the interface
    expect(pickLocale('kl-GL', ['fr'])).toBe('en')
    // `in` recognises names on Object.prototype: then LOCALES[value] is a function and the whole page fails to render
    for (const trap of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(isLocaleCode(trap), trap).toBe(false)
      expect(pickLocale(trap, ['fr']), trap).toBe('en')
    }
  })

  it('localeOfTag: Chinese by its script, a written-out script first; Taiwan, Hong Kong and Macao Traditional; every other language by its primary subtag', () => {
    const cases: [string, string | null][] = [
      ['zh', 'zh-CN'], ['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-MY', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'],
      // a script written out is the reader's word, over what the region would suggest
      ['zh-Hans-TW', 'zh-CN'], ['zh-Hans-HK', 'zh-CN'],
      ['zh-TW', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-MO', 'zh-TW'], ['zh-Hant', 'zh-TW'], ['zh-Hant-HK', 'zh-TW'], ['zh-Hant-TW', 'zh-TW'],
      // BCP-47 is case-insensitive, and a browser may report either case
      ['zh-tw', 'zh-TW'], ['ZH-HK', 'zh-TW'], ['zh-hans-tw', 'zh-CN'],
      // the other name of the language, and Cantonese, which reads Traditional unless it says Hans
      ['cmn', 'zh-CN'], ['cmn-Hant-TW', 'zh-TW'], ['yue', 'zh-TW'], ['yue-HK', 'zh-TW'], ['yue-Hans', 'zh-CN'],
      // what follows the first singleton is an extension, not a script or a region
      ['zh-TW-u-nu-hanidec', 'zh-TW'], ['zh-u-ca-chinese', 'zh-CN'], ['ja-JP-u-ca-japanese', 'ja'], ['zh-x-hant', 'zh-CN'],
      ['ja', 'ja'], ['ja-JP', 'ja'], ['ko', 'ko'], ['ko-KR', 'ko'], ['en', 'en'], ['en-GB', 'en'], ['en-US', 'en'],
      [' ja-JP ', 'ja'], ['fr-FR', null], ['', null], ['x-private', null],
    ]
    for (const [tag, code] of cases) expect([tag, localeOfTag(tag)]).toEqual([tag, code])
    // with this rule the answer does not depend on the table's order; the order is the menu's
    expect(LOCALE_CODES).toEqual(['zh-CN', 'zh-TW', 'ja', 'ko', 'en'])
  })

  it('after setLocale every state of the popup changes language, not one sentence left in the previous pack', () => {
    setLocale('en')
    expect(localeInUse()).toBe('en')
    for (const f of POPUP_FIXTURES) {
      for (const [path, text] of leaves(derivePopupView(f.input))) {
        // A language's own name is meant to be in its own script — 「Japanese (日本語)」 — and the
        // sample sentence is a sample of a translation
        // Only the language menu's own rows are in their own scripts (their name, their keywords); every other
        // menu's words are the interface's own and must translate like anything else (narrower per Opus's review of
        // Task 33 — the broad `menus.` used to let a leaked Chinese label in the service or style menu through unseen)
        if (path.includes('previewTarget') || path.includes('hint') || path.startsWith('language') || path.startsWith('menus.language.items')) continue
        expect(HAN.test(text), `${f.id} ${path}: ${text}`).toBe(false)
      }
    }
    setLocale('zh-CN')
    expect(S.primary.translate).toBe('翻译本页')
  })
})

describe('what a pack is read at', () => {
  it('the empty state is computed at call time: the module loads before applyLocale, and a constant would freeze the fallback language (Codex on #161)', () => {
    setLocale('zh-CN')
    const zhEmpty = derivePopupView({ page: null, entry: null, saved: null, session: null, config: null, pack: null, menu: null, shortcut: null, savedRevision: null, rejected: [], tab: null, find: { query: '', entries: null }, readerRuns: true })
    expect(zhEmpty.primary.label).toBe(LOCALES['zh-CN'].S.primary.translate)
    setLocale('en')
    const enEmpty = derivePopupView({ page: null, entry: null, saved: null, session: null, config: null, pack: null, menu: null, shortcut: null, savedRevision: null, rejected: [], tab: null, find: { query: '', entries: null }, readerRuns: true })
    expect(enEmpty.primary.label).toBe(LOCALES.en.S.primary.translate)
    setLocale('zh-CN')
  })
})

describe('copy names', () => {
  it('copying a long name gives way on the name, not the words for a copy: otherwise the copy shares the original\'s name (Codex on #161)', () => {
    const long = { id: 'x', name: 'あ'.repeat(40) }
    const latin = { id: 'y', name: 'A long style name, written in Latin letters' }
    try {
      for (const code of LOCALE_CODES) {
        setLocale(code)
        const words = LOCALES[code].O.reading.copyName('')
        for (const profile of [long, latin]) {
          const copy = copyName(profile)
          expect(copy.length, `${code} ${copy}`).toBeLessThanOrEqual(NAME_MAX)
          expect(copy, code).not.toBe(profile.name)
          expect(copy.replace(/\s+/g, ''), code).toContain(words.replace(/\s+/g, ''))
        }
      }
    } finally { setLocale('zh-CN') }
  })

  it('each language sets the name where it writes it: Japanese puts it first and joins it, spaced only after a Latin word', () => {
    const copy = (code: LocaleCode, name: string) => LOCALES[code].O.reading.copyName(name)
    expect(copy('zh-CN', '模糊')).toBe('模糊 副本')
    expect(copy('zh-TW', '模糊')).toBe('模糊 副本')
    expect(copy('en', 'Blurred')).toBe('Blurred copy')
    expect(copy('ko', '흐림')).toBe('흐림 사본')
    expect(copy('ja', 'ぼかし')).toBe('ぼかしのコピー')
    expect(copy('ja', 'My style')).toBe('My style のコピー')
    expect(LOCALES.ja.O.prompts.copyOf('標準')).toBe('標準のコピー')
  })
})

describe('style previews', () => {
  it('advanced declarations are drawn into the preview too: a style that works through css only must not look unstyled in the menu (Codex on #161)', () => {
    const plain = styleSample({ id: 'p', name: 'p', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: '' })
    const bold = styleSample({ id: 'b', name: 'b', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'font-weight: 600; letter-spacing: .02em' })
    expect(bold).not.toEqual(plain)
    expect(bold).toMatchObject({ fontWeight: '600', letterSpacing: '.02em' })
    // Custom properties keep their names; that is how React writes them
    expect(styleSample({ id: 'v', name: 'v', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: '--x: 3px' })).toMatchObject({ '--x': '3px' })
    // The later one wins, matching the order of the injected sheet on the page
    expect(styleSample({ id: 'o', name: 'o', color: 'red', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'color: blue' }).color).toBe('blue')
    // `!important` passes the sanitiser and the page accepts it, but the CSSOM does not take a priority written inside the value:
    // drop the priority, keep the declaration, or the preview drops this one quietly (Codex on #161)
    expect(styleSample({ id: 'i', name: 'i', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'color: red !important' }).color).toBe('red')
    expect(styleSample({ id: 'i2', name: 'i2', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'font-weight: 700 ! IMPORTANT' })).toMatchObject({ fontWeight: '700' })
    // Layout properties stay out of the preview: the sanitiser lets `position: fixed` through, on the paper that is the reader's own business,
    // but the sample is drawn inside the popup and would cover it (Codex on #161)
    const escaping = styleSample({ id: 'e', name: 'e', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'position: fixed; inset: 0; z-index: 9999; width: 100vw; display: block; transform: scale(9); margin: 40px; color: teal' })
    expect(escaping).toMatchObject({ color: 'teal' })
    for (const gone of ['position', 'inset', 'zIndex', 'width', 'display', 'transform', 'margin']) expect(escaping, gone).not.toHaveProperty(gone)
    // Nor anything that inflates the box: a 1000px font size would make one row thousands of pixels tall, and the other options out of reach
    const huge = styleSample({ id: 'h', name: 'h', color: '', opacity: 1, underline: 'none', thickness: 1, blur: false, css: 'font-size: 1000px; line-height: 1000px; padding: 500px; border-bottom-width: 400px; font-weight: 700' })
    expect(huge).toMatchObject({ fontWeight: '700' })
    for (const gone of ['fontSize', 'lineHeight', 'padding', 'borderBottomWidth']) expect(huge, gone).not.toHaveProperty(gone)
    // The safety net: whatever happens, no row is made taller
    expect(huge.maxHeight).toBeTruthy()
    expect(huge.overflow).toBe('hidden')
  })
})
