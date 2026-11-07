// lab/typeset/checkpoint/items-hook.mjs: a Node module hook (registered by items.mjs and laid.mjs) that lets the checkpoint read
// the runner's laid members whole, not only as the reader dump writes them: as packages/typeset/tests/replay/gate-l1.ts is
// loaded, two calls are put in it. One where a member is adapted (`globalThis.__ckMem?.(pair, today's ord, its part's ord,
// whether its reading draws its label anew)`), one before the runner dumps a page's member (`globalThis.__ckLaid?.(pair, page,
// member)`), so that a tool sees the member's layout (its display lines with each run's face, fill and place, each crop's
// piece) and can name it by its part's ord. Nothing else of any module is touched.
const LAID = "      if (pm.state !== 'laid' || !pm.lay) continue\n"
const MEM = '    const mem = got.member\n'
// (the entry's page, design-a's Page as the reader receives it: laid.mjs --entry)
const PAGE = '      out.entry.ms.push(performance.now() - t1)\n'

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  if (!url.endsWith('/packages/typeset/tests/replay/gate-l1.ts')) return r
  let source = String(r.source)
  for (const a of [LAID, MEM, PAGE])
    if (source.split(a).length !== 2) throw new Error(`items-hook: gate-l1.ts no longer holds its anchor once: ${a.trim()}`)
  source = source.replace(LAID, `      ;(globalThis as any).__ckLaid?.(pair, pg, pm)\n${LAID}`)
  source = source.replace(MEM, `${MEM}    ;(globalThis as any).__ckMem?.(pair, u.ord, ord, reading.labelDrawn ?? null)\n`)
  source = source.replace(PAGE, `${PAGE}      ;(globalThis as any).__ckPage?.(pair, pg, page)\n`)
  return { ...r, source }
}
