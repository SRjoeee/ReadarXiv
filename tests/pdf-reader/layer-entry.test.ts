import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { resolveSpecifier, valueImportsOf, withoutComments } from '../../scripts/check-boundary.mjs'

// The reader's entry (Plan 8d imports it): what it pulls in, and what it gives. Everything it reaches is in the reader's
// bundle, so none of it may be a module only the server runs (the compile, the marks, the maker, the pixel checker), and
// every specifier on the way is relative, so that the web's build through its pin and a plain browser page load it alike

const ENTRY = 'src/pdf-reader/engine/layer/layer.mjs'
const ENGINE = 'src/pdf-reader/engine/'
/** the modules the reader must never load (Plan 8b's Global Constraints, Task 11's Invariants) */
const SERVER = ['layout/marks', 'layout/make', 'layout/ink', 'layout/carry', 'layer/check', 'live', 'latex-front', 'mt', 'scripts'].map(m => `${ENGINE}${m}`)

/** every module the entry reaches through its static and dynamic imports, each with the specifiers it names */
function walk() {
  const seen = new Map<string, string[]>()
  const queue = [ENTRY]
  while (queue.length) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    const text = readFileSync(file, 'utf8')
    // an import whose module is computed escapes any scanner: none is allowed on the way
    expect(/\bimport\s*\(\s*[^'"\s)]/.test(withoutComments(text)), `${file}: an import of a computed module`).toBe(false)
    const specs: string[] = valueImportsOf(text)
    seen.set(file, specs)
    for (const spec of specs) {
      const target: string = resolveSpecifier(file, spec)
      const next = [`${target}.mjs`, `${target}.js`].find(f => existsSync(f))
      if (next) queue.push(next)
    }
  }
  return seen
}

describe("the reader's entry", () => {
  it("the reader's entry pulls no server module", () => {
    const reached = walk()
    for (const [file, specs] of reached) {
      for (const spec of specs) {
        expect(spec.startsWith('./') || spec.startsWith('../'), `${file} imports ${spec}`).toBe(true)
        const target: string = resolveSpecifier(file, spec)
        expect(SERVER.some(m => target === m), `${file} imports ${spec} (${target})`).toBe(false)
        expect(existsSync(`${target}.mjs`), `${file} imports ${spec}, which is not a module of the engine`).toBe(true)
      }
    }
    // what it does reach: the layer, its rules and faces, the layout file's parser
    const modules = [...reached.keys()].map(f => f.slice(ENGINE.length, -'.mjs'.length)).sort()
    expect(modules).toEqual([
      'font-coverage', 'font-roles', 'layer-rules', 'layer/breaks', 'layer/draw', 'layer/fit', 'layer/hyphen', 'layer/layer', 'layer/net',
      'layer/page', 'layer/pieces', 'layer/tokens', 'layout/file', 'layout/json',
    ])
  })

  it("the entry's exports are the contract's", async () => {
    const entry = await import('@/pdf-reader/engine/layer/layer.mjs')
    expect(Object.keys(entry).sort()).toEqual([
      'parseLayout', 'indexLayout', 'LAYOUT', 'LAYOUT_CAP', 'LAYOUT_VALUES', 'LayoutRefusal',
      'layerRulesFor',
      'rolesFor', 'familyOfFonts', 'FACES',
      'loadHyphenator',
      // LAYER_COLOURS: the closed colour table a run's `colour` indexes, so that the reader copies none (the controller's ruling)
      'trText', 'trPiecesOf', 'kOfSource', 'LAYER_COLOURS',
      'layUnit',
      'bodyUnits', 'evenOf',
      'checkPieces',
      'drawUnit', 'spansOf', 'unitAt',
    ].sort())
    // each the module's own, not a copy
    const [file, pieces, fit, draw] = await Promise.all([
      import('@/pdf-reader/engine/layout/file.mjs'), import('@/pdf-reader/engine/layer/pieces.mjs'), import('@/pdf-reader/engine/layer/fit.mjs'), import('@/pdf-reader/engine/layer/draw.mjs'),
    ])
    expect(entry.parseLayout).toBe(file.parseLayout)
    expect(entry.LAYER_COLOURS).toBe(pieces.LAYER_COLOURS)
    expect(entry.layUnit).toBe(fit.layUnit)
    expect(entry.drawUnit).toBe(draw.drawUnit)
  })
})
