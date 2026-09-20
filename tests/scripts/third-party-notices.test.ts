import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script the build config imports, deliberately dependency-free and untyped
import { noticesText, packageDirOf } from '../../scripts/third-party-notices.mjs'

// The notices that ship in every build (docs/THIRD_PARTY.md, "npm packages"): which package a module belongs to, and
// what the file says of it. The list itself is the bundle's and is checked on the real output (scripts/check-output.mjs)

describe('packageDirOf', () => {
  it('names the package a module id lies in, pnpm\'s nesting and scopes included', () => {
    expect(packageDirOf('/w/node_modules/.pnpm/react@19.2.8/node_modules/react/index.js')).toBe('/w/node_modules/.pnpm/react@19.2.8/node_modules/react')
    expect(packageDirOf('/w/node_modules/.pnpm/@ai-sdk+provider@4.0.10/node_modules/@ai-sdk/provider/dist/index.mjs')).toBe('/w/node_modules/.pnpm/@ai-sdk+provider@4.0.10/node_modules/@ai-sdk/provider')
    expect(packageDirOf('/w/node_modules/zod/v4/core/api.js')).toBe('/w/node_modules/zod')
  })

  it('reads through what a bundler adds to an id: a virtual module\'s NUL, a query, a Windows path', () => {
    expect(packageDirOf('\0/w/node_modules/dexie/dist/dexie.mjs?commonjs-proxy')).toBe('/w/node_modules/dexie')
    expect(packageDirOf('C:\\w\\node_modules\\dexie\\dist\\dexie.mjs')).toBe('C:/w/node_modules/dexie')
  })

  it('has nothing to say of the project\'s own modules, a virtual one, or pnpm\'s store itself', () => {
    expect(packageDirOf('/w/src/core/session/index.ts')).toBeUndefined()
    expect(packageDirOf('\0virtual:wxt-background-entrypoint')).toBeUndefined()
    expect(packageDirOf('/w/node_modules/.pnpm/lock.yaml')).toBeUndefined()
  })
})

describe('noticesText', () => {
  let root = ''
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const pkg = (name: string, manifest: Record<string, unknown>, files: Record<string, string>): string => {
    const dir = join(root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }))
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text)
    return dir
  }

  it('gives each package its name, version, licence and its own texts — a NOTICE after the licence (Apache-2.0 §4(d)) — sorted by name', () => {
    root = mkdtempSync(join(tmpdir(), 'axt-notices-'))
    const text = noticesText(new Set([
      pkg('zeta', { version: '2.0.0', license: 'MIT', homepage: 'https://zeta.example' }, { 'LICENSE.md': 'MIT text of zeta\r\n' }),
      pkg('@scope/alpha', { version: '1.0.0', license: 'Apache-2.0', repository: { url: 'git+https://alpha.example' } }, { LICENSE: 'Apache notice of alpha', NOTICE: 'NOTICE of alpha' }),
    ]))
    expect(text).toContain('from the 2 npm packages below')
    expect(text.indexOf('@scope/alpha 1.0.0 — Apache-2.0')).toBeLessThan(text.indexOf('zeta 2.0.0 — MIT'))
    expect(text).toContain('git+https://alpha.example')
    expect(text.indexOf('Apache notice of alpha')).toBeLessThan(text.indexOf('NOTICE of alpha'))
    expect(text).toContain('MIT text of zeta\n')
    expect(text).not.toContain('\r')
  })

  it('adds Apache-2.0\'s own text once when any package is under it, and not otherwise: the AI SDK\'s packages publish only the notice (§4(a))', () => {
    root = mkdtempSync(join(tmpdir(), 'axt-notices-'))
    const terms = 'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION'
    const mit = pkg('only-mit', { version: '1.0.0', license: 'MIT' }, { LICENSE: 'MIT text' })
    expect(noticesText(new Set([mit]))).not.toContain(terms)
    const both = noticesText(new Set([mit, pkg('a', { version: '1.0.0', license: 'Apache-2.0' }, { LICENSE: 'notice a' }), pkg('b', { version: '1.0.0', license: 'Apache-2.0' }, { LICENSE: 'notice b' })]))
    expect(both.split(terms)).toHaveLength(2)
  })

  it('one package installed twice at one version is one entry', () => {
    root = mkdtempSync(join(tmpdir(), 'axt-notices-'))
    const first = pkg('twice', { version: '1.0.0', license: 'MIT' }, { LICENSE: 'MIT text' })
    const second = join(root, 'elsewhere/node_modules/twice')
    mkdirSync(second, { recursive: true })
    writeFileSync(join(second, 'package.json'), JSON.stringify({ name: 'twice', version: '1.0.0', license: 'MIT' }))
    writeFileSync(join(second, 'LICENSE'), 'MIT text')
    expect(noticesText(new Set([first, second])).split('twice 1.0.0 — MIT')).toHaveLength(2)
  })

  it('a bundled package with no text anywhere stops the build, naming the package and the file to add — never a gap in the file', () => {
    root = mkdtempSync(join(tmpdir(), 'axt-notices-'))
    const bare = pkg('@nobody/bare', { version: '3.1.4', license: 'MIT' }, { 'README.md': 'no licence file here' })
    expect(() => noticesText(new Set([bare]))).toThrow(/@nobody\/bare@3\.1\.4 .*licenses\/@nobody__bare\.txt/)
  })

  it('a package that publishes none takes the text kept in licenses/: wxt is one of the four', () => {
    root = mkdtempSync(join(tmpdir(), 'axt-notices-'))
    const text = noticesText(new Set([pkg('wxt', { version: '0.21.4', license: 'MIT' }, {})]))
    expect(text).toContain('wxt 0.21.4 — MIT')
    expect(text).toContain('Permission is hereby granted, free of charge')
  })
})
