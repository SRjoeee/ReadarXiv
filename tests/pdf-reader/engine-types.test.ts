// @vitest-environment node
// The entries' types (docs/PDF-READER.md, "The engine's contract"): every name engine-contract.json lists is declared by the
// module that defines it, and typed. The project's own type check skips declaration files (skipLibCheck), under which a
// re-export of a name its module never declared, and a module with no declaration file at all, silently become `any`; this
// check runs tsc over a generated file with skipLibCheck off and asserts of every name that it is not `any`.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const TSC = join(ROOT, 'node_modules/typescript/bin/tsc')
const CONTRACT = JSON.parse(readFileSync(join(__dirname, 'engine-contract.json'), 'utf8')) as Record<string, string[]>

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

/** tsc over `files` (written in a temporary directory) with skipLibCheck off; the declaration files it reads are the project's */
function tsc(files: Record<string, string>, paths: Record<string, string[]> = { '@/*': [`${ROOT}/src/*`] }) {
  const dir = mkdtempSync(join(tmpdir(), 'engine-types-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), text) }
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: false, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: [], allowImportingTsExtensions: true, paths },
    files: Object.keys(files).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts')),
  }))
  const r = spawnSync(process.execPath, [TSC, '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
  return { status: r.status, errors: r.stdout.split('\n').filter(l => /error TS/.test(l)).map(l => l.replace(dir, '').replace(ROOT, '')) }
}

const ANY = 'type IsAny<T> = 0 extends 1 & T ? true : false\ntype Typed<T extends false> = T\n'

describe('the checker', () => {
  it('refuses a name its module never declared, a module with no declaration file and a name typed any, and passes a typed one', () => {
    const files = {
      'a.mjs': 'export const typed = 1\nexport const loose = 1\n',
      'a.d.mts': 'export declare const typed: number\nexport declare const loose: any\n',
      'entry.d.mts': "export { typed, loose, missing } from './a.mjs'\nexport { bare } from './b.mjs'\n",
      'b.mjs': 'export const bare = 1\n',
      'check.ts': `${ANY}import type * as e from './entry.mjs'\nexport type T = Typed<IsAny<typeof e.typed>>\nexport type L = Typed<IsAny<typeof e.loose>>\n`,
    }
    const { status, errors } = tsc(files)
    expect(status).not.toBe(0)
    expect(errors.join('\n')).toMatch(/TS2305.*missing/)
    expect(errors.join('\n')).toMatch(/TS7016.*b\.mjs/)
    expect(errors.join('\n')).toMatch(/TS2344/) // `loose` is any
    expect(errors.join('\n')).not.toMatch(/typed\b.*TS2344|TS2344.*e\.typed/)
    expect(tsc({ ...files, 'entry.d.mts': "export { typed } from './a.mjs'\n", 'check.ts': `${ANY}import type * as e from './entry.mjs'\nexport type T = Typed<IsAny<typeof e.typed>>\n` })).toEqual({ status: 0, errors: [] })
  })
})

describe('the five entries', () => {
  it('declare every name engine-contract.json lists, and none as any', () => {
    const lines = [ANY]
    for (const entry of Object.keys(CONTRACT)) lines.push(`import type * as ${entry} from '${ROOT}/src/pdf-reader/engine/${entry}.mjs'`)
    for (const [entry, names] of Object.entries(CONTRACT)) for (const name of names) lines.push(`export type ${entry}_${name} = Typed<IsAny<typeof ${entry}.${name}>>`)
    const { status, errors } = tsc({ 'check.ts': `${lines.join('\n')}\n` })
    expect({ status, errors }).toEqual({ status: 0, errors: [] })
  })
})
