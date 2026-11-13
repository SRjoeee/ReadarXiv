// The engine's shared reads, each bounded or told by kind before it reads: bytes read as latin-1 in slices an argument list holds
// (latin1: the cross-reference reader's, the delta's wire's, the remover's, the tail's), and a value's property read with its
// kind told first (`at`, `x?.[k]`: PDF.js's values as the ink walk reads them, ink-args.ts; the remover's and the wrap's
// operands, remove.ts and wrap.ts). A leaf: it imports nothing, so that any module may take it (the reader's view bundles it
// with the ink walk). Not among the entry's names.

/** bytes as a string, one character a byte (ISO 8859-1, which TextDecoder's 'latin1', windows-1252, is not), in slices that
 *  fit an argument list. (A slice's end past the bytes needs no Math.min: subarray clamps its end to the length.) (Reflect.apply,
 *  which TypeScript lets take a typed array, not a spread, which it also does: the spread read 10 MB 6 times slower, 160 ms
 *  against 27 on Node 22) */
export function latin1(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) {
    const part: string = Reflect.apply(String.fromCharCode, null, b.subarray(i, i + 8192))
    s += part
  }
  return s
}

/** `x?.[k]`, the value told by its kind before the read: undefined for null or none, else the property of the value or of its
 *  wrapper, read with the value as its receiver, as a read of it is */
export const at = (x: unknown, k: PropertyKey): unknown =>
  x === null || x === undefined ? undefined : Reflect.get(Object(x), k, x)
