import { describe, expect, it } from 'vitest'
import { O, S, setLocale } from '@/ui/strings'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { MANAGE_PROMPTS, MANAGE_SERVICES, MANAGE_STYLES, derivePopupView, runnable } from '@/entrypoints/popup/view-model'
import { searchUrl } from '@/entrypoints/popup/find'

const input = (id: string) => POPUP_FIXTURES.find(f => f.id === id)!.input
const view = (id: string) => derivePopupView(input(id))
/** Every string a reader could see in a view (values only; keys are code) */
const words = (v: unknown): string => typeof v === 'string' ? v : v && typeof v === 'object' ? Object.values(v).map(words).join(' ') : ''

// The copy tables of UI.md §3 are the Chinese ones; this file checks that pack
setLocale('zh-CN')

describe('derivePopupView (UI.md §4)', () => {
  it('derives every fixture, with no developer words and no state pill in the output', () => {
    for (const f of POPUP_FIXTURES) {
      const text = words(derivePopupView(f.input))
      expect(text, f.id).not.toMatch(/引擎|降级|块|会话|fallback|provider|就绪|翻译中/)
    }
  })
  it('a page that answered with nothing is no page: a listener that ignores axt:page-status resolves undefined', () => {
    // Measured in a real browser: with the entry pages answering other messages, `sendToActiveTab` resolved
    // `undefined` instead of rejecting, and the popup rendered nothing at all on every arXiv PDF
    const undefinedPage = { ...input('P0'), page: undefined as unknown as null }
    expect(derivePopupView(undefinedPage).kind).toBe('find')
    expect(derivePopupView({ ...undefinedPage, entry: { paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv', kind: 'abs', pdf: null, readerOpen: false } }).primary.action).toBe('openHtml')
  })
  it('P17 an abstract or PDF page: the popup is a working popup, and the button opens the HTML version', () => {
    const v = view('P17')
    // Not the one-sentence screen: the rows the reader came for are all there
    expect(v.kind).toBe('entry')
    expect(v.service).toEqual({ value: 'Microsoft 翻译' })
    expect(v.language.value).toBe('简体中文')
    // two entries, the reader's to choose (the reader's design, §2; the maintainer's words, 2026-09-25)
    expect(v.entries).toEqual({ html: { label: 'HTML 翻译', disabled: false }, pdf: { label: 'PDF 翻译', disabled: false } })
    expect(v.note).toBeNull()
    expect(v.secondary).toBeNull()
    expect(v.failed).toBeNull()
  })
  it('a paper that cannot be had as a bilingual PDF: its entry greyed, without words (the reader\'s design, §1, §2)', () => {
    const base = input('P17')
    const v = derivePopupView({ ...base, entry: { ...base.entry!, pdf: null } })
    expect(v.entries).toEqual({ html: { label: 'HTML 翻译', disabled: false }, pdf: { label: 'PDF 翻译', disabled: true } })
    expect(v.note).toBeNull()
  })

  it('the full text has no entries: its button is the page\'s own', () => {
    expect(view('P7').entries).toBeNull()
  })

  it('P17a no HTML version: the button is there and disabled, with the reason said once', () => {
    const v = view('P17a')
    expect(v.entries).toEqual({ html: { label: 'HTML 翻译', disabled: true }, pdf: { label: 'PDF 翻译', disabled: false } })
    // not "so there is nothing to translate": the PDF entry beside it translates (Part 5's final review)
    expect(v.note?.text).toBe('arXiv 没有这篇论文的 HTML 版本')
    // Nothing to open in the settings about a paper arXiv never converted
    expect(v.note?.settings).toBe(false)
    // with no PDF entry either, the whole sentence: there is nothing to translate
    expect(derivePopupView({ ...input('P17a'), entry: { ...input('P17a').entry!, pdf: null } }).note?.text).toBe(S.note.noHtml)
  })
  it('the reader holding the original — a paper with no source, a language it does not typeset — greys the primary rather than offer a switch that does nothing (Codex on #301)', () => {
    const base = input('P17')
    const reader = { ...base, entry: { ...base.entry!, kind: 'pdf' as const, readerOpen: true } }
    expect(derivePopupView(reader).primary.disabled).toBe(false)
    expect(derivePopupView({ ...reader, entry: { ...reader.entry, pdf: null } }).primary.disabled).toBe(true)
    expect(derivePopupView({ ...reader, config: { ...base.config!, targetLanguage: 'arb' } }).primary.disabled).toBe(true)
  })

  it('no HTML version and a service that cannot run, with nothing to take over: the service\'s note, which is why both entries are greyed — on an entry page and with the reader open (Part 5\'s final review)', () => {
    const noHtml = { ...input('P17b'), entry: { ...input('P17b').entry!, html: null } }
    const v = derivePopupView(noHtml)
    expect([v.entries?.html.disabled, v.entries?.pdf.disabled, v.note?.settings]).toEqual([true, true, true])
    expect(v.note?.text).toContain('API Key')
    const r = derivePopupView({ ...noHtml, entry: { ...noHtml.entry, kind: 'pdf', readerOpen: true } })
    expect([r.note?.text, r.note?.settings]).toEqual([v.note?.text, true])
  })
  it('P17b a service that cannot run, with nothing to take over, disables the button there too, as it does on the paper page', () => {
    const v = view('P17b')
    expect([v.entries?.html.disabled, v.entries?.pdf.disabled]).toEqual([true, true])
    expect(v.note?.text).toContain('API Key')
    expect(v.note?.settings).toBe(true)
  })
  it('P17c a free service takes over: the button is enabled and says which, exactly as the paper page\'s does (P7) — the page it opens starts by that rule (Devin on #247)', () => {
    const v = view('P17c')
    const paperPage = view('P7')
    expect([v.entries?.html.disabled, v.entries?.pdf.disabled]).toEqual([false, false])
    expect(paperPage.primary.disabled).toBe(false)
    expect(v.note).toEqual(paperPage.note)
    expect(v.note?.text).toContain('Microsoft')
  })
  it('P1 ready: the default service, no note, translate with the shortcut, both switches on', () => {
    const v = view('P1')
    expect(v.kind).toBe('paper')
    expect(v.service).toEqual({ value: 'Microsoft 翻译' })
    expect(v.language.value).toBe('简体中文')
    expect(v.prompt).toBeNull()
    expect(v.note).toBeNull()
    expect(v.failed).toBeNull()
    expect(v.menu).toBeNull()
    expect(v.primary).toEqual({ label: '翻译本页', action: 'translate', disabled: false, shortcut: '⌥T' })
    expect(v.secondary).toBeNull()
    expect(v.highlight).toBe(true)
    expect(v.images).toBe(true)
  })
  it('P2 service menu: the three built-ins, the reader\'s own, then the way to the settings page', () => {
    const v = view('P2')
    expect(v.menu).toBe('service')
    const m = v.menus!.service
    expect(m.search).toBe(false)
    expect(m.items.map(i => i.id)).toEqual(['microsoft', 'google-web', 'chrome-builtin', MANAGE_SERVICES])
    expect(m.items.map(i => i.checked)).toEqual([true, false, false, false])
    expect(m.items[2]).toMatchObject({ name: 'Chrome 翻译', disabled: true, action: { label: '下载' } })
    expect(m.items[3]).toMatchObject({ name: '管理翻译服务…', manage: true })
    const ready = derivePopupView({ ...input('P2'), pack: 'available' }).menus!.service
    expect(ready.items[2]).toMatchObject({ hint: '浏览器内置，无需联网' })
    expect(ready.items[2]!.disabled).toBeFalsy()
    expect(ready.items[2]!.action).toBeUndefined()
    const busy = derivePopupView({ ...input('P2'), pack: 'downloading' }).menus!.service
    expect(busy.items[2]).toMatchObject({ disabled: true, hint: '语言包下载中', action: { busy: true } })
  })

  it("a reader's services sit where the contract puts the LLM — after the free ones, before Chrome (S-P-46)", () => {
    const llm = input('P15')
    const m = derivePopupView({ ...llm, menu: 'service' }).menus!.service
    expect(m.items.map(i => i.id)).toEqual(['microsoft', 'google-web', llm.config!.services[0]!.id, 'chrome-builtin', MANAGE_SERVICES])
    const own = m.items[2]!
    expect(own).toMatchObject({ id: llm.config!.services[0]!.id, name: 'deepseek-v4-flash', hint: 'deepseek/deepseek-v4-flash', checked: true })
    // Without a key the row still selects; the note under the card is what says it cannot run
    const noKey = derivePopupView({ ...llm, config: { ...llm.config!, services: [{ ...llm.config!.services[0]!, apiKey: '' }] }, menu: 'service' }).menus!.service
    expect(noKey.items[2]).toMatchObject({ hint: '尚未配置 API Key' })
    expect(noKey.items[2]!.disabled).toBeFalsy()
  })
  it('P3 language menu: every language, searchable by any of its names or its code', () => {
    const v = view('P3')
    expect(v.menu).toBe('language')
    const m = v.menus!.language
    expect(m.search).toBe(true)
    expect(m.items.length).toBeGreaterThan(150)
    const cmn = m.items.find(i => i.id === 'cmn')!
    expect(cmn.checked).toBe(true)
    expect(cmn.keywords).toMatch(/Mandarin/)
    expect(cmn.keywords).toMatch(/cmn/)
  })
  it('P4 translating: the button says it and keeps the shortcut, the rows stay open, no counts anywhere', () => {
    const v = view('P4')
    // ⌥T restores a translated page, so the badge stays on this face of the button too (the owner, 2026-09-11)
    expect(v.primary).toEqual({ label: '显示原文', action: 'restore', disabled: false, shortcut: '⌥T' })
    expect(v.note).toBeNull()
    expect(JSON.stringify({ ...v, menus: null })).not.toMatch(/24|31/)
  })
  it('P5 one failure line counting paragraphs and figures together', () => {
    expect(view('P5').failed).toBe('3 处翻译失败')
  })
  it('P6 replaced: the service in use, the one put aside struck, a note with the reason and the settings button', () => {
    const v = view('P6')
    expect(v.service).toEqual({ value: 'Google 翻译', replaced: 'deepseek-v4-flash' })
    expect(v.note).toEqual({ text: 'deepseek-v4-flash：API Key 无效或已过期。本页已改用 Google 翻译', tone: 'info', settings: true })
    expect(v.primary.action).toBe('restore')
  })
  it('P7 LLM without a key, another service takes over: note says which, translate stays enabled', () => {
    const v = view('P7')
    expect(v.note).toEqual({ text: 'LLM 尚未配置 API Key，本次将使用 Microsoft 翻译', tone: 'info', settings: true })
    expect(v.primary.disabled).toBe(false)
    // the built-in named in the interface's language, not the prompt library's English (Task 103b)
    expect(v.prompt).toEqual({ value: O.prompts.builtInNames.default })
  })
  it('P7b a chosen service whose key was refused cannot run: the note says so and who takes over (the redesign\'s design, §5.2)', () => {
    const i = input('P7b')
    expect(runnable(i.config!, null, i.rejected)).toBe(false)
    expect(runnable(i.config!, null, [])).toBe(true)
    expect(view('P7b').note?.text).toBe(S.note.willFallback(S.note.llmRejected, 'Microsoft 翻译'))
    expect(view('P7b').primary.disabled).toBe(false)
  })
  it('P8 LLM without a key and nothing to take over: note and a disabled button', () => {
    const v = view('P8')
    expect(v.note).toEqual({ text: 'LLM 尚未配置 API Key', tone: 'alert', settings: true })
    expect(v.primary).toEqual({ label: '翻译本页', action: 'translate', disabled: true })
  })
  it('P9 paused: the reason, retranslate plus show-original', () => {
    const v = view('P9')
    expect(v.note).toEqual({ text: 'API Key 无效或已过期。请检查设置后重新翻译', tone: 'alert', settings: true })
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: false, shortcut: '⌥T' })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore' })
  })
  it('P10 Chrome chosen while its pack downloads: the note says so and who takes over', () => {
    const v = view('P10')
    expect(v.note?.text).toBe('Chrome 翻译的语言包下载中，约需 1 分钟，本次将使用 Google 翻译')
    expect(v.primary.disabled).toBe(false)
  })
  it('P11 paused image translation is a note, the page keeps going', () => {
    const v = view('P11')
    expect(v.note?.text).toBe('图片翻译已暂停：API Key 无效或已过期')
    expect(v.primary.action).toBe('restore')
  })
  it('P12 narrow-window note', () => {
    expect(view('P12').mode).toEqual({ value: 'side', note: '窗口较窄，暂按上下显示' })
  })
  it('P13 a choice that cannot run leaves the page behind: note, retranslate disabled, show-original', () => {
    const v = view('P13')
    expect(v.note).toEqual({ text: 'LLM 尚未配置 API Key', tone: 'alert', settings: true })
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: true })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore' })
  })
  it('behind is the page\'s revision against the saved settings\' digest: a key or model change alone puts the page behind, the page\'s own chain never does', () => {
    // The old test compared the page with the chain it was itself running on (the scoped provider status) — never
    // behind after the first poll. The digest of the saved settings is what the toggle compares with too
    const on = { ...input('P1'), page: { ...input('P1').page!, progress: { ...input('P1').page!.progress, state: 'on' as const, requested: 10, done: 10 }, running: { provider: 'microsoft', target: 'cmn', engine: 'microsoft', revision: 'r1' } } }
    expect(derivePopupView(on).primary).toMatchObject({ label: '显示原文', action: 'restore' })
    const behind = derivePopupView({ ...on, savedRevision: 'r2' })
    expect(behind.primary).toMatchObject({ label: '重新翻译', action: 'retranslate', disabled: false })
    expect(behind.secondary).toEqual({ label: '显示原文', action: 'restore' })
    expect(derivePopupView({ ...on, savedRevision: null }).primary).toMatchObject({ action: 'restore' })
  })
  it('the session chain and the saved chain are never confused: an unknown session shows as unknown, the decision reads the saved one', () => {
    // Codex on #185: the popup used to hand the view one status, the saved chain standing in for a session that had
    // not answered — its hand-over would have been shown as the running page's
    const demoted = { id: 'svc-1', kind: 'auth' as const, message: 'User not found.' }
    const handedOver = { ...input('P6').session!, engine: { id: 'google-web', demoted } }
    const on = { ...input('P6'), saved: handedOver, session: null }
    const unknown = derivePopupView(on)
    expect(unknown.note).toBeNull()
    expect(unknown.service).toEqual({ value: input('P6').config!.services[0]!.name })
    const known = derivePopupView({ ...on, session: handedOver })
    expect(known.note?.text).toContain('Google')
    expect(known.service.replaced).toBeDefined()
    // Whether a start is enabled without a runnable choice is the saved chain's fallback, whatever a session says
    const idle = input('P7')
    expect(derivePopupView({ ...idle, session: { ...idle.saved!, fallback: undefined } }).primary.disabled).toBe(false)
    expect(derivePopupView({ ...idle, saved: { ...idle.saved!, fallback: undefined }, session: idle.saved }).primary.disabled).toBe(true)
  })
  it('P16 the style menu is what the settings page holds, in its order, with the chosen one marked', () => {
    const v = view('P16')
    const c = input('P16').config!
    expect(v.style?.value).toBe('与原文相同')
    expect(v.menu).toBe('style')
    const m = v.menus!.style!
    expect(m.search).toBe(false)
    // The last row is not a style but the way in to managing them on the settings page (S-P-83)
    expect(m.items.map(i => i.id)).toEqual([...c.appearance.styles.map(p => p.id), MANAGE_STYLES])
    expect(m.items.at(-1)).toMatchObject({ id: MANAGE_STYLES, checked: false, manage: true })
    expect(m.items.filter(i => i.checked).map(i => i.id)).toEqual([c.appearance.activeStyle])
    // The entry has no preview: it is not a style
    expect(m.items.at(-1)!.preview).toBeUndefined()
  })
  it('P15 prompt menu lists the built-ins and the reader\'s own, and ends with the way to where they are managed (§5.3)', () => {
    const v = view('P15')
    expect(v.menu).toBe('prompt')
    const m = v.menus!.prompt!
    expect(m.items.slice(0, 2)).toMatchObject([{ id: 'default', name: O.prompts.builtInNames.default, checked: true }, { id: 'precision-rewrite', name: O.prompts.builtInNames['precision-rewrite'] }])
    expect(m.items.at(-1)).toMatchObject({ id: MANAGE_PROMPTS, name: '管理提示词…', checked: false, manage: true })
  })
  it('runnable follows the settings alone', () => {
    const c = input('P1').config!
    const svc = input('P15').config!.services[0]!
    expect(runnable(c, null)).toBe(true)
    expect(runnable({ ...c, provider: 'chrome-builtin' }, 'downloadable')).toBe(false)
    expect(runnable({ ...c, provider: 'chrome-builtin' }, 'available')).toBe(true)
    expect(runnable({ ...c, provider: 'google-web' }, null)).toBe(true)
    // An id naming nothing: the reader's LLM was deleted from another tab while this popup was open
    expect(runnable({ ...c, provider: 'svc-gone0000' }, null)).toBe(false)
    // A service needs a key, unless it is a local endpoint: Ollama and LM Studio answer without one
    expect(runnable({ ...c, provider: svc.id, services: [svc] }, null)).toBe(true)
    expect(runnable({ ...c, provider: svc.id, services: [{ ...svc, apiKey: '' }] }, null)).toBe(false)
    expect(runnable({ ...c, provider: svc.id, services: [{ ...svc, apiKey: '', baseURL: 'http://127.0.0.1:11434/v1' }] }, null)).toBe(true)
  })
})

