// Machine translation of LaTeX units, shared by the spikes (Node) and the reader (browser). A unit goes out as one
// wire text with its opaque pieces as markers (DESIGN §6: `@a#`, `@@` for a literal @), comes back as pieces again;
// the engine's slips are forgiven where they are unambiguous, and what still fails goes as runs — each stretch of text
// between opaque pieces on its own — so that nothing is left untranslated.
import { latin1Bytes } from './latex-front.mjs'
import { MIXED } from '@/cache/pdf-record'
import { fromAlpha, TAG_RE, toAlpha } from '@/core/protector/tokens'

// ---------------------------------------------------------------- markers wire format
export { fromAlpha, toAlpha }
export const escape = s => s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b) => b[0] === '#' ? String.fromCodePoint(b[1].toLowerCase() === 'x' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[b.toLowerCase()])
/** source text is read byte for byte (latin1); its characters are UTF-8 */
export const utf8 = s => new TextDecoder().decode(latin1Bytes(s))
// the engine's text is plain text: TeX's special characters in it (a % for "percent", a # for "number") are escaped
export const texEscape = s => s.replace(/[\\#$%&_{}~^]/g, c => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' })[c] ?? `\\${c}`)

/** a unit → the wire text, and the table from marker id back to the original piece */
export function serialize(u) {
  const slots = []
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  u.pieces.forEach((p, k) => {
    if (p.t === 'text') { let s = utf8(p.s).replace(/\s+/g, ' '); if (k === 0) s = s.trimStart(); if (k === u.pieces.length - 1) s = s.trimEnd(); wire += escape(s); return }
    slots.push(p)
    const m = `@${toAlpha(slots.length)}#`
    // a marker touching a letter is read as part of the word by the engine (#254): a space of ours around it
    const before = /\p{L}$/u.test(wire) ? ' ' : ''
    const nextText = u.pieces[k + 1]?.t === 'text' ? u.pieces[k + 1].s : ''
    const after = /^\p{L}/u.test(utf8(nextText)) ? ' ' : ''
    wire += before + m + after
  })
  return { wire, slots, lead, trail }
}

/** the translation → pieces, or why it cannot be used */
export function rehydrate(text, { slots, lead, trail }, tolerant = false) {
  const pieces = [], seen = new Map()
  let last = 0
  const pushText = s => { if (s) pieces.push({ t: 'text', tr: true, s: texEscape(s) }) }
  // tolerant: the engine sometimes drops the closing # before a CJK character or punctuation (@b形, @g。). A lone @ can only
  // be a marker's remains, because a literal @ went out as @@; accepted only when no letter follows, never inside a word
  const L = toAlpha(Math.max(1, slots.length)).length
  const re = tolerant ? new RegExp(`@@|@([a-z]{1,${L}})#|@([a-z]{1,${L}})(?![a-z#])`, 'g') : /@@|@([a-z]+)#/g
  let m, buf = ''
  while ((m = re.exec(text))) {
    buf += text.slice(last, m.index); last = re.lastIndex
    if (m[0] === '@@') { buf += '@'; continue }
    const id = fromAlpha(m[1] ?? m[2])
    if (!slots[id - 1]) return { error: 'unknown marker' }
    if (seen.has(id)) return { error: 'duplicated marker' }
    pushText(decode(buf)); buf = ''
    seen.set(id, pieces.length); pieces.push(slots[id - 1])
  }
  buf += text.slice(last); pushText(decode(buf))
  if (seen.size !== slots.length) return { error: 'lost marker' }
  // the two ends of a formatting group must stay in order and properly nested, or the braces stop balancing
  const stack = []
  for (const p of pieces) {
    if (p.t === 'open') stack.push(p.id)
    else if (p.t === 'close') { if (stack.pop() !== p.id) return { error: 'pair out of order' } }
  }
  if (stack.length) return { error: 'pair out of order' }
  if (lead) pieces.unshift({ t: 'text', s: lead }); if (trail) pieces.push({ t: 'text', s: trail })
  return { pieces }
}

// ---------------------------------------------------------------- tags wire format (DESIGN §6: LLMs)
const escapeTags = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** a unit → the wire text: <x id="n"/> for an opaque piece, <t id="n">…</t> around a formatting pair, which LLMs keep */
export function serializeTags(u) {
  const slots = [], pairSlot = new Map()
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  u.pieces.forEach((p, k) => {
    if (p.t === 'text') { let s = utf8(p.s).replace(/\s+/g, ' '); if (k === 0) s = s.trimStart(); if (k === u.pieces.length - 1) s = s.trimEnd(); wire += escapeTags(s); return }
    if (p.t === 'open') { slots.push({ open: p }); pairSlot.set(p.id, slots.length); wire += `<t id="${slots.length}">`; return }
    if (p.t === 'close') { const n = pairSlot.get(p.id); if (n) slots[n - 1].close = p; wire += '</t>'; return }
    slots.push({ void: p }); wire += `<x id="${slots.length}"/>`
  })
  return { wire, slots, lead, trail }
}
/** the translation → pieces, or why it cannot be used; the model's common spellings of a tag are read as the extension reads them */
export function rehydrateTags(text, { slots, lead, trail }) {
  const pieces = [], seenVoid = new Set(), seenPair = new Set(), stack = []
  // the tags as the background's tokenizer reads them (src/core/protector/tokens.ts): `<x id="1"></x >` is one void
  const re = new RegExp(TAG_RE.source, 'g')
  let last = 0, m
  const pushText = s => { const d = decode(s); if (d) pieces.push({ t: 'text', tr: true, s: texEscape(d) }) }
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index)); last = re.lastIndex
    const x = m[1] ?? m[2] ?? m[3], t = m[4] ?? m[5] ?? m[6]
    if (x) { const n = Number(x), slot = slots[n - 1]; if (!slot?.void || seenVoid.has(n)) return { error: slot?.void ? 'duplicated placeholder' : 'unknown placeholder' }; seenVoid.add(n); pieces.push(slot.void) }
    else if (t) { const n = Number(t), slot = slots[n - 1]; if (!slot?.open || !slot.close || seenPair.has(n)) return { error: 'bad pair' }; seenPair.add(n); stack.push(n); pieces.push(slot.open) }
    else { const n = stack.pop(); if (!n) return { error: 'bad pair' }; pieces.push(slots[n - 1].close) }
  }
  pushText(text.slice(last))
  if (stack.length) return { error: 'bad pair' }
  if (seenVoid.size !== slots.filter(x => x.void).length) return { error: 'lost placeholder' }
  if (seenPair.size !== slots.filter(x => x.open && x.close).length) return { error: 'lost pair' }
  if (lead) pieces.unshift({ t: 'text', s: lead }); if (trail) pieces.push({ t: 'text', s: trail })
  return { pieces }
}

