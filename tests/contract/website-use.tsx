// The website's use of what it imports (CLAUDE.md hard rule 7), held at compile time: `pnpm typecheck` compiles this file,
// and nothing runs it. website-imports.test.ts holds that every path the website imports resolves and exports every name
// it takes; a module can do that and still have changed what a call passes or gets back (5a.4 changed createController's
// arguments and the state's shape at the same path), and the website, which types the pin by its own declarations
// (readarxiv-web types/vendor.d.ts) and never compiles these sources, would build and break at run time. So each call
// below is the website's, made here against this tree: its arguments in the website's shapes, the members it reads of
// what comes back. A comment names the website's file and line (readarxiv-web c4e17876; its `@vendor/<path>` is `@/<path>`
// here). Where the website's value has a type of its own, the stand-in says so. A call is removed only when the website
// stops making it, as a path or a name is removed from website-imports.test.ts.
import { ArrowLeftRight, ChevronDown, type IconNode, Minus, PanelLeft, X } from 'lucide'
import { type RefObject, useMemo, useRef } from 'react'
import { BUILT_IN_HIGHLIGHTS, DEFAULT_APPEARANCE, HL_OPACITY_MAX, HL_OPACITY_MIN, lookOf } from '@/config/appearance'
import type { Config } from '@/config/schema'
import { appearanceRule } from '@/core/renderer/style-preset'
import { RULES_VERSION } from '@/core/rules/latexml'
import { LOCALE_CODES, LOCALES, pickLocale } from '@/locales'
import { createController, INITIAL, type ReaderController, type ReaderState, reduce, type Session, type Side } from '@/pdf-reader/controller'
import { readerRuns } from '@/pdf-reader/support'
import { type Appearance, applyAppearance, dimmed, themeOf, withoutTransitions } from '@/pdf-reader/ui/appearance'
import { Capsule } from '@/pdf-reader/ui/Capsule'
import { type CapsuleWords, words as interned } from '@/pdf-reader/ui/capsule-words'
import { DisplaySwitch } from '@/pdf-reader/ui/DisplaySwitch'
import { linkNameOf } from '@/pdf-reader/ui/link-names'
import { LanguageMenu, ZoomMenu } from '@/pdf-reader/ui/Menus'
import { Outline } from '@/pdf-reader/ui/Outline'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { PaperTitle } from '@/pdf-reader/ui/PaperTitle'
import { usePinch } from '@/pdf-reader/ui/pinch'
import { ProgressLine } from '@/pdf-reader/ui/ProgressLine'
import { useScrollShow } from '@/pdf-reader/ui/scroll-show'
import { ScrollIndicator } from '@/pdf-reader/ui/ScrollIndicator'
import { useSettingsLock } from '@/pdf-reader/ui/settings-lock'
import { capsuleOf, cardOf, lineOf, spokenOf } from '@/pdf-reader/ui/status'
import { NARROW_MS, useTimedLeave } from '@/pdf-reader/ui/StatusCapsule'
import { ToolbarButton } from '@/pdf-reader/ui/ToolbarButton'
import { useReader } from '@/pdf-reader/ui/use-reader'
import { createGoogleWebProvider } from '@/providers/google-web'
import { createMicrosoftProvider, supportsTarget } from '@/providers/microsoft'
import { getRequestErrorMeta, RATE_LIMIT_BASE_PAUSE_MS } from '@/providers/request/retry-policy'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { trackModality } from '@/ui/controls/modality'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { radioKeys } from '@/ui/controls/radio'
import { Switch } from '@/ui/controls/Switch'
import { useTip } from '@/ui/controls/tip'
import { useMenuNav } from '@/ui/menu-nav'
import { languageName, profileName, R, S, setLocale } from '@/ui/strings'

/** the website's controller: the pin's, with what the web keeps beside it (web/src/reader/controller.ts:48 WebController) */
type WebController = ReaderController & { web: { getState(): { drawn: boolean } } }
/** the website's preferences (web/src/settings.ts WebConfig): its own type, by the field names of the pin's Config the pin's
 *  interface reads (types/vendor.d.ts ReaderPrefs); stood for here by the pin's Config */
