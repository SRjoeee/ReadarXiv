// What both wires do to text: the escaping the free endpoints need, the entities read back, the code points no reader
// sees. Restated from the measured facts (translation dossier §16): Microsoft's and Google's free endpoints run an HTML
// aligner on every request, so a bare `<` or `&` fuses (`a < b and c > d` came back `<B和C> d`), and replies stay
// HTML-encoded; Google sets zero width spaces inside words; a numeric entity past U+10FFFF must not throw.

/** default-ignorable code points: invisible by definition, dropped from what a reply says */
export const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
/** the sentinel a reading places where a sentence begins (a private-use character: no reply holds one) */
export const SENTINEL = ''

/** text for the markers wire: `@` doubled (a literal `@` never starts a marker), `& < >` as entities */
export const escapeMarkers = (s: string): string =>
  s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** text for the tags wire: `& < >` as entities */
export const escapeTags = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** a reply's entities read: a numeric one of a code point (U+10FFFF at most, else kept as it stands) and the named ones */
export const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b: string) => {
    if (b[0] !== '#') return NAMED[b.toLowerCase()] ?? m
    const c = b[1] === 'x' || b[1] === 'X' ? Number.parseInt(b.slice(2), 16) : Number.parseInt(b.slice(1), 10)
    return c <= 0x10ffff ? String.fromCodePoint(c) : m
  })
/** an entity, as one atom of a wire: a boundary inside one goes to its end */
export const ENTITY = '&(?:#[xX][0-9a-fA-F]+|#\\d+|amp|lt|gt|quot|apos|nbsp);'

/** what a translation of words holds: a letter, or a digit (two is 2) */
export const SAYS = /[\p{L}\p{N}]/u
export const LETTER = /\p{L}/u
