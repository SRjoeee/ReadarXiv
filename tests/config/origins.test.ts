// Which host permissions the services need, decided in one place (DESIGN §9, the configuration; #299 rows 116, 119, 120
// and the ledger F2): the origins the stored services use and the ones a page still holds — a form asking or
// connecting, a deletion whose undo is open — are needed; every other origin the browser granted is given back, never
// the manifest's own, never one in a pattern the extension does not ask for, and none at all while the stored settings
// cannot be read
import { describe, expect, it } from 'vitest'
import { manifestOrigins, originHold, originOf, originsNeeded, readHold, reconcileOrigins } from '@/config/origins'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'

const service = (id: string, baseURL: string): Service => ({ id, kind: 'openai-compat', name: id, baseURL, apiKey: 'k', model: 'm', thinking: 'disabled' })
const MINE = service('svc-mine0000', 'https://api.example.com/v1')
const OTHER = service('svc-othr0000', 'https://other.example.com/v1')
const LOCAL = service('svc-locl0000', 'http://localhost:11434/v1')
const withServices = (...services: Service[]): Config => ({ ...DEFAULT_CONFIG, services })
/** The manifest as the browser reads it, with the website's host the day it joins (Task 17) */
const MANIFEST = manifestOrigins({
  host_permissions: ['https://openrouter.ai/*', 'https://translate-pa.googleapis.com/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*', 'https://readarxiv.com/*'],
  content_scripts: [{ matches: ['https://arxiv.org/html/*'] }, { matches: ['https://app-staging.readarxiv.org/*'] }],
})
const reconcile = (granted: string[], needed: Set<string>, settingsReadable = true) => reconcileOrigins({ granted, needed, settingsReadable, manifest: MANIFEST }).remove

describe('originOf', () => {
  it('names an address by its origin, as the browser grants it: scheme, host, a port that is not the default', () => {
    expect(originOf('https://api.example.com/v1/chat')).toBe('https://api.example.com/*')
    expect(originOf('http://localhost:11434/v1')).toBe('http://localhost:11434/*')
    expect(originOf('https://API.Example.com:443/v1')).toBe('https://api.example.com/*')
    // a pattern names itself
    expect(originOf('https://api.example.com/*')).toBe('https://api.example.com/*')
  })

  it('names nothing the extension never asks for: no address, another scheme', () => {
    expect(originOf('not a url')).toBeNull()
    expect(originOf('ftp://files.example.com/')).toBeNull()
    expect(originOf('chrome-extension://abc/page.html')).toBeNull()
  })
})

describe('originsNeeded', () => {
  it('the stored services\' origins and the ones held — one each, whatever the path', () => {
    const needed = originsNeeded(withServices(MINE, { ...OTHER, baseURL: 'https://api.example.com/v2' }, LOCAL), ['https://held.example.com/v1', 'https://held.example.com/*', 'garbage'])
    expect([...needed].sort()).toEqual(['http://localhost:11434/*', 'https://api.example.com/*', 'https://held.example.com/*'])
  })

  it('no service and nothing held needs nothing', () => {
    expect(originsNeeded(DEFAULT_CONFIG).size).toBe(0)
  })
})

