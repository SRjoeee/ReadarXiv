// `@readarxiv/reader/early` (the manifest's `./early`, src/early.ts): what a host's page does before the reader's code has
// loaded, as the reader does it, so that nothing is done twice and nothing differs: the original's first ask, the one the
// reader's own first read makes (a host that made it hands its answer over and the reader asks nothing again), and the look
// the chrome sets on <html>, read from the same preferences (a page painted before the chrome mounts shows the look chosen).
// A host's boot script and first-paint script take it whole, so it reaches nothing beyond its own few files: no package.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as appearance from '../src/chrome/appearance.ts'
import * as early from '../src/early.ts'
import { DEFAULTS } from '../src/prefs.ts'
import type { Reader } from '../src/reader.ts'
import { bytesOf, rangedServer } from './helpers/ranged-server.ts'

vi.mock('../src/pdfjs/kit.ts', async (real) => ({
  ...(await real<object>()),
  loadKit: () => new Promise(() => {}),
}))
const { openReader } = await import('../src/reader.ts')

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../src')
const manifest = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')) as { exports: Record<string, string> }

/** every module a file names (a static or a re-exporting `from`, a bare import, a dynamic import), comments out */
const namedBy = (file: string): string[] => {
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  return [
    ...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
    ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1] as string)
}
/** the files `entry` reaches by what it names, itself first, and every specifier that is not a relative path */
function closureOf(entry: string): { files: string[]; outside: string[] } {
  const files: string[] = []
  const outside: string[] = []
  const todo = [entry]
  while (todo.length > 0) {
    const file = todo.shift() as string
    if (files.includes(file)) continue
    files.push(file)
    for (const spec of namedBy(file)) {
      if (spec.startsWith('./') || spec.startsWith('../')) todo.push(resolve(dirname(file), spec))
      else outside.push(`${file.slice(SRC.length + 1)}: ${spec}`)
    }
  }
  return { files: files.map((f) => f.slice(SRC.length + 1)), outside }
}

let reader: Reader | null = null
afterEach(() => {
  reader?.close()
  reader = null
})

describe('@readarxiv/reader/early', () => {
  it('is an entry of the package, beside its own: the first ask and the look, and nothing else', () => {
    expect(manifest.exports['./early']).toBe('./src/early.ts')
    expect(Object.keys(early).sort()).toEqual(['dimmed', 'firstAsk', 'themeOf'])
  })
  it('reaches no package: a host takes it ahead of the reader, its own files alone', () => {
    const { files, outside } = closureOf(join(SRC, 'early.ts'))
    expect(outside).toEqual([])
    expect(files).toEqual(['early.ts', 'bytes/chunk.ts', 'chrome/look.ts'])
  })
  it("the first ask is the reader's own first read of the original: its address and its range, asked once", async () => {
    const original = '/api/v2/o/arxiv/2600_00001v1.pdf'
    const served = rangedServer(new Map([[original, { bytes: bytesOf(200_000), etag: '"o"' }]]))
    const asked: { url: string; range: string | null }[] = []
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.split('?')[0] === original) {
        asked.push({ url, range: new Headers(init?.headers).get('range') })
        return served.fetch(url, init)
      }
      // (our server's other routes: the follow's stream, which says nothing here)
      return new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream' } })
    }
    reader = openReader(document.createElement('div'), {
      host: {
        fetch,
        original: () => original,
        prefs: { read: async () => ({ ...DEFAULTS }), write: async () => {}, watch: () => () => {} },
      },
      paper: '2600.00001v1',
    })
    for (let turn = 0; turn < 200 && asked.length === 0; turn++) await new Promise<void>((r) => setTimeout(r, 0))
    expect(asked[0]).toEqual(early.firstAsk(original))
    expect(asked.filter((a) => a.url === asked[0]?.url)).toHaveLength(1)
  })
  it("the first ask's address keeps an address's own query, the range after it", () => {
    expect(early.firstAsk('/o/a.pdf')).toEqual({ url: '/o/a.pdf?r=0-65535', range: 'bytes=0-65535' })
    expect(early.firstAsk('/o/a.pdf?v=2').url).toBe('/o/a.pdf?v=2&r=0-65535')
  })
  it("the look's readings are the ones the chrome applies to <html> (its appearance, data-theme and data-axt-dim)", () => {
    expect(early.themeOf).toBe(appearance.themeOf)
    expect(early.dimmed).toBe(appearance.dimmed)
  })
})
