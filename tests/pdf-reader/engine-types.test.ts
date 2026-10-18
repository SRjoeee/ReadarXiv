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

describe('the reading view\'s document task', () => {
  // V10's type row: what each host's opener returns is a DocumentTask, PDF.js's own loading task and the web's ranged one
  // (a task of its shape, whose PDF.js task begins after its first range is read), with skipLibCheck off
  it('takes pdfjs-dist\'s PDFDocumentLoadingTask and a ranged task of its shape, and an opener over getDocument', () => {
    const check = [
      `import type { PDFDocumentLoadingTask, PDFDocumentProxy } from '${ROOT}/node_modules/pdfjs-dist/types/src/pdf.d.ts'`,
      `import type { DocumentOpener, DocumentTask } from '${ROOT}/src/pdf-reader/engine/view/reader-view.mjs'`,
      'declare const pdfjs: PDFDocumentLoadingTask',
      'export const own: DocumentTask = pdfjs',
      'interface RangedTask { readonly promise: Promise<PDFDocumentProxy>; readonly opened: boolean; onProgress: ((p: { loaded: number; total: number }) => void) | null; destroy(): Promise<void> }',
      'declare const ranged: RangedTask',
      'export const web: DocumentTask = ranged',
      'declare function getDocument(o: Record<string, unknown>): PDFDocumentLoadingTask',
      "export const opener: DocumentOpener = options => getDocument({ ...options, url: 'https://arxiv.org/pdf/2600.00001' })",
    ]
    expect(tsc({ 'check.ts': `${check.join('\n')}\n` })).toEqual({ status: 0, errors: [] })
    // the control: a task with no destroy is not one
    const bad = tsc({ 'check.ts': `${[check[1], 'export const t: DocumentTask = { promise: Promise.resolve(null as never), onProgress: null }'].join('\n')}\n` })
    expect(bad.status).not.toBe(0)
  })
})

describe('the units readers, bodies-free (amendment M21)', () => {
  it('type a read without bodies as flags, and the default as the full chunk, with no cast', () => {
    const entry = `${ROOT}/src/pdf-reader/engine/layer.mjs`
    const check = `
import { readUnitsChunk, unitsOfChunks, droppedOf, indexOf, readPart, mergeParts, openLayer } from '${entry}'
import type { LayerIndex, LightLayerIndex, PartChain, ReadHead, ReadUnitsChunk, ReadUnitsChunkLight, Ref } from '${entry}'
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
declare const bytes: Uint8Array
declare const ref: Ref
export async function use() {
  const full = await readUnitsChunk(bytes, { ref, before: null })
  const light = await readUnitsChunk(bytes, { ref, before: null, bodies: false })
  const alone = await readUnitsChunk(bytes, { ref, before: null, dropped: [0], bodies: false })
  const dflt = await readUnitsChunk(bytes, { ref, before: null, bodies: true })
  type A = Expect<Eq<typeof full, ReadUnitsChunk>>
  type B = Expect<Eq<typeof light, ReadUnitsChunkLight>>
  type C = Expect<Eq<typeof alone.units, (true | null)[]>>
  type D = Expect<Eq<typeof dflt, ReadUnitsChunk>>
  const chain = unitsOfChunks([full])
  const thin = unitsOfChunks([light], { bodies: false })
  const mixed = unitsOfChunks([full, light], { bodies: false })
  type E = Expect<Eq<typeof thin.units, (true | null)[]>>
  type F = Expect<Eq<typeof mixed.units, (true | null)[]>>
  type G = Expect<Eq<ReturnType<typeof unitsOfChunks>['units'][number], unknown> extends false ? true : true>
  const first: boolean = thin.units[0] === true
  const part: string[] = [...light.part.kinds.filter((k): k is string => k !== null)]
  const next = await readUnitsChunk(bytes, { ref, before: light, bodies: false })
  return [chain, first, part, droppedOf([full, light]), next, {} as [A, B, C, D, E, F, G]]
}
// @ts-expect-error a light chunk is not a full one: the bodies-free chain needs the option
unitsOfChunks([light])
declare const head: ReadHead
declare const light: ReadUnitsChunkLight
declare const full: ReadUnitsChunk
const lean = indexOf(head, [light])
const whole = indexOf(head, [full])
type H = Expect<Eq<typeof lean, LightLayerIndex>>
type I = Expect<Eq<typeof whole, LayerIndex>>
type J = Expect<Eq<typeof lean.pieces, Uint32Array>>
type K = Expect<Eq<typeof light.pieces, Uint32Array>>
declare const chain: PartChain | null
export const parts = [readPart(bytes, { ref, index: lean, chain }), readPart(bytes, { ref, index: whole, chain }), {} as [H, I, J, K]]
// @ts-expect-error a light index holds no bodies: the merge refuses it
mergeParts(lean, [])
// @ts-expect-error nor does the door take one
openLayer({ index: lean } as Parameters<typeof openLayer>[0])
`
    expect(tsc({ 'check.ts': check })).toEqual({ status: 0, errors: [] })
  })
})
