// lab/typeset/entry-laid.mjs: a Node module hook (registered by gate-l1.mjs before it loads the typesetter) through which the reader
// gate reads the lay the product makes. design-a's entry (packages/typeset/src/lay/entry.ts layPage) lays a page's prepared flows
// by layPagePrepared (lay/page.ts) and hands back the Page alone; the members as laid (each one's layout, its lines and their
// slots, its fit's scale and floor, its tokens) stay inside it. Here the entry's own import of `./page.ts` resolves to
// entry-page.mjs, which is page.ts with layPagePrepared handing each PreparedPage it makes to `globalThis.__axtEntryLaid` where a
// tool sets one: the reader gate judges I3, I4 and I5 on those very members, the entry's, never on a lay of its own. Nothing of any
// module is edited and no other importer of page.ts is touched (the gate's runner imports it itself); an entry.ts that no longer
// imports `./page.ts` is never laid through it, and the gate says so (no page read).
const ENTRY = '/packages/typeset/src/lay/entry.ts'
const SHIM = new URL('./entry-page.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === './page.ts' && context.parentURL?.endsWith(ENTRY)) return { url: SHIM, shortCircuit: true }
  return nextResolve(specifier, context)
}
