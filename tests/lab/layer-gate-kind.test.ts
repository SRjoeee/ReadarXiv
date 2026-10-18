// @vitest-environment node
// The layer gate's --engine-kind: the drawn layer (v0, `proto`) is what it measures and its default; the first layer
// (`layer`, layer/layer.mjs) is parked, and a request for it says so rather than failing every fixture one by one
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { engineKindOf } from '../../lab/pdf/spikes/layer-gate/kind.mjs'

const ROOT = resolve(__dirname, '../..')
const gone = () => false
const there = (path: string) => path.endsWith('src/pdf-reader/engine/layer/layer.mjs')

describe('engineKindOf', () => {
  it('is proto when none is given, and proto when proto is', () => {
    expect(engineKindOf(undefined, '/engine', gone)).toBe('proto')
    expect(engineKindOf('proto', '/engine', gone)).toBe('proto')
  })
  it('refuses the first layer of an engine that has parked it, naming where it went', () => {
    expect(() => engineKindOf('layer', '/engine', gone)).toThrow(/parked\/engine\//)
    expect(() => engineKindOf('layer', '/engine', gone)).toThrow(/layer\/layer\.mjs/)
  })
  it('measures the first layer of an engine that still has it (an older worktree, --engine=<it>)', () => {
    expect(engineKindOf('layer', '/old-worktree', there)).toBe('layer')
  })
  it('refuses any other kind', () => {
    expect(() => engineKindOf('v2', '/engine', gone)).toThrow(/proto/)
  })
})

describe('the gate', () => {
  it('refuses --engine-kind=layer on this tree before it reads a fixture', () => {
    const r = spawnSync(process.execPath, ['lab/pdf/spikes/layer-gate.mjs', '--engine-kind=layer'], { cwd: ROOT, encoding: 'utf8' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/parked\/engine\//)
  })
})
