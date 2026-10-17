// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVERAGE_SOURCE } from '../../src/pdf-reader/engine/rules/font-coverage.mjs'
import { checkCompileImage, COMPILE_IDENTITY, COMPILE_IMAGE, compileIdentity, compileImageRef, identityOf, imageFromArg, imageIdOf, platformArgs } from '../../lab/pdf/spikes/compile-image.mjs'

// The compile image's identity (lab/pdf/spikes/compile-image.mjs): one reference for every Docker compile of the lab, the same
// digest in every compile cache key, so that a cache of another TeX Live misses

const A = `texlive/texlive:latest@sha256:${'a'.repeat(64)}`
const B = `texlive/texlive@sha256:${'b'.repeat(64)}`
const pin = JSON.parse(readFileSync(join(import.meta.dirname, '../../lab/pdf/compile-image.json'), 'utf8'))
/** a compile cache key as layout-make.mjs, layer-fixtures.mjs and layout-paper-check.mjs build it: the identity, then the files */
const keyOf = (identity: string, files: [string, string][]) => {
  const h = createHash('sha256').update(identity)
  for (const [p, b] of files) h.update(p).update(b)
  return h.digest('hex').slice(0, 16)
}

describe('which image the lab compiles in', () => {
  it('is the pin\'s texlive by default, and COMPILE_IMAGE where given', () => {
    expect(compileImageRef({})).toBe(pin.texlive)
    expect(compileImageRef({ COMPILE_IMAGE: B })).toBe(B)
    expect(COMPILE_IMAGE).toBe(process.env.COMPILE_IMAGE || pin.texlive)
  })

  it('refuses a reference with no digest, or a pin file that is not one', () => {
    expect(() => compileImageRef({ COMPILE_IMAGE: 'texlive/texlive:latest' })).toThrow(/name\[:tag\]@sha256/)
    expect(() => compileImageRef({ COMPILE_IMAGE: 'texlive/texlive@sha256:abc' })).toThrow(/sha256/)
    const dir = mkdtempSync(join(tmpdir(), 'compile-image-'))
    writeFileSync(join(dir, 'p.json'), JSON.stringify({ texlive: 'texlive/texlive:latest' }))
    expect(() => compileImageRef({}, join(dir, 'p.json'))).toThrow(/name\[:tag\]@sha256/)
  })

  it('asks for a platform only when COMPILE_PLATFORM says so', () => {
    expect(platformArgs({})).toEqual([])
    expect(platformArgs({ COMPILE_PLATFORM: 'linux/amd64' })).toEqual(['--platform', 'linux/amd64'])
    expect(() => platformArgs({ COMPILE_PLATFORM: 'amd64' })).toThrow(/os\/arch/)
  })
})

describe('the identity in a compile cache key', () => {
  const files: [string, string][] = [['main.tex', '\\documentclass{article}'], ['a.sty', 'x']]

  it('is the digest, and the platform where asked', () => {
    expect(identityOf(A)).toBe(`sha256:${'a'.repeat(64)}`)
    expect(identityOf(B, ['--platform', 'linux/amd64'])).toBe(`sha256:${'b'.repeat(64)}|linux/amd64`)
    expect(COMPILE_IDENTITY).toBe(identityOf(COMPILE_IMAGE, platformArgs()))
  })

  it('gives one key to one identity and another to another, though the files are the same', () => {
    expect(keyOf(identityOf(A), files)).toBe(keyOf(identityOf(A), files))
    expect(keyOf(identityOf(A), files)).not.toBe(keyOf(identityOf(B), files))
    expect(keyOf(identityOf(B), files)).not.toBe(keyOf(identityOf(B, ['--platform', 'linux/amd64']), files))
  })

  it('is in the key of each cache that keys a compile by its files', () => {
    for (const f of ['layout-make.mjs', 'layer-fixtures.mjs', 'layout-paper-check.mjs']) {
      const text = readFileSync(join(import.meta.dirname, '../../lab/pdf/spikes', f), 'utf8')
      expect(text, f).toMatch(/createHash\('sha256'\)(\.update\(String\(EPOCH\)\))?\.update\((COMPILE_IDENTITY|IDENTITY)\)/)
      expect(text, f).not.toContain("'texlive/texlive:latest'")
    }
  })
})

