// The first read of the settings, bounded (S-R-21; one design for the reader, the popup and the settings page: P2, R100,
// S1 of #299). A page paints only once it knows its language, and storage that does not answer would leave it blank
// for as long as it stays silent. So the page gives its first reads 1,500 ms from its start, one clock for all of them
// — the language's, the theme's, the refused services' — and what has not answered by then is painted without: the
// browser's language, the system's appearance, the defaults. The answer that comes late changes nothing the page has
// said; the pages that follow the settings go on to follow them when they come.

/** how long the page waits for what storage holds before it paints without it */
export const FIRST_READ_MS = 1500

/** The clock a page starts with its first read, ending after `ms`; reads that come one after another share it, so that
 *  a page whose storage is silent paints once, at the end of it, and not once for each read */
export function firstReadTime(ms = FIRST_READ_MS): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** `read`'s answer, or nothing: when it throws (an invalidated extension context), or when `time` is over before it
 *  answers */
export function answeredBy<T>(read: Promise<T>, time: Promise<void>): Promise<T | undefined> {
  return Promise.race([read.catch(() => undefined), time.then(() => undefined)])
}