/**
 * The wire formats as the extension's chain negotiates them (src/core/protector/tokens.ts), by `renderPath`: tags for an
 * LLM, markers for the free engines, runs for an engine that keeps no placeholder. Per format: a unit → its wire; a
 * translation → its pieces, and for markers once more tolerantly; a run's text on the wire and back. Under runs every
 * unit goes as its runs, escaped as tags are (src/cache/key.ts)
 */
export const WIRE = {
  markers: { serialize, rehydrate: (text, ser) => rehydrate(text, ser), tolerant: (text, ser) => rehydrate(text, ser, true), run: escape, unrun: s => decode(s.replace(/@@/g, '@')) },
  tags: { serialize: serializeTags, rehydrate: rehydrateTags, run: escapeTags, unrun: decode },
  runs: { run: escapeTags, unrun: decode },
}

// ---------------------------------------------------------------- Microsoft's free endpoint, as the extension calls it
export const MICROSOFT_LANG = { zh: 'zh-Hans', ja: 'ja', de: 'de' }
/** one request: texts → translations (null where the engine returned nothing) */
export async function translateMicrosoft(texts, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: MICROSOFT_LANG[to] ?? to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => item?.translations?.[0]?.text ?? null)
    } catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
  }
}
/** texts in requests of at most 2000 characters or 100 texts, `parallel` requests at a time */
export async function translateTexts(texts, to, { parallel = 4, send = translateMicrosoft } = {}) {
  const batches = []
  let cur = [], chars = 0
  for (const [i, w] of texts.entries()) { if (cur.length && (chars + w.length > 2000 || cur.length >= 100)) { batches.push(cur); cur = []; chars = 0 } cur.push(i); chars += w.length }
  if (cur.length) batches.push(cur)
  const out = new Array(texts.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < batches.length) {
      const b = batches[next++]
      const got = await send(b.map(i => texts[i]), to).catch(() => b.map(() => null))
      b.forEach((i, k) => { out[i] = got[k] ?? null })
    }
  }))
  return out
}

