// lab/typeset/parity/hook.mjs: a Node module hook (registered by v2.mjs after ../checkpoint/items-hook.mjs) that lays the entry's
// pages in packages/typeset/tests/replay/gate-l1.ts as the product lays them: its call of design-a's `layPage` (with the rules,
// the hyphenation patterns and the options the gate's runner chooses) is replaced by `globalThis.__parityLay(part, rows)`, the
// reader's own lay (packages/reader/src/compose/typeset.ts `typesetLay`, which v2.mjs makes over the pair's metrics and the
// served patterns), so that whatever the reader passes to `layPage` (its rules for the target, its toggles' `leave`, its
// options) the parity check passes, and nothing more. The part and the rows stay gate-l1's (the pair's door rows, the same
// translation on both sides). And two more, for the verdict's leadRuling (the owner's ruling of 2026-11-10): in
// packages/typeset/src/shared/fill-pass.ts one call is put before a page's fill, `globalThis.__parityFill?.(page, the units
// begun on it, those running on to it, the rules)`, which v2.mjs reads to record each pass's target; and in
// packages/typeset/src/breaker/slots.ts option (i)'s line (floorOver: the gap under a borrowing paragraph measured from the
// borrow's limit) is skipped while `globalThis.__parityNoOptionI` is set, which v2.mjs sets alone, around a first lay of the
// pair whose pages it does not keep: each page's target before (i). And in packages/typeset/src/breaker/tokens.ts the line that
// sets no space beside a full-width mark's blank side (markBlankEdge: after a closing mark, before an opening one; B.tokens, lane
// cjk-space) is skipped while `globalThis.__parityBlankSides` is set, which v2.mjs sets alone, around another lay of the pair whose
// pages it does not keep: each member's line count with those spaces put back, the counterfactual the verdict's markSpaceRuling
// reads (the coordinator's ruling of 2026-11-10, xeCJK's rule). That rule alone: the next line of the filter, no ordinary space
// before a full-width mark no line opens with (markBarredStart, the coordinator's ruling of 2026-11-12, against xeCJK's, which
// keeps that space), is a ruling of its own that the 2026-11-10 one does not cover, and stays in that lay. And in
// packages/typeset/src/breaker/break.mjs a CJK line no longer squeezes to take the group it misses (`squeezes`: its marks' blank
// halves and SQUEEZE em a gap, light compression before stretching) while `globalThis.__parityNoSqueeze` is set, which v2.mjs sets
// alone, around another lay of the pair whose pages it does not keep: each member's line count without that punctuation rule, the
// counterfactual the owner's ruling L2 reads (rulings.mjs, 2026-11-12). Nothing else of any module is touched; a gate-l1.ts that no
// longer holds the call once, a fill-pass.ts or slots.ts its anchor, or a tokens.ts or break.mjs its line once, throws.
const CALL = /const page = layPage\(\n[\s\S]*?\n {6}\)\n(?= {6}out\.entry\.ms\.push)/g
const FILL = '  const { units, ...told } = fillUnitsOf(\n'
const OPTION_I = '  if ((b.B.at(-1) as number) - low > 1e-9) floor = Math.min(floor, low + (L - 1) * p0)\n'

const BLANK_SIDES = '    if (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace)) return false\n'
const SQUEEZES = '  const squeezes = !!P.cjk && !P.keepAll && !(st.track > (st.fitTrack ?? P.trackStart ?? 0) + 1e-9)\n'

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
  if (url.endsWith('/packages/typeset/src/breaker/slots.ts')) {
    const source = String(r.source)
    once(source, OPTION_I, 'slots.ts')
    return { ...r, source: source.replace(OPTION_I, `  if (!globalThis.__parityNoOptionI) ${OPTION_I.trimStart()}`) }
  }
  if (url.endsWith('/packages/typeset/src/breaker/break.mjs')) {
    const source = String(r.source)
    if (source.split(SQUEEZES).length !== 2) throw new Error('parity hook: break.mjs no longer holds its squeeze line once')
    return { ...r, source: source.replace(SQUEEZES, `  const squeezes = !globalThis.__parityNoSqueeze && ${SQUEEZES.slice('  const squeezes = '.length)}`) }
  }
  if (url.endsWith('/packages/typeset/src/breaker/tokens.ts')) {
    const source = String(r.source)
    if (source.split(BLANK_SIDES).length !== 2) throw new Error('parity hook: tokens.ts no longer holds its blank-side line once')
    return {
      ...r,
      source: source.replace(
        BLANK_SIDES,
        '    if (!(globalThis as any).__parityBlankSides && (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace))) return false\n',
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