declare const prefs: () => Config
/** the website's session (web/src/session/run.mjs), opened on the pin's host */
declare const openSession: (host: { left: HTMLElement; right: HTMLElement; params: URLSearchParams }) => Promise<Session>

/** a target no change would set (web/src/reader/controller.ts:107) */
const NO_TARGET: string = '\0'
/** web/src/reader/controller.ts:177 createWebController: the pin's controller made, and two of its commands taken over */
export function websiteController(params: URLSearchParams): WebController {
  const base = createController({
    params,
    reading: { config: prefs(), fallbackReason: null },
    open: async host => {
      // :181 the session's events told the pin's state through the host
      host.emit({ type: 'opened' })
      const session = await openSession({ ...host })
      // :70 held: the translation's bytes, or a rejection where there are none
      return { ...session, pdfBytes: async which => (await session.pdfBytes(which)) ?? Promise.reject(new Error(`no ${which} PDF to save`)) }
    },
  })
  // :187 a session that could not be opened told as a crash, the pin's attach kept
  const attach = base.attach
  base.attach = panes => attach(panes).catch((e: unknown) => Promise.reject(e))
  // :197 a target picked is the page's: every other change the session's
  const patch = base.patchSettings
  base.patchSettings = change => {
    const now = base.getState().settings ?? prefs()
    const picked: string = change({ ...now, targetLanguage: NO_TARGET as Config['targetLanguage'] }).targetLanguage
    if (picked !== NO_TARGET) return
    patch(change)
  }
  return Object.assign(base, { web: { getState: () => ({ drawn: false }) } })
}

/** web/src/reader/App.tsx: the page, its panes and its appearance */
export function WebsiteApp({ controller, contents }: { controller: WebController; contents: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  // :39
  const state = useReader(controller, s => ({ appearance: s.settings?.theme, dimPages: s.settings?.pdfReader.dimPages, swapped: s.settings?.pdfReader.swapped ?? false, title: s.paper.title }))
  const doc = useRef<HTMLElement>(null)
  // :43
  usePinch(controller, doc)
  // :48
  controller.setNarrow(true)
  // :55
  if (left.current && right.current) void controller.attach({ left: left.current, right: right.current }).then(session => session.retry())
  const appearance: Appearance | undefined = state.appearance
  // :140, :147 (useAppearance)
  withoutTransitions(document, () => undefined)
  if (appearance) applyAppearance(document.documentElement, { theme: themeOf(appearance), dim: dimmed(appearance, true, state.dimPages ?? true) }, true)
  // :87
  return <Outline controller={controller} open={contents} />
}

/** web/src/reader/App.tsx:113 Pane: one side, its pill and its scroll indicator */
export function WebsitePane({ controller, side }: { controller: WebController; side: Side }) {
  const section = useRef<HTMLElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const targets = useMemo<[RefObject<HTMLElement | null>, number][]>(() => [[pill, 2500], [indicator, 900]], [])
  // :118
  useScrollShow(section, targets)
  // :120
  const empty = useReader(controller, s => s.sides[side].pages === 0)
  return (
    <section ref={section} data-axt-empty={empty || undefined}>
      {/* :127, :128 */}
      <PagePill ref={pill} controller={controller} side={side} />
      <ScrollIndicator ref={indicator} controller={controller} side={side} />
    </section>
  )
}

/** web/src/reader/Toolbar.tsx:57 PaperBar, the bar */
export function WebsiteToolbar({ controller, contents, onContents }: { controller: WebController; contents: boolean; onContents: () => void }) {
  // :58
  const state = useReader(controller, s => ({ swapped: s.settings?.pdfReader.swapped ?? false, display: s.display, narrow: s.narrow, paper: s.paper, available: s.available, languageSupported: s.languageSupported, sync: s.sync }))
  // :67
  const lock = useSettingsLock(controller)
  return (
    <div>
      {/* :72 */}
      <ToolbarButton label={R.contents} aria-expanded={contents} aria-controls="axt-contents" onClick={onContents}>
        <Icon node={PanelLeft} />
      </ToolbarButton>
      {/* :76 */}
      <PaperTitle key={state.paper.id} id={state.paper.id} title={state.paper.title} />
      {/* :81 */}
      <DisplaySwitch value={state.narrow && state.display === 'bilingual' ? 'translation' : state.display} translatable={state.available && state.languageSupported} off={state.narrow ? ['bilingual'] : undefined} onChange={controller.setDisplay} />
      {/* :84 */}
      <ToolbarButton label={R.swap} pressed={state.swapped} disabled={lock.locked} why={lock.why} data-side-by-side onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, swapped: !c.pdfReader.swapped } }))}>
        <Icon node={ArrowLeftRight} />
      </ToolbarButton>
      {/* :88 */}
      <ToolbarButton label={R.sync} pressed={state.sync} data-side-by-side onClick={() => controller.setSync(!state.sync)} />
      {/* :93 */}
      <ToolbarButton label={R.zoom.out} hint="⌘ −" keys="Meta+-" onClick={() => controller.zoomBy(1 / 1.1)} className="!w-[26px] !min-w-[26px]">
        <Icon node={Minus} />
      </ToolbarButton>
      {/* :96, :102 */}
      <ZoomMenu controller={controller} />
      <LanguageMenu controller={controller} name="language" />
      {/* :107 */}
      <ProgressLine controller={controller} />
      {/* :97 */}
      <ToolbarButton label={R.zoom.in} onClick={() => controller.zoomBy(1.1)} />
    </div>
  )
}