describe('the local image is the digest the key names', () => {
  const inspect = (info: object) => async () => ({ stdout: JSON.stringify(info) })

  it('passes when the local image has the digest (and the platform\'s architecture)', async () => {
    await expect(checkCompileImage(A, [], inspect({ RepoDigests: [`texlive/texlive@sha256:${'a'.repeat(64)}`], Architecture: 'arm64' }))).resolves.toBeTruthy()
    await expect(checkCompileImage(B, ['--platform', 'linux/amd64'], inspect({ RepoDigests: [`texlive/texlive@sha256:${'b'.repeat(64)}`], Architecture: 'amd64' }))).resolves.toBeTruthy()
  })

  it('refuses another digest, another architecture and an image that is not there', async () => {
    await expect(checkCompileImage(A, [], inspect({ RepoDigests: [`texlive/texlive@sha256:${'c'.repeat(64)}`] }))).rejects.toThrow(/not sha256:a{64}/)
    await expect(checkCompileImage(B, ['--platform', 'linux/amd64'], inspect({ RepoDigests: [`texlive/texlive@sha256:${'b'.repeat(64)}`], Architecture: 'arm64' }))).rejects.toThrow(/arm64, not amd64/)
    await expect(checkCompileImage(A, [], async () => { throw Object.assign(new Error('x'), { stderr: 'Error response from daemon: No such image\n' }) })).rejects.toThrow(/not on this machine/)
  })
})

describe('a native compile, the platform in the inspection and the key, and --image by digest', () => {
  const asked: string[][] = []
  const inspect = (info: object) => async (args: string[]) => { asked.push(args); return { stdout: JSON.stringify(info) } }

  it('has the identity native and checks no image under NATIVE_TEX=1 (no Docker needed)', async () => {
    expect(compileIdentity({ NATIVE_TEX: '1' })).toBe('native')
    expect(compileIdentity({ NATIVE_TEX: '1', COMPILE_PLATFORM: 'linux/amd64' })).toBe('native')
    expect(compileIdentity({})).toBe(identityOf(pin.texlive))
    const ask = async () => { throw new Error('docker must not be asked') }
    await expect(checkCompileImage(A, [], ask, { NATIVE_TEX: '1' })).resolves.toEqual({})
    await expect(checkCompileImage(A, [], ask, {})).rejects.toThrow(/not on this machine.*NATIVE_TEX=1/)
  })

  it('inspects the platform it compiles on, and refuses another architecture', async () => {
    asked.length = 0
    await checkCompileImage(B, ['--platform', 'linux/amd64'], inspect({ RepoDigests: [`texlive/texlive@sha256:${'b'.repeat(64)}`], Architecture: 'amd64' }))
    expect(asked[0]).toEqual(['image', 'inspect', '--platform', 'linux/amd64', '--format', '{{json .}}', B])
    asked.length = 0
    await checkCompileImage(A, [], inspect({ RepoDigests: [`texlive/texlive@sha256:${'a'.repeat(64)}`], Architecture: 'arm64' }))
    expect(asked[0]).toEqual(['image', 'inspect', '--format', '{{json .}}', A])
  })

  it('has the platform in the key of every cache, the marks gate\'s too', () => {
    const dir = join(import.meta.dirname, '../../lab/pdf/spikes')
    expect(readFileSync(join(dir, 'layout-marks-gate.mjs'), 'utf8')).toMatch(/JSON\.stringify\(\[FORMAT, READ_HASH, image, COMPILE_IDENTITY,/)
    expect(readFileSync(join(dir, 'layout-marks-gate.mjs'), 'utf8')).toContain('await imageIdOf()')
    expect(readFileSync(join(dir, 'layout-paper-check.mjs'), 'utf8')).toContain('compileIdentity(process.env, IMAGE, PLATFORM)')
    // (one identity helper for the lot: the platform is part of it)
    expect(identityOf(A, ['--platform', 'linux/arm64'])).not.toBe(identityOf(A, ['--platform', 'linux/amd64']))
  })

  it('reads the image id of the platform it compiles on, and none under NATIVE_TEX=1 (the marks gate\'s key)', async () => {
    asked.length = 0
    const ask = async (args: string[]) => { asked.push(args); return { stdout: 'sha256:abc\n' } }
    expect(await imageIdOf(B, ['--platform', 'linux/amd64'], ask, {})).toBe('sha256:abc')
    expect(asked[0]).toEqual(['image', 'inspect', '--platform', 'linux/amd64', B, '--format', '{{.Id}}'])
    asked.length = 0
    expect(await imageIdOf(B, [], async () => { throw new Error('docker must not be asked') }, { NATIVE_TEX: '1' })).toBe('native')
    expect(asked).toEqual([])
  })

  it('takes --image by digest alone: a tag is no identity', () => {
    expect(imageFromArg(null)).toBe(compileImageRef({}))
    expect(imageFromArg(B)).toBe(B)
    expect(() => imageFromArg('texlive/texlive:latest')).toThrow(/by digest/)
    expect(() => imageFromArg('texlive/texlive')).toThrow(/by digest/)
    expect(readFileSync(join(import.meta.dirname, '../../lab/pdf/spikes/layout-paper-check.mjs'), 'utf8')).toContain("imageFromArg(argOf('image'))")
  })
})

describe('the font coverage is of the pinned image', () => {
  it('names the image the TeX Live faces were measured in: the pin\'s texlive', () => {
    expect(COVERAGE_SOURCE.release.texlive, 'regenerate scripts/font-roles.py from the pinned image\'s faces, or pin the image they were measured in').toBe(pin.texlive)
  })
})