describe('actionErrorText (S-P-90)', () => {
  it('names a missing active tab in the interface language and passes any other error through as thrown', async () => {
    const { actionErrorText } = await import('@/entrypoints/popup/view-model')
    const { NoActiveTabError } = await import('@/shared/messages')
    const strings = await import('@/ui/strings')
    setLocale('zh-CN')
    expect(actionErrorText(new NoActiveTabError())).toBe(strings.S.noActiveTab)
    expect(actionErrorText(new NoActiveTabError())).toMatch(/标签页/)
    setLocale('en')
    expect(actionErrorText(new NoActiveTabError())).toBe('No active tab')
    setLocale('zh-CN')
    expect(actionErrorText(new Error('the page did not answer'))).toBe('the page did not answer')
    expect(actionErrorText('plain')).toBe('plain')
  })

  it('a save the store refused has a sentence of its own, thrown here or carried back from the page as a failure reply', async () => {
    const { actionErrorText } = await import('@/entrypoints/popup/view-model')
    const { ConfigUnreadableError } = await import('@/config/storage')
    const { decodeReply, failure } = await import('@/shared/messages')
    const strings = await import('@/ui/strings')
    const refused = new ConfigUnreadableError({ kind: 'tooNew', stored: 99, supported: 15 })
    setLocale('en')
    expect(actionErrorText(refused)).toBe(strings.S.settingsUnreadable)
    expect(actionErrorText(refused)).toMatch(/not saved/)
    let carried: unknown
    try { decodeReply(failure(refused)) } catch (e) { carried = e }
    expect(actionErrorText(carried)).toBe(strings.S.settingsUnreadable)
    setLocale('zh-CN')
  })
})

