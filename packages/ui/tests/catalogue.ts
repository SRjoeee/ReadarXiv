// The string catalogue flattened into `locale path → words`: every leaf of every pack (S, O, R, REASON, REASON_KEYLESS and
// whatever else a pack holds), so that two catalogues can be compared word for word. A string leaf is itself; a function
// leaf is called twice, by one rule fixed on its arity, and each call is recorded under a key that spells its arguments:
//
//   numbers  3, 7, 11, … (3 + 4i)          `zh-CN O.glossary.count(3)`
//   words    'α1', 'α2', … ('α' + (i + 1)) `zh-CN O.glossary.count('α1')`
//
// A call that throws is recorded as `throws: <message>`; a call that answers something other than a string is flattened
// under its key like a leaf of the pack. The same rule is the snapshot's (scripts/catalogue-snapshot.ts, the fixture
// tests/fixtures/catalogue-3f4da971c.json) and the test's (catalogue.test.ts), so the same calls are made on both sides
/** The arguments of a function leaf's two calls, by its arity */
export const SAMPLES = {
  numbers: (arity: number): number[] => Array.from({ length: arity }, (_, i) => 3 + 4 * i),
  words: (arity: number): string[] => Array.from({ length: arity }, (_, i) => `α${i + 1}`),
}

const spell = (args: readonly unknown[]) =>
  `(${args.map((a) => (typeof a === 'string' ? `'${a}'` : String(a))).join(', ')})`

function walk(value: unknown, key: string, out: Record<string, string>): void {
  if (typeof value === 'string') {
    out[key] = value
  } else if (typeof value === 'function') {
    const call = value as (...args: unknown[]) => unknown
    for (const args of [SAMPLES.numbers(call.length), SAMPLES.words(call.length)]) {
      const at = `${key}${spell(args)}`
      let answer: unknown
      try {
        answer = call(...args)
      } catch (error) {
        out[at] = `throws: ${error instanceof Error ? error.message : String(error)}`
        continue
      }
      walk(answer, at, out)
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value)) walk(child, `${key}.${name}`, out)
  } else {
    out[key] = `${value === null ? 'null' : typeof value}: ${String(value)}`
  }
}

/** Every leaf of every pack of `locales` (a table of locale code → pack), keyed `locale path` */
export function flattenCatalogue(locales: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, pack] of Object.entries(locales)) {
    for (const [name, part] of Object.entries(pack as Record<string, unknown>)) walk(part, `${code} ${name}`, out)
  }
  return out
}
