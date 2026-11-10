// The translator contract (interfaces/translate/DECISION.md): what a host learns, what an adapter's author learns. Types and
// the one error class; no I/O. The platform's own types (AbortSignal, fetch, Response) are not visible to a Node package
// with no DOM library, so the few members the package uses are stated here, structurally: the hosts' real objects fit them.

/** A target language, BCP-47 (`zh-Hans`, `ja`, `sr-Cyrl`). Each adapter maps it to its endpoint's own code */
export type Lang = string
/** the language every translator is asked to translate from (each adapter's request names it: Microsoft's `from`, Google's
 *  source, Chrome's `sourceLanguage`), BCP 47 */
export const SOURCE: Lang = 'en'

/** An element's kind, as the source reader typed it: an open string (`math`, `display`, `cite`, `ref`, `url`, `code`,
 *  `note-mark`, `other`, …). A wire reads it for three things only: what the element reads as to a sentence cutter where the
 *  host says nothing (`reads`); for `display`, that it keeps a marker of its own (`alone`); and whether it can stand inside a
 *  word, its characters the word's (one that reads as a word: a formula, a macro, an escaped character; never `other`, the
 *  kind of an element its reader states nothing of, nor a display, a space, a break, a reference or an annotation) */
export type ElKind = string
/** A span's style: an open string (`bold`, `italic`, `mono`, `link`, `label`, …). The wire reads `must`, never the style */
export type SpanStyle = string

/**
 * A unit's content, as the source reader types it. A piece's id is local to its unit. An `el` travels whole and is never
 * translated; `stop` is the punctuation the element itself sets at its end that is its sentence's (a display's `x = y.`),
 * or a line end (white space) where it ends its sentence and sets no punctuation (a forced break a run-in label follows),
 * stated by the source reader, which a wire may write after the element so that the sentence ends there. A `span` holds
 * pieces; `must` marks one that comes back exactly once or the reply is refused (a link, a run-in label); a span without it
 * may come back unstyled, its words outside it. Where a wire sends it on no wire (the markers wire, the runs floor), its
 * head still comes back inside it, in a copy that holds it alone (accept.ts headLength: the elements before its first word,
 * where TeX sets a declaration that holds for the rest of the group, `{\em all}`; loose, it would hold past the group)
 */
export type Piece =
  | { t: 'text'; s: string }
  | {
      t: 'el'
      id: string
      kind: ElKind
      stop?: string | undefined
      /** a marker of its own: never joined with the elements beside it on a wire that joins them (Microsoft's). A
       *  `display` is, whatever this says */
      alone?: boolean | undefined
      /** what the element reads as to a sentence cutter, where the host knows it (the HTML page: its visible text); else
       *  its kind decides (a formula a word, a reference a number, a note's mark an annotation, a citation one too but
       *  where it opens a sentence after a stop: `… expensive. \citet{x} proposes`) */
      reads?: string | undefined
      /** it sets nothing where it stands, no character and no space (the PDF's source reader, from TeX's tables: a
       *  declaration, a key written to a file, a penalty, `\noindent`, `\-`, a table's row rule; never a space, a break, a
       *  fill or a skip): no translator needs it. The markers wire and the runs floor send it on no wire (each marker a hard
       *  boundary to Microsoft, each runs' edge a cut), beside an element that sets something in that one's marker; read
       *  back, it stands at the front of its innermost kept group (the unit, a `must` span) where nothing of the group went
       *  out before it, else at the group's end. The tags wire sends it as any element */
      silent?: boolean | 1 | undefined
      /** TeX sets it after the unit's text, no word of its sentences (the PDF's source reader: backref's list of the pages that
       *  cite a bibliography entry, set after the entry), and the white space that stands for the gap before it. No translator
       *  is given it: the chain asks for the unit without it (each marker a word to Microsoft, which read this one as a page
       *  number and wrote the character for "page" before it) and puts it back after the translation, its white space before
       *  it, on every wire and the runs floor */
      after?: string | undefined
      /** the full name the paper gives the type of the item a reference refers to (the PDF's source reader, read in its
       *  marked compile: "Figure", "Equation", "section"), where TeX states one. A word tied to the reference that
       *  abbreviates it ("Fig.") is sent to every translator as this name (names.ts namedOf); the unit itself keeps the word */
      name?: string | undefined
      /** the BCP 47 tag of the language the paper's names are set up for (babel's main language); absent where none is
       *  declared. The name
       *  is sent only where this is SOURCE's language, or none is declared */
      nameLang?: string | undefined
    }
  | {
      t: 'span'
      id: string
      style: SpanStyle
      must?: boolean | 1 | undefined
      /** the punctuation TeX sets at the group's end that its source does not write (the PDF's source reader, read off TeX's
       *  glyphs: a paper's macro's own `{\bf #1.}`, 2608.25210v2's run-in heads). Every wire and the runs floor write it at
       *  the group's end, inside a kept span before its close, after the words of one on no wire, so that the sentence ends
       *  there (kept with no stop between its markers, Microsoft ran the head into the next sentence and wrote none); a
       *  reply's stop there is the translation's own, read as text */
      stop?: string | undefined
      content: readonly Piece[]
    }