const APPEARANCES = ['light', 'dark', 'system'] as const
/** web/src/reader/ReadingOptions.tsx ReadingOptions, and the rows beside it (ClassToggles.tsx, OptionsLead.tsx) */
export function WebsiteReadingOptions({ controller }: { controller: WebController }) {
  // :42 (ClassToggles.tsx:30, NotFound.tsx:168 the same)
  const config = useReader(controller, s => s.settings) ?? prefs()
  // :43 (ClassToggles.tsx:31)
  const lock = useSettingsLock(controller)
  // :44
  const pop = usePopover('dialog', 'options')
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  // :49
  const setAppearance = (a: (typeof APPEARANCES)[number]) => controller.patchSettings(c => ({ ...c, theme: a }))
  // :104 (HomeLink.tsx:14, NotFound.tsx:55 with a label alone)
  const { props, tip } = useTip(R.options.name, lock.why)
  return (
    <>
      {/* :52 */}
      <ToolbarButton label={R.options.name} anchor={pop.anchor} {...pop.trigger} {...props} />
      {tip}
      {/* :55 */}
      <Popover {...pop.popover} role="dialog" label={R.options.name}>
        {/* :65 */}
        <Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} disabled={lock.locked} why={lock.why} onChange={on => controller.patchSettings(c => ({ ...c, reading: { ...c.reading, sentenceHighlight: on } }))} />
        {/* :71, :72 */}
        {config.appearance.highlights.map(h => (
          <button key={h.id} type="button" title={profileName(h, 'highlights')} onClick={() => controller.patchSettings(c => ({ ...c, appearance: { ...c.appearance, activeHighlight: h.id } }))} />
        ))}
        {/* :85 */}
        <div role="radiogroup" onKeyDown={radioKeys(APPEARANCES, config.theme, () => true, setAppearance, i => radios.current[i]?.focus())} />
        {/* :95 */}
        <Switch label={R.options.dim} checked={config.pdfReader.dimPages} onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, dimPages: on } }))} />
        {/* OptionsLead.tsx:28 */}
        <LanguageMenu controller={controller} name="options-language" />
      </Popover>
    </>
  )
}

