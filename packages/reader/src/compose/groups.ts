// The composed document's groups (design §4.5 "composing a page"): each laid unit's text, elements and label in optional-content
// groups of the add-on, named `axt:<ord>.<page>.<t|e|l>` (format's groupName), every group ON by default so that the composed
// page is arXiv's. A group belongs to one page, so one configuration holds every page's state at once and no render switches a
// group for the page it draws (today's visibility.mjs serialised renders for it). Three configurations, each read once a
// document (PDF.js 6.3.289 builds a new one per render it is not given one for: +23 MiB on a 147-page thesis, engine-view-host
// §16): `allOn`, which is never changed (a page not laid: arXiv's); `laid`, in which the groups a committed page turns off are
// off; `crops`, every unit's text group off and the rest on (the page's crop render: elements and labels, and the ink in no
// group). A configuration is read at paint time, so `laid` is changed only for pages whose drawings are drawn again after.
import { groupName, groupOf } from '@readarxiv/format'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OptionalContentConfig } from '../stack/stack.ts'
import type { Page } from './page.ts'

export interface Groups {
  readonly allOn: Promise<OptionalContentConfig>
  readonly laid: Promise<OptionalContentConfig>
  readonly crops: Promise<OptionalContentConfig>
  /** resolves once the configurations are read (none of ours where the document has none: every page stays arXiv's) */
  readonly ready: Promise<void>
  /** whether the document holds a group by that name */
  has(name: string): boolean
  readonly size: number
  /** page p's groups as `page` turns them off (its members' `off`), in `laid`; the groups of that page `page` does not name on */
  set(page: Page): string[]
  /** page n's groups all on again in `laid` */
  clear(n: number): void
}

export function groupsOf(doc: PDFDocumentProxy): Groups {
  const ids = new Map<string, string>()
  const byPage = new Map<number, Set<string>>()
  const read = () => doc.getOptionalContentConfig({ intent: 'display' })
  const allOn = read(),
    laid = read(),
    crops = read()
  const ready = (async () => {
    const [c, k] = await Promise.all([laid, crops])
    for (const [id, group] of c as unknown as Iterable<[string, { name?: unknown }]>) {
      const name = group?.name
      if (typeof name === 'string' && groupOf(name)) ids.set(name, id)
    }
    for (const [name, id] of ids)
      if ((groupOf(name) as { group: number }).group === 1) k.setVisibility(id, false, false)
  })().catch(() => {
    ids.clear()
  })
  return {
    allOn,
    laid,
    crops,
    ready,
    has: (name) => ids.has(name),
    get size() {
      return ids.size
    },
    set(page) {
      const off = new Set<string>()
      for (const m of page.members)
        for (const bit of [1, 2, 4] as const)
          if (m.off & bit) {
            const name = groupName(m.ord, page.page, bit)
            if (ids.has(name)) off.add(name)
          }
      void laid.then((c) => {
        for (const name of byPage.get(page.page) ?? [])
          if (!off.has(name)) c.setVisibility(ids.get(name) as string, true, false)
        for (const name of off) c.setVisibility(ids.get(name) as string, false, false)
      })
      byPage.set(page.page, off)
      return [...off]
    },
    clear(n) {
      const was = byPage.get(n)
      byPage.delete(n)
      if (was?.size)
        void laid.then((c) => {
          for (const name of was) c.setVisibility(ids.get(name) as string, true, false)
        })
    },
  }
}
