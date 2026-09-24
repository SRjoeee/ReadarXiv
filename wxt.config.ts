import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
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
 * The bilingual PDF reader (experiments/pdf-bilingual, issue #290), on this experiment branch only. It is served as
 * `pdf-reader/reader.html`, a page of this extension, so that it translates through the background as the HTML page
 * does. Its files are copied as they are: research code, neither bundled nor type-checked. They are copied only once
 * the experiment's setup has filled its lib/ (experiments/pdf-bilingual/README.md); without it the build is the
 * extension alone.
 * - Only the reader's own files and lib/: poc-reader/papers holds demo papers made locally from arXiv's, which may not
 *   be redistributed (Devin and Codex on #296).
 * - lib/axt holds modules compiled from this extension's source; it is compiled again with every build, so that the page
 *   never runs a message transport older than the background it talks to (Devin on #296).
 */
const PDF_READER = fileURLToPath(new URL('./experiments/pdf-bilingual/poc-reader', import.meta.url))
function pdfReaderFiles(): { absoluteSrc: string; relativeDest: string }[] {
  if (!existsSync(join(PDF_READER, 'lib/pdf.min.mjs'))) return []
  execSync('node spikes/build-shared.mjs', { cwd: join(PDF_READER, '..'), stdio: 'ignore' })
  const own = readdirSync(PDF_READER).filter(name => /\.(?:html|m?js|css)$/.test(name))
  const lib = readdirSync(join(PDF_READER, 'lib'), { recursive: true, encoding: 'utf8' }).map(path => join('lib', path))
  return [...own, ...lib]
    .filter(path => statSync(join(PDF_READER, path)).isFile())
    .map(path => ({ absoluteSrc: join(PDF_READER, path), relativeDest: `pdf-reader/${path}` }))
}

// The WXT project configuration.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // In extension pages <link rel="modulepreload" crossorigin> triggers Chrome's "cross-world extension resource mismatch" warning (harmless but noisy); preloading is off
  // The recogniser's worker (entrypoints/ocr) is a build of its own, and what it bundles goes into the same notices
  vite: () => ({ build: { modulePreload: false }, plugins: [tailwindcss(), noteBundledPackages()], worker: { format: 'es', plugins: () => [noteBundledPackages()] }, define: { __AXT_BUILD_REF__: JSON.stringify(buildRef()) } }),
  // The gallery is for `wxt` (serve) only: a release must not ship a debug page anyone can open
  hooks: {
    'entrypoints:found': (wxt, infos) => {
      if (wxt.config.command !== 'serve') {
        const at = infos.findIndex(info => info.name === 'gallery')
        if (at >= 0) infos.splice(at, 1)
      }
    },
    // The licences that go with every copy (scripts/third-party-notices.mjs): WXT calls this once every entry point
    // is built, so the list of what was bundled is complete; the project's own licence goes in beside it
    'build:publicAssets': (_wxt, files) => {
      files.push(...licenceFiles(), ...pdfReaderFiles())
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
    // compiles ships in the package; `script-src 'self'` stays as it was
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    // The keyboard entry (UI.md S-P-50): the same toggle as the context menu. The popup shows the
    // binding Chrome reports, so a reader who rebinds or removes it sees the truth
    commands: { 'axt-toggle': { suggested_key: { default: 'Alt+T' }, description: '__MSG_toggle__' } },
    // The background's fetch to an LLM endpoint needs a host permission; by default only OpenRouter, a custom baseURL is requested by origin when saved on the settings page.
    // google-web's endpoint is listed too (Codex on #59): today it returns CORS headers and an ordinary cross-origin request passes,
    // but that is exactly the dependency this move wants to shed — the day they stop sending the header the free engine is unusable whole
    // Every network engine has to be here: an MV3 background fetch is still bound by CORS, and without a host permission it can only
    // hope for `Access-Control-Allow-Origin` from the other side. Microsoft does return `*` today (measured), but that is a dependency
    // beyond our control — the day it stops, the whole engine becomes a `network` failure (Codex on #115; the line was missed when the provider was added)
    // arxiv.org, on this experiment branch: the PDF reader (above) fetches a paper's source and PDF from its extension page
    host_permissions: ['https://openrouter.ai/*', 'https://translate-pa.googleapis.com/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*'],
    // The floating button (DESIGN §4.0c) frames the popup as its control panel, and a page may only load an extension
    // file that is declared here. One file, and only to arXiv. What the popup loads for itself (its script, its
    // style sheet) is asked for by the extension's own origin and needs no entry; the button's mark is inline vector. A page that
    // may frame the popup could try to trick a click on it: the popup shows no key and no paper text, and what a
    // click can do there is what the reader does there anyway — start or undo a translation, pick a mode or a service
    web_accessible_resources: [{ resources: ['popup.html'], matches: ['https://arxiv.org/*'] }],
    // A custom endpoint may be http on 127.0.0.1 / the LAN (Ollama, LM Studio); with only the localhost literal the request fails outright (Codex on #6).
    // This is only the range that may be requested; the real grant is still asked for per origin on the settings page
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
})
