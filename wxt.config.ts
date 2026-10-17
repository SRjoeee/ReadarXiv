import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { readBuildRef } from './scripts/build-ref.mjs'
import { licenceFiles, noteBundledPackages } from './scripts/third-party-notices.mjs'

/**
 * The commit this build is made from when it is one the repository holds, `main` otherwise — scripts/build-ref.mjs
 * decides, over git. It goes into the diagnostics a reader exports (issue #156)
 */
let stamped: string | undefined
function buildRef(): string {
  // WXT asks for the vite config once per entrypoint: computed once, printed once
  if (stamped !== undefined) return stamped
  stamped = readBuildRef(cmd => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
  console.log(`[build] ref: ${stamped}`)
  return stamped
}

/**
 * The files PDF.js reads by address rather than by import (the reader's design, §11.2): its character maps, the standard
 * fonts with their licences, and its WebAssembly decoders, copied from the pinned package as they are into
 * `pdf-reader/pdfjs/`. The library and its worker are bundled (src/pdf-reader/pdfjs.ts). Not QuickJS (`quickjs-eval.*`,
 * 468 KB): only PDF.js's scripting sandbox loads it, and the reader's viewer has no scripting manager — it runs no script
 * a PDF carries (scripts/check-output.mjs holds it out)
 */
const PDFJS = fileURLToPath(new URL('./node_modules/pdfjs-dist', import.meta.url))
function pdfjsFiles(): { absoluteSrc: string; relativeDest: string }[] {
  return ['cmaps', 'standard_fonts', 'wasm'].flatMap(dir =>
    readdirSync(join(PDFJS, dir))
      .filter(name => statSync(join(PDFJS, dir, name)).isFile() && !name.startsWith('quickjs'))
      .map(name => ({ absoluteSrc: join(PDFJS, dir, name), relativeDest: `pdf-reader/pdfjs/${dir}/${name}` })),
  )
}

/**
 * The pages for development alone — the popup's states (gallery), the shared controls (controls) and the capsule's motion
 * (capsule): a release must not ship a debug page anyone can open, so a production build leaves them out; `wxt` and
 * `wxt build --mode development` (tests/e2e/probes/controls.mjs, capsule.mjs) keep them. scripts/check-output.mjs checks
 * the release
 */
const DEV_PAGES = ['gallery', 'controls', 'capsule']
/**
 * Our server, the reader's layer API (src/pdf-reader/addresses.ts READER_API; Stage 5 Task 17): production's in a production
 * build, staging's in a development build, and either where `AXT_READER_API` names it — the maintainer's test build is
 * `pnpm build:staging` (and `pnpm zip:staging`), which name staging's server here. No other host: the manifest grants the one it
 * names (`readarxiv.com` always: the website's mark runs there), and a staging build grants staging, marks its pages too and
 * names itself (`version_name`, its archive's name); `pnpm build`'s output check refuses a staging package
 */
const PRODUCTION_API = 'https://readarxiv.com'
const STAGING_API = 'https://app-staging.readarxiv.org'
function readerApi(mode: string): string {
  const named = process.env.AXT_READER_API
  if (named && named !== PRODUCTION_API && named !== STAGING_API) throw new Error(`AXT_READER_API names ${named}: production's (${PRODUCTION_API}) or staging's (${STAGING_API}) alone`)
  const api = named || (mode === 'production' ? PRODUCTION_API : STAGING_API)
  return api
}
let apiTold: string | undefined
function apiOf(mode: string): string {
  const api = readerApi(mode)
  if (apiTold !== api) { apiTold = api; console.log(`[build] the reader's server: ${api}`) }
  return api
}

// The WXT project configuration.
export default defineConfig({
  srcDir: 'src',
  // a staging archive never takes a release's name (WXT's own template otherwise)
  zip: { artifactTemplate: process.env.AXT_READER_API === STAGING_API ? '{{name}}-{{packageVersion}}-staging-{{browser}}.zip' : '{{name}}-{{packageVersion}}-{{browser}}{{modeSuffix}}.zip' },
  modules: ['@wxt-dev/module-react'],
  // In extension pages <link rel="modulepreload" crossorigin> triggers Chrome's "cross-world extension resource mismatch" warning (harmless but noisy); preloading is off
  // The recogniser's worker (entrypoints/ocr) is a build of its own, and what it bundles goes into the same notices
  vite: env => ({ build: { modulePreload: false }, plugins: [tailwindcss(), noteBundledPackages()], worker: { format: 'es', plugins: () => [noteBundledPackages()] }, define: { __AXT_BUILD_REF__: JSON.stringify(buildRef()), __AXT_READER_API__: JSON.stringify(apiOf(env.mode)), __AXT_LOOPBACK__: JSON.stringify(env.mode !== 'production') } }),
  hooks: {
    'entrypoints:found': (wxt, infos) => {
      if (wxt.config.mode !== 'production') return
      for (const name of DEV_PAGES) {
        const at = infos.findIndex(info => info.name === name)
        if (at >= 0) infos.splice(at, 1)
      }
    },
    // The licences that go with every copy (scripts/third-party-notices.mjs): WXT calls this once every entry point
    // is built, so the list of what was bundled is complete; the project's own licence goes in beside it
    'build:publicAssets': (_wxt, files) => {
      files.push(...licenceFiles(), ...pdfjsFiles())
    },
    // A build whose server is staging's grants it, and the website's mark runs on its pages as on production's: the one place
    // a host enters the manifest by the build (src/shared/web-app.ts names production's; scripts/check-output.mjs checks both)
    'build:manifestGenerated': (wxt, manifest) => {
      const api = readerApi(wxt.config.mode)
      if (api === PRODUCTION_API) return
      // named where Chrome shows the version, so that a staging package is never taken for a release (check-output)
      manifest.version_name = `${manifest.version} staging`
      manifest.host_permissions = [...(manifest.host_permissions ?? []), `${api}/*`]
      for (const entry of manifest.content_scripts ?? []) if (entry.matches?.includes(`${PRODUCTION_API}/*`)) entry.matches = [...entry.matches, `${api}/*`]
    },
  },
  manifest: {
    // UI.md S-P-01 requires the store listing, the manifest and the site to carry one name
    name: 'Read arXiv',
    // Two marks, two surfaces (scripts/icons.mjs): `icons` is filled by WXT from public/icon/<size>.png,
    // the tile, for the card the extensions page and the store put an icon on. Everywhere the mark
    // stands on its own — this toolbar button, the page tabs, our own brand rows — it is the bare
    // book, whose outline keeps it legible on a light and a dark surface alike. The toolbar button
    // starts grey: it has nothing to do on most pages, and a page it works on lights its own tab
    // (shared/action-icon.ts, UI.md §5.1)
    action: {
      default_icon: { 16: 'icon/mark-off-16.png', 32: 'icon/mark-off-32.png', 48: 'icon/mark-off-48.png' },
    },
    // The image overlay uses CSS anchor positioning, and `anchor-scope` needs Chrome 131 (§15.2). The document always said so, but it never reached
    // the manifest: a Chrome below that version installs the extension all the same and gets a misplaced overlay, and its scroll containers do not enter
    // sequential focus either (Codex on #99). Declared, so the floor the document states really applies
    minimum_chrome_version: '131',
    // The two strings Chrome itself shows — the extensions page, the store listing and the shortcuts
    // page — come from public/_locales, because only the browser reads them and only it can pick a
    // language for them. Everything inside our own pages follows the reader's own choice instead
    // (src/locales, UI.md §6)
    default_locale: 'en',
    description: '__MSG_description__',
    // contextMenus: the translate toggle in the context menu (issue #146) — it registers a menu item, not access to
    // page content. offscreen: the document the figure recogniser runs in (DESIGN §15.3) — a service worker cannot
    // host it. Neither shows an install warning
    permissions: ['storage', 'contextMenus', 'offscreen'],
    // The recogniser is WebAssembly, which an extension page may compile only when its policy says so. Everything it
    // compiles ships in the package; `script-src 'self'` stays as it was. No extension page frames anything (Stage 5 Task 17:
    // the TeX page the reader and the offscreen document framed is parked), so none may: `frame-src 'none'`. The pages that
    // are framed (the popup, the reader, by arXiv's) are the manifest's web-accessible resources, which this does not touch
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; frame-src 'none'" },
    // The keyboard entry (UI.md S-P-50): the same toggle as the context menu. The popup shows the
    // binding Chrome reports, so a reader who rebinds or removes it sees the truth
    commands: { 'axt-toggle': { suggested_key: { default: 'Alt+T' }, description: '__MSG_toggle__' } },
    // The background's fetch to an LLM endpoint needs a host permission; by default only OpenRouter, a custom baseURL is requested by origin when saved on the settings page.
    // google-web's endpoint is listed too (Codex on #59): today it returns CORS headers and an ordinary cross-origin request passes,
    // but that is exactly the dependency this move wants to shed — the day they stop sending the header the free engine is unusable whole
    // Every network engine has to be here: an MV3 background fetch is still bound by CORS, and without a host permission it can only
    // hope for `Access-Control-Allow-Origin` from the other side. Microsoft does return `*` today (measured), but that is a dependency
    // beyond our control — the day it stops, the whole engine becomes a `network` failure (Codex on #115; the line was missed when the provider was added)
    // arxiv.org: the PDF reader's page (entrypoints/pdf-reader) fetches the paper's PDF and its abstract page (CORS is not a
    // promise, DESIGN §8.0). readarxiv.com: our server, the reader's layer API (a paper's layer, its objects, our copy of
    // arXiv's PDF, the faces and the hyphenation), and the website the mark runs on (§4.0d). Nothing of TeX
    host_permissions: ['https://openrouter.ai/*', 'https://translate-pa.googleapis.com/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*', 'https://readarxiv.com/*'],
    // The floating button (DESIGN §4.0c) frames the popup as its control panel, and a page may only load an extension
    // file that is declared here. One file, and only to arXiv. What the popup loads for itself (its script, its
    // style sheet) is asked for by the extension's own origin and needs no entry; the button's mark is inline vector. A page that
    // may frame the popup could try to trick a click on it: the popup shows no key and no paper text, and what a
    // click can do there is what the reader does there anyway — start or undo a translation, pick a mode or a service
    // On this experiment branch the PDF reader's page too: arXiv's PDF page frames it (entrypoints/pdf.content.ts), and
    // what that page loads for itself is asked for by the extension's own origin, as the popup's is, and needs no entry
    web_accessible_resources: [{ resources: ['popup.html'], matches: ['https://arxiv.org/*'] }, { resources: ['pdf-reader.html'], matches: ['https://arxiv.org/*'] }],
    // A custom endpoint may be http on 127.0.0.1 / the LAN (Ollama, LM Studio); with only the localhost literal the request fails outright (Codex on #6).
    // This is only the range that may be requested; the real grant is still asked for per origin on the settings page
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
})
