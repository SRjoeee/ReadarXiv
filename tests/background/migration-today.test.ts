// Stage 4b's migration seen working (hard rules 4 and 7): a fresh profile and a profile carrying today's database
// (`axt-translation-cache` at version 2, the per-text cache of 1d804a770) both translate a fixture page through the HTML
// pipeline and a PDF's texts through the reader's call site, each over the background's transport, its chain and its
// stores on that database; the old entries go once, the new tables fill. The engines are the package's own adapters over
// an endpoint that answers each text with itself
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chainOf, type FetchInit, type FetchReply } from '@readarxiv/translate'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createTranslateDb, createTranslateStore } from '@/cache/translate-store'
import { DEFAULT_CONFIG } from '@/config/schema'
import { extract } from '@/core/extractor'
import { startTranslation } from '@/core/pipeline/run'
import { restore } from '@/core/renderer/page'
import { DEFAULT_PRELOAD } from '@/core/scheduler/lazy'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport, type TranslationTransport } from '@/providers/transport'

const options = { indexedDB, IDBKeyRange }
const echo = async (url: string, init: FetchInit): Promise<FetchReply> => {
  const texts = url.includes('microsoft') ? (JSON.parse(init.body) as string[]) : (JSON.parse(init.body) as [[string[]]])[0][0]
  const body = url.includes('microsoft') ? texts.map(text => ({ translations: [{ text }] })) : [texts]
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) }
}

/** today's database: version 2 of the per-text cache, with an HTML block's and a PDF text's entries */
async function todays(name: string): Promise<void> {
  const old = new Dexie(name, options)
  old.version(1).stores({ entries: '&key, paper, createdAt, expiresAt, lastAccessedAt' })
  old.version(2).stores({ entries: '&key, paper, createdAt, expiresAt, lastAccessedAt, byteSize' })
  const now = Date.now()
  await old.table('entries').bulkPut(['html', 'pdf'].map(k => ({ key: k, paper: '2410.00260', translation: 'old', createdAt: now, lastAccessedAt: now, expiresAt: now + 1e9, byteSize: 8 })))
  old.close()
}

let current: TranslationTransport
vi.mock('@/shared/transport', () => ({
  createMessageTransport: () => ({ status: () => current.status(), translate: (c: never) => current.translate(c), cancel: (s: string) => current.cancel(s) }),
}))

describe('the migration of stage 4b: a fresh profile and one carrying today\'s database both translate', () => {
  for (const profile of ['fresh', "today's"] as const) {
    it(`${profile}: a fixture page through the HTML pipeline and a PDF's texts through the reader's call site`, async () => {
      const name = `axt-migration-${profile}-${Math.random()}`
      if (profile === "today's") await todays(name)
      const db = createTranslateDb(name, options)
      const stores = createTranslateStore({ db })
      current = await createLocalTransport(DEFAULT_CONFIG, { chain: chainOf({ store: stores.answers }), probe: chainOf(), rows: stores.rows, fetch: echo, chromeApi: null, cancelled: new CancelledScopeRegistry() })

      // the HTML page: the whole fixture, on the session's markers wire (Microsoft, the shipped default)
      const doc = new DOMParser().parseFromString(readFileSync(join(import.meta.dirname, '../fixtures/arxiv/2410.00260.html'), 'utf8'), 'text/html')
      const before = doc.documentElement.outerHTML
      const blocks = extract(doc)
      const status = await current.status()
      const run = startTranslation({ doc, blocks, target: status.targetLanguage, mode: 'stack', paper: '2410.00260', transport: c => current.translate(c), capabilities: { maxBatchChars: status.maxBatchChars, maxBatchItems: status.maxBatchItems, renderPath: status.renderPath }, preload: DEFAULT_PRELOAD })
      await run.translate(blocks)
      expect(run.progress()).toMatchObject({ requested: blocks.length, done: blocks.length, failed: 0 })
      run.stop()
      restore(doc)
      expect(doc.documentElement.outerHTML).toBe(before)

      // the PDF reader: its engine's texts, in the session's wire, through openEngine
      const { openEngine } = await import('@/pdf-reader/session/translate.mjs')
      const engine = await openEngine({ paper: '2410.00260' })
      expect(await engine.translate(['We set @a# to one.', 'A plain sentence.'])).toEqual([
        expect.objectContaining({ text: 'We set @a# to one.' }),
        expect.objectContaining({ text: 'A plain sentence.' }),
      ])

      // the old table gone, once; the new ones hold what was accepted
      expect(db.tables.map(t => t.name).sort()).toEqual(['answers', 'ocr', 'rows'])
      expect((await stores.stats()).entries).toBeGreaterThan(blocks.length)
      db.close()
    })
  }
})