/** web/src/reader/StatusCapsule.tsx: the web's capsule, over the pin's words and the pin's capsule where it has none of its own */
export function WebsiteCapsule({ controller, icon, words }: { controller: WebController; icon: IconNode | 'spinner'; words: CapsuleWords }) {
  // :86
  const pane = useReader(controller, s => ({ narrow: s.narrow, display: s.display, pages: Math.max(s.sides.left.pages, s.sides.right.pages) }))
  // :95, :96
  const pin = useReader(controller, s => capsuleOf(s, { noticeClosed: false, narrowShown: pane.narrow, refusalsSeen: 0 }))
  const said: string = useReader(controller, spokenOf)
  // :117
  const linger = useTimedLeave(pin?.kind === 'narrow', NARROW_MS, () => undefined)
  return (
    // :132
    <Capsule key={pin?.kind} kind={pin?.kind as string} icon={icon} words={interned(pin?.words ?? words)} wordsId="w" spoken={said} data-tone="alert" alone={true} out={false} afterKey="a"
      after={
        <>
          {/* :145, :149, :150 */}
          <button type="button" aria-label={R.status.close}><Icon node={X} size={13} /></button>
          <button type="button" onClick={() => controller.setDisplay('translation')}>{R.status.chooseLanguage}</button>
          <button type="button" onClick={controller.retry}>{S.failed.retry}</button>
        </>
      }
      {...linger} />
  )
}

/** web/src/reader/ShareMenu.tsx and UiLanguageMenu.tsx: the menus the web draws with the pin's list and its keys */
export function WebsiteMenus({ controller }: { controller: WebController }) {
  // ShareMenu.tsx:44
  const ready = useReader(controller, s => s.download === 'translation')
  // ShareMenu.tsx:48 (UiLanguageMenu.tsx:36, NotFound.tsx:100)
  const pop = usePopover('menu', 'share')
  // ShareMenu.tsx:92
  const nav = useMenuNav({ count: 2, initial: 0, isDisabled: () => false, labelOf: i => String(i), onPick: i => void i, onClose: () => undefined })
  // attribution.tsx:21, view.ts:77
  const id = useReader(controller, s => s.paper.id)
  // attribution.tsx:53
  const link = useTip(id || R.abstract, id ? R.abstract : undefined)
  // UiLanguageMenu.tsx:38
  const items = LOCALE_CODES.map(code => ({ id: code, name: code, lang: code, checked: code === 'en' }))
  return (
    <>
      {/* ShareMenu.tsx:78 (UiLanguageMenu.tsx:42) */}
      <ToolbarButton label={R.options.name} value="English" valueLang="en" anchor={pop.anchor} {...pop.trigger} data-wide={ready || undefined} className="menu-btn" {...link.props}>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      {/* ShareMenu.tsx:81 (UiLanguageMenu.tsx:45) */}
      <Popover {...pop.popover} role="menu" label={R.options.name} className="axt-small-menu">
        {/* UiLanguageMenu.tsx:46 */}
        <MenuList key={pop.generation} kind="radios" label={R.options.name} items={items} onClose={() => undefined} onPick={code => void code} />
        <div role="menu" tabIndex={0} aria-activedescendant={nav.activeId} onKeyDown={nav.onKeyDown} id={nav.idOf(nav.active)} onMouseEnter={() => nav.setActive(0)} />
      </Popover>
    </>
  )
}

/** the rest of the reader's calls: its keys, its view, its entry, its cards, its session and its words */
export async function websiteReader(controller: WebController, ui: (typeof LOCALE_CODES)[number]) {
  // keys.ts:12
  controller.zoomTo('page-width')
  // view.ts:88, :92
  const off = controller.subscribe(() => undefined)
  const s: ReaderState = controller.getState()
  // cards.tsx:35
  controller.retry()
  // ShareMenu.tsx:58, :66
  await controller.download('translation').catch((e: unknown) => e)
  // main.tsx:54, :55, :206
  const chosen = pickLocale(undefined, navigator.languages)
  setLocale(chosen)
  const untrack: () => void = trackModality()
  // words.ts:370 wordsFor: a pack read without swapping the locale
  const pin = LOCALES[ui]
  const words: string[] = [pin.R.status.useHtml, pin.S.failed.retry, pin.REASON.unknown, pin.R.status.translating]
  // run.mjs:156 the view's words
  const view: { pageName: (side: 'left' | 'right', n: number) => string; sideName: (side: 'left' | 'right') => string; linkName: (to: { url: string } | { internal: true }) => string } = {
    pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n),
    sideName: side => R.display[side === 'left' ? 'original' : 'translation'],
    linkName: linkNameOf,
  }
  // pdfjs.ts:51
  const build = readerRuns(globalThis) ? 'modern' : 'legacy'
  // the words the web's bar and its cards read (types/vendor.d.ts @vendor/ui/strings)
  const read: string[] = [R.status.noPdf, R.status.useHtml, R.status.translating, S.rows.language, R.options.color, R.options.appearance, R.options.light, R.options.dark, R.options.system]
  // web/tests/seams.test.ts:62
  const names = ['jpn', 'cmn-Hant', 'deu'].map(code => languageName(code as Parameters<typeof languageName>[0]))
  off()
  untrack()
  return { s, words, view, build, read, names }
}

