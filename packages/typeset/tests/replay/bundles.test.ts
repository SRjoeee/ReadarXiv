// The lab's L1 bundles folder (bundles.ts): named by AXT_L1_BUNDLES or the default; a value that is set and is no bundles folder
// is an error naming it, never the default (twice a clobbered shell variable sent a gate over the default bundles or over
// nothing: integration's round 8m reader gate, marks-2's reader gate); every tool names the folder it serves in one line; a pair
// asked of a named folder that holds no head of it is an error too. Synthetic folders in a temporary directory.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bundlesDir, bundlesLine, headsFor } from './bundles.ts'

describe('the bundles a lab tool serves', () => {
  const root = mkdtempSync(join(tmpdir(), 'l1-bundles-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const good = join(root, 'bundles')
  mkdirSync(join(good, '2601.00001v1'), { recursive: true })
  writeFileSync(join(good, '2601.00001v1', 'head.json'), '{}')
  const def = join(root, 'default')
  it('set and no folder (a clobbered variable: a number, an empty string, a file): refused, naming the value', () => {
    writeFileSync(join(root, 'a-file'), '')
    for (const v of ['3', '', join(root, 'nothing-here'), join(root, 'a-file')])
      expect(() => bundlesDir({ AXT_L1_BUNDLES: v }, def)).toThrow(JSON.stringify(v))
  })
  it('set and a folder holding no head at all: refused, it is no bundles folder', () => {
    mkdirSync(join(root, 'empty'))
    expect(() => bundlesDir({ AXT_L1_BUNDLES: join(root, 'empty') }, def)).toThrow(/no bundles folder/)
  })
  it('unset: the default, and the line says so', () => {
    const b = bundlesDir({}, def)
    expect(b).toEqual({ dir: def, from: 'default' })
    expect(bundlesLine(b)).toBe(`bundles: ${resolve(def)} (default)`)
  })
  it('set and a bundles folder: used, and the line says where from', () => {
    const b = bundlesDir({ AXT_L1_BUNDLES: good }, def)
    expect(b).toEqual({ dir: good, from: 'env' })
    expect(bundlesLine(b)).toBe(`bundles: ${resolve(good)} (from AXT_L1_BUNDLES)`)
  })
  it("a pair asked of a named folder that holds no head of it: refused; of the default folder, said and left to the tool's stop", () => {
    const named = bundlesDir({ AXT_L1_BUNDLES: good }, def)
    expect(headsFor(['2601.00001v1-zh'], named)).toEqual({ missing: [] })
    expect(() => headsFor(['2601.00001v1-zh', '2601.00002v1-ja'], named)).toThrow(/2601\.00002v1-ja/)
    expect(headsFor(['2601.00002v1-ja'], { dir: def, from: 'default' })).toEqual({ missing: ['2601.00002v1-ja'] })
    // (a whole list the tool did not name, the tap's every ledger: the pairs the folder lacks are named, the rest run)
    expect(headsFor(['2601.00001v1-zh', '2601.00002v1-ja'], named, { listed: true })).toEqual({
      missing: ['2601.00002v1-ja'],
    })
  })
})
