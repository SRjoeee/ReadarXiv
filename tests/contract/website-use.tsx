// The website's use of what it imports (CLAUDE.md hard rule 7), held at compile time: `pnpm typecheck` compiles this file,
// and nothing runs it. website-imports.test.ts holds that every path the website imports resolves and exports every name
// it takes; a module can do that and still have changed what a call passes or gets back (5a.4 changed createController's
// arguments and the state's shape at the same path), and the website, which types the pin by its own declarations
// and never compiles these sources, would build and break at run time. So each call
// below is the website's, made here against this tree: its arguments in the website's shapes, the members it reads of
// what comes back. A comment names the part of the website that makes the call (its `@vendor/<path>` is `@/<path>`
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

/** the website's controller: the pin's, with what the web keeps beside it */
type WebController = ReaderController & { web: { getState(): { drawn: boolean } } }
/** the website's preferences: its own type, by the field names of the pin's Config the pin's interface reads (its
 *  declaration of the reader's preferences); stood for here by the pin's Config */
declare const prefs: () => Config
/** the website's session, opened on the pin's host */
declare const openSession: (host: { left: HTMLElement; right: HTMLElement; params: URLSearchParams }) => Promise<Session>

/** a target no change would set (the website's controller's) */
const NO_TARGET: string = '\0'
/** the website's controller made: the pin's controller, and two of its commands taken over */
export function websiteController(params: URLSearchParams): WebController {
  const base = createController({
    params,
    reading: { config: prefs(), fallbackReason: null },
    open: async host => {
      // the session's events told the pin's state through the host
      host.emit({ type: 'opened' })
      const session = await openSession({ ...host })
      // held: the translation's bytes, or a rejection where there are none
      return { ...session, pdfBytes: async which => (await session.pdfBytes(which)) ?? Promise.reject(new Error(`no ${which} PDF to save`)) }
    },
  })
  // a session that could not be opened told as a crash, the pin's attach kept
  const attach = base.attach
  base.attach = panes => attach(panes).catch((e: unknown) => Promise.reject(e))
  // a target picked is the page's: every other change the session's
  const patch = base.patchSettings
  base.patchSettings = change => {
    const now = base.getState().settings ?? prefs()
    const picked: string = change({ ...now, targetLanguage: NO_TARGET as Config['targetLanguage'] }).targetLanguage
    if (picked !== NO_TARGET) return
    patch(change)
  }
  return Object.assign(base, { web: { getState: () => ({ drawn: false }) } })
}