/** What a translator is given: the unit's id (a label, never a key), its content, and whether it lights by sentence */
export interface UnitIn {
  id: string
  kind?: string | undefined
  content: readonly Piece[]
  sentences?: boolean | undefined
  /** a reply is taken only where each element's placeholder came back whole: one a reading would have to repair by
   *  guessing where the element stands (Microsoft's marker without its `#`) refuses it, to the next translator. The HTML
   *  page states it: over 87 live Microsoft replies taken only so, an element stood glued inside a word, jammed against
   *  another with the words between them lost, or away from its `#` beside stray characters (lane L6, stage 4b). A
   *  doubled `#` is no such repair: the marker stands where it stood */
  strict?: boolean | undefined
}

/** A translation's content: the unit's elements and spans by their ids, text in between */
export type OutPiece =
  | { t: 'text'; s: string }
  | { t: 'el'; id: string }
  | { t: 'span'; id: string; content: OutPiece[] }

/** Where each sentence after the first begins, as offsets in the plain projection of the unit (`src`) and of its
 *  translation (`tr`): text pieces joined, each element one character, span edges none (accept.ts projectionOf) */
export interface Sentences {
  src: readonly number[]
  tr: readonly number[]
}

/** The paper's context, one per paper version; it reaches only a translator whose replies depend on it. `section` (the
 *  heading the units sit under, or an image's caption) and `glossary` (the reader's term table) are a host's where its
 *  prompt reads them; like the rest, they enter the key of a translator whose replies depend on the context */
export interface PaperContext {
  title?: string
  abstract?: string
  terms?: readonly string[]
  section?: string
  glossary?: readonly { readonly term: string; readonly translation: string }[]
}

/** What the caller does next, never an HTTP cause */
export type Why =
  /** every translator that answered refused the unit, runs included: show the original; asking again changes nothing
   *  until the chain does */
  | { kind: 'refused' }
  /** the service, not the unit: ask again later */
  | { kind: 'unavailable'; retryAfterMs?: number }
  /** no translator of the chain can run: nothing changes until the configuration does; the host words the code */
  | { kind: 'unconfigured'; code: UnconfiguredCode }
  | { kind: 'aborted' }
export type UnconfiguredCode = 'no-key' | 'key-refused' | 'no-language' | 'no-model' | 'needs-gesture'

/** One unit's outcome. `by`: the translator identity that answered, `runs:<identity>` or `runs:mixed` for the runs floor,
 *  `self` for a unit with no letter (nothing sent) */
export type Result =
  | { id: string; ok: true; content: OutPiece[]; by: string; sentences?: Sentences }
  | { id: string; ok: false; why: Why }

/** What a host may count or tell a reader: a request sent; a translator passed over for a unit (`id`: the unit's, or
 *  `<id>~<k>` for a stretch of the runs floor) and why, told for every translator of the call the unit did not get an
 *  answer from, the ones that do not serve the target or are off included */
export type Note =
  | { kind: 'sent'; by: string; chars: number; units: number }
  | { kind: 'passed'; by: string; id: string; why: Why }

// ---------------------------------------------------------------- the platform's members the package uses

/** The members of an AbortSignal the package reads */
export interface Signal {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}
/** The request a translator's `fetch` is asked; a host passes its platform's fetch */
export interface FetchInit {
  method: string
  headers: Record<string, string>
  body: string
  signal: Signal
}
/** The members of a Response the adapters read */
export interface FetchReply {
  readonly ok: boolean
  readonly status: number
  readonly headers: { get(name: string): string | null }
  text(): Promise<string>
}
export type Fetch = (url: string, init: FetchInit) => Promise<FetchReply>

// ---------------------------------------------------------------- what an adapter's author learns

export interface Limits {
  /** a request's wire characters at most; a unit over it goes alone */
  chars: number
  /** a request's units at most */
  units: number
  /** requests of this translator in flight at once, for every call of a chain */
  inFlight: number
  /** one request's time; past it the request is cut, and tried again as a transient failure */
  callMs: number
  /** 1: a unit this translator was refused for is asked alone once more before it falls through */
  reask: 0 | 1
}