describe('startRefusalText', () => {
  it('turns every refusal code the session can answer into the sentence of the interface language', async () => {
    const { startRefusalText } = await import('@/entrypoints/popup/view-model')
    const strings = await import('@/ui/strings')
    setLocale('zh-CN')
    expect(startRefusalText({ started: false, reason: 'already-on' })).toBe(strings.S.page.alreadyOn)
    expect(startRefusalText({ started: false, reason: 'not-paper' })).toBe(strings.S.page.notPaper)
    expect(startRefusalText({ started: false, reason: 'backend-silent', detail: 'gone' })).toBe(strings.S.page.backendSilentWith('gone'))
    setLocale('en')
    expect(startRefusalText({ started: false, reason: 'no-service' })).toBe('No API key yet. Add one in the settings')
    setLocale('zh-CN')
  })
})

describe('the core strings seam (DESIGN §4.2)', () => {
  it('setLocale hands the core the retry label and the failure sentences of that locale', async () => {
    const { coreStrings } = await import('@/core/strings')
    const strings = await import('@/ui/strings')
    setLocale('en')
    expect(coreStrings().retry).toBe('Retry')
    expect(coreStrings().failureTitle('auth')).toBe(strings.reasonText('auth'))
    setLocale('zh-CN')
    expect(coreStrings().retry).toBe(strings.S.page.retry)
    expect(coreStrings().failureTitle('no-key')).toBe(strings.reasonText('no-key'))
  })

  describe('the popup while the PDF reader is open (the reader\'s design, §9.2)', () => {
    const reader = (config = input('P17').config!, over = {}) => derivePopupView({ ...input('P17'), config, entry: { ...input('P17').entry!, kind: 'pdf', readerOpen: true }, ...over })
    const withConfig = (patch: Record<string, unknown>) => ({ ...input('P17').config!, ...patch }) as NonNullable<ReturnType<typeof input>['config']>

    it('lists the nine languages the reader typesets, alone', () => {
      const v = reader(undefined, { menu: 'language' })
      expect(v.menus?.language.items.map(i => i.id)).toEqual(['jpn', 'cmn', 'cmn-Hant', 'kor', 'deu', 'spa', 'fra', 'por', 'rus'])
    })

    it('greys stacked with its reason, and shows a stored stacked as side by side, what the reader shows', () => {
      const v = reader(withConfig({ mode: 'stack' }))
      expect(v.mode).toMatchObject({ value: 'side', disabled: ['stack'] })
    })

    it('offers the translation while the original is shown, the original while a translation is', () => {
      const cfg = input('P17').config!
      expect(reader(withConfig({ pdfReader: { ...cfg.pdfReader, original: true } })).primary).toMatchObject({ label: '翻译本页', action: 'readerTranslate' })
      expect(reader(withConfig({ pdfReader: { ...cfg.pdfReader, original: false } })).primary).toMatchObject({ label: '显示原文', action: 'readerOriginal' })
    })

    it('has no style to choose (the foot greys its button) and no entries; the service, the highlight and the images are as elsewhere', () => {
      const v = reader()
      expect([v.style, v.entries]).toEqual([null, null])
      expect(v.service.value).toBe(view('P17').service.value)
      expect([v.highlight, v.images]).toEqual([view('P17').highlight, view('P17').images])
    })
  })
})

