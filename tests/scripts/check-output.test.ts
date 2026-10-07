import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
const verdict = (name: string) => {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
  return `${result.stdout}\n${result.stderr}`.split('\n').find(line => line.slice(2).startsWith(name))?.[0]
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'axt-output-'))
  // what the script reads before its first check: the website's hosts, the manifest, the content scripts
  put('src/shared/web-app.ts', "export const WEB_APP_HOSTS: readonly string[] = ['app.example.org']\n")
  put(`${OUT}/manifest.json`, '{}')
  put(`${OUT}/content-scripts/content.js`, 'console.log("content")\n')
  // a reader's chunk with the production build's TeX page in it, and a binary file
  put(`${OUT}/chunks/session.js`, "const TEX_PAGE = 'https://tex.readarxiv.org'; const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])\n")
  put(`${OUT}/pdf-reader/pdfjs/wasm/openjpeg.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0xff, 0xfe]))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('a production build fails check-output when', () => {
  const LOOPBACK = `${OUT} names no loopback TeX page`
  const TEX = `${OUT} holds no BusyTeX or texlyre file`
  const DEV = `${OUT} holds no dev page`

  it('a production package names a loopback TeX page (`127.0.0.1:8071`, `localhost:8070`)', () => {
    expect(verdict(LOOPBACK)).toBe('✓')
    for (const address of ['http://127.0.0.1:8071', 'http://localhost:8070']) {
      put(`${OUT}/chunks/session.js`, `const site = '${address}'\n`)
      expect(verdict(LOOPBACK)).toBe('✗')
    }
    // in any text file of the package, not only a script
    put(`${OUT}/chunks/session.js`, "const site = 'https://tex.readarxiv.org'\n")
    put(`${OUT}/pdf-reader.html`, '<iframe src="http://127.0.0.1:8071/"></iframe>\n')
    expect(verdict(LOOPBACK)).toBe('✗')
  })

  it('a production package holds a BusyTeX or texlyre file', () => {
    expect(verdict(TEX)).toBe('✓')
    // by its path
    put(`${OUT}/tex/busytex.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d]))
    expect(verdict(TEX)).toBe('✗')
    rmSync(join(root, OUT, 'tex'), { recursive: true })
    expect(verdict(TEX)).toBe('✓')
    // by what a file holds, whatever its name: a bundled module, or a binary carrying the name
    put(`${OUT}/chunks/compile.js`, 'import { BusyTex } from "texlyre-busytex"\n')
    expect(verdict(TEX)).toBe('✗')
    rmSync(join(root, OUT, 'chunks/compile.js'))
    put(`${OUT}/assets/engine.wasm`, new Uint8Array([0, 0x61, 0x73, 0x6d, ...Buffer.from('busytex_main'), 0xff]))
    expect(verdict(TEX)).toBe('✗')
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
