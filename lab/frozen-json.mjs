// lab/frozen-json.mjs: today's outputs written as JSON and read back as they were made (amendment 8.3 of the refactor's design:
// today's outputs frozen before the cut-over deletes today's engine). A value is kept as a structured clone keeps it: NaN, the
// infinities, -0 and undefined (an object's key kept, in its place), a Map, a Set, a typed array, each written as an object of
// one key, `{ $axt: <its name>, … }`; anything else JSON says itself. A JSON round trip alone would read a NaN back as null and a
// Map as {}: other values than the ones the gate or the test was answered with. Read by the parity's frozen side
// (lab/typeset/parity/frozen.mjs) and the tests' recorded answers (tests/pdf-reader/helpers/today-answers.ts).

/** the key a kept value is written under: no output of today's names one */
const MARK = '$axt'
const NUMBERS = new Map([
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
  ['-0', -0],
])
const TYPED = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array]
const TYPED_BY_NAME = new Map(TYPED.map((T) => [T.name, T]))

/** a value as JSON can hold it; throws on what it cannot keep (a function, a BigInt, a class's instance) or on an object that
 *  names the mark itself */
export function encode(v) {
  if (v === undefined) return { [MARK]: 'undefined' }
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { [MARK]: 'NaN' }
    if (v === Number.POSITIVE_INFINITY) return { [MARK]: 'Infinity' }
    if (v === Number.NEGATIVE_INFINITY) return { [MARK]: '-Infinity' }
    if (Object.is(v, -0)) return { [MARK]: '-0' }
    return v
  }
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return Array.from(v, encode)
  if (v instanceof Map) return { [MARK]: 'Map', entries: [...v].map(([k, x]) => [encode(k), encode(x)]) }
  if (v instanceof Set) return { [MARK]: 'Set', values: [...v].map(encode) }
  if (ArrayBuffer.isView(v) && TYPED_BY_NAME.get(v.constructor.name) === v.constructor) return { [MARK]: v.constructor.name, values: Array.from(v, encode) }
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    if (Object.hasOwn(v, MARK)) throw new Error(`frozen-json: a value names the key ${MARK}`)
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = encode(x)
    return out
  }
  throw new Error(`frozen-json: a value of a kind JSON cannot keep (${Object.prototype.toString.call(v)})`)
}

/** encode's inverse: the value as it was made */
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode)
  if (v === null || typeof v !== 'object') return v
  if (Object.hasOwn(v, MARK)) {
    const kind = v[MARK]
    if (kind === 'undefined') return undefined
    if (NUMBERS.has(kind)) return NUMBERS.get(kind)
    if (kind === 'Map') return new Map(v.entries.map(([k, x]) => [decode(k), decode(x)]))
    if (kind === 'Set') return new Set(v.values.map(decode))
    const T = TYPED_BY_NAME.get(kind)
    if (T) return T.from(v.values.map(decode))
    throw new Error(`frozen-json: an unknown kept value ${JSON.stringify(kind)}`)
  }
  const out = {}
  for (const k of Object.keys(v)) out[k] = decode(v[k])
  return out
}
