// The platform boundary's checker (DESIGN §4.2, scripts/check-boundary.mjs). The first version matched `@/…` spellings
// only, and the adversarial review of 2026-09-13 walked past it with a relative path; every bypass it named is a case
// here, so the next rewrite cannot lose one.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { enginePackagesOf, platformImportsOf, resolveSpecifier, valueImportsOf, withoutComments } from '../../scripts/check-boundary.mjs'

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
    expect(forbidden("import { LOCALES } from '@/locales'\n")).toEqual(['@/locales'])
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
    expect(forbidden("import { type Locale, LOCALES } from '@/locales'\n")).toEqual(['@/locales'])
  })
})

describe('valueImportsOf', () => {
  it('reports every specifier of a file in the order they appear', () => {
    const text = "import a from './a'\nimport type { B } from './b'\nexport { c } from './c'\nconst d = await import('./d')\n"
    expect(valueImportsOf(text)).toEqual(['./a', './c', './d'])
  })
})

describe('the engine imports no package but the layout rules\' validator, in rules/ alone', () => {
  const packages = (file: string, text: string) => (enginePackagesOf(file, text) as { spec: string }[]).map(p => p.spec)
  it('allows zod (and its mini build) in src/pdf-reader/engine/rules/, and nowhere else in the engine', () => {
    expect(packages('src/pdf-reader/engine/rules/layout.mjs', "import * as z from 'zod/mini'\n")).toEqual([])
    expect(packages('src/pdf-reader/engine/rules/layout.mjs', "import { z } from 'zod'\n")).toEqual([])
    expect(packages('src/pdf-reader/engine/layer-proto/run.mjs', "import * as z from 'zod/mini'\n")).toEqual(['zod/mini'])
    expect(packages('src/pdf-reader/engine/source/latex-front.mjs', "import { z } from 'zod'\n")).toEqual(['zod'])
    expect(packages('src/pdf-reader/engine/rulesx/layout.mjs', "import { z } from 'zod'\n")).toEqual(['zod'])
  })
  it('refuses any other package, scoped or not, even in rules/, and a dynamic or required one', () => {
    expect(packages('src/pdf-reader/engine/rules/layout.mjs', "import { a } from 'lodash'\n")).toEqual(['lodash'])
    expect(packages('src/pdf-reader/engine/layout/addon.mjs', "import PL from '@cantoo/pdf-lib'\n")).toEqual(['@cantoo/pdf-lib'])
    expect(packages('src/pdf-reader/engine/layer-proto/x.mjs', "const m = await import('pdfjs-dist')\n")).toEqual(['pdfjs-dist'])
    expect(packages('src/pdf-reader/engine/x.mjs', "const m = require('zod')\n")).toEqual(['zod'])
  })
  it('lets relative paths, the repository\'s aliases, node: modules and type-only imports pass, and judges only the engine', () => {
    expect(packages('src/pdf-reader/engine/x.mjs', "import { a } from './a.mjs'\nimport { b } from '../b.mjs'\nimport { c } from '@/core/c'\nimport { d } from 'node:fs'\n")).toEqual([])
    expect(packages('src/pdf-reader/engine/x.d.mts', "import type { ZodMiniType } from 'zod/mini'\n")).toEqual([])
    expect(packages('src/core/x.ts', "import { z } from 'zod'\n")).toEqual([])
  })
})
