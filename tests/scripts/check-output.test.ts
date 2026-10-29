import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// scripts/check-output.mjs on a package made here. A package this small fails the checks that look for what a build
// must hold (the recogniser's models, the licences), so each check of what a release must not hold is read by its own
// line: ✓ on the clean package, ✗ once the package holds the thing (a ✗ is the script's failure)

const SCRIPT = resolve('scripts/check-output.mjs')
const OUT = '.output/chrome-mv3'
let root: string

const put = (path: string, content: string | Uint8Array) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** The script's verdict on the check whose line starts with `name`: '✓', '✗', or undefined when no line names it */
const verdict = (name: string, env: Record<string, string> = {}) => {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } })
  return `${result.stdout}\n${result.stderr}`.split('\n').find(line => line.slice(2).startsWith(name))?.[0]
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'axt-output-'))
  // what the script reads before its first check: the website's hosts, the manifest, the content scripts
  put('src/shared/web-app.ts', "export const WEB_APP_HOSTS: readonly string[] = ['app.example.org']\n")
  put(`${OUT}/manifest.json`, '{}')
  put(`${OUT}/content-scripts/content.js`, 'console.log("content")\n')
  // a reader's chunk with this machine's names in it, and a binary file
  put(`${OUT}/chunks/session.js`, "const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])\n")
  put(`${OUT}/pdf-reader/pdfjs/wasm/openjpeg.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0xff, 0xfe]))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('a production build fails check-output when', () => {
  const LOOPBACK = `${OUT} names no loopback TeX page`
  const TEX = `${OUT} holds no BusyTeX or texlyre file`
  const DEV = `${OUT} holds no dev page`

  it('a production package names a loopback TeX page (`127.0.0.1:8071`, `localhost:8070`)', () => {
    expect(verdict(LOOPBACK)).toBe('✓')
    for (const address of ['http://127.0.0.1:8071', 'http://localhost:8070', 'http://[::1]:8071']) {
      put(`${OUT}/chunks/session.js`, `const site = '${address}'\n`)
      expect(verdict(LOOPBACK)).toBe('✗')
    }
    // a port alone, or another port on this machine, names no TeX page
    put(`${OUT}/chunks/session.js`, "const port = 8071; const ollama = 'http://localhost:11434/v1'; const far = 'http://127.0.0.1:80710'\n")
    expect(verdict(LOOPBACK)).toBe('✓')
    // in any file of the package, not only a script: a page, and a file that is not UTF-8
    put(`${OUT}/pdf-reader.html`, '<iframe src="http://127.0.0.1:8071/"></iframe>\n')
    expect(verdict(LOOPBACK)).toBe('✗')
    rmSync(join(root, OUT, 'pdf-reader.html'))
    put(`${OUT}/assets/engine.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d, 0xff, 0xfe, ...Buffer.from('http://localhost:8070'), 0xff]))
    expect(verdict(LOOPBACK)).toBe('✗')
  })

  it('a production package holds a BusyTeX or texlyre file', () => {
    expect(verdict(TEX)).toBe('✓')
    // by its path
    put(`${OUT}/tex/busytex.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d]))
    expect(verdict(TEX)).toBe('✗')
    rmSync(join(root, OUT, 'tex'), { recursive: true })
    expect(verdict(TEX)).toBe('✓')
    // by what a file holds, whatever its name: a bundled module of the package, a reference to one of its files, a
    // binary carrying one
    put(`${OUT}/chunks/compile.js`, 'import { BusyTex } from "texlyre-busytex"\n')
    expect(verdict(TEX)).toBe('✗')
    put(`${OUT}/chunks/compile.js`, "const worker = new Worker('/busytex/busytex_pipeline.js')\n")
    expect(verdict(TEX)).toBe('✗')
    rmSync(join(root, OUT, 'chunks/compile.js'))
    put(`${OUT}/assets/engine.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d, 0xff, ...Buffer.from('busytex.data'), 0xff]))
    expect(verdict(TEX)).toBe('✗')
    rmSync(join(root, OUT, 'assets/engine.wasm'))
    // the name in prose is none of its files: a comment a build keeps
    put(`${OUT}/chunks/live.js`, '/*! a compile the TeX page failed: the BusyTeX worker gave up after 180 s (BusyTeX\'s own limit) */\n')
    expect(verdict(TEX)).toBe('✓')
  })

  it('a production package holds a development page', () => {
    expect(verdict(DEV)).toBe('✓')
    for (const page of ['gallery', 'controls', 'capsule']) {
      put(`${OUT}/${page}.html`, '<!doctype html>\n')
      expect(verdict(DEV)).toBe('✗')
      rmSync(join(root, OUT, `${page}.html`))
    }
  })
})

