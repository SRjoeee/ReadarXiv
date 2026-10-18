// The TeX page's warm-up (DESIGN §16.6): what the background asks of the offscreen document, and what it hears back.
// Shared by both, and by the messages' table (shared/messages.ts)

/** download ahead, into the extension's store, what a first visit in `lang` fetches from the TeX page at `site` (the
 *  document makes the page's hints for it: pdf-reader/session/hints.mjs texHints) */
export interface TexWarmRequest {
  site: string
  /** the target language (BCP 47), given back in the result */
  lang: string
}

export type TexWarmResult =
  /** versions: the page's `ready` (cv/eid/tid/index); files: how many the hints name; bytes: downloaded now */
  | { ok: true; lang: string; versions: string; files: number; bytes: number; ms: number }
  /** deferred: a reader that typesets is open, or a warm-up runs — nothing tried. stopped: another language is wanted
   *  now, or a reader needs the page — what came is kept. unsupported: the page takes no warm-up (one of protocol 1, or
   *  of 2 before the warm-up), under `versions` ('1', or its cv/eid/tid/index). network: the page's files that could
   *  not be had for a network reason */
  | { ok: false; lang: string; error: string; deferred?: true; stopped?: true; unsupported?: true; versions?: string; network?: string[] }
