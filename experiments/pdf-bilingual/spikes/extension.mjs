// The extension with the PDF reader as one of its pages, for the spikes that drive the reader: Chromium with the
// repository's build loaded (the reader is its page pdf-reader.html, src/entrypoints/pdf-reader), and the reader's
// address in it. The reader translates through that build's background, with its default settings unless
// a spike changes them. Build first: `pnpm build` at the repository root.
import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('../../../', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
export const BUILD = join(REPO, '.output/chrome-mv3')

/**
 * { context, worker, id, readerUrl(query) }: `profile` names the temporary profile's directory, `extension` another
 * build. `demos`: the precompiled demo papers (poc-reader/papers, made on this machine by reader-papers.mjs) staged into
 * a temporary copy of the build, for the spikes that open them — a build never holds them, since arXiv's papers may not
 * be redistributed (Codex on #296)
 */
export async function launchWithReader({ profile = 'reader', extension = BUILD, demos = false, headless = true, viewport = { width: 1600, height: 1000 } } = {}) {
  if (!existsSync(join(extension, 'pdf-reader.html'))) throw new Error(`no reader in ${extension}: \`pnpm build\` at the repository root`)
  if (demos) {
    const papers = new URL('../poc-reader/papers', import.meta.url).pathname
    if (!existsSync(papers)) throw new Error('no demo papers: node spikes/reader-papers.mjs first')
    const copy = mkdtempSync(join(tmpdir(), 'reader-demos-'))
    cpSync(extension, copy, { recursive: true })
    cpSync(papers, join(copy, 'pdf-reader/papers'), { recursive: true })
    extension = copy
  }
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), `${profile}-`)), { channel: 'chromium', headless, viewport, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const id = new URL(worker.url()).host, base = `chrome-extension://${id}/pdf-reader.html`
  return { context, worker, id, readerUrl: query => `${base}?${typeof query === 'string' ? query : new URLSearchParams(query)}` }
}
