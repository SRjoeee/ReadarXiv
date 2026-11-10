// lab/typeset/parity/hook.mjs: a Node module hook (registered by v2.mjs after ../checkpoint/items-hook.mjs) that lays the entry's
// pages in packages/typeset/tests/replay/gate-l1.ts as the product lays them: its call of design-a's `layPage` (with the rules,
// the hyphenation patterns and the options the gate's runner chooses) is replaced by `globalThis.__parityLay(part, rows)`, the
// reader's own lay (packages/reader/src/compose/typeset.ts `typesetLay`, which v2.mjs makes over the pair's metrics and the
// served patterns), so that whatever the reader passes to `layPage` (its rules for the target, its toggles' `leave`, its
// options) the parity check passes, and nothing more. The part and the rows stay gate-l1's (the pair's door rows, the same
// translation on both sides). And two more, for the verdict's leadRuling (the owner's ruling of 2026-11-10): in
// packages/typeset/src/shared/fill-pass.ts one call is put before a page's fill, `globalThis.__parityFill?.(page, the units
// begun on it, those running on to it, the rules)`, which v2.mjs reads to record each pass's target; and in
// packages/typeset/src/breaker/slots.mjs option (i)'s line (floorOver: the gap under a borrowing paragraph measured from the
// borrow's limit) is skipped while `globalThis.__parityNoOptionI` is set, which v2.mjs sets alone, around a first lay of the
// pair whose pages it does not keep: each page's target before (i). And in packages/typeset/src/breaker/tokens.ts the line that
// sets no space beside a full-width mark's blank side (B.tokens, lane cjk-space) is skipped while `globalThis.__parityMarkSpaces`
// is set, which v2.mjs sets alone, around another lay of the pair whose pages it does not keep: each member's line count with those
// spaces put back, the counterfactual the verdict's markSpaceRuling reads (the coordinator's ruling of 2026-11-10). Nothing else of
// any module is touched; a gate-l1.ts that no longer holds the call once, a fill-pass.ts or slots.mjs its anchor, or a tokens.ts
// its line once, throws.
const CALL = /const page = layPage\(\n[\s\S]*?\n {6}\)\n(?= {6}out\.entry\.ms\.push)/g
const FILL = '  const { units, ...told } = fillUnitsOf(\n'
const OPTION_I = '  if (b.B.at(-1) - low > 1e-9) floor = Math.min(floor, low + (L - 1) * p0)\n'

const MARK_SPACES = '    if (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace)) return false\n'

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  const once = (source, anchor, file) => {
    if (source.split(anchor).length !== 2) throw new Error(`parity hook: ${file} no longer holds its anchor once`)
  }
  if (url.endsWith('/packages/typeset/src/shared/fill-pass.ts')) {
    const source = String(r.source)
    once(source, FILL, 'fill-pass.ts')
    return {
      ...r,
      source: source.replace(FILL, `  ;(globalThis as any).__parityFill?.(pg, begun, ok.filter((p) => p.pages[0] !== pg), P)\n${FILL}`),
    }
  }
  if (url.endsWith('/packages/typeset/src/breaker/slots.mjs')) {
    const source = String(r.source)
    once(source, OPTION_I, 'slots.mjs')
    return { ...r, source: source.replace(OPTION_I, `  if (!globalThis.__parityNoOptionI) ${OPTION_I.trimStart()}`) }
  }
  if (url.endsWith('/packages/typeset/src/breaker/tokens.ts')) {
    const source = String(r.source)
    if (source.split(MARK_SPACES).length !== 2) throw new Error('parity hook: tokens.ts no longer holds its mark-space line once')
    return {
      ...r,
      source: source.replace(
        MARK_SPACES,
        '    if (!(globalThis as any).__parityMarkSpaces && (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace))) return false\n',
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
