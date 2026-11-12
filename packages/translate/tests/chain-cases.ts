// The chain's case table: what CHAIN_DIGEST (src/chain.ts) is the hash of. Each case is a call through the chain with fake
// translators, and its outcome is every unit's result; the digest is the SHA-256 of the outcomes of every case, in the
// table's order, as canonical JSON (an object's keys sorted, so that only what a result says moves it). Each of the chain's
// own rules has a case here whose outcome that rule alone decides: without the rule the case's results differ. A change to
// a rule that changes an outcome fails tests/chain-digest.test.ts until the new digest is written, and the chain's identity
// (identityOf) moves with it: every row of every chain is asked again.
//
// The texts are ASCII and Latin-script, so that no case reads a word boundary ICU's dictionaries decide (a CJK text's), which
// a Node with another ICU could cut otherwise. A case is added with the change it holds, never alone: a case added moves
// the digest as a change of behaviour does.
import { chainOf, keyOf } from '../src/chain.ts'
import {
  Fault,
  type Lang,
  type OutPiece,
  type Piece,
  type Result,
  type Translator,
  type UnitIn,
} from '../src/contract.ts'
import { sha256Hex } from '../src/sha256.ts'
import { type FakeOptions, fakeTranslator, mangler } from '../src/testing/fakes.ts'
import { fakeClock, memoryStore } from '../src/testing/ports.ts'
import { el, span, t, unit } from './pieces.ts'

/** the chain's own rules, as the chain's comment names them (src/chain.ts CHAIN_DIGEST); `base` the outcome every rule
 *  starts from (a reply accepted is the row, a unit with no letter its own translation, a stored reply judged again) */
export const RULES = [
  'base',
  'fall-through',
  'reask',
  'runs>=2-whole',
  'runs-heads',
  'after',
  'groups/2',
  'names',
  'references',
  'pass-whole',
  'words',
] as const
export type Rule = (typeof RULES)[number]

export interface ChainCase {
  rule: Rule
  /** what the case holds, for a reader of the table: not in the digest */
  name: string
  target: Lang
  units: readonly UnitIn[]
  /** the chain's translators, made anew for each run (a fake that counts its replies starts again) */
  translators: () => Translator[]
  /** replies a store holds before the call: the translator (by its place in the chain), the unit, the raw reply */
  stored?: readonly { at: number; unit: UnitIn; raw: string }[]
}

// ---------------------------------------------------------------- the translators

const mapText = (out: readonly OutPiece[], f: (s: string) => string): OutPiece[] =>
  out.map((p) =>
    p.t === 'text'
      ? { t: 'text', s: f(p.s) }
      : p.t === 'span'
        ? { t: 'span', id: p.id, content: mapText(p.content, f) }
        : p,
  )
const flat = (out: readonly OutPiece[]): OutPiece[] => out.flatMap((p) => (p.t === 'span' ? flat(p.content) : [p]))
const plainOf = (out: readonly OutPiece[]): string =>
  flat(out)
    .map((p) => (p.t === 'text' ? p.s : ''))
    .join('')
const caps = (s: string) => s.toUpperCase()

/** gives every unit back with its text in capitals, its elements and groups where they were */
const upper = (identity = 'upper:0', o: Omit<FakeOptions, 'identity' | 'reply'> = {}) =>
  fakeTranslator({ identity, ...o, reply: (out) => mapText(out, caps) })
/** gives a unit of text alone back in capitals, and nothing for one that holds an element or a group (refused) */
const textOnly = (identity = 'text-only:0') =>
  fakeTranslator({ identity, reply: (out) => (out.some((p) => p.t !== 'text') ? [] : mapText(out, caps)) })
/** answers from a table by the unit's plain text, its groups dropped; a text not in the table comes back as it is */
const table = (identity: string, rows: Readonly<Record<string, string>>) =>
  fakeTranslator({
    identity,
    reply: (out) => {
      const s = plainOf(out)
      return [{ t: 'text', s: rows[s] ?? s }]
    },
  })

// ---------------------------------------------------------------- the units

const withMath = unit('m', [t('We fix '), el('x'), t(' here.')])
const plain = unit('p', [t('Plain words only.')])
const tie: Piece = { t: 'el', id: '1', kind: 'space' }
const figure: Piece = { t: 'el', id: '2', kind: 'ref', name: 'Figure' }
const backrefs: Piece = { t: 'el', id: 'l', kind: 'macro', after: ' ' }
const lead = unit('u', [t('First, '), span('3', 'bold', [t('the hierarchical structure')]), t(' keeps the order.')])

