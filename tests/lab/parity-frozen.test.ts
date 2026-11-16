// @vitest-environment node
// Today's side of the parity check frozen (lab/typeset/parity/frozen.mjs, amendment 8.3): what render.mjs drew and read of
// today's side is written once and read in place of drawing it after today's engine is gone. Read back, every reading must be
// the one the browser handed over (a NaN a JSON round trip turns into null is another reading: `l.x0 !== null` would take it),
// every shot the bytes the screenshot gave, and a record drawn from other inputs than the run's is refused, not drawn from.
// Synthetic readings and bytes in a temporary folder.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { decode, encode, getShot, inputsOf, pageOf, putShot, readRecord, recordFile, staleOf, writeRecord } from '../../lab/typeset/parity/frozen.mjs'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const folder = () => {
  const d = mkdtempSync(join(tmpdir(), 'parity-frozen-'))
  dirs.push(d)
  return d
}

describe("a reading of today's side kept as the browser handed it", () => {
  it('keeps NaN, the infinities, -0 and undefined (its key, in its place) through JSON', () => {
    const reading = { page: 3, lines: [{ x0: Number.NaN, y: -0, size: 9.96 }, { x0: null, w: Number.POSITIVE_INFINITY }], gap: Number.NEGATIVE_INFINITY, lead: undefined, tail: 'end' }
    const back = decode(JSON.parse(JSON.stringify(encode(reading)))) as typeof reading
    expect(Object.keys(back)).toEqual(['page', 'lines', 'gap', 'lead', 'tail'])
    expect(Object.hasOwn(back, 'lead')).toBe(true)
    expect(back.lead).toBeUndefined()
    expect(Number.isNaN(back.lines[0].x0)).toBe(true)
    expect(back.lines[0].x0 === null).toBe(false)
    expect(Object.is(back.lines[0].y, -0)).toBe(true)
    expect(back.lines[1]).toEqual({ x0: null, w: Number.POSITIVE_INFINITY })
    expect(back.gap).toBe(Number.NEGATIVE_INFINITY)
    expect(back).toEqual(reading)
  })
  it('refuses what JSON cannot keep, and an object naming the mark it writes', () => {
    expect(() => encode({ f: () => 1 })).toThrow(/cannot keep/)
    expect(() => encode({ $axt: 'NaN' })).toThrow(/names the key/)
  })
})

describe("today's shots stored by their digest", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')
  it('stores a shot once and gives back its bytes', () => {
    const dir = folder()
    const d = putShot(dir, png)
    expect(d).toMatch(/^[0-9a-f]{64}$/)
    expect(putShot(dir, png)).toBe(d)
    expect(getShot(dir, d)).toBe(png)
  })
  it('fails a shot that is missing or whose bytes are not its digest', () => {
    const dir = folder()
    const d = putShot(dir, png)
    writeFileSync(join(dir, 'shots', `${d}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 4]))
    expect(() => getShot(dir, d)).toThrow(/does not hold its digest's bytes/)
    expect(() => getShot(dir, 'f'.repeat(64))).toThrow(/is missing/)
  })
})

describe("a pair's record", () => {
  const inputs = inputsOf({ head: { sha256: 'a' }, target: 'zh', classes: null }, Buffer.from('[[1]]'), Buffer.from('%PDF'))
  const record = {
    pair: '2601.00001v1-zh',
    toggles: 'defaults',
    inputs,
    opened: { pages: 2, orig: 2, delta: false },
    errors: ['p2: a page error'],
    pages: [{ page: 1, view: [0, 0, 612, 792], today: { committed: true, units: [{ id: 4, x0: Number.NaN }] }, shots: { A: 'a', T: 't', Tt: 'tt', Tc: 'tc' }, litBoxes: {} }, { page: 2, error: 'drawn wrong' }],
  }
  it('is written once, under its toggles, and read back as written', () => {
    const dir = folder()
    expect(readRecord(dir, 'defaults', record.pair)).toBeNull()
    writeRecord(dir, 'defaults', record.pair, record)
    expect(recordFile(dir, 'defaults', record.pair)).toBe(join(dir, 'defaults', `${record.pair}.json`))
    const back = readRecord(dir, 'defaults', record.pair)
    expect(back).toEqual({ format: 'readarxiv-today-frozen 1', ...record })
    expect(() => writeRecord(dir, 'defaults', record.pair, record)).toThrow(/written once/)
    expect(readRecord(dir, 'on', record.pair)).toBeNull()
  })
  it("stands for the run's pair only over the same toggles and inputs", () => {
    const dir = folder()
    writeRecord(dir, 'defaults', record.pair, record)
    const back = readRecord(dir, 'defaults', record.pair)
    if (!back) throw new Error('no record')
    expect(staleOf(back, 'defaults', inputs)).toBeNull()
    expect(staleOf(back, 'on', inputs)).toMatch(/toggles defaults/)
    expect(staleOf(back, 'defaults', { ...inputs, desc: { head: { sha256: 'b' }, target: 'zh', classes: null } })).toMatch(/another release bundle/)
    expect(staleOf(back, 'defaults', inputsOf(inputs.desc, Buffer.from('[[2]]'), Buffer.from('%PDF')))).toMatch(/other door rows/)
    expect(staleOf(back, 'defaults', inputsOf(inputs.desc, Buffer.from('[[1]]'), Buffer.from('%PDF-1.5')))).toMatch(/another arXiv PDF/)
  })
  it("gives a page's side, its error, or the error of a page it does not hold", () => {
    const dir = folder()
    writeRecord(dir, 'defaults', record.pair, record)
    const back = readRecord(dir, 'defaults', record.pair)
    if (!back) throw new Error('no record')
    expect(pageOf(back, 1).shots).toEqual({ A: 'a', T: 't', Tt: 'tt', Tc: 'tc' })
    expect(pageOf(back, 2).error).toBe('drawn wrong')
    expect(pageOf(back, 3)).toEqual({ page: 3, error: "today's side is not frozen for page 3" })
  })
})