// ---------------------------------------------------------------- names
/**
 * Whether a short text (a table cell, a figure label) is only a name — a dataset, a model, a method — which, sent
 * alone and with no context, comes back as words (HellaSwag → 地狱之战, Magicoder → 魔法师), while the prose keeps
 * names as they are. At most three words, each of them a name: one with a digit or an inner capital (GSM8K,
 * DirectHarm4), all capitals (MATH, ASR), or a capitalised word the prose treats as a proper noun and never as a
 * common one — capitalised in the middle of a sentence (… and Aegis [16]) or as the start of a longer name (Beaver for
 * BeaverTails), and never in lower case. A capitalised word the prose writes in lower case too is a word, set in title
 * case in a heading or a term (Average, Score, Safety Dataset); one the prose never treats as a name is a word as well
 * (Compute). Of the two mistakes, translating a name (Aegis → 宙斯盾) misleads, leaving a word untranslated does not:
 * a doubtful case stays a name only on both kinds of evidence. `prose` is the running text.
 */
export function isName(text, prose) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length > 3) return false
  const quote = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const proper = w => new RegExp(`[a-z,;:)\\]] ${quote(w)}(?![a-z])`).test(prose) || new RegExp(`(^|[^A-Za-z])${quote(w)}[A-Z]`).test(prose)
  const common = w => new RegExp(`(^|[^A-Za-z])${quote(w.toLowerCase())}($|[^A-Za-z])`).test(prose)
  const nameWord = w => { const bare = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''); return !bare || /[0-9]/.test(bare) || /^[A-Z][^a-z]*$/.test(bare) || /^[A-Za-z][a-z]*[A-Z]/.test(bare) || (/^[A-Z][a-z]+$/.test(bare) && proper(bare) && !common(bare)) }
  return words.every(nameWord)
}
/** the table cells and figure texts that are only names (isName): they keep their source */
export function nameCells(units) {
  const short = u => u.kind === 'cell' || u.kind === 'figure'
  const textOf = u => u.pieces.filter(p => p.t === 'text').map(p => p.s).join(' ')
  const prose = units.filter(u => !short(u)).map(textOf).join('\n')
  return new Set(units.filter(u => short(u) && isName(textOf(u), prose)))
}

/**
 * Units → Map unit → translated pieces. `send(texts)` returns the translations of a list of wire texts in `format`
 * (WIRE). What the placeholders cannot bring back, even tolerantly where the format has a tolerant reading, goes again
 * as runs; a unit none of whose runs came back is left out (it stays in the source language). `how` counts each way.
 */
