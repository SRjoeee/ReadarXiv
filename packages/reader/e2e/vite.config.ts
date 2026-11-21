// The reader's offline harness pages, built with the reader's own plugin (PDF.js's assets at pdfjs/<version>/, the legacy
// build's worker too: a reader handed the legacy build is checked).
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readerAssets } from '../src/vite.ts'

export default defineConfig({
  root: fileURLToPath(new URL('./page', import.meta.url)),
  base: '/',
  logLevel: 'warn',
  // (Tailwind for the host page's sheet, chrome.css, as both hosts build theirs)
  plugins: [tailwindcss(), readerAssets({ legacy: true })],
  build: {
    outDir: fileURLToPath(new URL('./.out', import.meta.url)),
    // the harness page (index.html: the reader's parts) and a host's page (chrome.html: the chrome over openReader)
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./page/index.html', import.meta.url)),
        chrome: fileURLToPath(new URL('./page/chrome.html', import.meta.url)),
      },
    },
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
})
