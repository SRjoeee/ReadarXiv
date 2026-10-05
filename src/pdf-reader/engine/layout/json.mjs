// What both of the layout's parsers share (the marks file, layout/marks.mjs; the layout file, layout/file.mjs): a file
// made from a paper is untrusted, and each is refused within bounds before it is used: its bytes, then its UTF-8, then
// its values counted before JSON.parse, then its shape and every number with plain loops. A refusal names where and why.
// Imports nothing: the reader's parser of the layout file loads it too.

/** a file refused: where (a JSON path, e.g. 'lines[3][1][17]'; '' for the file as a whole) and why */
export class LayoutRefusal extends Error {
  constructor(path, why) {
    super(path ? `${path}: ${why}` : why)
    this.name = 'LayoutRefusal'
    this.path = path
    this.why = why
  }
}

/**
 * The values a JSON text holds — every object, array, string (a key among them), number, true, false and null — counted
 * outside strings without parsing, and given up once past `max` (max + 1 then): what JSON.parse would build is bounded
 * before it is built. Read by character codes, once, never past the value that goes over. Exact for a valid text; for
 * another, JSON.parse refuses it anyway
 */
export function countValues(text, max = Infinity) {
  let n = 0
  let inNumber = false
  for (let i = 0, end = text.length; i < end; i++) {
    const c = text.charCodeAt(i)
    // a digit or a minus begins a number unless one is under way; a point, an exponent and its sign go on with it
    if ((c >= 48 && c <= 57) || c === 45) {
      if (!inNumber) { inNumber = true; if (++n > max) return n }
      continue
    }
    if (inNumber && (c === 46 || c === 101 || c === 69 || c === 43)) continue
    inNumber = false
    if (c === 34) {
      if (++n > max) return n
      // to the string's closing quote, past every escaped character
      for (i++; i < end; i++) {
        const d = text.charCodeAt(i)
        if (d === 92) i++
        else if (d === 34) break
      }
    } else if (c === 123 || c === 91) {
      if (++n > max) return n
    } else if (c === 116 || c === 110) {
      // true, null: the letters after the first are no value
      if (++n > max) return n
      i += 3
    } else if (c === 102) {
      if (++n > max) return n
      i += 4
    }
  }
  return n
}

/** UTF-8 bytes as text, refusing malformed input (TextDecoder fatal) */
export function utf8Strict(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new LayoutRefusal('', 'malformed UTF-8')
  }
}

/** a file's bytes as the value they hold, in the order of refusal: more than `cap` bytes before they are decoded, then
 *  malformed UTF-8, then more than `values` values before JSON.parse is called, then text that is not JSON */
export function boundedJson(bytes, { cap, values }) {
  if (bytes.length > cap) throw new LayoutRefusal('', `${bytes.length} bytes, more than ${cap}`)
  const text = utf8Strict(bytes)
  const n = countValues(text, values)
  if (n > values) throw new LayoutRefusal('', `more than ${values} values`)
  try {
    return JSON.parse(text)
  } catch {
    throw new LayoutRefusal('', 'not JSON')
  }
}

/** a document's pages at most */
export const PAGES_MAX = 10000
/** a coordinate's bound either way, PDF units: 200 inches, PDF's largest page (ISO 32000-1, annex C) */
export const COORD_MAX = 14400

export const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v)
/** a finite number (JSON has no NaN, and a number written 1e400 is Infinity once parsed) */
export const isNumber = v => typeof v === 'number' && Number.isFinite(v)
export const isInteger = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi

/** an object with exactly `keys` */
export function checkKeys(v, keys, path) {
  if (!isObject(v)) throw new LayoutRefusal(path, 'not an object')
  for (const k of keys) if (!Object.hasOwn(v, k)) throw new LayoutRefusal(path ? `${path}.${k}` : k, 'missing')
  for (const k of Object.keys(v)) if (!keys.includes(k)) throw new LayoutRefusal(path ? `${path}.${k}` : k, 'not a key of the schema')
  return v
}

/** a document's page count: an integer 1 to PAGES_MAX */
export function checkPages(v, path) {
  if (!isInteger(v, 1, PAGES_MAX)) throw new LayoutRefusal(path, `not an integer 1 to ${PAGES_MAX}`)
  return v
}

/** each page's view, x0, y0, x1, y1 (stride 4): exactly 4 × pages finite numbers, each within ±COORD_MAX, x0 < x1, y0 < y1 */
export function checkViews(v, pages, path) {
  if (!Array.isArray(v) || v.length !== 4 * pages) throw new LayoutRefusal(path, `not ${4 * pages} numbers`)
  for (let i = 0; i < v.length; i++) {
    if (!isNumber(v[i]) || Math.abs(v[i]) > COORD_MAX) throw new LayoutRefusal(`${path}[${i}]`, `not a number within ±${COORD_MAX}`)
    if (i % 4 >= 2 && v[i] <= v[i - 2]) throw new LayoutRefusal(`${path}[${i}]`, 'an empty view')
  }
  return v
}

/** whether (x, y) lies within page `page`'s view (1-based) by `slack` */
export const inView = (views, page, x, y, slack = 1) => {
  const o = 4 * (page - 1)
  return x >= views[o] - slack && x <= views[o + 2] + slack && y >= views[o + 1] - slack && y <= views[o + 3] + slack
}
