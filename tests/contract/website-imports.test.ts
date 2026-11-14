// The website's contract (CLAUDE.md hard rule 7). The website (readarxiv-web) pins this repository as a submodule and
// imports modules of its src/ through an alias, `@vendor/<path>` → `src/<path>`, in its reader, its Worker and its tests.
// A module moved or deleted here, or a name it no longer exports, breaks the website's build at its next pin, so each
// stays at its old path with every name the website takes from it (a re-export where the code moved and its API stayed, a
// frozen copy of the old module where its API changed or it was deleted) until the website's cut-over. The calls the website
// makes are held in their shapes by website-use.tsx, which `pnpm typecheck` compiles.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every path the website imports as `@vendor/<path>`, by path under src/ (without an extension, as the website writes
 * it, except for a style sheet), with every value it imports from it: the static and dynamic imports and the members it
 * reads off a namespace import, in its source and its tests (readarxiv-web 0bf496b5, gathered 2026-11-07). A path or a
 * name is removed from this list only when the website stops importing it, in a pull request that names the website's
 * commit that stopped.
 *
 * Type-only imports are not held: the website types every `@vendor/` module by its own `types/vendor.d.ts` and never
 * compiles against these sources (three of the controller's types it imports, ReaderEvent, ReaderHost and ReaderPrefs,
 * exist only there), and its bundlers erase type imports. Its `web/tests/vendor-types.test.ts` holds those declarations
 * to the pin's source.
 */
const WEBSITE_IMPORTS: readonly { path: string; names: readonly string[] }[] = [
  { path: 'config/appearance', names: ['BUILT_IN_HIGHLIGHTS', 'DEFAULT_APPEARANCE', 'HL_OPACITY_MAX', 'HL_OPACITY_MIN', 'lookOf'] },
  { path: 'core/renderer/style-preset', names: ['appearanceRule'] },
  { path: 'core/rules/latexml', names: ['RULES_VERSION'] },
  { path: 'entrypoints/pdf-reader/reader.css', names: [] },
  { path: 'locales', names: ['LOCALE_CODES', 'LOCALES', 'pickLocale'] },
  { path: 'pdf-reader/controller', names: ['createController', 'INITIAL', 'reduce'] },
  { path: 'pdf-reader/engine/view/engine.css', names: [] },
  { path: 'pdf-reader/support', names: ['readerRuns'] },
  { path: 'pdf-reader/ui/appearance', names: ['applyAppearance', 'dimmed', 'themeOf', 'withoutTransitions'] },
  { path: 'pdf-reader/ui/Capsule', names: ['Capsule'] },
  { path: 'pdf-reader/ui/capsule-words', names: ['words'] },
  { path: 'pdf-reader/ui/DisplaySwitch', names: ['DisplaySwitch'] },
  { path: 'pdf-reader/ui/link-names', names: ['linkNameOf'] },
  { path: 'pdf-reader/ui/Menus', names: ['LanguageMenu', 'ZoomMenu'] },
  { path: 'pdf-reader/ui/Outline', names: ['Outline'] },
  { path: 'pdf-reader/ui/PagePill', names: ['PagePill'] },
  { path: 'pdf-reader/ui/PaperTitle', names: ['PaperTitle'] },
  { path: 'pdf-reader/ui/pinch', names: ['usePinch'] },
  { path: 'pdf-reader/ui/ProgressLine', names: ['ProgressLine'] },
  { path: 'pdf-reader/ui/scroll-show', names: ['useScrollShow'] },
  { path: 'pdf-reader/ui/ScrollIndicator', names: ['ScrollIndicator'] },
  { path: 'pdf-reader/ui/settings-lock', names: ['useSettingsLock'] },
  { path: 'pdf-reader/ui/status', names: ['capsuleOf', 'cardOf', 'lineOf', 'spokenOf'] },
  { path: 'pdf-reader/ui/StatusCapsule', names: ['NARROW_MS', 'useTimedLeave'] },
  { path: 'pdf-reader/ui/ToolbarButton', names: ['ToolbarButton'] },
  { path: 'pdf-reader/ui/use-reader', names: ['useReader'] },
  { path: 'providers/google-web', names: ['createGoogleWebProvider'] },
  { path: 'providers/microsoft', names: ['createMicrosoftProvider', 'supportsTarget'] },
  { path: 'providers/request/retry-policy', names: ['getRequestErrorMeta', 'RATE_LIMIT_BASE_PAUSE_MS'] },
  { path: 'styles/image.css', names: [] },
  { path: 'ui/controls/Icon', names: ['Icon'] },
  { path: 'ui/controls/MenuList', names: ['MenuList'] },
  { path: 'ui/controls/modality', names: ['trackModality'] },
  { path: 'ui/controls/Popover', names: ['Popover', 'usePopover'] },
  { path: 'ui/controls/radio', names: ['radioKeys'] },
  { path: 'ui/controls/Switch', names: ['Switch'] },
  { path: 'ui/controls/tip', names: ['useTip'] },
  { path: 'ui/menu-nav', names: ['useMenuNav'] },
  { path: 'ui/strings', names: ['languageName', 'profileName', 'R', 'S', 'setLocale'] },
]

