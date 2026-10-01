// Machine translation of LaTeX units, shared by the spikes (Node) and the reader (browser). A unit goes out as one
// wire text with its opaque pieces as markers (DESIGN §6: `@a#`, `@@` for a literal @), comes back as pieces again;
// the engine's slips are forgiven where they are unambiguous, and what still fails goes as runs — each stretch of text
// between opaque pieces on its own — so that nothing is left untranslated.
import { tokens } from './anchors.mjs'
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

/** a unit → the wire text, the table from marker id back to the original piece, and the markers the wire set apart
 *  from a full stop (`stops`), whose space rehydrate takes off again */
export function serialize(u) {
  const slots = [], stops = new Set()
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  u.pieces.forEach((p, k) => {
    if (p.t === 'text') { let s = utf8(p.s).replace(/\s+/g, ' '); if (k === 0) s = s.trimStart(); if (k === u.pieces.length - 1) s = s.trimEnd(); wire += escape(s); return }
    slots.push(p)
    const m = `@${toAlpha(slots.length)}#`
    // a marker touching a letter is read as part of the word by the engine (#254): a space of ours around it. So is one
    // right after a full stop, `models.@a#` — a citation or a footnote's mark after a sentence — which left the
    // sentence's last word in English (the HTML page's protector, 09c25622: 13 of 17 blocks as sent, none with the space)
    const before = /[\p{L}.]$/u.test(wire) ? ' ' : ''
    if (wire.endsWith('.')) stops.add(slots.length)
    const nextText = u.pieces[k + 1]?.t === 'text' ? u.pieces[k + 1].s : ''
    const after = /^\p{L}/u.test(utf8(nextText)) ? ' ' : ''
    wire += before + m + after
  })
  return { wire, slots, lead, trail, stops }
}

/** the translation → pieces, or why it cannot be used. The space the wire set after a full stop before a marker is the
 *  wire's, not the source's: it is taken off the text before that marker, as the HTML page's protector takes its own
 *  (09c25622) — kept, `Fig.~\ref` came back as an ordinary space and then the tie (the review of A1, M3). Only while
 *  that text still ends in a full stop (any script's, as the HTML page's label.ts knows them), or before a piece a space
 *  never goes before: an engine that set a citation before the stop, `Modelle @a#.`, chose the space (the re-review of
 *  A1, m5), but one that wrote `Eq.~` out as `Gleichung @a#` did not — a space and then the tie. Over the ten papers'
 *  pieces set apart after a full stop, Microsoft's German, French, Spanish and Chinese left a space and no stop before
 *  34, 38, 49 and 12 of them: a tie, a control space or a group's end every one, a citation never */
