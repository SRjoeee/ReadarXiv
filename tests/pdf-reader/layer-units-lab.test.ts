// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { droppedOf, type ReadUnitsChunk, type ReadUnitsChunkLight, readUnitsChunk, unitsOfChunks, writeUnitChunks } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
// AXT_LAB=<a lab/pdf directory>: each local paper's real units read bodies-free and chunk by chunk (amendments M19, M21) give the chain's kinds, records and external refs
describe.skipIf(!process.env.AXT_LAB)('the real papers: units read bodies-free and alone', () => {
for (const name of ['1512.03385v1', '1706.03762v7', '1810.04805v2', '2307.16209v1', '2608.04322v1']) it(name, async () => {
  const root = process.env.AXT_LAB as string
  const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/layout', name, 'source.gz'))))
  if (!('files' in source)) throw new Error('pdf')
  const units = bundleUnitsOf(openPaper(source.files))
  const id = name.replace(/v\d+$/, '')
  const chunks = await writeUnitChunks({ paper: { id, version: Number(name.slice(id.length + 1)) }, units })
  const read: ReadUnitsChunk[] = [], lean: ReadUnitsChunkLight[] = []
  for (const c of chunks) read.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: read.at(-1) ?? null }))
  for (const c of chunks) lean.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: null, dropped: droppedOf(read).filter(d => d < c.from), bodies: false }))
  const all = unitsOfChunks(read), thin = unitsOfChunks(lean, { bodies: false })
  expect(thin.records).toEqual(all.records)
  expect(thin.kinds).toEqual(all.kinds)
  for (let k = 0; k < read.length; k++) expect(thin.externalRefs(k)).toEqual(all.externalRefs(k))
  expect(chunks.length).toBeGreaterThan(0)
  // the piece counts (M24)
  expect(thin.pieces).toEqual(Uint32Array.from(units, u => u[5].length))
  for (const [i, u] of all.units.entries()) expect(thin.pieces[i], `unit ${i}`).toBe(u === null ? 0 : u[5].length)
})
})
