// U.label (design-b §1.5): a float's label in the target's name (T26) and a theorem-like head's (T27), each with the
// original's number and punctuation, and the label the unit is then laid with. Ported from engine 065c1d973: labelInTarget
// L2:1184-1195, spacedText L2:1230-1235, headLabelInTarget L2:1245-1259 (BABEL_HEADS L2:1274), the run's choice RUN:2029-2036,
// rules/tex-names.mjs headName :60-63, colourOfStyle L2:2909, hexOf L2:4569. A head is named from the parts its part states
// (Label.name, num, punct, as TeX set them), not by today's pattern over its text (headInTarget :145-161, which took one
// capital before a number's first dot and no more: "Corollary VI.2" stayed the original's, 2610.21312v1).
//
// Its inputs, and the field each comes from once lane L1 states it (until then the tap's recorded values):
// - `label`: the label the class set before the unit's first line, its glyphs (prepareUnit's) ← Placed.label (Label: kind,
//   ink, name, num, punct, their styles); today's glyphs are the page's characters in its box
// - `head`: a theorem-like head's parts ← Placed.label's name, num and punct, each one glyph of its ink with its text and
//   style
// - `relabels`: the unit's label group exists and the wrap does not keep the label as the original's ← Placed.fixed (bit 4)
// - `words`: babel's names in the target (Rules.words); `heads`: translator's dictionary's head names in the target
//   (rules/tex-names.json, a data file of Rules); `names`: the paper's own name units' translations (A6, other rows)

/** a glyph of a label as the rule reads it: its character, its extent, its size and its font state */
export type Glyph = {
  ch: string
  x0: number
  x1: number
  size?: number
  st?: { fam?: string; bold?: boolean; italic?: boolean; fill?: number } | null
}
/** a part of a label drawn anew: its text in its own style */
export type LabelPart = { text: string; st: { bold?: boolean; italic?: boolean; color?: string | undefined } }
/** a caption's label as its part states it with its float's type (Label.float, LaTeX's \@captype): its type, its name, and
 *  its glyphs after the name (its number and punctuation as TeX printed them), and whether its parts hold its every glyph */
export type FloatLabel = { type: string; name: string; rest: readonly Glyph[]; num: boolean; whole: boolean }
/** the unit's label, as the unit is laid with it: its glyphs, and where it is drawn anew its words (`drawn`, `parts`) and
 *  whether it ends in an opening bracket (`open`); a caption's, its float's type where its part states one (`float`) */
export type UnitLabel = {
  x1: number
  text: string
  chars: readonly Glyph[]
  drawn?: string
  parts?: readonly LabelPart[]
  open?: boolean
  float?: FloatLabel
}
export type HeadLabel = { text: string; parts: LabelPart[]; open: boolean; chars: readonly Glyph[] }
/** a theorem-like head's parts as its part states them (Label.name, num, punct: amsthm's \thmname, \thmnumber and the
 *  punctuation after them), each one glyph of its ink; `whole`, whether they hold the label's every glyph, from its ink's
 *  start (the name first) to its end, its own 1/100 grid: a swapped head (amsthm's \swapnumbers, "3.2 Theorem") or one
 *  with glyphs no part holds is no head the rule can name, and keeps the original's (FloatLabel.whole's test) */
export type HeadParts = { name?: Glyph; num?: Glyph; punct?: Glyph; whole: boolean }

export type LabelInput = {
  label: UnitLabel | undefined
  head: HeadParts | null
  kind: string
  /** the reader draws labels anew (today's door: always) */
  labels: boolean
  relabels: boolean
  to: string
  words: Readonly<Record<string, string>> | null
  captions: Readonly<Partial<Record<'figure' | 'table', string>>> | null
  heads: Readonly<Record<string, string>> | null
  names: ReadonlyMap<string, string> | null
}
export type Labelled = { relabel: string | null; head: HeadLabel | null; label: UnitLabel | undefined }

/** babel's names in English (layout/names.mjs:12 NAME_ENGLISH): a head that is one whole is the names' own */
const NAME_ENGLISH = [
  'Abstract',
  'References',
  'Bibliography',
  'Contents',
  'List of Figures',
  'List of Tables',
  'Appendix',
  'Index',
  'Proof',
  'Preface',
  'Glossary',
  'Figure',
  'Table',
]
const BABEL_HEADS = new RegExp(`^\\s*(?:${NAME_ENGLISH.join('|')})\\s*[.:\\u2013\\u2014]?\\s*$`, 'u')

/** a float's label in the target's name, its number and punctuation the original's; null where it keeps the original's
 *  (L2:1184 labelInTarget). Where its part states its float's type (`float`, the owner's ruling of 2026-11-08: one form a
 *  paper), by the type: a figure's or a table's in the rules' word, its glyphs after its name as TeX printed them, any
 *  number ("A1", "S3", "I"); any other type's (an algorithm's, a sub-figure's) the original's, and one whose parts do not hold
 *  its every glyph or state no number. Else by its spelling, as today's */
