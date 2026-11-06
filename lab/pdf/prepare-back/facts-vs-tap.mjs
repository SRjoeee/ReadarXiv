// lab/pdf/prepare-back/facts-vs-tap.mjs: the parts' facts against what today's reader worked out (stage 1a-2's deliverable 4).
// For every unit a reader dump of the baseline lays (the tap's ledgers, readarxiv-lab-data/refactor-2026-11/baseline/tap: each
// unit's last round's L5 and L6 slots), the fact as the prepare states it in its part (run.mjs's bundles and located files,
// joined by the dump's ord) against today's value: equal, or different with its cause. A unit that stands elsewhere on arXiv's
// page than on our compile (its place not `same`) is counted apart. Not shipped.
//   node lab/pdf/prepare-back/facts-vs-tap.mjs <run out> <tap dir> <out.json> [pair…]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const [OUT, TAP, DEST, ...only] = process.argv.slice(2)
const near = (a, b, t = 0.011) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= t
const KEPT = 1, PINNED = 2, SHORTSKIP = 4

/** our members by ord for a paper, their places, and the dump's ords */
const papers = new Map()
function paperOf(id) {
  if (papers.has(id)) return papers.get(id)
  const lf = join(OUT, 'located', `${id}.json`), hf = join(OUT, 'bundles', id, 'head.json')
  if (!existsSync(lf) || !existsSync(hf)) return papers.set(id, null).get(id)
  const located = JSON.parse(readFileSync(lf, 'utf8')), head = JSON.parse(readFileSync(hf, 'utf8'))
  const placed = new Map(), nextOf = new Map()
  head.parts.forEach(d => {
    if (!d) return
    const part = JSON.parse(readFileSync(join(OUT, 'bundles', id, `${d}.part`), 'utf8'))
    for (const fl of part.flows) fl.forEach((m, i) => { if (!placed.has(m.ord)) placed.set(m.ord, m); if (fl[i + 1]) nextOf.set(m.ord, fl[i + 1]) })
  })
  const place = new Map()
  for (const list of Object.values(located.places ?? {})) for (const [o, p] of list) place.set(o, p)
  const P = { placed, place, nextOf, dumpOrds: new Map(located.dumpOrds ?? []) }
  papers.set(id, P)
  return P
}