// The reader is the reading view on the layer (Stage 5 Tasks 9 and 17): its places' code in a chunk; no TeX page, nothing of the
// LaTeX front end; the host permissions exactly the release's, staging's only in a staging build, and no staging host named
// anywhere in a production one; the web-accessible resources and the offscreen document as they were
describe('the layer reader\'s package', () => {
  const VIEW = `${OUT} holds the reading view, the reader`
  const NO_TEX = `${OUT} names no TeX page`
  const HOSTS = 'the host permissions are exactly'
  const NO_STAGING = 'a production build names no staging host'
  const RELEASE = ['https://openrouter.ai/*', 'https://translate-pa.googleapis.com/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*', 'https://readarxiv.com/*']
  it('holds the reading view: its places\' code in a chunk, not only their rule in the style sheet', () => {
    put(`${OUT}/assets/pdf-reader.css`, '.axt-place-view{position:absolute;inset:0}\n')
    expect(verdict(VIEW)).toBe('✗')
    put(`${OUT}/chunks/host-Ab12.js`, "const holder = document.createElement('div'); holder.className = 'axt-place-view'\n")
    expect(verdict(VIEW)).toBe('✓')
  })
  it('names no TeX page and holds nothing of the LaTeX front end', () => {
    expect(verdict(NO_TEX)).toBe('✓')
    put(`${OUT}/chunks/session.js`, "const TEX_PAGE = 'https://tex.readarxiv.org'\n")
    expect(verdict(NO_TEX)).toBe('✗')
    put(`${OUT}/chunks/session.js`, "const FONT_PROBE = '\\\\AtEndDocument{\\\\typeout{AXT-FONTS rm=\\\\rmdefault}}'\n")
    expect(verdict(NO_TEX)).toBe('✗')
  })
  it('grants exactly the release\'s hosts, staging\'s in a staging build alone, which a production build names nowhere', () => {
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: RELEASE }))
    expect(verdict(HOSTS)).toBe('✓')
    expect(verdict(NO_STAGING)).toBe('✓')
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: [...RELEASE, 'https://tex.readarxiv.org/*'] }))
    expect(verdict(HOSTS)).toBe('✗')
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: RELEASE.slice(1) }))
    expect(verdict(HOSTS)).toBe('✗')
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: [...RELEASE, 'https://app-staging.readarxiv.org/*'] }))
    expect(verdict(HOSTS)).toBe('✓')
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: RELEASE }))
    put(`${OUT}/chunks/api.js`, "const API = 'https://app-staging.readarxiv.org'\n")
    expect(verdict(NO_STAGING)).toBe('✗')
    put(`${OUT}/manifest.json`, JSON.stringify({ host_permissions: [...RELEASE, 'https://app-staging.readarxiv.org/*'] }))
    expect(verdict(NO_STAGING)).toBe('✓')
  })
  it('a release is production\'s alone: a staging package fails the release\'s check, and passes only as the staging build it names itself', () => {
    const ASKED = 'the build is the one asked for'
    const STAGING = [...RELEASE, 'https://app-staging.readarxiv.org/*']
    put(`${OUT}/manifest.json`, JSON.stringify({ version: '0.4.1', host_permissions: RELEASE }))
    expect(verdict(ASKED)).toBe('✓')
    // an AXT_READER_API left in the environment at a release's cut: a staging package under `pnpm build`
    put(`${OUT}/manifest.json`, JSON.stringify({ version: '0.4.1', version_name: '0.4.1 staging', host_permissions: STAGING }))
    expect(verdict(ASKED)).toBe('✗')
    // the staging build, asked for (pnpm build:staging), and named so
    expect(verdict(ASKED, { AXT_BUILD: 'staging' })).toBe('✓')
    put(`${OUT}/manifest.json`, JSON.stringify({ version: '0.4.1', host_permissions: STAGING }))
    expect(verdict(ASKED, { AXT_BUILD: 'staging' })).toBe('✗')
    // a release asked as staging is no staging build either
    put(`${OUT}/manifest.json`, JSON.stringify({ version: '0.4.1', host_permissions: RELEASE }))
    expect(verdict(ASKED, { AXT_BUILD: 'staging' })).toBe('✗')
  })
  it('the web-accessible resources are the popup and the reader to arXiv alone; the offscreen document stays', () => {
    const war = [{ resources: ['popup.html'], matches: ['https://arxiv.org/*'], use_dynamic_url: true }, { resources: ['pdf-reader.html'], matches: ['https://arxiv.org/*'], use_dynamic_url: true }]
    put(`${OUT}/manifest.json`, JSON.stringify({ web_accessible_resources: war, permissions: ['storage', 'offscreen'], content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-src 'none'" } }))
    expect(verdict('the web-accessible resources are popup.html and pdf-reader.html')).toBe('✓')
    expect(verdict('the offscreen document stays')).toBe('✓')
    expect(verdict('the extension\'s pages frame nothing')).toBe('✓')
    expect(verdict('the manifest does not let a reader that is no frame act')).toBe('✓')
    // at a stable address (no use_dynamic_url) an arXiv page could write into a frame, and a manifest that lets a reader
    // of its own act (the harness's copy) is no build's
    put(`${OUT}/manifest.json`, JSON.stringify({ web_accessible_resources: war.map(({ use_dynamic_url: _, ...entry }) => entry), axt_top_level_reader: true, permissions: ['storage', 'offscreen'], content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-src 'none'" } }))
    expect(verdict('the web-accessible resources are popup.html and pdf-reader.html')).toBe('✗')
    expect(verdict('the manifest does not let a reader that is no frame act')).toBe('✗')
    put(`${OUT}/manifest.json`, JSON.stringify({ web_accessible_resources: [...war.slice(0, 1), { resources: ['pdf-reader.html'], matches: ['<all_urls>'] }], permissions: ['storage'] }))
    expect(verdict('the web-accessible resources are popup.html and pdf-reader.html')).toBe('✗')
    expect(verdict('the offscreen document stays')).toBe('✗')
    expect(verdict('the extension\'s pages frame nothing')).toBe('✗')
  })
})

describe('the store archive', () => {
  // `wxt zip` builds again before it writes the archive, and that build was checked by nothing: `pnpm build && pnpm zip` paired
  // the two by convention only (#88 E8). Each archive's script ends with the check of its own kind of build
  const scripts = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts
  it('is checked as its build is: the release archive as a release, the staging archive as staging', () => {
    expect(scripts.zip).toBe('wxt zip && node scripts/check-output.mjs')
    expect(scripts['zip:staging']).toMatch(/ wxt zip && AXT_BUILD=staging node scripts\/check-output\.mjs$/)
    // the archive and its build ask the same server
    expect(scripts['zip:staging']!.split(' wxt zip')[0]).toBe(scripts['build:staging']!.split(' wxt build')[0])
  })
})
