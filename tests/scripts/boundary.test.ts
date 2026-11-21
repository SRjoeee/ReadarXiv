// The platform boundary's checker (DESIGN §4.2, scripts/check-boundary.mjs). The first version matched `@/…` spellings
// only, and the adversarial review of 2026-09-13 walked past it with a relative path; every bypass it named is a case
// here, so the next rewrite cannot lose one.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { platformImportsOf, resolveSpecifier, valueImportsOf, withoutComments } from '../../scripts/check-boundary.mjs'

const FROM = 'src/core/renderer/failed.ts'
const forbidden = (text: string, file = FROM) => (platformImportsOf(file, text) as { spec: string }[]).map(p => p.spec)

describe('resolveSpecifier', () => {
  it('resolves every alias the project configures, a relative path and a bare module to one destination', () => {
    expect(resolveSpecifier(FROM, '@/ui/strings')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, '~/ui/strings')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, '@@/src/ui/strings')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, '~~/src/ui/strings')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, '../../ui/strings')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, './attrs')).toBe('src/core/renderer/attrs')
    expect(resolveSpecifier(FROM, 'wxt/browser')).toBe('wxt/browser')
  })
  it('reads a file extension and an index file as the module they name', () => {
    expect(resolveSpecifier(FROM, '../../ui/strings.ts')).toBe('src/ui/strings')
    expect(resolveSpecifier(FROM, '@/locales/index.ts')).toBe('src/locales')
    expect(resolveSpecifier(FROM, '@/ui/controls/Button.tsx')).toBe('src/ui/controls/Button')
  })
})

describe('withoutComments', () => {
  it('blanks comments and keeps the lines, so an import named in prose is not an import', () => {
    expect(forbidden("// import { S } from '@/ui/strings'\nexport const a = 1\n")).toEqual([])
    expect(forbidden("/**\n * `import { S } from '@/ui/strings'` is what this used to do\n */\nexport const a = 1\n")).toEqual([])
    expect(withoutComments("const a = 1 // x\nconst b = 2\n").split('\n')).toHaveLength(3)
  })
  it('leaves a literal that contains comment markers alone', () => {
    expect(withoutComments("const url = 'https://example.com/x' \nconst a = 1\n")).toContain('const a = 1')
    expect(forbidden("const url = 'https://example.com/*'\nimport { S } from '@/ui/strings'\n")).toEqual(["@/ui/strings"])
  })
})

describe('the forms an import can take', () => {
  it('catches the spelling the review used to walk past the first checker', () => {
    expect(forbidden("import { S } from '../../ui/strings'\n")).toEqual(['../../ui/strings'])
    expect(forbidden("import { S } from '~/ui/strings'\n")).toEqual(['~/ui/strings'])
    expect(forbidden("import { S } from '@@/src/ui/strings'\n")).toEqual(['@@/src/ui/strings'])
  })
  it('catches compact syntax, namespace imports and a bare side-effect import', () => {
    expect(forbidden("import{S}from'@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(forbidden("import * as strings from '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(forbidden("import '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(forbidden("import'@/ui/strings'\n")).toEqual(['@/ui/strings'])
  })
  it('catches re-exports, dynamic imports however spaced, and require', () => {
    expect(forbidden("export { S } from '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(forbidden("export * from '@/ui/strings'\n")).toEqual(['@/ui/strings'])
    expect(forbidden("const s = await import('@/ui/strings')\n")).toEqual(['@/ui/strings'])
    expect(forbidden("const s = await import(  '@/ui/strings'  )\n")).toEqual(['@/ui/strings'])
    expect(forbidden("const s = require('@/ui/strings')\n")).toEqual(['@/ui/strings'])
  })
  it('catches every platform module the rule names, from wherever in the core', () => {
    expect(forbidden("import { browser } from 'wxt/browser'\n", 'src/providers/google-web.ts')).toEqual(['wxt/browser'])
    expect(forbidden("import { sendMessage } from '@/shared/messages'\n", 'src/cache/index.ts')).toEqual(['@/shared/messages'])
    expect(forbidden("import { configItem } from '@/config/storage'\n")).toEqual(['@/config/storage'])
    expect(forbidden("import { usePopupData } from '@/entrypoints/popup/data'\n")).toEqual(['@/entrypoints/popup/data'])
    expect(forbidden("import { LOCALES } from '@readarxiv/ui'\n")).toEqual(['@readarxiv/ui'])
  })
})

describe('what stays allowed', () => {
  it('lets a type-only import and a type-only re-export through: they compile away', () => {
    expect(forbidden("import type { PageStatus } from '@/shared/messages'\n")).toEqual([])
    expect(forbidden("export type { PageStatus } from '@/shared/messages'\n")).toEqual([])
    expect(forbidden("import type{PageStatus}from'@/shared/messages'\n")).toEqual([])
  })
  it('lets the core import the core, the shared data modules and the configuration schema', () => {
    expect(forbidden("import { T_CLASS } from '@/core/marks'\nimport { DEFAULT_CONFIG } from '@/config/schema'\nimport type { OcrResult } from '@/shared/ocr'\n")).toEqual([])
    expect(forbidden("import { setState } from './attrs'\n")).toEqual([])
  })
  it('counts a value import that merely marks some names as types: `import type { … }` says it better', () => {
    expect(forbidden("import { type Locale, LOCALES } from '@readarxiv/ui'\n")).toEqual(['@readarxiv/ui'])
  })
})

describe('valueImportsOf', () => {
  it('reports every specifier of a file in the order they appear', () => {
    const text = "import a from './a'\nimport type { B } from './b'\nexport { c } from './c'\nconst d = await import('./d')\n"
    expect(valueImportsOf(text)).toEqual(['./a', './c', './d'])
  })
})

// The gate as `pnpm lint` runs it: `node scripts/check-boundary.mjs` from the repository's root. The script is a module
// these tests import as well, so it runs its check only when it is the program — and it must know that it is wherever the
// checkout lies: told by a `file://` + path spelled by hand, a checkout under a path with a space in it (a URL writes
// `%20`) ended the check having read nothing, with exit code 0
describe('the gate run as a program, in a checkout whose path a file: URL spells otherwise', () => {
  let root: string
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const run = () => {
    // the files the gate reads are the ones git tracks
    execFileSync('git', ['add', '-A'], { cwd: root })
    const result = spawnSync(process.execPath, ['scripts/check-boundary.mjs'], { cwd: root, encoding: 'utf8' })
    return { code: result.status, out: result.stdout, err: result.stderr }
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'axt boundary '))
    mkdirSync(join(root, 'scripts'))
    copyFileSync(resolve('scripts/check-boundary.mjs'), join(root, 'scripts/check-boundary.mjs'))
    execFileSync('git', ['init', '-q'], { cwd: root })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('reads the core and says so', () => {
    put('src/core/clean.ts', "import { T_CLASS } from '@/core/marks'\nexport const a = T_CLASS\n")
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toContain('boundary check: 1 core files import no platform module')
  })
  it('fails on a core file that imports the platform layer', () => {
    put('src/core/leak.ts', "import { getConfig } from '@/config/storage'\nexport const a = getConfig\n")
    const { code, err } = run()
    expect(code).toBe(1)
    expect(err).toContain('src/core/leak.ts: imports @/config/storage')
  })
})