/** each fact: [name, rows, today's value from the slots, ours from the placed member, equal?] */
const own = m => m.lines.filter(l => !(l[9] & KEPT))
const FACTS = [
  ['size', 'E6, C5', s => s.params?.s, m => m.style.size, (a, b) => near(a, b)],
  ['role', 'C5', s => { const f = s.elements?.orig?.key?.split('|')[0]; return f && f !== 'math' ? f : undefined }, m => m.style.role, (a, b) => a === b],
  ['weight', 'C5', s => s.elements?.orig?.key ? s.elements.orig.key.split('|')[1] === 'b' : undefined, m => !!m.style.bold, (a, b) => a === b],
  ['slant', 'C5', s => s.elements?.orig?.key ? s.elements.orig.key.split('|')[2] === 'i' : undefined, m => !!m.style.slant, (a, b) => a === b],
  ['firstX0', 'C8, E16', s => s.elements?.firstX0 ?? undefined, m => own(m)[0]?.[2], (a, b) => near(a, b)],
  ['kept lines', 'C9, B17', s => s.elements?.keep, m => m.lines.filter(l => l[9] & KEPT).length, (a, b) => a === b],
  ['tail', 'C20', s => (s.elements ? s.elements.tail ?? '' : undefined), m => (m.tail ?? []).map(([t]) => t).join(''), (a, b) => a === b],
  ['label', 'C10, B16', s => (s.label ? s.label.label?.x1 ?? null : undefined), m => m.label?.ink[3] ?? null, (a, b) => (a === null && b === null) || near(a, b)],
  ['centred', 'B3, E8', s => (s.decor ? s.decor.centredFlag === true : undefined), m => m.align === 'c', (a, b) => a === b],
  ['head alone', 'E23', s => s.params?.halfLead?.head, m => { const l = own(m)[0]; return l ? !(l[9] & PINNED) : undefined }, (a, b) => a === b],
  ['foot alone', 'E23', s => s.params?.halfLead?.foot, m => { const l = own(m).at(-1); return l ? !(l[9] & PINNED) : undefined }, (a, b) => a === b],
  ['below', 'E23', s => { const v = s.params?.halfLead?.below; return v === undefined ? undefined : typeof v === 'number' ? v : null }, m => m.room.next ?? null, (a, b) => (a === null && b === null) || near(a, b, 0.02)],
  ['pitch', 'E10', s => s.blocks?.blocks?.[0]?.pitch0 ?? undefined, m => m.lead, (a, b) => near(a, b, 0.02)],
  ['band', 'E24', s => (s.params?.clear ? (s.params.clear.bands ?? 0) > 0 : undefined), m => !!m.room.band, (a, b) => a === b],
  ['forced breaks', 'C14', s => (s.breaks ? s.breaks.breaks.filter(b => !b[4]).map(b => b[2]).sort() : undefined), m => (m.els ?? []).filter(([, e]) => e.ends).map(([, e]) => e.ends[1]).sort(), (a, b) => a.length === b.length && a.every((x, i) => (x === null ? true : near(x, b[i], 0.02)))],
  ['paragraphs opened', 'C13, C15', s => (s.breaks ? s.breaks.paraAt : undefined), m => (m.els ?? []).filter(([, e]) => e.opens !== undefined).length, (a, b) => a === b],
  ['short skips', 'E15', s => (s.blocks ? s.blocks.blocks.reduce((n, b) => n + (b.shortSkips?.length ?? 0), 0) : undefined), m => m.lines.filter(l => l[9] & SHORTSKIP).length, (a, b) => a === b],
  ['elements kept', 'D2, B11', s => (s.elements ? s.elements.modes.filter(x => x[1] === 'kept').length : undefined), m => (m.els ?? []).filter(([, e]) => e.keep).length, (a, b) => a === b],
  ['mark after', 'D10, D11', s => (s.elements ? s.elements.modes.filter(x => /origAfter|heldAfter/.test(x[5])).length : undefined), m => (m.els ?? []).filter(([, e]) => e.after !== undefined).length, (a, b) => a === b],
]

