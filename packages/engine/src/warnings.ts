// PDF.js's warnings while the engine reads a document (read.ts readPdf): the one channel on which PDF.js tells that it recovered
// from an error inside its worker. PDF.js 6.3.289 recovers in some twenty places on the prepare's reads and answers the read as
// whole: a page's list ended where its parse failed, a font read as none (an ErrorFont), a pattern, a shading or a colour space
// left out. No call of its API fails for any of these, and `stopAtErrors` does not change that for a page's list: its API settles
// the list with what it read (lane mem-errors, 2026-11-10). Each such warning names its site and prints its reason as text
// (`${reason}`). A warning whose reason is a failed allocation (memory.mjs isMemoryText) is the paper's: the read that heard it
// throws one (memoryFailure). Every other recovery is counted by its site, with its first reason (`recovered`, which the bundle's
// head states): at normal memory none fires on the corpus (the census of 2026-11-10: the 88 papers and 2609.19644v1, arXiv's PDF
// and B), so one seen in the wild is told.
//
// The channel: PDF.js prints a warning as `console.warn(\`Warning: ${msg}\`)`, where its level (one for the process, set by each
// document's opening, its API's and its worker's alike) is WARNINGS or more. While a watch is open, console.warn is PDF.js's
// channel to it: each watch open hears every warning PDF.js prints (PDF.js names no document in one), a warning is passed on
// to console.warn as it was only where an open watch's reader asked PDF.js for its warnings, and anything else written to
// console.warn passes as it is. The last watch closed puts console.warn back: nothing of it is left behind.
import { ALLOCATION_FAILED, isMemoryText } from './memory.ts'

/** PDF.js's level at which it prints its warnings (its VerbosityLevel.WARNINGS) */
export const WARNINGS = 1
/** PDF.js 6.3.289's recover branches on the prepare's reads, each by the words it warns with (pdf.worker.mjs): a page's list and what it reads (XObjects, shadings, ExtGStates, marked
 *  content's properties, patterns, colour spaces, inline images, sub-streams, annotations), a font's load and what it reads (its
 *  dict, its file, its maps, its glyphs' paths), a page's text, an annotation's appearance, the page tree. (The API's own
 *  "Error during font loading", which repeats a font's failure the worker told, is no site of its own) */
export const RECOVER_SITES: readonly (readonly [site: string, words: string])[] = [
  ['list', 'getOperatorList - ignoring errors during '],
  ['list-xobject', 'getOperatorList - ignoring XObject: '],
  ['list-shading', 'getOperatorList - ignoring Shading: '],
  ['list-gstate', 'getOperatorList - ignoring ExtGState: '],
  ['list-marked', 'getOperatorList - ignoring beginMarkedContentProps: '],
  ['list-annotation', 'getOperatorList - ignoring annotation data during '],
  ['pattern', 'handleTilingType - ignoring pattern: '],
  ['colour-space', '_handleColorSpace - ignoring ColorSpace: '],
  ['shading', 'parseShading - ignoring shading: '],
  ['inline-image', 'Unable to decode inline image: '],
  ['sub-stream', 'getContentStream - ignoring sub-stream '],
  ['state-font', 'ensureStateFont: '],
  ['font-lookup', 'loadFont - lookup failed: '],
  ['font-evaluate', 'loadFont - preEvaluateFont failed: '],
  ['font-translate', 'loadFont - translateFont failed: '],
  ['font-missing', 'is not available -- attempting to fallback to a default font.'],
  ['font-file', 'translateFont - fetching '],
  ['font-tounicode', 'readToUnicode - ignoring ToUnicode data: '],
  ['font-cidtogid', 'extractDataStructures - ignoring CIDToGIDMap data: '],
  ['font-encoding', 'Encoding is not a Name nor a Dict'],
  ['font-paths', 'buildFontPaths - ignoring '],
  ['text', 'getTextContent - ignoring '],
  ['appearance', 'parseDefaultAppearance - ignoring errors: '],
  ['appearance', 'parseAppearanceStream - ignoring errors: '],
  ['page-tree', 'getAllPageDicts - Skipping invalid first page: '],
]
/** a warning that is an error's text whole (PDF.js's `warn(e)`): a font's program it could not read (the system font then), a
 *  shading made a dummy, a standard font's data not read */
const ERROR_TEXT = /^[A-Z][A-Za-z]*(?:Error|Exception): /
/** a recovery's first reason, at most these characters (the head is bounded) */
const REASON_MAX = 200

/** the site a warning tells, or null for one that tells no recovery of these (the lite worker's undecoded images, the lexer's
 *  and the font programs' own repairs) */
export function siteOf(message: string): string | null {
  for (const [site, words] of RECOVER_SITES) if (message.includes(words)) return site
  return ERROR_TEXT.test(message) ? 'error' : null
}
/** a warning's reason: what it prints of its failure (`…: "<reason>".`), else the warning whole (an error's text) */
export function reasonOf(message: string): string {
  const at = message.lastIndexOf(': "')
  return at >= 0 && message.endsWith('".') ? message.slice(at + 3, -2) : message
}

/** a failed allocation a warning told, as isMemoryError takes one: V8's RangeError of its words, the warning its cause */
export function memoryFailure(warning: string): RangeError {
  return Object.assign(new RangeError(ALLOCATION_FAILED), { cause: warning })
}

export interface WarningWatch {
  /** the first warning heard whose reason is a failed allocation, or null */
  readonly memory: string | null
  /** each site heard, its count and its first reason */
  readonly recovered: ReadonlyMap<string, { count: number; first: string }>
  /** the watch closed (the last one closed puts console.warn back) */
  close(): void
}

type Sink = { take(message: string): void; forward: boolean }
const open = new Set<Sink>()
let held: typeof console.warn | null = null
function channel(...args: unknown[]): void {
  const pass = held ?? (() => {})
  const m = args[0]
  if (args.length !== 1 || typeof m !== 'string' || !m.startsWith('Warning: ')) {
    pass(...args)
    return
  }
  let forward = false
  for (const s of open) {
    s.take(m.slice('Warning: '.length))
    forward ||= s.forward
  }
  if (forward) pass(...args)
}

/** a watch over PDF.js's warnings from now until it is closed; `forward`: its reader asked PDF.js for its warnings (pass them on) */
export function watchWarnings({ forward }: { forward: boolean }): WarningWatch {
  let memory: string | null = null
  const recovered = new Map<string, { count: number; first: string }>()
  const sink: Sink = {
    forward,
    take(message) {
      const reason = reasonOf(message)
      if (memory === null && isMemoryText(reason)) memory = message
      const site = siteOf(message)
      if (site === null) return
      const had = recovered.get(site)
      if (had) had.count++
      else recovered.set(site, { count: 1, first: reason.slice(0, REASON_MAX) })
    },
  }
  if (open.size === 0) {
    held = console.warn
    console.warn = channel
  }
  open.add(sink)
  let closed = false
  return {
    get memory() {
      return memory
    },
    recovered,
    close() {
      if (closed) return
      closed = true
      open.delete(sink)
      if (open.size === 0 && held) {
        if (console.warn === channel) console.warn = held
        held = null
      }
    },
  }
}