export interface Translator {
  /** who answers: endpoint, model, prompt digest, `<name>:<16 hex>`. Never a key. Persisted (store keys, rows' `by`) */
  readonly identity: string
  /** the digest of write's and read's golden outputs, held by the conformance suite (testing translatorSuite) */
  readonly digest: string
  /** whether its replies depend on the paper's context: then the context's digest enters the store key */
  readonly context: boolean
  readonly limits: Limits
  /** whether it serves the target; bounded by the adapter, and by the chain besides */
  supports(target: Lang): Promise<boolean>
  /** pure: what the unit is sent as. Its bytes are the store key */
  write(unit: UnitIn, target: Lang): string
  /** one request: each wire's raw reply at most once, in any order, as soon as it is whole. Throws a Fault for a failure
   *  of the request; replies yielded before it stand */
  send(
    wires: readonly string[],
    call: { target: Lang; context?: PaperContext },
    signal: Signal,
  ): AsyncIterable<readonly [index: number, raw: string]>
  /** pure and total: the raw reply read back as content, or null where it cannot be read; it may be tolerant */
  read(unit: UnitIn, raw: string): { content: OutPiece[]; sentences?: Sentences } | null
}

/** What the chain does next with a request that failed. The adapter decides, from its endpoint's behaviour */
export type Remedy =
  /** transient (network, 5xx, no answer in time): this translator again after a backoff, `tries` times at most */
  | 'again'
  /** the endpoint asks for a pause (429): it cools for every call for `retryAfterMs`; the request moves on now */
  | 'cool'
  /** this translator cannot serve this request. The chain's one rule over it (#636): where the endpoint said the request is
   *  larger than it takes (`too-large`), a smaller one can be served, so this translator is asked for each half, a lone unit
   *  refused by it; any other refusal is the same at any size (a request shape, a parameter, a key the endpoint refuses), so
   *  the request is handed on whole to the next translator, and counted against this one as a failure of its endpoint is */
  | 'pass'
  /** it cannot serve this configuration (no key, key refused, model not found, a gesture needed): off for its object */
  | 'off'
  /** the request's signal */
  | 'abort'
export type FaultCode =
  | 'network'
  | 'timeout'
  | 'rate'
  | 'overload'
  /** the endpoint said the request is larger than it takes: HTTP 413 (RFC 9110 §15.5.14), or the words of its own stated
   *  cap. An adapter reports it only from such a reply, never from a bare 400 */
  | 'too-large'
  | 'unsupported'
  | 'malformed'
  | 'no-key'
  | 'key-refused'
  | 'model'
  | 'needs-gesture'
  | 'aborted'

/** A request's failure, as its translator names the remedy. `message` is at most 300 characters and holds no key */
export class Fault extends Error {
  readonly remedy: Remedy
  readonly code: FaultCode
  readonly retryAfterMs: number | undefined
  /** for `again`: the tries this failure is worth in all (a malformed reply: 2, asked once more), else the chain's */
  readonly tries: number | undefined
  constructor(remedy: Remedy, code: FaultCode, message: string, o: { retryAfterMs?: number; tries?: number } = {}) {
    super(message.slice(0, 300))
    this.name = 'Fault'
    this.remedy = remedy
    this.code = code
    this.retryAfterMs = o.retryAfterMs
    this.tries = o.tries
  }
}

// ---------------------------------------------------------------- what a host learns

/** Raw replies by key; values are opaque strings of at most 64 KiB. A store that throws, hangs or answers garbage is read
 *  as all misses */
export interface Store {
  read(keys: readonly string[]): Promise<(string | null)[]>
  write(entries: readonly (readonly [key: string, value: string])[]): Promise<void>
}
/** Pacing shared beyond the chain's realm (the Worker's Engines object). `by` is a translator identity; `last` says the
 *  translator is the last of its chain, which an open breaker never turns away */
export interface Gate {
  acquire(
    by: string,
    signal: Signal,
    last: boolean,
  ): Promise<{ ok: true; lease: string } | { ok: false; retryInMs?: number }>
  release(lease: string, outcome: 'ok' | 'failed' | 'none', coolMs?: number): Promise<void>
}
export interface Clock {
  now(): number
  /** resolves after `ms`, or as soon as `signal` aborts */
  sleep(ms: number, signal: Signal): Promise<void>
  /** in [0, 1) */
  random(): number
}
export interface Ports {
  store?: Store
  gate?: Gate
  clock?: Clock
}

export interface TranslateOptions {
  translators: readonly Translator[]
  context?: PaperContext
  signal?: Signal
  note?: (n: Note) => void
}
export interface Chain {
  /** exactly one result per unit, as each settles: store hits first, then as requests answer */
  translate(units: readonly UnitIn[], target: Lang, o: TranslateOptions): AsyncIterable<Result>
}