describe('the redesign\'s popup (its design, §5)', () => {
  it('every menu the view offers is drawn, open or not; a menu asked for that the view has not is not open', () => {
    const v = view('P1')
    expect(v.menus?.service.items.length).toBeGreaterThan(3)
    expect(v.menus?.language.items.length).toBeGreaterThan(150)
    expect([v.menus?.prompt, v.menus?.style?.items.at(-1)?.id]).toEqual([null, MANAGE_STYLES])
    expect(derivePopupView({ ...input('P1'), menu: 'prompt' }).menu).toBeNull()
    expect(derivePopupView({ ...input('PR'), menu: 'style' }).menu).toBeNull()
  })

  it('a note carries the alert for something blocked or stopped, the information for something that goes on (§5.2)', () => {
    const tones = Object.fromEntries(['P6', 'P7', 'P7b', 'P8', 'P8b', 'P9', 'P10', 'P11', 'P13', 'P17a', 'P17b', 'P17c'].map(id => [id, view(id).note?.tone]))
    expect(tones).toEqual({ P6: 'info', P7: 'info', P7b: 'info', P8: 'alert', P8b: 'alert', P9: 'alert', P10: 'info', P11: 'alert', P13: 'alert', P17a: 'info', P17b: 'alert', P17c: 'info' })
    // no HTML version and no PDF entry either: nothing to translate, blocked
    expect(derivePopupView({ ...input('P17a'), entry: { ...input('P17a').entry!, pdf: null } }).note?.tone).toBe('alert')
  })

  it('P8b a refused key with nothing to take over: said as the service\'s reason, the button greyed (§5.2)', () => {
    expect(view('P8b').note).toEqual({ text: 'API Key 已失效', tone: 'alert', settings: true })
    expect(view('P8b').primary.disabled).toBe(true)
  })

  it('P6b the key made good while the page runs on the free service: P13\'s pair offers the way back, with the key, which retranslates too (the retranslate cue)', () => {
    const v = view('P6b')
    expect(v.note).toBeNull()
    expect(v.service).toEqual({ value: 'Google 翻译', replaced: 'deepseek-v4-flash' })
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: false, shortcut: '⌥T' })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore' })
    const id = input('P6b').config!.services[0]!.id
    // the refusal still recorded, or the chain a start would run on still passing the service over (a 403: `auth`,
    // never recorded): P6 as it was
    expect(derivePopupView({ ...input('P6b'), rejected: [id] }).primary.action).toBe('restore')
    expect(derivePopupView({ ...input('P6b'), saved: input('P6').saved }).primary.action).toBe('restore')
    // a demotion that was not the key's (a limit, the network) is no cue: no `auth` entry in `demotions` either,
    // or the key would read as made good from a refusal that was never recorded (the fix below)
    const limited = { ...input('P6b').session!, engine: { id: 'google-web', demoted: { id, kind: 'rate-limit' as const, message: '429' } }, demotions: [{ id, kind: 'rate-limit' as const }] }
    expect(derivePopupView({ ...input('P6b'), session: limited }).primary.action).toBe('restore')
  })

  it('two hand-overs — the key refused, then a transient failure of the free engine that took over — still cue once the key is good: `engine.demoted` names only the second hand-over, but `demotions` still holds the key\'s (Opus\'s review of Task 33)', () => {
    const id = input('P6b').config!.services[0]!.id
    const twoHandovers = {
      ...input('P6b').session!,
      // Microsoft, tried next on the chain, failed transiently and handed over to Google — the most recent
      // hand-over, and the one `engine.demoted` alone would show
      engine: { id: 'google-web', demoted: { id: 'microsoft', kind: 'rate-limit' as const, message: '429' } },
      // both hand-overs still in force: the key's refusal is no longer the latest, but it never healed on its own
      demotions: [{ id, kind: 'auth' as const }, { id: 'microsoft', kind: 'rate-limit' as const }],
    }
    const v = derivePopupView({ ...input('P6b'), session: twoHandovers })
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: false, shortcut: '⌥T' })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore' })
  })

  it('lang: the reader\'s languages in their own, and the style rows\' sample in its; the full list names each in the interface\'s language first', () => {
    expect(derivePopupView({ ...input('PR'), menu: 'language' }).menus!.language.items.map(i => [i.id, i.lang])).toContainEqual(['jpn', 'ja'])
    expect(view('P16').menus!.style!.items.filter(i => !i.manage).every(i => i.lang === 'zh-CN')).toBe(true)
    expect(view('P3').menus!.language.items.every(i => i.lang === undefined)).toBe(true)
  })

  it('an entry page shows nothing of a translated page; the reader keeps the display and the switches, not the styles', () => {
    expect([view('P17').style, view('P17').menus?.style]).toEqual([null, null])
    expect([view('PR').kind, view('PR').style, view('PR').menus?.style]).toEqual(['reader', null, null])
  })
})