const STOP_SPACE = /(?<=[.\u3002\uff0e\u0964\u0965\u06d4\u0589\u1362\u104b\u0f0d])[ \t\n\f\r]+$/, SPACE = /[ \t\n\f\r]+$/
/** a piece a space never goes before: one that is a space itself (a tie, a control space, a kern), a group's end */
const SPACING = /^(?:~|\\[ ,;:]|\\(?:q?quad|enspace|thinspace|nobreakspace)(?![A-Za-z])|\\hspace\*?\{|\}$)/
export function rehydrate(text, { slots, lead, trail, stops }, tolerant = false) {
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
    const wires = stops?.has(id) && (SPACING.test(slots[id - 1].src ?? '') ? SPACE : STOP_SPACE)
    pushText(decode(wires ? buf.replace(wires, '') : buf)); buf = ''
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

// ---------------------------------------------------------------- sentences (plans/2026-10-01-pdf-highlight.md, B3)
/** what the wire writes as one thing, a boundary inside which goes to its end: a marker (read tolerantly too, `@b`
 *  without its `#`), an escaped @, an entity */
const ATOM = /@@|@[a-z]+#?|&(?:#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g
/** where a sentence begins in the reply, while it is read back: a private-use character, which no reply holds (one that
 *  did would give a sentinel too many, and no sentences) */
const SENTINEL = '\ue000'
const WORD = /^[\p{L}\p{N}]/u
const atomsOf = s => [...s.matchAll(ATOM)].map(m => [m.index, m.index + m[0].length])
/** a boundary out of the atom it falls inside */
const outOf = (atoms, c) => { for (const [a, b] of atoms) if (c > a && c < b) return b; return c }
const cumulative = ls => { const out = []; let at = 0; for (const n of ls.slice(0, -1)) { at += n; out.push(at) } return out }
/** how many characters that are not white space the source wire writes before `c`: an escaped @ or an entity one, a
 *  marker none — the placeholder is a space in the plain text */
function shownBefore(wire, c) {
  let n = 0, i = 0
  for (const m of wire.slice(0, c).matchAll(ATOM)) {
    for (; i < m.index; i++) if (!/\s/.test(wire[i])) n++
    if (m[0] === '@@' || m[0][0] === '&') n++
    i = m.index + m[0].length
  }
  for (; i < c; i++) if (!/\s/.test(wire[i])) n++
  return n
}
/** the offset in a plain text where its `n`-th character that is no white space has been passed, and its first letter
 *  or digit from there: where a sentence's first word begins */
function wordAfter(text, n) {
  let i = 0
  for (let seen = 0; i < text.length && seen < n; i++) if (!/\s/.test(text[i])) seen++
  while (i < text.length && !WORD.test(text.slice(i, i + 2))) i++
  return i
}
const nonSpace = s => s.replace(/\s+/g, '').length
/** the pieces equal but for the sentinels and white space (the space rehydrate takes off before a stop-marker is not
 *  taken where a sentinel stands between) */
const sameBut = (withSentinels, b) => {
  const bare = s => s.split(SENTINEL).join('').replace(/\s+/g, '')
  // a sentinel between two markers is a text piece of its own, where the reply has none
  const a = withSentinels.filter(p => !(p.t === 'text' && !p.s.split(SENTINEL).join('')))
  return a.length === b.length && a.every((p, k) => (p.t === 'text' && b[k].t === 'text' ? bare(p.s) === bare(b[k].s) : p === b[k]))
}

/**
 * A unit's sentences as its engine cut them — Microsoft's own sentence lengths for the wire it was sent (`sentLen`, kept
 * by the extension's service as the segment's `alignment`, DESIGN §8.6: lengths in the wire's characters, one pair per
 * sentence, verified to partition both texts) — as where each sentence after the first begins: `src` the offsets of
 * their first words in the unit's plain source (plainSource, what the left side is anchored by), `tr` in its
 * translation's (plainTranslated of `pieces`, what the right side is). `text` the engine's reply, `pieces` what it was
 * read back as (rehydrate, `tolerant` or not). A boundary inside a marker goes to the marker's end — the engine cuts
 * inside the closing marker at a unit's end (`…@g|#`), and rarely inside one in the middle (report-B §2(a)) — and one
 * that then begins no sentence on either side (at the end, after its neighbour, or before a sentence with no word: a
 * formula alone) is dropped on both sides together, the two sentences around it read as one. Null where the lengths do
 * not partition both texts, or the reply's sentences cannot be read back as `pieces`: the unit is lit whole.
 * What a copy keeps (CachedUnit.sentences) is these offsets, and their meaning is three functions': plainSource and
 * plainTranslated, the texts they count in, and anchors.mjs tokens, which turns an offset into the word a side finds
 * (sentenceStarts). Those three are the record's contract: a change to any of them changes what a kept copy's offsets
 * name, and is a change of the record (live.mjs PIPELINE_VERSION)
 */
export function sentencesOf(u, ser, text, alignment, pieces, tolerant = false) {
  const { source, target } = alignment ?? {}
  if (!source?.length || source.length !== target?.length) return null
  if (source.reduce((a, b) => a + b, 0) !== ser.wire.length || target.reduce((a, b) => a + b, 0) !== text.length) return null
  const plain = plainSource(u), translated = plainTranslated(pieces)
  if (shownBefore(ser.wire, ser.wire.length) !== nonSpace(plain)) return null
  const wireAtoms = atomsOf(ser.wire), textAtoms = atomsOf(text)
  const cs = cumulative(source).map(c => outOf(wireAtoms, c)), ct = cumulative(target).map(c => outOf(textAtoms, c))
  // the reply with a sentinel where each sentence begins, read back as the pieces were: the sentinels' places in its
  // plain text are the boundaries'
  let marked = '', last = 0
  for (const c of ct) { marked += text.slice(last, c) + SENTINEL; last = c }
  const back = rehydrate(marked + text.slice(last), ser, tolerant)
  if (back.error || !sameBut(back.pieces, pieces)) return null
  const withSentinels = plainTranslated(back.pieces)
  const tn = []
  for (let i = 0, n = 0; i < withSentinels.length; i++) { const ch = withSentinels[i]; if (ch === SENTINEL) tn.push(n); else if (!/\s/.test(ch)) n++ }
  if (tn.length !== ct.length) return null
  // each pair kept only where both sentences around it hold a word on both sides
  const words = s => tokens(s).length
  const total = [words(plain), words(translated)]
  const out = { src: [], tr: [] }
  let before = [0, 0]
  cs.forEach((c, j) => {
    const at = [wordAfter(plain, shownBefore(ser.wire, c)), wordAfter(translated, tn[j])]
    const k = [words(plain.slice(0, at[0])), words(translated.slice(0, at[1]))]
    if (k[0] <= before[0] || k[1] <= before[1] || k[0] >= total[0] || k[1] >= total[1]) return
    out.src.push(at[0]); out.tr.push(at[1]); before = k
  })
  return out
}

/**
 * A record's sentences (CachedUnit.sentences), where they are of their shape: as many starts on each side, each side's
 * whole numbers rising inside its text — `src` and `tr`, the texts each side is anchored by —; else null, and the unit
 * is lit whole (the review of B3, minor 5: a malformed field threw where the reader worked out the starts, and the
 * side had no highlight)
 */
export function sentencesKept(s, src, tr) {
  const ok = (xs, text) => Array.isArray(xs) && xs.every((o, j) => Number.isInteger(o) && o > (j ? xs[j - 1] : 0) && o < text.length)
  return s && typeof s === 'object' && ok(s.src, src) && ok(s.tr, tr) && s.src.length === s.tr.length ? s : null
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
 * (WIRE), `{ text, by, alignment? }` (engine.mjs). What the placeholders cannot bring back, even tolerantly where the format has a tolerant reading, goes again
 * as runs; a unit none of whose runs came back is left out (it stays in the source language). `how` counts each way.
 */
export async function translateUnits(units, send, format = 'markers') {
  const wire = WIRE[format]
  // unit → { pieces, state, by, sentences? }: whole (read back strictly or tolerantly, or every run back), partial (some runs back),
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
      // a whole unit keeps its sentences where the engine reported them (sentencesOf: markers only, where the alignment
      // is Microsoft's own; the runs below have no wire offsets to hang them on)
      const whole = (pieces, tolerant) => {
        const sentences = format === 'markers' && got.alignment ? sentencesOf(u, sers[i], got.text, got.alignment, pieces, tolerant) : null
        results.set(u, { pieces, state: 'whole', by: got.by, ...(sentences ? { sentences } : {}) })
      }
      const strict = wire.rehydrate(got.text, sers[i])
      if (!strict.error) { whole(strict.pieces, false); how.whole++; return }
      const loose = wire.tolerant?.(got.text, sers[i])
      if (loose && !loose.error) { whole(loose.pieces, true); how.tolerant++; return }
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

/** a text piece as the compiled PDF shows it: a translation's TeX escapes undone, the source's bytes as UTF-8 */
const shown = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s))
const plain = (pieces, textOf) => pieces.map(p => (p.t === 'text' ? textOf(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
/** a unit's plain text in the source (placeholders dropped: anchors are found from text alone) */
export const plainSource = u => plain(u.pieces, p => utf8(p.s))
/** a unit's plain text in its translation, as the compiled PDF shows it */
export const plainTranslated = pieces => plain(pieces, shown)
const SLOT = '￼'
/**
 * A unit's plain text as the PDF shows it (plainTranslated's, which is plainSource's for pieces not translated) and
 * `gaps`, the offsets in it where a placeholder stood: there the page has words the text does not — a formula's, a
 * citation's number — which anchors.mjs lets stand in a run of words (a heading, Round $n$: …). Without placeholders,
 * no `gaps`
 */
export function unitText(pieces) {
  const text = plainTranslated(pieces)
  if (!pieces.some(p => p.t === 'ph' || p.t === 'nested')) return { text }
  const slotted = pieces.map(p => (p.t === 'text' ? shown(p) : p.t === 'ph' || p.t === 'nested' ? ` ${SLOT} ` : ' ')).join('').replace(/\s+/g, ' ').trim()
  let bare = ''
  const gaps = []
  for (const c of slotted) {
    if (c === SLOT) { if (gaps.at(-1) !== bare.length) gaps.push(bare.length) } else if (c !== ' ' || (bare && !bare.endsWith(' '))) bare += c
  }
  // the text is plainTranslated's, character for character, or the offsets would name other places: a text holding
  // the slot character itself gives none
  if (bare.trimEnd() !== text) return { text }
  return { text, gaps: gaps.map(g => Math.min(g, text.length)).filter((g, i, a) => a.indexOf(g) === i) }
}
/**
 * Each unit's text as a compile has it, for the anchors: translated where `done` has its pieces, the source's otherwise;
 * with where its placeholders stood (unitText), its displays beyond its marks (displayEdges) and the sentences of the
 * translation typeset (`sentencesOf(pieces)`: kept by the pieces they belong to, so that a translation come in since does
 * not lend its sentences to the one shown)
 */
export const textsShown = (units, done, sentencesOf) => units.map((u, i) => {
  const pieces = done.get(u), sentences = pieces && sentencesOf(pieces)
  return { id: i, ...unitText(pieces ?? u.pieces), ...displayEdges(u), ...(sentences ? { sentences } : {}) }
})
/** the unit's displays beyond its marks and between its words, their letters as latex-front found them (displayOutside)
 *  or a copy keeps them: for the anchors. A copy made when they were a bare `true` gives none */
export const displayEdges = u => Object.fromEntries(['lead', 'trail', 'inner'].filter(k => typeof u[k] === 'string').map(k => [k, u[k]]))
