import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReaderController, Side } from '@/pdf-reader/controller'
import { type Appearance, applyAppearance, dimmed, themeOf } from '@/pdf-reader/ui/appearance'
import { Outline } from '@/pdf-reader/ui/Outline'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { ScrollIndicator } from '@/pdf-reader/ui/ScrollIndicator'
import { useScrollShow } from '@/pdf-reader/ui/scroll-show'
import { Toolbar } from '@/pdf-reader/ui/Toolbar'
import { useReader } from '@/pdf-reader/ui/use-reader'

/**
 * The reader's page (the reader's design, §5): the toolbar, the contents, the document area with its two panes (the
 * engine draws into their scrollers, and owns them), and what floats over them. The panes' ids are the probes' too
 */
export function App({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const state = useReader(controller)
  useLayoutEffect(() => {
    if (!left.current || !right.current) return
    // a session that cannot open is in the controller's state (a failure); nothing is left to catch here
    void controller.attach({ left: left.current, right: right.current }).then(
      session => {
        // the probes' hooks (experiments/pdf-bilingual/spikes): beside the session's own on window.__reader
        Object.assign((window as unknown as { __reader: object }).__reader, { controller, session })
      },
      () => {},
    )
  }, [controller])
  useAppearance(state.settings?.pdfReader.appearance, state.settings?.pdfReader.dimPages)
  // the contents sidebar, open or not: this visit's, not a setting; the document area moves with it (reader.css)
  const [contents, setContents] = useState(false)
  useEffect(() => { document.documentElement.toggleAttribute('data-axt-contents', contents) }, [contents])
  const swapped = state.settings?.pdfReader.swapped ?? false
  useEffect(() => { document.documentElement.toggleAttribute('data-axt-swapped', swapped) }, [swapped])
  // the tab says what is being read; the product's name until the title is known
  useEffect(() => { document.title = state.paper.title || 'Read arXiv' }, [state.paper.title])
  return (
    <>
      <Toolbar controller={controller} embedded={embedded} contents={contents} onContents={() => setContents(open => !open)} />
      <Outline controller={controller} open={contents} />
      <div className="doc">
        <Pane controller={controller} side="left" scroller={left} />
        <Pane controller={controller} side="right" scroller={right} />
      </div>
    </>
  )
}

/**
 * One pane: the scroller the engine draws into (and owns: it replaces the right one as translations come), and what floats
 * over it, its page pill and its scroll indicator, shown while it scrolls without React rendering on a scroll
 */
function Pane({ controller, side, scroller }: { controller: ReaderController; side: Side; scroller: RefObject<HTMLDivElement | null> }) {
  const section = useRef<HTMLElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const targets = useMemo<[RefObject<HTMLElement | null>, number][]>(() => [[pill, 2500], [indicator, 900]], [])
  useScrollShow(section, targets)
  return (
    <section ref={section} className="pane" data-side={side}>
      <div className="viewerContainer" id={side} ref={scroller}>
        <div className="pdfViewer" />
      </div>
      <PagePill ref={pill} controller={controller} side={side} />
      <ScrollIndicator ref={indicator} controller={controller} side={side} />
    </section>
  )
}

/** the appearance the settings ask for, on <html>; changes after the first crossfade, and the system's is followed */
function useAppearance(appearance: Appearance | undefined, dimPages: boolean | undefined) {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(query.matches)
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
