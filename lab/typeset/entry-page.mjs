// lab/typeset/entry-page.mjs: packages/typeset/src/lay/page.ts as the entry imports it under entry-laid.mjs: every export of
// page.ts, and its layPagePrepared handing the PreparedPage it lays to `globalThis.__axtEntryLaid` (where a tool sets one) before
// it returns it, unchanged.
import * as page from '../../packages/typeset/src/lay/page.ts'

export * from '../../packages/typeset/src/lay/page.ts'

/** page.ts's layPagePrepared, its answer handed to the tool's sink as well */
export function layPagePrepared(...a) {
  const laid = page.layPagePrepared(...a)
  globalThis.__axtEntryLaid?.(laid)
  return laid
}