/**
 * Every path of the workspace packages the website reaches by a relative path into its submodule (`vendor/readarxiv/<path>`),
 * outside the alias and outside src/ (readarxiv-web e0ae76dd, gathered 2026-11-13 from its code, its scripts and its tests):
 * - the modules its browser checks, scripts and tests import (plain `node`, whose own type stripping reads a `.ts` module,
 *   esbuild, or its test runner), each with every value it takes, named as a bundler finds it (with or without an extension);
 * - the files and folders it reads, bundles or credits by their path (names: none), a folder written with its `/`.
 * A path only named in a check that it is absent somewhere is not held. A path leaves this list only when the website stops
 * reaching it, in a pull request that names the website's commit that stopped; one a change here must move is moved here and
 * at the website's next pin together (round RB2b: the engine's tail.mjs and ink.mjs made TypeScript, their three importers'
 * specifiers the pin's).
 */
const WEBSITE_PACKAGE_PATHS: readonly { path: string; names: readonly string[] }[] = [
  // (the modules imported, and the values taken)
  { path: 'packages/engine/src/ink.ts', names: ['pageInk'] },
  { path: 'packages/engine/src/tail.ts', names: ['startxrefOf'] },
  { path: 'packages/format/src/index.ts', names: ['toggleKind'] },
  { path: 'packages/reader/e2e/page/convert', names: ['fixtureLay', 'pagesOf'] },
  { path: 'packages/reader/src/bytes/source.ts', names: ['chunkUrl', 'rangeSource'] },
  { path: 'packages/reader/src/bytes/store.ts', names: ['CHUNK', 'chunkStore'] },
  { path: 'packages/reader/src/chrome/links', names: ['linkable'] },
  { path: 'packages/reader/src/chrome/status', names: ['capsuleOf'] },
  { path: 'packages/reader/src/compose/classes.ts', names: ['kindShown'] },
  { path: 'packages/reader/src/compose/typeset.ts', names: ['pastFootOf'] },
  { path: 'packages/reader/src/session/client.ts', names: ['follow', 'objectStore', 'open', 'Refused'] },
  { path: 'packages/reader/src/session/contents.ts', names: ['createContents'] },
  { path: 'packages/reader/src/session/machine.ts', names: ['FORMATS', 'needsOf'] },
  { path: 'packages/reader/src/session/paper.ts', names: ['abstractTitleOf', 'htmlVersionOf'] },
  // (the files and folders read, bundled or credited by their path)
  { path: 'packages/engine/src/bundle/bundle.ts', names: [] },
  { path: 'packages/engine/src/compile/live.mjs', names: [] },
  { path: 'packages/engine/src/compile/paper.mjs', names: [] },
  { path: 'packages/engine/src/compiled.ts', names: [] },
  { path: 'packages/engine/src/front.ts', names: [] },
  { path: 'packages/engine/src/instrument/instrument.mjs', names: [] },
  { path: 'packages/engine/src/locate/locate.ts', names: [] },
  { path: 'packages/engine/src/locate/words.ts', names: [] },
  // (colour.ts credited by its row in docs/THIRD_PARTY.md, which the website's licence gate reads, tests/vite-licence-gate.test.ts;
  // names.ts held in its reader's bundle, web/tests/layer-imports.test.ts; both at e0ae76dd, named `.mjs` there until its next pin)
  { path: 'packages/engine/src/marks/colour.ts', names: [] },
  { path: 'packages/engine/src/marks/marks.mjs', names: [] },
  { path: 'packages/engine/src/marks/names.ts', names: [] },
  { path: 'packages/engine/src/plan.ts', names: [] },
  { path: 'packages/engine/src/prepare.ts', names: [] },
  { path: 'packages/engine/src/source/latexml-args.mjs', names: [] },
  { path: 'packages/engine/src/source/tex-names.json', names: [] },
  { path: 'packages/engine/src/wrap/wrap.ts', names: [] },
  { path: 'packages/reader/e2e/fixtures/', names: [] },
  { path: 'packages/reader/src/chrome/', names: [] },
  { path: 'packages/reader/src/chrome/Capsule.tsx', names: [] },
  { path: 'packages/reader/src/chrome/capsule-motion.ts', names: [] },
  { path: 'packages/reader/src/chrome/capsule-words.ts', names: [] },
  { path: 'packages/typeset/src/data/rules/heads.ts', names: [] },
  { path: 'packages/typeset/src/data/rules/refs.ts', names: [] },
  { path: 'packages/ui/src/controls.css', names: [] },
  { path: 'packages/ui/src/controls/display-glyphs.ts', names: [] },
  { path: 'packages/ui/src/controls/Icon.tsx', names: [] },
  { path: 'packages/ui/src/controls/MenuList.tsx', names: [] },
  { path: 'packages/ui/src/tokens.css', names: [] },
]