export function labelInTarget(
  label: UnitLabel | undefined,
  names: LabelInput['words'],
  captions: LabelInput['captions'],
  to: string,
): string | null {
  const f = label?.float
  if (f) {
    const kind = f.type === 'figure' || f.type === 'table' ? f.type : null
    if (!kind || captions?.[kind] !== 'target' || !names?.[kind] || !f.whole || !f.num || !/\p{L}/u.test(f.name))
      return null
    const name = f.name === f.name.toUpperCase() ? names[kind]!.toLocaleUpperCase(to) : names[kind]!
    return name === f.name ? null : `${name} ${spacedText(f.rest)}`
  }
  const m =
    label?.text &&
    /^\s*(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE)\s*([0-9]+(?:\.[0-9]+)?[a-z]?|[IVXL]+)\s*([.:]?)\s*$/.exec(label.text)
  if (!m || !names) return null
  const kind = /^t/i.test(m[1]!) ? 'table' : 'figure'
  if (captions?.[kind] !== 'target' || !names[kind]) return null
  const caps = m[1] === m[1]!.toUpperCase()
  const name = caps ? names[kind]!.toLocaleUpperCase(to) : names[kind]!
  if (name === m[1]) return null
  const punct =
    m[3] ||
    ((label.chars ?? [])
      .map((c) => c.ch)
      .join('')
      .match(/[.:]$/)?.[0] ??
      '')
  return `${name} ${m[2]}${punct}`
}

/** a label's glyphs as its text: a space where two stand a fifth of their size apart (L2:1230 spacedText) */
export function spacedText(chars: readonly Glyph[]): string {
  const cs = [...(chars ?? [])].filter((c) => /\S/.test(c.ch ?? '')).sort((a, b) => a.x0 - b.x0)
  let out = ''
  cs.forEach((c, i) => {
    if (i && c.x0 - cs[i - 1]!.x1 >= 0.2 * Math.max(c.size ?? 0, cs[i - 1]!.size ?? 0)) out += ' '
    out += c.ch
  })
  return out
}

/** a head's name in the target: translator's dictionary's, else the paper's own name unit's (tex-names.mjs:60 headName) */
function headName(english: string, heads: LabelInput['heads'], names: LabelInput['names']): string | null {
  if (!heads) return null
  if (Object.hasOwn(heads, english) && heads[english]) return heads[english]!
  const w = names?.get?.(english)
  return typeof w === 'string' && w.trim() ? w.trim() : null
}
const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
/** a glyph's fill as a style's colour (L2:2909 colourOfStyle) */
const colourOfStyle = (st: Glyph['st']) =>
  Number.isInteger(st?.fill) && st!.fill! >= 0 ? { color: st!.fill! > 0 ? hexOf(st!.fill!) : undefined } : {}

/** a theorem-like head's label as the target names it, in its parts' styles (L2:1245 headLabelInTarget): its name in the
 *  target's word (the rules' head names, else the paper's own name unit's), its number and its punctuation as TeX printed them,
 *  a space before the punctuation where it stands apart (spacedText's reading); null for a babel name's head (the names path's),
 *  a head of no name, and a name nothing names in the target. An unnumbered head whose name ends in its own stop, a style that
 *  sets no punctuation after it ("Thm."), is named with its stop where its name alone is not */
export function headLabelInTarget(
  head: HeadParts,
  heads: LabelInput['heads'],
  names: LabelInput['names'],
): Omit<HeadLabel, 'chars'> | null {
  const chars = [head.name, head.num, head.punct].filter((c): c is Glyph => !!c)
  if (!head.name || !head.whole || BABEL_HEADS.test(spacedText(chars))) return null
  const english = head.name.ch.replace(/\s+/g, ' ').trim()
  if (!/^\p{L}/u.test(english)) return null
  // (its punctuation as TeX set it, a space before it where it stands a fifth of its size apart: "Definition 5.1 (")
  const before = head.num ?? head.name,
    p = head.punct
  let name = headName(english, heads, names),
    tail = p ? `${p.x0 - before.x1 >= 0.2 * Math.max(p.size ?? 0, before.size ?? 0) ? ' ' : ''}${p.ch}` : ''
  if (!name && !head.num && /^\s*\./.test(tail)) {
    const dotted = headName(`${english}.`, heads, names)
    if (dotted) {
      name = dotted
      tail = tail.replace(/^\s*\./, '')
    }
  }
  if (!name) return null
  const drawn = `${name}${head.num ? ` ${head.num.ch}` : ''}${tail.replace(/\s+/g, ' ')}`
  const drawnTail = /[\s.:([]*$/.exec(drawn)![0]
  const own = (st: Glyph['st']) =>
    st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic, ...colourOfStyle(st) } : {}
  const parts: LabelPart[] = [{ text: drawn.slice(0, drawn.length - drawnTail.length), st: own(head.name.st) }]
  if (drawnTail) parts.push({ text: drawnTail, st: own((head.punct ?? chars.at(-1))?.st) })
  return { text: drawn, parts, open: /[([]\s*$/.test(drawn) }
}

/** U.label: the unit's label in the target where the reader draws it anew, and the label it is laid with (RUN:2029-2036) */
export function label(i: LabelInput): Labelled {
  const relabel = i.labels && i.relabels ? labelInTarget(i.label, i.words, i.captions, i.to) : null
  const read =
    !relabel && i.labels && i.relabels && (i.kind === 'theorem' || i.kind === 'heading') && i.head?.name
      ? headLabelInTarget(i.head, i.heads, i.names)
      : null
  const head = read
    ? { ...read, chars: [i.head!.name, i.head!.num, i.head!.punct].filter((c): c is Glyph => !!c) }
    : null
  let out = i.label
  if (head)
    out = {
      ...(out ?? {}),
      x1: Math.max(...head.chars.map((c) => c.x1)),
      text: head.chars.map((c) => c.ch).join(''),
      chars: head.chars,
      drawn: head.text,
      parts: head.parts,
      open: head.open,
    }
  if (relabel) out = { ...out!, drawn: relabel }
  return { relabel, head, label: out }
}