/** the website's tests of the pin's state and words (web/tests/controller.test.ts, swaps.test.ts, run.test.ts, first-paint.test.ts) */
export function websiteStateTests(): unknown[] {
  // controller.test.ts:211, :212; swaps.test.ts:162, :188
  const open = reduce({ ...INITIAL, display: 'bilingual' as const }, { type: 'opened' })
  const laid = reduce(reduce(open, { type: 'layer', state: 'open', laid: 1, total: 4 }), { type: 'translated', got: 1, total: 1, lost: 0, stopped: null })
  // controller.test.ts:193, :196, :217
  const action = cardOf(reduce(INITIAL, { type: 'fail', event: 'service', text: '', kind: 'network' }))?.action
  const none = cardOf(reduce(INITIAL, { type: 'unavailable', why: 'refused', retryAt: null }))
  const shown = reduce(laid, { type: 'display', mode: 'original' })
  // swaps.test.ts:176, run.test.ts:926
  const line: { on: boolean; value: number } = lineOf(shown)
  // run.test.ts:924, :925
  let st: ReturnType<typeof reduce> = { ...INITIAL, display: 'bilingual' }
  st = reduce(st, { type: 'page', side: 'left', page: 1, pages: 6 })
  // first-paint.test.ts:16
  const look = [dimmed('dark', false, true), themeOf('system')]
  return [action, none, line, st.phase, st.laying, look]
}

/** the website's tests of the pin's appearance and versions (web/tests/highlights.test.ts, tests/vendor-engine.test.ts) */
export function websiteAppearanceTests(): unknown[] {
  // highlights.test.ts:9, :12, :18, :26
  const keys = BUILT_IN_HIGHLIGHTS.map(h => Object.keys(h).sort())
  const rule: string = appearanceRule(lookOf({ appearance: { ...DEFAULT_APPEARANCE, activeHighlight: DEFAULT_APPEARANCE.activeHighlight } }))
  const bounds = [HL_OPACITY_MIN * 100, HL_OPACITY_MAX * 100]
  // vendor-engine.test.ts:24
  const rules: string = RULES_VERSION
  return [keys, rule, bounds, rules]
}

/** the Worker's machine translation (worker/src/mt/chain.ts, gate.ts, ramp.ts; worker/tests/targets-pin.test.ts) */
export async function websiteWorker(iso: string, f: typeof fetch, signal: AbortSignal): Promise<unknown[]> {
  // chain.ts:245, ramp.ts:118
  const microsoft = createMicrosoftProvider(iso, { fetch: f })
  const google = createGoogleWebProvider({ fetch: f })
  // gate.ts:16, :17
  const cap: number = (createGoogleWebProvider().maxConcurrent ?? 2) + (createMicrosoftProvider('cmn').maxConcurrent ?? 2)
  // chain.ts:246, :257; ramp.ts:126
  const segments = (await google.isAvailable()) ? (await microsoft.translate({ segments: [{ id: '0', text: 'a' }], source: 'en', target: iso, signal })).segments : []
  const texts: string[] = segments.map(s => s.text)
  // chain.ts:123, :192; ramp.ts:132
  const pause: number = getRequestErrorMeta(new Error('429')).retryAfterMs ?? RATE_LIMIT_BASE_PAUSE_MS
  // targets-pin.test.ts:15
  const served: boolean = supportsTarget(iso)
  return [cap, texts, pause, served]
}