/** a difference's cause, by fact (each class's reading in lanes/L1-prepare.md) */
const overlaps = (k, l) => k[0] === l[0] && Math.min(k[4], l[5]) > Math.max(k[2], l[6])
const displayRows = m => m.lines.filter(l => l[9] & KEPT && (m.els ?? []).some(([, e]) => e.kind === 'display' && e.ink.some(k => overlaps(k, l)))).length
const CAUSE = {
  size: (a, b) => (Math.abs(a - b) < 0.5 ? 'two readings of one font size (today: the median of its text items\' heights; the part: its glyphs\' most common size)' : 'the majority (today: by matched source words; the part: by its own glyphs)'),
  role: () => 'the majority (today: by matched source words; the part: by its own glyphs)',
  weight: () => 'the majority (today: by matched source words; the part: by its own glyphs)',
  slant: () => 'the majority (today: by matched source words; the part: by its own glyphs)',
  firstX0: (a, b, m) => { const l = own(m)[0]; return (m.els ?? []).some(([, e]) => e.ink.some(k => overlaps(k, l) && Math.abs(k[1] - l[2]) < 0.02)) ? 'its first line begins with an element (today: the first source word\'s start; the part: the line\'s first glyph)' : m.label ? 'a label on its first line' : a > b ? 'today\'s first word after other glyphs of its own' : 'other' },
  'kept lines': (a, b, m, P, s) => {
    // (today's displays in order, each kept with file lines (`region:`) or in place with none (`inPlace`), against the part's
    // displays in their order: the part's rows of the ones today keeps with file lines, and its held lines)
    const today = (s.elements?.modes ?? []).filter(x => x[2] === 'display')
    const ours = (m.els ?? []).filter(([, e]) => e.kind === 'display')
    const rowsOf = e => m.lines.filter(l => l[9] & KEPT && e.ink.some(k => overlaps(k, l))).length
    const held = b - displayRows(m)
    if (today.length === ours.length && ours.length) {
      const filed = ours.reduce((n, [, e], q) => n + (/inPlace/.test(today[q][5]) ? 0 : rowsOf(e)), 0)
      if (held + filed === a) return 'a display today keeps in place with no file line (inPlace: a unit\'s first or last piece, or a frame\'s); the part: its rows, KEPT lines (design-a)'
      return held + filed < a ? 'a display\'s rows: today the page\'s text lines it touches (a stacked part, a deep script a line of its own); the part TeX\'s rows (rows.ts: its ink\'s bands, joined where its glyphs interleave)' : 'a display\'s rows: the part more rows than today\'s text lines'
    }
    return ours.length ? 'displays told otherwise (today and the part do not count the same displays)' : b > a ? 'more lines kept (a held line the source does not write)' : 'fewer lines kept'
  },
  'short skips': (a, b, m) => (!displayRows(m) ? 'other' : a === 0 ? 'the part a short skip where today none' : b === 0 ? 'today a short skip where the part none' : 'both, counted otherwise'),
  pitch: (a, b, m) => (own(m).length < 2 ? 'one line of its own (the part: a smaller line set close under kept in the line by the line rule; its lead then 1.2 sizes)' : 'today: the pitch of its first block; the part: the median of all its lines\' gaps'),
  label: (a, b, m) => (a !== null && b === null ? (m.kind === 'footnote' ? 'a footnote\'s mark (today: read as a label, TEX:550; the instrument: its mark no label)' : `${m.kind}: today\'s LABEL reading (L2:1128) of its text`) : a === null ? 'a label the instrument states and today\'s reading did not take' : 'the label\'s extent'),
  centred: (a, b, m) => (m.kind === 'cell' ? 'a cell\'s alignment (E8: 1b, the tabular preamble)' : `${a ? 'today centred' : 'the part centred'}: TeX told nothing; today the maker\'s reading on B, the part on A`),
  'head alone': (a, b, m) => (m.label && m.label.ink[0] === own(m)[0]?.[0] ? 'its label on the line (today: head false wherever a label is not drawn anew; the label is its own group)' : m.join ? 'a flow\'s member before it on the line (travels with its own text)' : a ? 'ink that stays on its baseline (the part)' : 'other ink on its baseline that travels (today counts any)'),
  'foot alone': (a, b, m, P) => (P.nextOf.get(m.ord)?.join ? 'a flow\'s member after it on the line (travels with its own text)' : a ? 'ink that stays on its baseline (the part)' : 'other ink on its baseline that travels (today counts any)'),
  below: (a, b, m) => (a === null ? 'today finds no line under it, the part one' : b === null ? 'the part finds no line under it, today one' : own(m).some(l => l[1] !== own(m).at(-1)[1]) ? 'across: today under its last block\'s span (both columns), the part under its last line\'s column' : Math.abs(a - b) < 0.5 * m.style.size ? 'the same next line, its baseline read otherwise (within half a size)' : a < b ? 'today a nearer line under it' : 'the part a nearer line under it'),
  tail: (a, b, m) => (a && !b && m.lines.at(-1)?.[9] & KEPT ? 'a unit that ends with a display: today reads the display\'s own stop as the class\'s tail (an inPlace display\'s glyphs are no rendering of today\'s); the part: the display\'s (its el `stop`)' : !a && b ? 'the part takes marks today does not' : 'other'),
  'mark after': (a, b, m) => (a > b && m.lines.at(-1)?.[9] & KEPT ? 'a display that ends the unit (today: inPlace, its origAfter the unit\'s first character; the drop rule reads it only where the display opens the unit)' : 'other'),
  band: (a, b) => (!a && b ? 'today\'s door passes no table rules (hiding.rules): no band on any cell' : 'other'),
}

