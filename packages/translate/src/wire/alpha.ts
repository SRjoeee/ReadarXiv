// A marker's id as letters (the markers wire, markers.ts: `@a#`, `@ab#`), bijective base 26: letters, not digits, as machine
// translators reorder, merge and thousands-separate digits. A module of its own, so that a reader of these two functions alone
// (the HTML page's protector, src/core/protector/tokens.ts) takes nothing else of the wire with them.

/** bijective base-26: 1 → a, 26 → z, 27 → aa */
export function toAlpha(id: number): string {
  let n = id
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(97 + r) + out
    n = (n - 1 - r) / 26
  }
  return out
}
export function fromAlpha(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 96)
  return n
}
