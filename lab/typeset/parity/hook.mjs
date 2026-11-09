// lab/typeset/parity/hook.mjs: a Node module hook (registered by v2.mjs after ../checkpoint/items-hook.mjs) that lays the entry's
// pages in packages/typeset/tests/replay/gate-l1.ts as the product lays them: its call of design-a's `layPage` (with the rules,
// the hyphenation patterns and the options the gate's runner chooses) is replaced by `globalThis.__parityLay(part, rows)`, the
// reader's own lay (packages/reader/src/compose/typeset.ts `typesetLay`, which v2.mjs makes over the pair's metrics and the
// served patterns), so that whatever the reader passes to `layPage` (its rules for the target, its toggles' `leave`, its
// options) the parity check passes, and nothing more. The part and the rows stay gate-l1's (the pair's door rows, the same
// translation on both sides). And in packages/typeset/src/shared/fill-pass.ts one call is put after a page's fill, before its
// runs are joined: `globalThis.__parityFill?.(page, its target, the units begun on it, those running on to it, the rules)`,
// which v2.mjs reads to record each pass's target and the paragraphs that borrow room among its voters (the verdict's
// leadRuling). Nothing else of any module is touched; a gate-l1.ts that no longer holds the call once, or a fill-pass.ts its
// anchor, throws.
const CALL = /const page = layPage\(\n[\s\S]*?\n {6}\)\n(?= {6}out\.entry\.ms\.push)/g
const FILLED = '  for (const [p, t] of runs) {\n'

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  if (url.endsWith('/packages/typeset/src/shared/fill-pass.ts')) {
    const source = String(r.source)
    if (source.split(FILLED).length !== 2) throw new Error('parity hook: fill-pass.ts no longer holds its anchor once')
    return {
      ...r,
      source: source.replace(
        FILLED,
        `  ;(globalThis as any).__parityFill?.(pg, target, begun, ok.filter((p) => p.pages[0] !== pg), P)\n${FILLED}`,
      ),
    }
  }
  if (!url.endsWith('/packages/typeset/tests/replay/gate-l1.ts')) return r
  const source = String(r.source)
  const found = source.match(CALL) ?? []
  if (found.length !== 1) throw new Error(`parity hook: gate-l1.ts no longer holds the entry's layPage call once (${found.length})`)
  return {
    ...r,
    source: source.replace(CALL, 'const page = (globalThis as any).__parityLay(part as Part, entryRows)\n'),
  }
}