/** the website's reader page: the page, its panes and its appearance */
export function WebsiteApp({ controller, contents }: { controller: WebController; contents: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const state = useReader(controller, s => ({ appearance: s.settings?.theme, dimPages: s.settings?.pdfReader.dimPages, swapped: s.settings?.pdfReader.swapped ?? false, title: s.paper.title }))
  const doc = useRef<HTMLElement>(null)
  usePinch(controller, doc)
  controller.setNarrow(true)
  if (left.current && right.current) void controller.attach({ left: left.current, right: right.current }).then(session => session.retry())
  const appearance: Appearance | undefined = state.appearance
  // (its appearance)
  withoutTransitions(document, () => undefined)
  if (appearance) applyAppearance(document.documentElement, { theme: themeOf(appearance), dim: dimmed(appearance, true, state.dimPages ?? true) }, true)
  return <Outline controller={controller} open={contents} />
}

/** the website's pane: one side, its pill and its scroll indicator */
export function WebsitePane({ controller, side }: { controller: WebController; side: Side }) {
  const section = useRef<HTMLElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const targets = useMemo<[RefObject<HTMLElement | null>, number][]>(() => [[pill, 2500], [indicator, 900]], [])
  useScrollShow(section, targets)
  const empty = useReader(controller, s => s.sides[side].pages === 0)
  return (
    <section ref={section} data-axt-empty={empty || undefined}>
      <PagePill ref={pill} controller={controller} side={side} />
      <ScrollIndicator ref={indicator} controller={controller} side={side} />
    </section>
  )
}

/** the website's paper bar */
export function WebsiteToolbar({ controller, contents, onContents }: { controller: WebController; contents: boolean; onContents: () => void }) {
  const state = useReader(controller, s => ({ swapped: s.settings?.pdfReader.swapped ?? false, display: s.display, narrow: s.narrow, paper: s.paper, available: s.available, languageSupported: s.languageSupported, sync: s.sync }))
  const lock = useSettingsLock(controller)
  return (
    <div>
      <ToolbarButton label={R.contents} aria-expanded={contents} aria-controls="axt-contents" onClick={onContents}>
        <Icon node={PanelLeft} />
      </ToolbarButton>
      <PaperTitle key={state.paper.id} id={state.paper.id} title={state.paper.title} />
      <DisplaySwitch value={state.narrow && state.display === 'bilingual' ? 'translation' : state.display} translatable={state.available && state.languageSupported} off={state.narrow ? ['bilingual'] : undefined} onChange={controller.setDisplay} />
      <ToolbarButton label={R.swap} pressed={state.swapped} disabled={lock.locked} why={lock.why} data-side-by-side onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, swapped: !c.pdfReader.swapped } }))}>
        <Icon node={ArrowLeftRight} />
      </ToolbarButton>
      <ToolbarButton label={R.sync} pressed={state.sync} data-side-by-side onClick={() => controller.setSync(!state.sync)} />
      <ToolbarButton label={R.zoom.out} hint="⌘ −" keys="Meta+-" onClick={() => controller.zoomBy(1 / 1.1)} className="!w-[26px] !min-w-[26px]">
        <Icon node={Minus} />
      </ToolbarButton>
      <ZoomMenu controller={controller} />
      <LanguageMenu controller={controller} name="language" />
      <ProgressLine controller={controller} />
      <ToolbarButton label={R.zoom.in} onClick={() => controller.zoomBy(1.1)} />
    </div>
  )
}

const APPEARANCES = ['light', 'dark', 'system'] as const
/** the website's reading options, and the rows beside them (its class toggles, the options' lead) */
export function WebsiteReadingOptions({ controller }: { controller: WebController }) {
  // (its class toggles and its not-found page the same)
  const config = useReader(controller, s => s.settings) ?? prefs()
  // (its class toggles the same)
  const lock = useSettingsLock(controller)
  const pop = usePopover('dialog', 'options')
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  const setAppearance = (a: (typeof APPEARANCES)[number]) => controller.patchSettings(c => ({ ...c, theme: a }))
  // (its home link and its not-found page with a label alone)
  const { props, tip } = useTip(R.options.name, lock.why)
  return (
    <>
      <ToolbarButton label={R.options.name} anchor={pop.anchor} {...pop.trigger} {...props} />
      {tip}
      <Popover {...pop.popover} role="dialog" label={R.options.name}>
        <Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} disabled={lock.locked} why={lock.why} onChange={on => controller.patchSettings(c => ({ ...c, reading: { ...c.reading, sentenceHighlight: on } }))} />
        {config.appearance.highlights.map(h => (
          <button key={h.id} type="button" title={profileName(h, 'highlights')} onClick={() => controller.patchSettings(c => ({ ...c, appearance: { ...c.appearance, activeHighlight: h.id } }))} />
        ))}
        <div role="radiogroup" onKeyDown={radioKeys(APPEARANCES, config.theme, () => true, setAppearance, i => radios.current[i]?.focus())} />
        <Switch label={R.options.dim} checked={config.pdfReader.dimPages} onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, dimPages: on } }))} />
        {/* the options' lead */}
        <LanguageMenu controller={controller} name="options-language" />
      </Popover>
    </>
  )
}