const ledgers = readdirSync(join(TAP, 'ledgers')).filter(f => f.endsWith('.ledger.json.gz')).sort()
const out = { pairs: 0, units: 0, joined: 0, missing: {}, facts: Object.fromEntries(FACTS.map(([n, rows]) => [n, { rows, same: { equal: 0, different: 0 }, elsewhere: { equal: 0, different: 0 } }])) }
for (const f of ledgers) {
  const pair = f.replace(/\.ledger\.json\.gz$/, '')
  if (only.length && !only.includes(pair)) continue
  const L = JSON.parse(gunzipSync(readFileSync(join(TAP, 'ledgers', f))).toString('utf8'))
  out.pairs++
  const P = paperOf(pair.replace(/-[a-z-]+(?:\.pack)?$/, ''))
  for (const u of L.units) {
    if (u.dump !== 'laid') continue
    out.units++
    const last = Math.max(0, ...u.slots.map(s => s.round))
    const s = {}
    // (a step's slots of the round, merged: U.decor's second slot is a carried label's crop, beside its first)
    for (const x of u.slots) {
      if (x.round !== last) continue
      const k = { 'U.elements': 'elements', 'U.breaks': 'breaks', 'U.label': 'label', 'U.decor': 'decor', 'U.params': 'params', 'U.blocks': 'blocks' }[x.by] ?? '_'
      s[k] = s[k] && typeof s[k] === 'object' && x.value && typeof x.value === 'object' ? { ...x.value, ...s[k] } : (s[k] ?? x.value)
    }
    const mo = P?.dumpOrds.get(u.ord)
    const m = mo === undefined ? undefined : P.placed.get(mo)
    if (!m) { const why = !P ? 'no paper' : mo === undefined ? 'no member' : 'no part holds it'; out.missing[why] = (out.missing[why] ?? 0) + 1; continue }
    out.joined++
    const where = P.place.get(mo) === 'same' ? 'same' : 'elsewhere'
    for (const [name, , today, ours, eq] of FACTS) {
      const a = today(s)
      if (a === undefined) continue
      const b = ours(m)
      if (b === undefined) continue
      const F = out.facts[name]
      const ok = eq(a, b)
      F[where][ok ? 'equal' : 'different']++
      if (ok || where !== 'same') continue
      const cause = CAUSE[name]?.(a, b, m, P, s) ?? 'other'
      const C = (F.causes ??= {})[cause] ??= { n: 0, examples: [] }
      C.n++
      if (C.examples.length < 3 && !C.examples.some(e => e.paper === pair.replace(/-[a-z-]+(?:\.pack)?$/, '') && e.ord === u.ord)) C.examples.push({ pair, paper: pair.replace(/-[a-z-]+(?:\.pack)?$/, ''), ord: u.ord, member: mo, kind: m.kind, today: a, ours: b })
    }
  }
}
writeFileSync(DEST, `${JSON.stringify(out, null, 1)}\n`)
for (const [n, F] of Object.entries(out.facts)) {
  console.log(`${n.padEnd(18)} same ${String(F.same.equal).padStart(6)} = ${String(F.same.different).padStart(5)} ≠   elsewhere ${String(F.elsewhere.equal).padStart(5)} = ${String(F.elsewhere.different).padStart(5)} ≠`)
  for (const [c, C] of Object.entries(F.causes ?? {}).sort((x, y) => y[1].n - x[1].n)) console.log(`    ${String(C.n).padStart(5)}  ${c}`)
}
console.log(JSON.stringify({ pairs: out.pairs, units: out.units, joined: out.joined, missing: out.missing }))
