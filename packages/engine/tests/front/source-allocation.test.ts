// @vitest-environment node
// A failed allocation while the paper's source is read is the paper's, never a reading of the source (lane mem-errors; the
// bundle 4 contract, M7): the front end's catches that tell a file not UTF-8, a macro's call no text, or arXiv's 00README.json
// unreadable let it through, so that the prepare refuses the paper for its memory rather than reading its files in another
// encoding, its calls as placeholders, or its tree and compiler as none declared.
import { describe, expect, it } from 'vitest'
import { analyze, inMemory, openPaper } from '../../src/front.types.ts'
import { isMemoryError } from '../../src/index.ts'

/** V8's own failed allocation, as it throws one */
function v8Failure(): Error {
  try {
    void new ArrayBuffer(2 ** 50)
  } catch (e) {
    return e as Error
  }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}
const bytes = (s: string) => new TextEncoder().encode(s)
/** `run` with every Uint8Array of `length` elements failing to allocate, as V8 fails one: how many failed, and its end */
function withFailing<T>(length: number, run: () => T): { failed: number; end: { value: T } | { threw: unknown } } {
  const Real = globalThis.Uint8Array
  let failed = 0
  class Failing extends Real {
    constructor(...args: unknown[]) {
      if (args[0] === length) {
        failed++
        throw v8Failure()
      }
      super(...(args as [number]))
    }
  }
  globalThis.Uint8Array = Failing as unknown as Uint8ArrayConstructor
  let end: { value: T } | { threw: unknown }
  try {
    end = { value: run() }
  } catch (e) {
    end = { threw: e }
  } finally {
    globalThis.Uint8Array = Real
  }
  return { failed, end }
}

/** a paper's main file: `body` in an article */
const paper = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('arXiv\'s 00README.json, read', () => {
  it('a failed allocation reading it is thrown, not taken for a file that does not read', () => {
    const files = new Map([['main.tex', bytes(paper('Some text.'))], ['00README.json', bytes('{"process":{"compiler":"pdflatex"},"texlive_version":2023}')]])
    const failing = new Map(files)
    failing.get = (p: string) => {
      if (p === '00README.json') throw v8Failure()
      return files.get(p)
    }
    expect(analyze(inMemory(files)).tlVersion).toBe(2023)
    let threw: unknown = null
    try {
      analyze(inMemory(failing))
    } catch (e) {
      threw = e
    }
    expect(isMemoryError(threw)).toBe(true)
  })
})

describe('the paper opened', () => {
  it('a file\'s text whose bytes fail to allocate where its encoding is told is thrown, not read as a file that is not UTF-8', () => {
    // (the one file of its length: its text's bytes are made where the front end asks whether it is UTF-8)
    const main = paper(`A paragraph of the paper, été. ${'x'.repeat(4099)}`)
    const length = new TextDecoder('latin1').decode(bytes(main)).length
    const files = new Map([['main.tex', bytes(main)]])
    expect(openPaper(files).units.length).toBeGreaterThan(0)
    const r = withFailing(length, () => openPaper(files))
    expect(r.failed).toBeGreaterThan(0)
    expect('threw' in r.end && isMemoryError(r.end.threw)).toBe(true)
  })
  it('a macro\'s call whose text fails to allocate where it is expanded is thrown, not left a placeholder', () => {
    // (the expansion's one text piece, "Hello <argument> there", is the one string of its length made into bytes)
    const arg = 'w'.repeat(3001)
    const files = new Map([['main.tex', bytes(paper(`\\newcommand{\\greet}[1]{Hello #1 there}\nA paragraph that says \\greet{${arg}} in it.`))]])
    expect(openPaper(files).units.length).toBeGreaterThan(0)
    const r = withFailing(`Hello ${arg} there`.length, () => openPaper(files))
    expect(r.failed).toBeGreaterThan(0)
    expect('threw' in r.end && isMemoryError(r.end.threw)).toBe(true)
  })
})