/** the website's status capsule, over the pin's words and the pin's capsule where it has none of its own */
export function WebsiteCapsule({ controller, icon, words }: { controller: WebController; icon: IconNode | 'spinner'; words: CapsuleWords }) {
  const pane = useReader(controller, s => ({ narrow: s.narrow, display: s.display, pages: Math.max(s.sides.left.pages, s.sides.right.pages) }))
  const pin = useReader(controller, s => capsuleOf(s, { noticeClosed: false, narrowShown: pane.narrow, refusalsSeen: 0 }))
  const said: string = useReader(controller, spokenOf)
  const linger = useTimedLeave(pin?.kind === 'narrow', NARROW_MS, () => undefined)
  return (
    <Capsule key={pin?.kind} kind={pin?.kind as string} icon={icon} words={interned(pin?.words ?? words)} wordsId="w" spoken={said} data-tone="alert" alone={true} out={false} afterKey="a"
      after={
        <>
          <button type="button" aria-label={R.status.close}><Icon node={X} size={13} /></button>
          <button type="button" onClick={() => controller.setDisplay('translation')}>{R.status.chooseLanguage}</button>
          <button type="button" onClick={controller.retry}>{S.failed.retry}</button>
        </>
      }
      {...linger} />
  )
}

/** the website's share menu and its interface-language menu: the menus the web draws with the pin's list and its keys */
export function WebsiteMenus({ controller }: { controller: WebController }) {
  // (the share menu)
  const ready = useReader(controller, s => s.download === 'translation')
  // (the share menu; the language menu and the not-found page the same)
  const pop = usePopover('menu', 'share')
  // (the share menu)
  const nav = useMenuNav({ count: 2, initial: 0, isDisabled: () => false, labelOf: i => String(i), onPick: i => void i, onClose: () => undefined })
  // (the attribution line and the view)
  const id = useReader(controller, s => s.paper.id)
  // (the attribution line)
  const link = useTip(id || R.abstract, id ? R.abstract : undefined)
  // (the language menu)
  const items = LOCALE_CODES.map(code => ({ id: code, name: code, lang: code, checked: code === 'en' }))
  return (
    <>
      {/* the share menu (the language menu the same) */}
      <ToolbarButton label={R.options.name} value="English" valueLang="en" anchor={pop.anchor} {...pop.trigger} data-wide={ready || undefined} className="menu-btn" {...link.props}>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      {/* the share menu (the language menu the same) */}
      <Popover {...pop.popover} role="menu" label={R.options.name} className="axt-small-menu">
        {/* the language menu */}
        <MenuList key={pop.generation} kind="radios" label={R.options.name} items={items} onClose={() => undefined} onPick={code => void code} />
        <div role="menu" tabIndex={0} aria-activedescendant={nav.activeId} onKeyDown={nav.onKeyDown} id={nav.idOf(nav.active)} onMouseEnter={() => nav.setActive(0)} />
      </Popover>
    </>
  )
}

/** the rest of the reader's calls: its keys, its view, its entry, its cards, its session and its words */
export async function websiteReader(controller: WebController, ui: (typeof LOCALE_CODES)[number]) {
  // (its keys)
  controller.zoomTo('page-width')
  // (its view)
  const off = controller.subscribe(() => undefined)
  const s: ReaderState = controller.getState()
  // (its cards)
  controller.retry()
  // (the share menu)
  await controller.download('translation').catch((e: unknown) => e)
  // (its entry)
  const chosen = pickLocale(undefined, navigator.languages)
  setLocale(chosen)
  const untrack: () => void = trackModality()
  // (its words: a pack read without swapping the locale)
  const pin = LOCALES[ui]
  const words: string[] = [pin.R.status.useHtml, pin.S.failed.retry, pin.REASON.unknown, pin.R.status.translating]
  // (its session: the view's words)
  const view: { pageName: (side: 'left' | 'right', n: number) => string; sideName: (side: 'left' | 'right') => string; linkName: (to: { url: string } | { internal: true }) => string } = {
    pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n),
    sideName: side => R.display[side === 'left' ? 'original' : 'translation'],
    linkName: linkNameOf,
  }
  // (its choice of PDF.js's build)
  const build = readerRuns(globalThis) ? 'modern' : 'legacy'
  // the words the web's bar and its cards read (its declaration of @vendor/ui/strings)
  const read: string[] = [R.status.noPdf, R.status.useHtml, R.status.translating, S.rows.language, R.options.color, R.options.appearance, R.options.light, R.options.dark, R.options.system]
  // (its tests of its seams)
  const names = ['jpn', 'cmn-Hant', 'deu'].map(code => languageName(code as Parameters<typeof languageName>[0]))
  off()
  untrack()
  return { s, words, view, build, read, names }
}