export async function translateUnits(units, send, format = 'markers') {
  const wire = WIRE[format]
  // unit → { pieces, state, by }: whole (read back strictly or tolerantly, or every run back), partial (some runs back),
  // none (the engine could not take it, runs included), lost (a failure of the service; engine.mjs, EngineError's
  // `lost`). `by` is the identity that answered, MIXED when runs of one unit had two (REPORT, eighteenth addendum)
  const results = new Map(), how = { whole: 0, tolerant: 0, runs: 0, untranslated: 0, lost: 0 }, failed = []
  // what came back, when some texts did not for a reason not theirs (engine.mjs, EngineError's `lost`): those stay in
  // the source language, counted, and the failure is kept — sent again piece by piece they would only fail again, as
  // many times over as they have pieces (Codex on #296)
  const ask = async texts => {
    try { return { texts: await send(texts), lost: null } } catch (e) {
      if (!e?.partial) throw e
      how.error ??= e.kind
      return { texts: e.partial, lost: e.lost }
    }
  }
  if (wire.serialize) {
    const sers = units.map(wire.serialize)
    const { texts, lost } = await ask(sers.map(s => s.wire))
    units.forEach((u, i) => {
      if (lost?.has(i)) { how.lost++; results.set(u, { state: 'lost' }); return }
      const got = texts[i]
      if (got == null) { failed.push(u); return }
      const strict = wire.rehydrate(got.text, sers[i])
      if (!strict.error) { results.set(u, { pieces: strict.pieces, state: 'whole', by: got.by }); how.whole++; return }
      const loose = wire.tolerant?.(got.text, sers[i])
      if (loose && !loose.error) { results.set(u, { pieces: loose.pieces, state: 'whole', by: got.by }); how.tolerant++; return }
      failed.push(u)
    })
  } else failed.push(...units)
  const runs = []
  for (const u of failed) u.pieces.forEach((p, k) => { if (p.t === 'text' && (utf8(p.s).match(/\p{L}/gu) ?? []).length >= 2) runs.push({ u, k, wire: wire.run(utf8(p.s).replace(/\s+/g, ' ').trim()) }) })
  const { texts: runTexts, lost: runsLost } = runs.length ? await ask(runs.map(r => r.wire)) : { texts: [], lost: null }
  const byUnit = new Map(), total = new Map()
  runs.forEach((r, j) => {
    total.set(r.u, (total.get(r.u) ?? 0) + 1)
    if (runTexts[j] != null) (byUnit.get(r.u) ?? byUnit.set(r.u, new Map()).get(r.u)).set(r.k, runTexts[j])
  })
  const lostUnits = new Set(runs.filter((r, j) => runsLost?.has(j)).map(r => r.u))
  for (const u of failed) {
    const got = byUnit.get(u)
    if (!got?.size) {
      if (lostUnits.has(u)) { how.lost++; results.set(u, { state: 'lost' }) } else { how.untranslated++; results.set(u, { state: 'none' }) }
      continue
    }
    const ids = new Set([...got.values()].map(g => g.by))
    // some runs back and some lost to the service: lost, so that it is tried again — partial is for a unit the engine
    // could not take whole, which another try would not change (final review); what came back is shown meanwhile
    const whole = got.size === total.get(u)
    results.set(u, {
      pieces: u.pieces.map((p, k) => (got.has(k) ? { t: 'text', tr: true, s: p.s.match(/^\s*/)[0] + texEscape(wire.unrun(got.get(k).text)) + p.s.match(/\s*$/)[0] } : p)),
      state: whole ? 'whole' : lostUnits.has(u) ? 'lost' : 'partial',
      by: ids.size === 1 ? [...ids][0] : MIXED,
    })
    if (!whole && lostUnits.has(u)) how.lost++
    else how.runs++
  }
  return { results, how }
}

/** a unit's plain text in the source (placeholders dropped: anchors are found from text alone) */
export const plainSource = u => u.pieces.map(p => (p.t === 'text' ? utf8(p.s) : ' ')).join('').replace(/\s+/g, ' ').trim()
/** a unit's plain text in its translation, as the compiled PDF shows it */
export const plainTranslated = pieces => pieces.map(p => (p.t === 'text' ? (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s)) : ' ')).join('').replace(/\s+/g, ' ').trim()