const SRC = resolve(__dirname, '../../src')
/** What a bundler finds for `<path>`, in the order it tries: the module's own file, then a directory's index */
const CANDIDATES = ['.ts', '.tsx', '.mjs', '.d.mts', '/index.ts', '/index.tsx', '/index.mjs', '/index.d.mts']
/** A declaration file is types only and a style sheet is the page's: each resolves, and there is nothing to load here */
const isCode = (file: string) => !file.endsWith('.d.mts') && !file.endsWith('.css')

const isFile = (file: string) => existsSync(file) && statSync(file).isFile()
/** A style sheet is named with its extension; a module without one */
const resolved = (path: string): string | undefined =>
  (/\.css$/.test(path) ? [''] : CANDIDATES).map(ext => `${SRC}/${path}${ext}`).find(isFile)

describe("the website's @vendor/ imports: every module resolves at its path under src/, loads, and exports every value the website takes from it", () => {
  it('the list names each path once and each name once', () => {
    expect(new Set(WEBSITE_IMPORTS.map(entry => entry.path)).size).toBe(WEBSITE_IMPORTS.length)
    for (const { path, names } of WEBSITE_IMPORTS) expect(new Set(names).size, path).toBe(names.length)
  })

  it.each(WEBSITE_IMPORTS)('@vendor/$path resolves', ({ path }) => {
    expect(resolved(path), `src/${path} (.ts, .tsx, .mjs, .d.mts or an index)`).toBeDefined()
  })

  // Under happy-dom, the environment of every test here, so the reader's and the controls' components load as in a page
  it.each(WEBSITE_IMPORTS.filter(entry => entry.names.length > 0))('@vendor/$path loads and exports $names', async ({ path, names }) => {
    const file = resolved(path)
    expect(file, `src/${path}`).toBeDefined()
    if (!file || !isCode(file)) return
    const module: Record<string, unknown> = await import(/* @vite-ignore */ file)
    expect(names.filter(name => !(name in module)), `${file} no longer exports`).toEqual([])
  })

  // A path can resolve and export every name and still have changed what a call passes or gets back (5a.4's controller, at
  // the same path): website-use.tsx makes the website's calls, in its shapes, and `pnpm typecheck` compiles them. This holds
  // the two lists together: every value listed here is imported there from its path, and nothing the website does not take
  it('website-use.tsx calls from each path every value the website takes from it', () => {
    const use = readFileSync(resolve(__dirname, 'website-use.tsx'), 'utf8')
    const imported = new Map<string, string[]>()
    for (const [, list = '', path = ''] of use.matchAll(/^import \{([^}]*)\} from '@\/([^']+)'$/gm)) {
      const values = list.split(',').map(name => name.trim()).filter(name => name !== '' && !name.startsWith('type '))
      imported.set(path, values.map(name => name.split(/\s+as\s+/)[0] as string).sort())
    }
    const listed = WEBSITE_IMPORTS.filter(entry => entry.names.length > 0)
    expect([...imported.keys()].sort()).toEqual(listed.map(entry => entry.path).sort())
    for (const { path, names } of listed) expect(imported.get(path), path).toEqual([...names].sort())
  })
})

const ROOT = resolve(__dirname, '../..')
/** What a path of WEBSITE_PACKAGE_PATHS names in the tree: a folder (written with its `/`), or the file a bundler finds */
const packagePathOf = (path: string): string | undefined =>
  path.endsWith('/')
    ? existsSync(`${ROOT}/${path}`) && statSync(`${ROOT}/${path}`).isDirectory() ? `${ROOT}/${path}` : undefined
    : ['', '.ts', '.tsx', '.mjs'].map(ext => `${ROOT}/${path}${ext}`).find(isFile)

describe("the website's relative paths into the workspace packages: every one is at its path, and each module loads and exports every value the website takes from it", () => {
  it('the list names each path once and each name once', () => {
    expect(new Set(WEBSITE_PACKAGE_PATHS.map(entry => entry.path)).size).toBe(WEBSITE_PACKAGE_PATHS.length)
    for (const { path, names } of WEBSITE_PACKAGE_PATHS) expect(new Set(names).size, path).toBe(names.length)
  })

  it.each(WEBSITE_PACKAGE_PATHS)('$path is there', ({ path }) => {
    expect(packagePathOf(path), path).toBeDefined()
  })

  it.each(WEBSITE_PACKAGE_PATHS.filter(entry => entry.names.length > 0))('$path loads and exports $names', async ({ path, names }) => {
    const file = packagePathOf(path)
    expect(file, path).toBeDefined()
    if (!file) return
    const module: Record<string, unknown> = await import(/* @vite-ignore */ file)
    expect(names.filter(name => !(name in module)), `${path} no longer exports`).toEqual([])
  })
})
