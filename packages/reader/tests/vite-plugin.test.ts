// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readerAssets } from '../src/vite.ts'

describe("the reader's build plugin", () => {
  it("emits PDF.js's data files and worker at pdfjs/<version>/, the legacy worker only when asked", async () => {
    const { build } = await import('vite')
    const pdfjs = JSON.parse(readFileSync(new URL(import.meta.resolve('pdfjs-dist/package.json')), 'utf8')) as {
      version: string
    }
    const dir = mkdtempSync(join(tmpdir(), 'axt-reader-assets-'))
    try {
      writeFileSync(join(dir, 'entry.js'), 'export const x = 1\n')
      for (const legacy of [false, true]) {
        const out = join(dir, legacy ? 'legacy' : 'modern')
        await build({
          root: dir,
          logLevel: 'silent',
          configFile: false,
          plugins: [readerAssets({ legacy })],
          build: { outDir: out, lib: { entry: join(dir, 'entry.js'), formats: ['es'], fileName: 'entry' } },
        })
        const at = join(out, 'pdfjs', pdfjs.version)
        expect(existsSync(join(at, 'pdf.worker.min.mjs'))).toBe(true)
        expect(existsSync(join(at, 'cmaps', '78-H.bcmap'))).toBe(true)
        expect(existsSync(join(at, 'standard_fonts', 'LiberationSans-Regular.ttf'))).toBe(true)
        expect(existsSync(join(at, 'wasm', 'openjpeg.wasm'))).toBe(true)
        expect(existsSync(join(at, 'pdf_viewer.css'))).toBe(true)
        expect(existsSync(join(at, 'images', 'loading-icon.gif'))).toBe(true)
        expect(existsSync(join(at, 'legacy', 'pdf.worker.min.mjs'))).toBe(legacy)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
