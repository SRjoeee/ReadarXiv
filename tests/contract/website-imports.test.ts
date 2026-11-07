// The website's contract (CLAUDE.md hard rule 7). The website (readarxiv-web) pins this repository as a submodule and
// imports modules of its src/ through an alias, `@vendor/<path>` → `src/<path>`, in its reader and its Worker. A module
// moved or deleted here breaks the website's build at its next pin, so each stays at its old path (a re-export where the
// code moved, a frozen copy where it was deleted) until the website's cut-over.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every path the website imports as `@vendor/<path>`: its source's and its tests' `@vendor/` imports, by path under src/
 * without an extension (gathered from readarxiv-web's tree on 2026-11-07). A path is removed from this list only when the
 * website stops importing it, in a pull request that names the website's commit that stopped.
 */
const WEBSITE_IMPORTS = [
  'locales',
  'pdf-reader/controller',
  'pdf-reader/support',
  'pdf-reader/ui/appearance',
  'pdf-reader/ui/Capsule',
  'pdf-reader/ui/capsule-words',
  'pdf-reader/ui/DisplaySwitch',
  'pdf-reader/ui/link-names',
  'pdf-reader/ui/Menus',
  'pdf-reader/ui/Outline',
  'pdf-reader/ui/PagePill',
  'pdf-reader/ui/PaperTitle',
  'pdf-reader/ui/pinch',
  'pdf-reader/ui/ProgressLine',
  'pdf-reader/ui/scroll-show',
  'pdf-reader/ui/ScrollIndicator',
  'pdf-reader/ui/settings-lock',
  'pdf-reader/ui/status',
  'pdf-reader/ui/StatusCapsule',
  'pdf-reader/ui/ToolbarButton',
  'pdf-reader/ui/use-reader',
  'providers/google-web',
  'providers/microsoft',
  'providers/request/retry-policy',
  'ui/controls/Icon',
  'ui/controls/MenuList',
  'ui/controls/modality',
  'ui/controls/Popover',
  'ui/controls/radio',
  'ui/controls/Switch',
  'ui/controls/tip',
  'ui/menu-nav',
  'ui/strings',
] as const

const SRC = resolve(__dirname, '../../src')
/** What a bundler finds for `<path>`, in the order it tries: the module's own file, then a directory's index */
const CANDIDATES = ['.ts', '.tsx', '.mjs', '.d.mts', '/index.ts', '/index.tsx', '/index.mjs', '/index.d.mts']
/** A declaration file is types only: it resolves, and there is nothing to load */
const isCode = (file: string) => !file.endsWith('.d.mts')

const resolved = (path: string): string | undefined => CANDIDATES.map(ext => `${SRC}/${path}${ext}`).find(existsSync)

describe("the website's @vendor/ imports: every module resolves at its path under src/ and loads", () => {
  it('the list names each path once', () => {
    expect(new Set(WEBSITE_IMPORTS).size).toBe(WEBSITE_IMPORTS.length)
  })

  it.each(WEBSITE_IMPORTS)('@vendor/%s resolves', path => {
    expect(resolved(path), `src/${path} (.ts, .tsx, .mjs, .d.mts or an index)`).toBeDefined()
  })

  // Under happy-dom, the environment of every test here, so the reader's and the controls' components load as in a page
  it.each(WEBSITE_IMPORTS)('@vendor/%s imports without throwing and exports something', async path => {
    const file = resolved(path)
    expect(file, `src/${path}`).toBeDefined()
    if (!file || !isCode(file)) return
    const module: Record<string, unknown> = await import(/* @vite-ignore */ file)
    expect(Object.keys(module).length, `${file} exports nothing`).toBeGreaterThan(0)
  })
})
