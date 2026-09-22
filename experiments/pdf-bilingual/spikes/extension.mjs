// The extension with the PDF reader as one of its pages, for the spikes that drive the reader: Chromium with the
// repository's build loaded (wxt.config.ts copies poc-reader/ in as `pdf-reader/` once setup has filled its lib/), and
// the reader's address in it. The reader translates through that build's background, with its default settings unless
// a spike changes them. Build first: `pnpm build` at the repository root.
import { existsSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('../../../', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
export const BUILD = join(REPO, '.output/chrome-mv3')

/** { context, worker, id, readerUrl(query) }: `profile` names the temporary profile's directory, `extension` another build */
export async function launchWithReader({ profile = 'reader', extension = BUILD, headless = true, viewport = { width: 1600, height: 1000 } } = {}) {
  if (!existsSync(join(extension, 'pdf-reader/reader.html'))) throw new Error(`no reader in ${extension}: \`node setup.mjs\` here, then \`pnpm build\` at the repository root`)
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), `${profile}-`)), { channel: 'chromium', headless, viewport, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const id = new URL(worker.url()).host, base = `chrome-extension://${id}/pdf-reader/reader.html`
  return { context, worker, id, readerUrl: query => `${base}?${typeof query === 'string' ? query : new URLSearchParams(query)}` }
}