/** the website's tests of the pin's state and words (of its controller, its swaps, its session and its first paint) */
export function websiteStateTests(): unknown[] {
  // (its controller's and its swaps' tests)
  const open = reduce({ ...INITIAL, display: 'bilingual' as const }, { type: 'opened' })
  const laid = reduce(reduce(open, { type: 'layer', state: 'open', laid: 1, total: 4 }), { type: 'translated', got: 1, total: 1, lost: 0, stopped: null })
  // (its controller's tests)
  const action = cardOf(reduce(INITIAL, { type: 'fail', event: 'service', text: '', kind: 'network' }))?.action
  const none = cardOf(reduce(INITIAL, { type: 'unavailable', why: 'refused', retryAt: null }))
  const shown = reduce(laid, { type: 'display', mode: 'original' })
  // (its swaps' and its session's tests)
  const line: { on: boolean; value: number } = lineOf(shown)
  // (its session's tests)
  let st: ReturnType<typeof reduce> = { ...INITIAL, display: 'bilingual' }
  st = reduce(st, { type: 'page', side: 'left', page: 1, pages: 6 })
  // (its first paint's test)
  const look = [dimmed('dark', false, true), themeOf('system')]
  return [action, none, line, st.phase, st.laying, look]
}

/** the website's tests of the pin's appearance and versions (of its highlights and of the pinned engine) */
export function websiteAppearanceTests(): unknown[] {
  // (its highlights' tests)
  const keys = BUILT_IN_HIGHLIGHTS.map(h => Object.keys(h).sort())
  const rule: string = appearanceRule(lookOf({ appearance: { ...DEFAULT_APPEARANCE, activeHighlight: DEFAULT_APPEARANCE.activeHighlight } }))
  const bounds = [HL_OPACITY_MIN * 100, HL_OPACITY_MAX * 100]
  // (its test of the pinned engine)
  const rules: string = RULES_VERSION
  return [keys, rule, bounds, rules]
}

/** the Worker's machine translation (its chain, its pacing gate and its ramp; its test of the targets the pin serves) */
export async function websiteWorker(iso: string, f: typeof fetch, signal: AbortSignal): Promise<unknown[]> {
  // (its chain and its ramp)
  const microsoft = createMicrosoftProvider(iso, { fetch: f })
  const google = createGoogleWebProvider({ fetch: f })
  // (its pacing gate)
  const cap: number = (createGoogleWebProvider().maxConcurrent ?? 2) + (createMicrosoftProvider('cmn').maxConcurrent ?? 2)
  // (its chain and its ramp)
  const segments = (await google.isAvailable()) ? (await microsoft.translate({ segments: [{ id: '0', text: 'a' }], source: 'en', target: iso, signal })).segments : []
  const texts: string[] = segments.map(s => s.text)
  // (its chain and its ramp)
  const pause: number = getRequestErrorMeta(new Error('429')).retryAfterMs ?? RATE_LIMIT_BASE_PAUSE_MS
  // (its test of the targets the pin serves)
  const served: boolean = supportsTarget(iso)
  return [cap, texts, pause, served]
}
