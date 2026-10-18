import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReaderController, Side } from '@/pdf-reader/controller'
import { type Appearance, applyAppearance, dimmed, themeOf, withoutTransitions } from '@/pdf-reader/ui/appearance'
import { FailureCard } from '@/pdf-reader/ui/FailureCard'
import { Outline } from '@/pdf-reader/ui/Outline'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { ScrollIndicator } from '@/pdf-reader/ui/ScrollIndicator'
import { useScrollShow } from '@/pdf-reader/ui/scroll-show'
import { usePinch } from '@/pdf-reader/ui/pinch'
import { cardOf } from '@/pdf-reader/ui/status'
import { StatusCapsule } from '@/pdf-reader/ui/StatusCapsule'
import { Toolbar } from '@/pdf-reader/ui/Toolbar'
import { useReader } from '@/pdf-reader/ui/use-reader'

/**
 * The reader's page (the reader's design, §5): the toolbar, the contents, the document area with its two panes (the
 * engine draws into their scrollers, and owns them), and what floats over them. The panes' ids are the probes' too
 */
export function App({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  // what the page itself shows; each part below takes its own (use-reader.ts)
  const state = useReader(controller, s => ({ appearance: s.settings?.theme, dimPages: s.settings?.pdfReader.dimPages, swapped: s.settings?.pdfReader.swapped ?? false, title: s.paper.title, card: cardOf(s) !== null && !s.noPaper, noPaper: s.noPaper }))
  const doc = useRef<HTMLElement>(null)
  usePinch(controller, doc)
  // a document area under 840 px shows the translation alone in side by side (the design, §5); the session applies it
  useEffect(() => {
    const el = doc.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => { if (entry) controller.setNarrow(entry.contentRect.width < 840) })
    observer.observe(el)
    return () => observer.disconnect()
  }, [controller])
  useLayoutEffect(() => {
    if (!left.current || !right.current) return
    // a session that cannot open is in the controller's state (a failure); nothing is left to catch here
    void controller.attach({ left: left.current, right: right.current }).then(
      session => {
        // the probes' hooks (lab/pdf/spikes): beside the session's own on window.__reader
        Object.assign((window as unknown as { __reader: object }).__reader, { controller, session })
      },
      () => {},
    )
  }, [controller])
  useAppearance(state.appearance, state.dimPages)
  // the contents sidebar, open or not: this visit's, not a setting. The document area moves with it at once, each side
  // refitted once to its new width, and is drawn sliding there by a transform, on the compositor (reader.css .doc)
  const [contents, setContents] = useState(false)
  // the value last drawn: the area slides only when it changes, never as the page mounts — a first-run flag was spent
  // by StrictMode's second run of this effect, and a development build slid the area in on every load (Part 7's final
  // review)
  const drawn = useRef(contents)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.toggleAttribute('data-axt-contents', contents)
    if (drawn.current === contents) return
    drawn.current = contents
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const side = Number.parseFloat(getComputedStyle(root).getPropertyValue('--side')) || 0
    doc.current?.animate([{ translate: `${contents ? -side : side}px 0` }, { translate: '0 0' }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
  }, [contents])
  const swapped = state.swapped
  useEffect(() => { document.documentElement.toggleAttribute('data-axt-swapped', swapped) }, [swapped])
  // the tab says what is being read; the product's name until the title is known
  useEffect(() => { document.title = state.title || 'Read arXiv' }, [state.title])
  return (
    <>
      <Toolbar controller={controller} embedded={embedded} contents={contents} onContents={() => setContents(open => !open)} />
      <Outline controller={controller} open={contents} />
      {/* the page's main landmark, beside the toolbar's banner and the contents' complementary region (Part 6's
          accessibility audit); its layout is the class's */}
      <main className="doc" ref={doc}>
        <Pane controller={controller} side="left" scroller={left} empty={state.noPaper} />
        <Pane controller={controller} side="right" scroller={right} card={state.card} empty={state.noPaper} />
        {/* an address with no paper: its card is the page's, not a pane's (the display may hide the pane) */}
        {state.noPaper && <FailureCard controller={controller} of="page" />}
      </main>
      <StatusCapsule controller={controller} onChooseLanguage={chooseLanguage} />
    </>
  )
}

/** the capsule's choose-language action: the language menu itself, the toolbar's, or below 900 px the one the reading
 *  options hold (§5), opened in them — its search takes the focus, whatever rows come before it (the branch review:
 *  below 500 px the focus went to the download) */
function chooseLanguage() {
  const inBar = document.querySelector<HTMLElement>('[popovertarget="pop-language"]')
  if (inBar?.offsetParent) { document.getElementById('pop-language')?.showPopover(); return }
  document.getElementById('pop-options')?.showPopover()
  document.getElementById('pop-options-language')?.showPopover()
}

/**
 * One pane: the scroller the engine draws into (and owns: it replaces the right one as translations come), and what floats
 * over it, its page pill and its scroll indicator, shown while it scrolls without React rendering on a scroll. `empty`: an
 * address with no paper has nothing in either pane, and the pill's arrows, though drawn transparent, are in the Tab order
 * and a "1 / 0" pager that does nothing stood before the card's link (Codex on #329): the pane is inert, as a closed
 * contents sidebar is
 */
function Pane({ controller, side, scroller, card = false, empty = false }: { controller: ReaderController; side: Side; scroller: RefObject<HTMLDivElement | null>; card?: boolean; empty?: boolean }) {
  const section = useRef<HTMLElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const targets = useMemo<[RefObject<HTMLElement | null>, number][]>(() => [[pill, 2500], [indicator, 900]], [])
  useScrollShow(section, targets)
  return (
    // data-card: the failure's card covers the pane's scroller (reader.css; no relational selector there, §12)
    <section ref={section} className="pane" data-side={side} data-card={card || undefined} inert={empty}>
      <div className="viewerContainer" id={side} ref={scroller}>
        <div className="pdfViewer" />
      </div>
      <PagePill ref={pill} controller={controller} side={side} />
      <ScrollIndicator ref={indicator} controller={controller} side={side} />
      {side === 'right' && <FailureCard controller={controller} />}
    </section>
  )
}

/** the appearance the settings ask for, on <html>; changes after the first crossfade, and the system's is followed */
function useAppearance(appearance: Appearance | undefined, dimPages: boolean | undefined) {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    // the system's own flip changes the colours at once: the transitions are held there too (better-ui)
    const on = () => withoutTransitions(document, () => setSystemDark(query.matches))
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [])
  const first = useRef(true)
  useLayoutEffect(() => {
    if (!appearance) return
    applyAppearance(document.documentElement, { theme: themeOf(appearance), dim: dimmed(appearance, systemDark, dimPages ?? true) }, !first.current)
    first.current = false
  }, [appearance, dimPages, systemDark])
}
