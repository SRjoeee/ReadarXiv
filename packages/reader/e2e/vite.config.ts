// The reader's offline harness page, built with the reader's own plugin (PDF.js's assets at pdfjs/<version>/, the legacy
// build's worker too: a reader handed the legacy build is checked).
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { readerAssets } from '../src/vite.ts'

export default defineConfig({
  root: fileURLToPath(new URL('./page', import.meta.url)),
  base: '/',
  logLevel: 'warn',
  plugins: [readerAssets({ legacy: true })],
  build: {
    outDir: fileURLToPath(new URL('./.out', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
})
