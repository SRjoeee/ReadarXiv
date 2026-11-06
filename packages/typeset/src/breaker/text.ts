// A row's text pieces as the breaker reads them: a translation's TeX escapes undone (each its own character), and the offsets
// of its characters in the unit's plain text, by which the page's word table places each token (highlight). Ported from engine
// 065c1d973: layer/pieces.mjs:56-63 (utf8, shown, drawnText), layer-proto/words.mjs:18-73 (BLANK, plainTracker, transformMap).

/** a text piece of a row: its text, and whether it is the translation's (TeX's escapes in it) */
export type TextPiece = { t: 'text'; s: string; tr?: boolean }

const Decoder = (globalThis as unknown as { TextDecoder: new () => { decode(b: Uint8Array): string } }).TextDecoder
/** a source's text read byte for byte (latin1), its characters UTF-8 (pieces.mjs utf8) */
const utf8 = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
  return new Decoder().decode(b)
}
/** a text piece as the compiled PDF shows it, a translation's TeX escapes undone, a source's bytes as UTF-8 (pieces.mjs shown) */
export const shown = (p: TextPiece) =>
  p.tr
    ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1')
    : utf8(p.s)
const DRAWN: Record<string, string> = { textbackslash: '\\', textasciitilde: '~', textasciicircum: '^' }
/** a text piece as the layer draws it: a translation's TeX escapes undone in one pass, each its own character; a source's text
 *  as it is (pieces.mjs drawnText) */
export const drawnText = (p: TextPiece) =>
  p.tr
    ? p.s.replace(/\\(?:(textbackslash|textasciitilde|textasciicircum)\{\}|([#$%&_{}]))/g, (_, n, c) => c ?? DRAWN[n]!)
    : p.s

const BLANK = /\s/
export type PlainTracker = { gap(): void; space(): number; next(): number; text(s: string): Int32Array }
/** the offsets of a unit's text in its plain text: a blank adds nothing after a blank, a piece that is no text one space
 *  (words.mjs plainTracker) */
export function plainTracker(): PlainTracker {
  let len = 0,
    space = true
  return {
    gap() {
      if (!space) {
        len++
        space = true
      }
    },
    space: () => Math.max(0, len - 1),
    next: () => len,
    text(s) {
      const at = new Int32Array(s.length)
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        if (c <= 32 || c > 126 ? BLANK.test(s[i]!) : false) {
          at[i] = len
          if (!space) {
            len++
            space = true
          }
        } else {
          at[i] = len++
          space = false
        }
      }
      return at
    },
  }
}
/** each character of a piece's transformed text by the index of its first character in the piece's string and how many it
 *  stands for; null where the transformed text is not `expected` (words.mjs transformMap) */
export function transformMap(s: string, expected: string): { from: number[]; span: number[] } | null {
  let out = ''
  const from: number[] = [],
    span: number[] = []
  for (let i = 0; i < s.length; ) {
    const c = s[i]!
    let ch = c,
      n = 1
    if (c === '-' && s[i + 1] === '-') {
      if (s[i + 2] === '-') {
        ch = '—'
        n = 3
      } else {
        ch = '–'
        n = 2
      }
    } else if (c === '`' && s[i + 1] === '`') {
      ch = '“'
      n = 2
    } else if (c === "'" && s[i + 1] === "'") {
      ch = '”'
      n = 2
    } else if (c === '\n') ch = ' '
    out += ch
    for (let q = 0; q < ch.length; q++) {
      from.push(i)
      span.push(n)
    }
    i += n
  }
  return out === expected ? { from, span } : null
}
