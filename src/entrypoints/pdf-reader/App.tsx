import { useLayoutEffect, useRef } from 'react'
import type { ReaderController } from '@/pdf-reader/controller'
import { R } from '@/ui/strings'

/**
 * The reader's page, Part 1: the two panes the engine draws into, and, when the reader is laid over arXiv's PDF page,
 * the way back to the browser's viewer (pdf.content.ts takes the frame away on this message)
 */
export function App({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
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
  // the panes' ids are the probes' too, as they were on the prototype's page
  return (
    <>
      {embedded && (
        <button type="button" className="reader-leave" data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
          {R.leave}
        </button>
      )}
      <main>
        <section className="pane">
          <div className="viewerContainer" id="left" ref={left}>
            <div className="pdfViewer" />
          </div>
        </section>
        <section className="pane">
          <div className="viewerContainer" id="right" ref={right}>
            <div className="pdfViewer" />
          </div>
        </section>
      </main>
    </>
  )
}
