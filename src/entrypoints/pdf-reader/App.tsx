import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReaderController } from '@/pdf-reader/controller'
import { type Appearance, applyAppearance, dimmed, themeOf } from '@/pdf-reader/ui/appearance'
import { useReader } from '@/pdf-reader/ui/use-reader'
import { R } from '@/ui/strings'

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
  const swapped = state.settings?.pdfReader.swapped ?? false
  useEffect(() => { document.documentElement.toggleAttribute('data-axt-swapped', swapped) }, [swapped])
  return (
    <>
      <header role="toolbar" aria-label={R.bar} className="chrome">
        <div data-zone="lead" className="flex min-w-0 items-center gap-1" />
        <div data-zone="centre" className="flex items-center" />
        <div data-zone="trail" className="flex items-center justify-self-end gap-1">
          {embedded && (
            <button type="button" data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
              {R.leave}
            </button>
          )}
        </div>
      </header>
      <div className="doc">
        <section className="pane" data-side="left">
          <div className="viewerContainer" id="left" ref={left}>
            <div className="pdfViewer" />
          </div>
        </section>
        <section className="pane" data-side="right">
          <div className="viewerContainer" id="right" ref={right}>
            <div className="pdfViewer" />
          </div>
        </section>
      </div>
    </>
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
