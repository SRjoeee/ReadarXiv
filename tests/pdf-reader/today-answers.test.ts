// @vitest-environment node
// A test's recorded answers of today's code (tests/pdf-reader/helpers/today-answers.ts): each by the call it answered, today's
// function's name and its arguments, every own property of an object counted; none for a call the recording did not make.
// Synthetic answers in a temporary folder.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { encode } from '../../lab/frozen-json.mjs'
import { digestOf, keyOf, todayAnswers, todayFixture } from './helpers/today-answers.ts'

describe("a test's recorded answers", () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  it("keys a call by today's function and its arguments, an object's every own property counted", () => {
    const open = Object.defineProperty({ t: 'open', id: 1 }, 'sets', { value: 0, enumerable: false })
    expect(keyOf(['serialize', { pieces: [open] }])).not.toBe(keyOf(['serialize', { pieces: [{ t: 'open', id: 1 }] }]))
    expect(keyOf(['f', 'a', Number.NaN])).toBe(keyOf(['f', 'a', Number.NaN]))
    expect(digestOf({ a: 1 }, [2])).toMatch(/^[0-9a-f]{64}$/)
    expect(digestOf({ a: 1 }, [2])).not.toBe(digestOf({ a: 1 }, [3]))
  })
  it('reads an answer back by its call, and fails a call the recording did not make', () => {
    const d = mkdtempSync(join(tmpdir(), 'today-answers-'))
    dirs.push(d)
    const file = join(d, 'a-test.json')
    writeFileSync(file, JSON.stringify({ recorded: 'a test', answers: { [keyOf(['f', 'x'])]: encode({ m: new Map([[1, 2]]) }) } }))
    const answer = todayAnswers('a-test', file)
    expect(todayFixture('a-test')).toMatch(/tests\/fixtures\/today\/a-test\.json$/)
    expect(answer('f', 'x')).toEqual({ m: new Map([[1, 2]]) })
    expect(() => answer('f', 'y')).toThrow(/no answer of today's f recorded/)
  })
})
