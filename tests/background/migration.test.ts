// Stage 4b's migration seen working (hard rules 4 and 7): a fresh profile and a profile carrying today's database
// (`axt-translation-cache` at version 2, the per-text cache of 1d804a770) both translate a fixture page through the HTML
// pipeline and a PDF's units through the rebuilt reader's call site (src/pdf-reader/host/translate.ts hostTranslate, the
// reader host's one function that talks to the background), each over the background's transport, its chain and its stores
// on that database; the old entries go once, the new tables fill, and the reader's units are read back from them. The engines
// are the package's own adapters over an endpoint that answers each text with itself
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Row, Unit } from '@readarxiv/format'
import { chainOf, type FetchInit, type FetchReply } from '@readarxiv/translate'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createTranslateDb, createTranslateStore } from '@/cache/translate-store'
import { DEFAULT_CONFIG } from '@/config/schema'
import { extract } from '@/core/extractor'
import { startTranslation } from '@/core/pipeline/run'
import { restore } from '@/core/renderer/page'
import { DEFAULT_PRELOAD } from '@/core/scheduler/lazy'
import { hostTranslate } from '@/pdf-reader/host/translate'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport } from '@/providers/transport'

const options = { indexedDB, IDBKeyRange }
/** the endpoint: each text answered with itself, every request counted */
function echoing() {
  const sent: string[] = []
  const fetch = async (url: string, init: FetchInit): Promise<FetchReply> => {
    sent.push(url)
    const texts = url.includes('microsoft') ? (JSON.parse(init.body) as string[]) : (JSON.parse(init.body) as [[string[]]])[0][0]
    const body = url.includes('microsoft') ? texts.map(text => ({ translations: [{ text }] })) : [texts]
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) }
  }
  return { sent, fetch }
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

/** a PDF's units as the rebuilt reader hands them to its host (packages/format's Unit): a paragraph with a formula, and one of
 *  plain words */
const UNITS: Unit[] = [
  { id: 'u1', kind: 'para', content: [{ t: 'text', s: 'We set ' }, { t: 'el', id: '1', kind: 'math', src: '$a$' }, { t: 'text', s: ' to one.' }] } as Unit,
  { id: 'u2', kind: 'para', content: [{ t: 'text', s: 'A plain sentence.' }] } as Unit,
]
const all = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }

describe('the migration of stage 4b: a fresh profile and one carrying today\'s database both translate, the rebuilt reader through its host', () => {
  for (const profile of ['fresh', "today's"] as const) {
    it(`${profile}: a fixture page through the HTML pipeline and a PDF's units through the rebuilt reader's host (hostTranslate), the migrated store read back`, async () => {
      const name = `axt-migration-${profile}-${Math.random()}`
      if (profile === "today's") await todays(name)
      const db = createTranslateDb(name, options)
      const stores = createTranslateStore({ db })
      const endpoint = echoing()
      const transport = await createLocalTransport(DEFAULT_CONFIG, { chain: chainOf({ store: stores.answers }), probe: chainOf(), rows: stores.rows, fetch: endpoint.fetch, chromeApi: null, cancelled: new CancelledScopeRegistry() })

      // the HTML page: the whole fixture, on the session's markers wire (Microsoft, the shipped default)
      const doc = new DOMParser().parseFromString(readFileSync(join(import.meta.dirname, '../fixtures/arxiv/2410.00260.html'), 'utf8'), 'text/html')
      const before = doc.documentElement.outerHTML
      const blocks = extract(doc)
      const status = await transport.status()
      const run = startTranslation({ doc, blocks, target: status.targetLanguage, mode: 'stack', paper: '2410.00260', transport: c => transport.translate(c), capabilities: { maxBatchChars: status.maxBatchChars, maxBatchItems: status.maxBatchItems, renderPath: status.renderPath }, preload: DEFAULT_PRELOAD })
      await run.translate(blocks)
      expect(run.progress()).toMatchObject({ requested: blocks.length, done: blocks.length, failed: 0 })
      run.stop()
      restore(doc)
      expect(doc.documentElement.outerHTML).toBe(before)

      // the PDF reader: its units, through the rebuilt reader's host, one result a unit
      const translate = hostTranslate({ transport, paper: '2410.00260' })
      const asked = endpoint.sent.length
      const rows = await all(translate(UNITS, status.targetLanguage, { signal: new AbortController().signal }))
      expect(endpoint.sent.length).toBeGreaterThan(asked)
      expect(rows.map(r => [r.id, r.ok])).toEqual([['u1', true], ['u2', true]])
      const text = (r: Row) => (r.ok ? r.content.map(p => (p.t === 'text' ? p.s : `<${p.t}>`)).join('') : null)
      expect(rows.map(text)).toEqual(['We set <el> to one.', 'A plain sentence.'])

      // the old table gone, once; the new ones hold what was accepted
      expect(db.tables.map(t => t.name).sort()).toEqual(['answers', 'ocr', 'rows'])
      expect((await stores.stats()).entries).toBeGreaterThan(blocks.length)

      // read back: the same units asked again are answered from the migrated store (its rows, or the answers behind them: either
      // alone answers them), nothing sent
      const sent = endpoint.sent.length
      expect(await all(translate(UNITS, status.targetLanguage, { signal: new AbortController().signal }))).toEqual(rows)
      expect(endpoint.sent.length).toBe(sent)
      db.close()
    })
  }
})
