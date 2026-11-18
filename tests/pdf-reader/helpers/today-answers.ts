// Today's answers on a test's own inputs, recorded once while today's engine ran (amendment 8.3 of the refactor's design: a test
// whose oracle was today's code keeps its recorded answers after the cut-over deletes that code). One fixture a test,
// tests/fixtures/today/<test>.json: each answer under the call it answered, today's function's name and its arguments (keyOf),
// read back as it was made (lab/frozen-json.mjs). A call the recording did not make has no answer: the test fails there, naming
// the call, rather than compare with anything else (the kept code then hands today's function other inputs than it was
// recorded on, and today's answer to those is not known).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode, encode } from '../../../lab/frozen-json.mjs'

/** a call's form for its key: an object's every own property, one that is not enumerable too (marked `~`: a front end's
 *  `sets: 0` is not enumerable, and today's functions read it), each other value as frozen-json writes it */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v === null || typeof v !== 'object' || v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)) return encode(v)
  const out: Record<string, unknown> = {}
  for (const k of Object.getOwnPropertyNames(v)) {
    const d = Object.getOwnPropertyDescriptor(v, k) as PropertyDescriptor
    out[d.enumerable ? k : `~${k}`] = canonical(d.value)
  }
  return out
}

/** a call's key: today's function's name and its arguments */
export const keyOf = (call: readonly unknown[]): string => JSON.stringify(canonical(call))

/** the inputs a case's own reading of today's code read (its pages, its units), as one argument of a key: their SHA-256, so
 *  that an answer recorded for them is read back for them alone */
export const digestOf = (...inputs: unknown[]): string => createHash('sha256').update(keyOf(inputs)).digest('hex')

/** a test's fixture of today's answers (a path joined, not `new URL(…, import.meta.url)`: Vite reads that form as an asset's
 *  and answers `undefined` for a file it did not find when it transformed the module) */
export const todayFixture = (name: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'today', `${name}.json`)

/** what a fixture holds: how and when it was recorded, and each answer by its call's key */
export type TodayFixture = { recorded: string; answers: Record<string, unknown> }

/** a test's recorded answers: today's answer to `fn` called with `args`, read afresh each time (a test may change what it is
 *  given); throws on a call the recording did not make. `file`: the fixture, the test's own by default */
export function todayAnswers(name: string, file = todayFixture(name)): <T = unknown>(fn: string, ...args: unknown[]) => T {
  const { answers } = JSON.parse(readFileSync(file, 'utf8')) as TodayFixture
  return <T = unknown>(fn: string, ...args: unknown[]): T => {
    const key = keyOf([fn, ...args])
    if (!Object.hasOwn(answers, key)) throw new Error(`no answer of today's ${fn} recorded for these arguments (${file}): ${key.slice(0, 400)}`)
    return decode(answers[key]) as T
  }
}