describe('P0 and the moments before it (the redesign\'s design, §5.4)', () => {
  it('before the first answer the brand row alone; an arXiv paper\'s page still silent is loading; anything else is P0', () => {
    expect(view('PW').kind).toBe('pending')
    expect(view('PL').kind).toBe('loading')
    expect(view('P0').kind).toBe('find')
    // a paper's page asked no more (it never answered), and another page while asking: both P0
    expect(derivePopupView({ ...input('PL'), tab: { url: input('PL').tab!.url, asking: false } }).kind).toBe('find')
    expect(derivePopupView({ ...input('PL'), tab: { url: 'https://arxiv.org/list/cs.CL/recent', asking: true } }).kind).toBe('find')
  })

  it('an entry page (or the reader) that has already answered shows its entries, not loading, however the tab poll still reads: `entry` answers the question `tab.asking` is still asking (Opus\'s review of Task 33)', () => {
    expect(derivePopupView({ ...input('P17'), tab: { url: 'https://arxiv.org/abs/2501.07202v1', asking: true } }).kind).toBe('entry')
    expect(derivePopupView({ ...input('PR'), tab: { url: 'https://arxiv.org/pdf/2501.07202v1', asking: true } }).kind).toBe('reader')
  })

  it('an entry page or the reader that has answered before the settings have loaded is loading, not P0\'s search (a paper\'s page must not show P0)', () => {
    expect(derivePopupView({ ...input('P17'), config: null }).kind).toBe('loading')
    expect(derivePopupView({ ...input('PR'), config: null }).kind).toBe('loading')
  })

  it('an empty field has nothing under it but the help line; what is typed says what Enter will do', () => {
    expect(view('P0').find).toEqual({ query: '', found: null })
    expect(view('P0a').find?.found).toEqual({ kind: 'search', label: '在 arXiv 搜索「attention is all you need」', href: searchUrl('attention is all you need') })
    expect(view('P0b').find?.found).toEqual({ kind: 'open', format: 'pdf', label: 'PDF 翻译', paper: 'arXiv 2501.07202v1', href: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' })
    expect(view('P0c').find?.found).toMatchObject({ kind: 'open', format: 'html', label: 'HTML 翻译', paper: 'arXiv 2501.07202v1', href: 'https://arxiv.org/html/2501.07202v1#readarxiv' })
    expect(view('P0g').find?.found).toEqual({ kind: 'elsewhere', text: '只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。' })
  })

  it('a paper named: its line at once, its two entries once both checks are back, a greyed one said as P17 says it', () => {
    expect(view('P0d').find?.found).toEqual({ kind: 'paper', paper: 'arXiv 2501.07202v1', entries: null, note: null })
    expect(view('P0e').find?.found).toMatchObject({ entries: { html: { label: 'HTML 翻译', href: 'https://arxiv.org/html/2501.07202v1#readarxiv' }, pdf: { label: 'PDF 翻译', href: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' } }, note: null })
    // the note's tone is P17's own (noHtmlNote): info here, its PDF entry beside it still working (Task 36's fix, carried from Task 33's review)
    expect(view('P0f').find?.found).toMatchObject({ entries: { html: { href: null } }, note: { text: 'arXiv 没有这篇论文的 HTML 版本', tone: 'info' } })
    // an answer about another paper is not this one's
    expect(derivePopupView({ ...input('P0e'), find: { ...input('P0e').find, query: 'hep-th/9711200' } }).find?.found).toMatchObject({ entries: null })
  })

  it('P0\'s two entries are P17\'s (the design\'s §5.4): greyed too when the chosen service cannot run, not only when arXiv has no HTML version — otherwise P0 opens a translation bound to fail', () => {
    // An id naming nothing (the reader's own service deleted from another tab) and no fallback to take over
    const unrunnable = { ...input('P0e'), config: { ...input('P0e').config!, provider: 'svc-gone0000' } }
    expect(derivePopupView(unrunnable).find?.found).toMatchObject({ entries: { html: { href: null }, pdf: { href: null } } })
    // the settings not read yet is not a reason to grey what the checks already cleared
    expect(derivePopupView({ ...input('P0e'), config: null }).find?.found).toMatchObject({ entries: { html: { href: 'https://arxiv.org/html/2501.07202v1#readarxiv' } } })
  })

  it('P0\'s greyed entries say why as P17b does: the service\'s reason, alert, with the settings button — before the HTML version\'s absence, which would imply a working PDF entry (the final review, A-I1)', () => {
    // P8b's settings (a refused key, nothing to take over) put under P0e / P0f; P17 under them says the same
    const { config, rejected, saved } = input('P8b')
    const refused = (id: string) => ({ ...input(id), config, rejected, saved })
    const reason = { text: S.note.cannotRun(S.note.llmRejected), tone: 'alert', settings: true }
    expect(derivePopupView({ ...input('P17'), config, rejected, saved }).note).toEqual(reason)
    expect(derivePopupView(refused('P0e')).find?.found).toMatchObject({ entries: { html: { href: null }, pdf: { href: null } }, note: reason })
    // no HTML version, and a PDF entry greyed beside it: S-P-33a ("the PDF entry works") is not said
    expect(derivePopupView(refused('P0f')).find?.found).toMatchObject({ entries: { html: { href: null }, pdf: { href: null } }, note: reason })
    // nothing said before the checks are back: the entries and their note arrive together
    expect(derivePopupView(refused('P0d')).find?.found).toMatchObject({ entries: null, note: null })
    // a fallback takes over: the entries work, and P0f's own line stands
    expect(derivePopupView({ ...refused('P0f'), saved: input('P7b').saved }).find?.found).toMatchObject({ entries: { pdf: { href: 'https://arxiv.org/pdf/hep-th/9711200#readarxiv' } }, note: { text: S.note.noHtmlVersion, tone: 'info', settings: false } })
  })
})