// ---------------------------------------------------------------- the table

export const CASES: readonly ChainCase[] = [
  // ---- base
  {
    rule: 'base',
    name: 'a unit with no letter is its own translation; one with letters is the reply accepted',
    target: 'de',
    units: [unit('n', [t('2024 '), el('m')]), plain],
    translators: () => [upper()],
  },
  {
    rule: 'base',
    name: 'a stored reply is the row, not asked; one refused when read again is asked again',
    target: 'de',
    units: [unit('s', [t('Stored words here.')]), unit('r', [t('We fix '), el('x'), t(' again.')])],
    translators: () => [upper()],
    stored: [
      {
        at: 0,
        unit: unit('s', [t('Stored words here.')]),
        raw: JSON.stringify({ content: [{ t: 'text', s: 'Gespeichert.' }] }),
      },
      {
        at: 0,
        unit: unit('r', [t('We fix '), el('x'), t(' again.')]),
        raw: JSON.stringify({ content: [{ t: 'text', s: 'Ohne.' }] }),
      },
    ],
  },
  {
    rule: 'base',
    name: "a reply's sentences kept where they reconstruct",
    target: 'de',
    units: [unit('k', [t('One sentence here. Two sentences.')], true)],
    translators: () => [upper('upper:0', { sentences: () => ({ src: [19], tr: [19] }) })],
  },
  {
    rule: 'base',
    name: "a reply's sentences that do not reconstruct are dropped, the translation kept",
    target: 'de',
    units: [unit('j', [t('One sentence here. Two sentences.')], true)],
    translators: () => [upper('upper:0', { sentences: () => ({ src: [19], tr: [999] }) })],
  },
  // ---- fall-through: a unit the first translator's reply loses an element of goes to the second; the other stays the first's
  {
    rule: 'fall-through',
    name: 'per unit: only the unit refused reaches the next translator',
    target: 'de',
    units: [withMath, plain],
    translators: () => [mangler('drop-el', 'first:0'), upper('second:0')],
  },
  // ---- reask: a translator that asks it is asked a refused unit once more, alone
  {
    rule: 'reask',
    name: 'a refused unit asked once more of the same translator, before the next',
    target: 'de',
    units: [withMath],
    translators: () => {
      let n = 0
      const flaky = fakeTranslator({
        identity: 'flaky:0',
        limits: { reask: 1 },
        reply: (out) => (n++ === 0 ? out.filter((p) => p.t !== 'el') : out),
      })
      return [flaky, upper('second:0')]
    },
  },
  // ---- the runs floor: its stretches through the chain, a stretch of fewer than two letters kept, every stretch or none
  {
    rule: 'runs>=2-whole',
    name: 'a unit every translator refused: its stretches asked through the chain, put back between the elements',
    target: 'de',
    units: [unit('r', [t('First words here '), el('a'), t(' then more words.')])],
    translators: () => [textOnly()],
  },
  {
    rule: 'runs>=2-whole',
    name: 'a stretch of fewer than two letters is kept as it stands',
    target: 'de',
    units: [unit('x', [t('Alpha words '), el('a'), t(' x '), el('b'), t(' omega words.')])],
    translators: () => [textOnly()],
  },
  {
    rule: 'runs>=2-whole',
    name: 'refused where a stretch came back from no translator: never half translated',
    target: 'de',
    units: [unit('h', [t('alpha words '), el('a'), t(' omega words')])],
    translators: () => [
      fakeTranslator({
        identity: 'alpha:0',
        reply: (out) =>
          out.length === 1 && out[0]?.t === 'text' && out[0].s.startsWith('alpha') ? mapText(out, caps) : [],
      }),
    ],
  },
  // ---- runs-heads: a group that is no edge of a stretch keeps its head (a declaration's place) in a copy of itself
  {
    rule: 'runs-heads',
    name: "the runs floor keeps a group's head in a copy of the group, its words in the stretch",
    target: 'de',
    units: [
      unit('d', [
        t('We use '),
        span('1', 'italic', [el('2', 'other'), t(' all the words')]),
        t(' and '),
        el('m'),
        t(' more words.'),
      ]),
    ],
    translators: () => [textOnly()],
  },
  // ---- after: an element TeX sets after the unit's text is given to no translator and comes back after the translation
  {
    rule: 'after',
    name: "backref's list after an entry: sent to no translator, put back after the translation with its space",
    target: 'de',
    units: [
      unit('b', [
        t('A. Author. A title of a paper. In Proc., '),
        el('pp', 'number'),
        t(' '),
        el('y', 'number'),
        backrefs,
      ]),
    ],
    translators: () => [upper()],
  },
  // ---- groups/2: a group the reply did not bring back placed around its own text where the translation states it
  {
    rule: 'groups/2',
    name: 'a group the reply dropped, placed back around its own text',
    target: 'de',
    units: [unit('g', [t('A '), span('b', 'bold', [t('bold')]), t(' word.')])],
    translators: () => [mangler('drop-span', 'drop:0')],
  },
  {
    rule: 'groups/2',
    name: 'a text the source holds only as groups of one style, n times: each of the n placed (RQ2 twice)',
    target: 'de',
    units: [
      unit('q', [
        span('0', 'bold', [t('RQ2')]),
        t(' concerns the initial state. We answer '),
        span('4', 'bold', [t('RQ2')]),
        t(' now.'),
      ]),
    ],
    translators: () => [mangler('drop-span', 'drop:0')],
  },
  {
    rule: 'groups/2',
    name: "a group's end mark matched by its class, the reply's own stop inside the group (RQ1. as RQ1。)",
    target: 'de',
    units: [unit('i', [t('In summary, '), span('2', 'bold', [t('RQ1.')]), t(' The model keeps its accuracy.')])],
    translators: () => [
      table('stop:0', { 'In summary, RQ1. The model keeps its accuracy.': 'Kurz, RQ1。 Das Modell bleibt genau.' }),
    ],
  },
  // ---- names: a word tied to a reference that abbreviates its item's name is sent as the name
  {
    rule: 'names',
    name: "an abbreviation before a reference sent as the item's name",
    target: 'de',
    units: [unit('f', [t('As shown in Fig.'), tie, figure, t(', it holds.')])],
    translators: () => [upper()],
  },
  // ---- references: a phrase group a markers-wire translator's reply did not bring back placed by its reference
  {
    rule: 'references',
    name: "a phrase group placed where a markers-wire reply states the group's own translation",
    target: 'de',
    units: [lead],
    translators: () => [
      {
        ...table('markers:0', {
          'First, the hierarchical structure keeps the order.':
            'Zuerst behaelt die hierarchische Struktur die Ordnung.',
          'the hierarchical structure': 'die hierarchische Struktur',
        }),
        wire: 'markers',
      },
    ],
  },
  // ---- pass-whole: a request refused for no reason of its size goes whole to the next translator; alone, it is unavailable
  {
    rule: 'pass-whole',
    name: 'a 400 to every request: each unit unavailable (the service), never refused (the unit)',
    target: 'de',
    units: [unit('a1', [t('First unit words.')]), unit('a2', [t('Second unit words.')])],
    translators: () => [
      fakeTranslator({ identity: 'refuser:0', script: () => ({ fault: new Fault('pass', 'malformed', '400') }) }),
    ],
  },
  // ---- words: a group that is not `must` with an edge inside a word is offered to no translator
  {
    rule: 'words',
    name: 'a group that cuts a word: the word sent whole and plain, the row unstyled',
    target: 'de',
    units: [unit('w', [span('1', 'bold', [t('I')]), t('nduce the model to answer.')])],
    translators: () => [upper()],
  },
]

// ---------------------------------------------------------------- the outcome and the digest

/** JSON with every object's keys sorted */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v !== null && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

/** one case through a chain of its own: every unit's result, by id */
export async function outcomeOf(c: ChainCase): Promise<Result[]> {
  const translators = c.translators()
  const store = memoryStore()
  for (const s of c.stored ?? []) {
    const tr = translators[s.at] as Translator
    store.entries.set(keyOf(tr, c.target, tr.write(s.unit, c.target)), s.raw)
  }
  const out: Result[] = []
  for await (const r of chainOf({ clock: fakeClock(), store }).translate(c.units, c.target, { translators }))
    out.push(r)
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The chain's behaviour digest: the SHA-256 of every case's outcome, in the table's order */
export async function chainDigest(cases: readonly ChainCase[] = CASES): Promise<string> {
  const outcomes: Result[][] = []
  for (const c of cases) outcomes.push(await outcomeOf(c))
  return sha256Hex(canonical(outcomes))
}
