import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACKAGES_IMPORTS, packageFile } from '../../lab/pdf/packages-route.mjs'

// A plain page of the lab loads the engine's workspace packages by an import map: a package one of them imports by name and
// the map does not name fails the page's every module (the layer gate's speed check laid no output while
// packages/engine/src/marks/run-ins.ts imported `@readarxiv/text` and neither map named it, lane mem-front 2026-11-10).
const ROOT = resolve(import.meta.dirname, '../..')
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesUnder(join(dir, d.name)) : [join(dir, d.name)]))
/** the workspace packages a package's source loads by name: its imports and re-exports, not those its type stripping erases */
const loadsOf = (pkg: string): Set<string> => {
  const out = new Set<string>()
  for (const f of filesUnder(join(ROOT, 'packages', pkg, 'src'))) {
    if (!/\.(ts|mjs|js)$/.test(f) || /\.test\.ts$/.test(f) || /\.d\.ts$/.test(f)) continue
    const code = readFileSync(f, 'utf8')
    for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+'(@readarxiv\/[a-z]+)'/gms)) if (!m[2]) out.add(m[3] as string)
  }
  return out
}
/** every workspace package a page that maps `entries` loads, followed from each to the packages it loads */
const loadedFrom = (entries: string[]): Set<string> => {
  const seen = new Set<string>(), todo = [...entries]
  while (todo.length) {
    const p = todo.pop() as string
    if (seen.has(p)) continue
    seen.add(p)
    todo.push(...loadsOf(p.replace('@readarxiv/', '')))
  }
  return seen
}
const named = (imports: Record<string, string>) => Object.keys(imports).filter((k) => k.startsWith('@readarxiv/'))
/** the import map a page of the lab writes by hand */
const pageImports = (page: string): Record<string, string> => {
  const html = readFileSync(join(ROOT, page), 'utf8')
  return JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}').imports
}
const PAGES = ['lab/pdf/spikes/layer-gate/page.html', 'lab/pdf/layer-lab/index.html', 'lab/pdf/spikes/ocg-reader/index.html']

describe("the lab's import maps of the workspace packages", () => {
  it('name every package the engine loads by name, each served from its entry', () => {
    const map: Readonly<Record<string, string>> = PACKAGES_IMPORTS
    for (const p of loadedFrom(named(map))) {
      expect(map[p], p).toBe(`/packages/${p.replace('@readarxiv/', '')}/src/index.ts`)
      expect(packageFile(ROOT, map[p] ?? ''), p).not.toBeNull()
    }
  })
  it.each(PAGES)('%s, which writes its map by hand, names the same', (file) => {
    const page = pageImports(file)
    for (const p of loadedFrom(named(page))) expect(page[p], p).toBe(PACKAGES_IMPORTS[p])
  })
})
