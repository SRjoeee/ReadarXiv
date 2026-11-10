// The left pane while it is PDF.js's viewer (design §4.5: the stack goes under the left only if it matches today's left; until
// then, and if it does not, the left keeps PDFViewer). What the website measured PDFViewer needs, carried from W pdfjs.ts
// (0bf496b5) into the reader so that both hosts run it: `quietRoot` (PDF.js's write of its container's height on the root
// restyled every element of the page, 41 to 54 ms in one task), `eagerPages` (with autoFetch off PDF.js lays every undrawn page at
// page 1's size: a landscape page in a letter box) and `aheadHeld`, whose hold is now the reader's own (it was a module
// variable). Each patches a class or the document's root, idempotent, holding no reader's state.
//
// PDF.js private members the left still reads (the contract's list): `_getVisiblePages`, lent by the follower so that the
// viewer draws the pages its compositor transform shows (panes.ts `lend`); nothing else.

/** what PDF.js writes to the root's inline style that the reader never reads */
const UNREAD = new Set(['--viewer-container-height'])
const quieted = new WeakSet<object>()
/** the root's inline style without PDF.js's writes of what the reader never reads; once a document */
export function quietRoot(style: Pick<CSSStyleDeclaration, 'setProperty'>): void {
  if (quieted.has(style)) return
  quieted.add(style)
  const set = style.setProperty.bind(style)
  style.setProperty = (name: string, value: string | null, priority?: string) => {
    if (!UNREAD.has(name)) set(name, value, priority)
  }
}

/** PDF.js's own bounds on setting a document's pages up ahead (pdf_viewer.mjs PagesCountLimit) */
const FORCE_LAZY_PAGE_INIT = 5000,
  PAUSE_EAGER_PAGE_INIT = 250
interface PageViewLike {
  pdfPage?: unknown
  setPdfPage(page: unknown): void
}
interface DocLike {
  numPages: number
  loadingParams?: { disableAutoFetch?: boolean }
  getPage(n: number): Promise<unknown>
}
interface ViewerLike {
  pdfDocument: unknown
  readonly pagesPromise: Promise<unknown> | null
  eventBus: { dispatch(name: string, data: unknown): void }
  getPageView(index: number): PageViewLike | undefined
  setDocument(doc: unknown): void
}
interface QueueLike {
  getHighestPriority(
    visible: { first?: { id: number }; last?: { id: number } },
    ...rest: unknown[]
  ): { id?: number } | null
  renderHighestPriority?(): void
}
// biome-ignore lint/suspicious/noExplicitAny: a class's constructor, whatever it takes (PDF.js's viewer's options)
type ViewerClass = abstract new (...a: any[]) => ViewerLike

/**
 * PDF.js's viewer with every page set up at its own size once the first has been drawn, as PDF.js does for a document whose
 * autoFetch is on; once every page is set up, `pagesloaded` is told again (W pdfjs.ts:115-151)
 */
export function eagerPages<T extends ViewerClass>(Base: T): T {
  abstract class Eager extends Base {
    override setDocument(pdfDocument: unknown): void {
      super.setDocument(pdfDocument)
      const doc = pdfDocument as DocLike | null
      if (!doc?.loadingParams?.disableAutoFetch || !(doc.numPages > 1) || doc.numPages > FORCE_LAZY_PAGE_INIT) return
      void this.pagesPromise?.then(
        async () => {
          const set: Promise<unknown>[] = []
          for (let n = 2; n <= doc.numPages; n++) {
            if (this.pdfDocument !== doc) return
            const one = doc.getPage(n).then(
              (page) => {
                if (this.pdfDocument !== doc) return
                const view = this.getPageView(n - 1)
                if (view && !view.pdfPage) view.setPdfPage(page)
              },
              () => {},
            )
            set.push(one)
            if (n % PAUSE_EAGER_PAGE_INIT === 0) await one
          }
          await Promise.all(set)
          if (this.pdfDocument === doc)
            this.eventBus.dispatch('pagesloaded', { source: this, pagesCount: doc.numPages })
        },
        () => {},
      )
    }
  }
  return Eager as unknown as T
}

/** a hold of the pages PDF.js draws ahead of the view (its rendering queue's pre-render), one a reader */
export interface AheadHold {
  on: boolean
  viewers: Set<{ renderingQueue?: QueueLike }>
}
/** the hold let go: each viewer draws what it held back */
export function letAheadGo(h: AheadHold): void {
  if (!h.on) return
  h.on = false
  for (const v of [...h.viewers]) {
    try {
      v.renderingQueue?.renderHighestPriority?.()
    } catch {
      /* a viewer let go */
    }
  }
}
/** PDF.js's viewer with its pages ahead of the view held while `hold.on`: only when, never what (W pdfjs.ts:169-197) */
export function aheadHeld<T extends ViewerClass>(Base: T, hold: AheadHold): T {
  abstract class Held extends Base {
    // biome-ignore lint/suspicious/noExplicitAny: a class's constructor, whatever it takes (PDF.js's viewer's options)
    constructor(...a: any[]) {
      super(...a)
      const self = this as unknown as { renderingQueue?: QueueLike }
      const q = self.renderingQueue
      if (!q || typeof q.getHighestPriority !== 'function') return
      const pick = q.getHighestPriority.bind(q)
      q.getHighestPriority = (visible, ...rest) => {
        const v = pick(visible, ...rest)
        if (!hold.on || !v || typeof v.id !== 'number' || !visible?.first || !visible.last) return v
        return v.id < visible.first.id || v.id > visible.last.id ? null : v
      }
      hold.viewers.add(self)
    }
  }
  return Held as unknown as T
}