describe('reconcileOrigins', () => {
  it('gives back a granted origin no stored service and nothing held needs, and keeps the rest', () => {
    expect(reconcile(['https://api.example.com/*', 'https://gone.example.com/*'], originsNeeded(withServices(MINE)))).toEqual(['https://gone.example.com/*'])
  })

  it('an origin is never given back while the stored settings cannot be read: which services use one is unknown (#299 row 120, F2a)', () => {
    // the read answers with the defaults, which hold no service: by them, every origin would be unused
    const needed = originsNeeded(DEFAULT_CONFIG)
    expect(reconcile(['https://api.example.com/*', 'https://gone.example.com/*'], needed, false)).toEqual([])
    expect(reconcileOrigins({ granted: ['https://api.example.com/*'], needed, settingsReadable: false, manifest: [] })).toEqual({ remove: [] })
    // readable again, the same grants are judged as usual: kept for good no longer
    expect(reconcile(['https://api.example.com/*', 'https://gone.example.com/*'], needed, true)).toEqual(['https://api.example.com/*', 'https://gone.example.com/*'])
  })

  it('a form\'s Cancel gives back only the origins no stored service and no other open form needs (#299 F2b)', () => {
    // the cancelled form asked for two origins; another open form holds one of them, a stored service uses another
    const granted = ['https://cancelled.example.com/*', 'https://shared.example.com/*', 'https://api.example.com/*']
    const otherForm = [originHold('https://shared.example.com/v1')!]
    const needed = originsNeeded(withServices(MINE), otherForm.map(name => readHold(name)!.origin))
    expect(reconcile(granted, needed)).toEqual(['https://cancelled.example.com/*'])
  })

  it('a deletion\'s commit inside the undo window keeps an origin a form is connecting with (#299 F2c)', () => {
    // the service deleted and the same custom address typed again into the add form, connecting while the undo runs
    const formConnecting = originHold(MINE.baseURL)!
    const needed = originsNeeded(withServices(OTHER), [readHold(formConnecting)!.origin])
    expect(reconcile(['https://api.example.com/*', 'https://other.example.com/*'], needed)).toEqual([])
  })

  it('a page closed during an undo keeps nothing it did not need: once its holds are gone, the deleted service\'s origin goes back (#299 row 116)', () => {
    const undoOpen = originHold(MINE.baseURL, MINE.id)!
    const granted = ['https://api.example.com/*', 'https://other.example.com/*']
    // while the page holds the undo, the origin is kept — the deletion may still be undone
    expect(reconcile(granted, originsNeeded(withServices(OTHER), [readHold(undoOpen)!.origin]))).toEqual([])
    // the page closed: the browser let its holds go with it, and nothing else needs the origin
    expect(reconcile(granted, originsNeeded(withServices(OTHER), []))).toEqual(['https://api.example.com/*'])
  })

  it('readarxiv.com and arXiv, the manifest\'s own hosts, are never given back, nor a content script\'s; read from the manifest given, not a list of its own', () => {
    const granted = ['https://readarxiv.com/*', 'https://arxiv.org/*', 'https://openrouter.ai/*', 'https://edge.microsoft.com/*', 'https://app-staging.readarxiv.org/*', 'https://gone.example.com/*']
    expect(reconcile(granted, new Set())).toEqual(['https://gone.example.com/*'])
    // another manifest, another answer: nothing here names a host of its own
    expect(reconcileOrigins({ granted, needed: new Set(), settingsReadable: true, manifest: manifestOrigins({ host_permissions: ['https://arxiv.org/*'] }) }).remove)
      .toEqual(['https://readarxiv.com/*', 'https://openrouter.ai/*', 'https://edge.microsoft.com/*', 'https://app-staging.readarxiv.org/*', 'https://gone.example.com/*'])
  })

  it('a grant in a pattern the extension never asks for is not the extension\'s to give back: the reader gave it in the browser', () => {
    const granted = ['https://*/*', 'http://*/*', '<all_urls>', '*://example.com/*', 'https://*.example.com/*', 'https://example.com/path/*']
    expect(reconcile(granted, new Set())).toEqual([])
  })

  it('a grant without a port covers its host on every port, as Chrome reads it: kept while a service on any of them needs it', () => {
    // the service first added on port 80, then edited to 11434: the browser had nothing to ask, the grant it holds is the first
    expect(reconcile(['http://localhost/*'], originsNeeded(withServices(LOCAL)))).toEqual([])
    // the other way round a grant on one port covers no other
    expect(reconcile(['http://localhost:11434/*'], originsNeeded(withServices({ ...LOCAL, baseURL: 'http://localhost/v1' })))).toEqual(['http://localhost:11434/*'])
  })

  it('a grant the manifest covers is the manifest\'s: Chrome refuses to remove a required host', () => {
    const manifest = manifestOrigins({ host_permissions: ['http://127.0.0.1/*', 'https://*.example.org/*'] })
    expect(reconcileOrigins({ granted: ['http://127.0.0.1:8080/*', 'https://api.example.org/*', 'https://example.org/*', 'https://example.net/*'], needed: new Set(), settingsReadable: true, manifest }).remove)
      .toEqual(['https://example.net/*'])
  })

  it('each origin once, in the order the browser listed them', () => {
    expect(reconcile(['https://b.example.com/*', 'https://a.example.com/*', 'https://b.example.com/*'], new Set())).toEqual(['https://b.example.com/*', 'https://a.example.com/*'])
  })
})

describe('the hold\'s name', () => {
  it('carries the origin, and the service whose undo is open; read back as it was written', () => {
    expect(readHold(originHold('https://api.example.com/v1')!)).toEqual({ origin: 'https://api.example.com/*' })
    expect(readHold(originHold('http://localhost:11434/v1', 'svc-mine0000')!)).toEqual({ origin: 'http://localhost:11434/*', service: 'svc-mine0000' })
  })

  it('no hold for an address with no origin; another lock\'s name is not a hold', () => {
    expect(originHold('nonsense')).toBeNull()
    expect(readHold('axt-tex-store')).toBeNull()
    expect(readHold('axt-origin nonsense')).toBeNull()
  })
})
