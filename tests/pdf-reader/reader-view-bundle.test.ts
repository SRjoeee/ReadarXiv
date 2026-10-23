// @vitest-environment node
// The reading view as a browser bundles it (the shared reader view's contract §4.1; Stage 5 Task 7 Step 4): the view entry
// and the layer entry built by esbuild for the browser, and every file the build read listed by its metafile. Nothing may
// come from outside the engine but the three core modules and the one package the engine's rule allows
// (scripts/check-boundary.mjs ENGINE_ALLOW, ENGINE_PACKAGES: the layout rules' validator); no pdfjs-dist (PDF.js is the
// host's kit); and nothing of the server's: the paper's source, its pipeline, the layout maker, the content walk and the wrap
// (layout/remove.mjs, own.mjs, wrap.mjs: the maker child's). The pipeline's anchors, versions and memory are leaves every reader takes (the view's floats read the anchors'
// helpers; the layer its versions and memory errors), as engine-contract.test.ts holds them
import { relative, resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { ENGINE_ALLOW, ENGINE_PACKAGES } from '../../scripts/check-boundary.mjs'

const ROOT = resolve(__dirname, '../..')
const ENGINE = 'src/pdf-reader/engine/'
const SERVER = [/^src\/pdf-reader\/engine\/pipeline\/(?!(?:anchors|versions|memory)\.mjs$)/, /^src\/pdf-reader\/engine\/source\//, /^src\/pdf-reader\/engine\/layout\/(?:make|remove|own|wrap)\.mjs$/]

/** the files a browser build of `entries` reads, repository-relative */
async function inputsOf(entries: string[]): Promise<string[]> {
  const r = await build({ entryPoints: entries.map(e => resolve(ROOT, e)), bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm', target: 'es2022', outdir: resolve(ROOT, '.reader-view-bundle'), logLevel: 'silent' })
  return Object.keys(r.metafile.inputs).map(f => relative(ROOT, resolve(ROOT, f)).split('\\').join('/')).sort()
}
/** the package a file of node_modules belongs to (pnpm's layout: …/node_modules/<name>/…, the last one) */
const packageOf = (f: string) => /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*\/node_modules\/)/.exec(f)?.[1] ?? null
const PACKAGES = (ENGINE_PACKAGES as { name: string }[]).map(p => p.name)
const allowed = (f: string) => f.startsWith(ENGINE) || (ENGINE_ALLOW as string[]).some(c => f === `${c}.ts` || f === `${c}/index.ts`) || PACKAGES.includes(packageOf(f) ?? '')

describe('the reading view, bundled for the browser', () => {
  it('reads nothing outside the engine and the allowlist, no package, and nothing of the server\'s', async () => {
    const inputs = await inputsOf([`${ENGINE}view.mjs`, `${ENGINE}layer.mjs`])
    expect(inputs).toContain(`${ENGINE}view/reader-view.mjs`)
    expect(inputs).toContain(`${ENGINE}view/places.mjs`)
    expect(inputs.filter(f => !allowed(f))).toEqual([])
    expect([...new Set(inputs.map(packageOf).filter(Boolean))]).toEqual(PACKAGES.filter(p => inputs.some(f => packageOf(f) === p)))
    expect(inputs.filter(f => packageOf(f) === 'pdfjs-dist')).toEqual([])
    expect(inputs.filter(f => SERVER.some(r => r.test(f)))).toEqual([])
  }, 60_000)

  it('the check holds something: the extension\'s session, which takes pdfjs-dist and the pipeline, fails each part of it', async () => {
    const inputs = await inputsOf(['src/pdf-reader/engine/pipeline/live.mjs', 'src/pdf-reader/engine/view/figures.mjs'])
    expect(inputs.filter(f => SERVER.some(r => r.test(f))).length).toBeGreaterThan(0)
    expect(SERVER.some(r => r.test(`${ENGINE}pipeline/anchors.mjs`))).toBe(false)
    expect(SERVER.some(r => r.test(`${ENGINE}layout/cell-rules.mjs`))).toBe(false)
    expect(SERVER.some(r => r.test(`${ENGINE}layout/wrap.mjs`))).toBe(true)
    expect(allowed('node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist/build/pdf.mjs')).toBe(false)
    expect(allowed('src/pdf-reader/session/session.mjs')).toBe(false)
  }, 60_000)
})
