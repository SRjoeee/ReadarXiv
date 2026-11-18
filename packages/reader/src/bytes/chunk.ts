// A chunk, as every range of an object is asked: its size, the address a range of an object on our server is asked at, the
// Range header it is asked with, and the original's first ask. It imports nothing, so that a host's page can make that first
// ask before the reader's code has loaded (`@readarxiv/reader/early`) and make it exactly as the reader's first read does.

/** PDF.js's own chunk, which every document here is opened with: every range a document asks is whole chunks of it */
export const CHUNK = 65_536

/** the address a range of an object on our server is asked at: its own, with the range in its query (`r=<first>-<last>`) */
export const chunkUrl = (url: string, begin: number, end: number): string =>
  `${url}${url.includes('?') ? '&' : '?'}r=${begin}-${end - 1}`

/** the Range header that asks bytes [begin, end) (RFC 9110 §14.1.2: the first and the last byte, both inclusive) */
export const rangeOf = (begin: number, end: number): string => `bytes=${begin}-${end - 1}`

/** the reader's first ask of the original at `url` on our server: its first chunk, at that chunk's address and with its Range
 *  (a read of [0, CHUNK) before the object's length is known: reader.ts, as the original's source is made) */
export const firstAsk = (url: string): { url: string; range: string } => ({
  url: chunkUrl(url, 0, CHUNK),
  range: rangeOf(0, CHUNK),
})
