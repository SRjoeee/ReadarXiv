// One input per state of the popup: UI.md §4's rows with the redesign's (its design, §5). Shared by the tests and the
// gallery; a change to the state table starts here.
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import type { ProviderStatus } from '@/providers/transport'
import type { PageStatus } from '@/shared/messages'
import type { PopupInput } from './view-model'

export interface PopupFixture {
  id: string
  name: string
  when: string
  input: PopupInput
  /** What a failed action left on the error line (S-P-90), for the one state that shows it */
  error?: string
}

const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'deepseek-v4-flash', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'set', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' as const }
const config: Config = DEFAULT_CONFIG
const llm: Config = { ...DEFAULT_CONFIG, provider: SVC.id, services: [SVC] }
const llmNoKey: Config = { ...DEFAULT_CONFIG, provider: SVC.id, services: [{ ...SVC, apiKey: '' }] }

function page(over: Partial<PageStatus['progress']> = {}, extra: Partial<PageStatus> = {}): PageStatus {
  const state = over.state ?? 'idle'
  return {
    paper: '2409.01234',
    mode: 'stack',
    preference: 'stack',
    progress: { state, total: 120, requested: 0, done: 0, failed: 0, cached: 0, inFlight: 0, ...over },
    epoch: 'doc#1',
    ...(state === 'on' ? { running: { provider: 'microsoft', target: 'cmn', engine: 'microsoft', revision: 'r1' } } : {}),
    ...extra,
  }
}

function provider(over: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    providerId: 'microsoft',
    chosen: 'microsoft',
    revision: 'r1',
    available: true,
    maxBatchChars: 4000,
    maxBatchItems: 20,
    renderPath: 'markers',
    targetLanguage: 'cmn',
    promptId: 'default',
    engine: { id: 'microsoft' },
    chain: ['microsoft', 'google-web'],
    demotions: [], identity: '',
    ...over,
  }
}
const llmProvider = (over: Partial<ProviderStatus> = {}) => provider({ providerId: SVC.id, chosen: SVC.id, model: SVC.model, renderPath: 'tags', engine: { id: SVC.id }, chain: [SVC.id, 'microsoft', 'google-web'], ...over })

const base: PopupInput = {
  page: page(), entry: null, saved: provider(), session: null, config, pack: 'available', menu: null, shortcut: '⌥T',
  // The saved settings' digest equals the running page's revision: nothing is behind unless a fixture says so
  savedRevision: 'r1',
  // No service is refused unless a fixture says so (the service health record, the redesign's design, §4)
  rejected: [],
  // The tab is a paper's, heard from; P0's field is empty (the redesign's design, §5.4)
  tab: { url: 'https://arxiv.org/html/2409.01234', asking: false },
  find: { query: '', entries: null },
  // This browser runs the PDF reader unless a fixture says not
  readerRuns: true,
}
/** No paper in the tab, and the page heard from: P0 (§5.4) */
const p0: PopupInput = { ...base, page: null, tab: { url: null, asking: false } }
const abs = (paper: string, over: Partial<NonNullable<PopupInput['entry']>> = {}) => ({ paper, html: `https://arxiv.org/html/${paper}#readarxiv`, kind: 'abs' as const, pdf: `https://arxiv.org/pdf/${paper}#readarxiv`, readerOpen: false, ...over })
/** The reader's service put aside for a refused key, and a page running on the free service since (P6, P6b) */
const REFUSED = { id: SVC.id, kind: 'auth' as const, message: 'User not found.' }
// The hand-over still in force, by engine (transport.ts `demotions`): the key's refusal, alongside `engine.demoted`
// (the most recent hand-over — the same one here, until a later test adds a second)
const p6: PopupInput = { ...base, config: llm, page: page({ state: 'on', requested: 20, done: 11 }, { running: { provider: SVC.id, target: 'cmn', engine: 'google-web', revision: 'r1' } }), saved: llmProvider(), session: llmProvider({ engine: { id: 'google-web', demoted: REFUSED }, demotions: [{ id: SVC.id, kind: 'auth', status: 401 }] }) }

export const POPUP_FIXTURES: PopupFixture[] = [
  { id: 'PW', name: 'Before the first answer', when: 'tab === null', input: { ...base, page: null, tab: null } },
  { id: 'PL', name: 'An arXiv paper still loading', when: 'page = entry = null ∧ tab = a paper ∧ asking', input: { ...base, page: null, tab: { url: 'https://arxiv.org/html/2409.01234', asking: true } } },
  { id: 'P0', name: 'Not on a paper: search and open', when: 'page = entry = null ∧ tab not a paper still asked', input: p0 },
  { id: 'P0a', name: 'P0, words typed', when: 'find.query = words', input: { ...p0, find: { query: 'attention is all you need', entries: null } } },
  { id: 'P0b', name: 'P0, an arXiv PDF address', when: 'find.query = arxiv.org/pdf/…', input: { ...p0, find: { query: 'https://arxiv.org/pdf/2501.07202v1', entries: null } } },
  { id: 'P0c', name: 'P0, an arXiv HTML address', when: 'find.query = arxiv.org/html/…', input: { ...p0, find: { query: 'https://arxiv.org/html/2501.07202v1', entries: null } } },
  { id: 'P0d', name: 'P0, a paper named, its checks out', when: 'find.query names a paper ∧ !entries', input: { ...p0, find: { query: 'https://arxiv.org/abs/2501.07202v1', entries: null } } },
  { id: 'P0e', name: 'P0, a paper named, both entries', when: 'entries.html ∧ entries.pdf', input: { ...p0, find: { query: 'https://arxiv.org/abs/2501.07202v1', entries: { id: '2501.07202v1', html: 'https://arxiv.org/html/2501.07202v1#readarxiv', pdf: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' } } } },
  { id: 'P0f', name: 'P0, a paper with no HTML version', when: 'entries.html = null', input: { ...p0, find: { query: 'hep-th/9711200', entries: { id: 'hep-th/9711200', html: null, pdf: 'https://arxiv.org/pdf/hep-th/9711200#readarxiv' } } } },
  { id: 'P0g', name: 'P0, a link elsewhere', when: 'find.query = another site\'s link', input: { ...p0, find: { query: 'https://www.nature.com/articles/s41586-021-03819-2', entries: null } } },
  { id: 'P1', name: 'Ready', when: 'idle ∧ runnable', input: base },
  { id: 'P2', name: 'Service menu', when: 'menu = service', input: { ...base, menu: 'service', pack: 'downloadable' } },
  { id: 'P3', name: 'Language menu', when: 'menu = language', input: { ...base, menu: 'language' } },
  { id: 'P4', name: 'Translating', when: 'on', input: { ...base, session: provider(), page: page({ state: 'on', requested: 31, done: 24, inFlight: 3 }, { preference: 'side', mode: 'side' }) } },
  { id: 'P5', name: 'Translating, with failures', when: 'on ∧ failed > 0 ∧ !fatal', input: { ...base, session: provider(), page: page({ state: 'on', requested: 31, done: 24, failed: 2 }, { images: { total: 6, requested: 3, done: 2, failed: 1 } }) } },
  // the key refused: the record holds the service, and the chain in force passes it over as the page's did
  { id: 'P6', name: 'Switched to another service', when: 'on ∧ engine.demoted', input: { ...p6, rejected: [SVC.id], saved: llmProvider({ available: false, engine: { id: 'google-web', demoted: REFUSED } }) } },
  // the key made good since (a connection that succeeded cleared the record): a start would run on the service again
  { id: 'P6b', name: 'The key made good, the page still on the free service', when: 'on ∧ demotions(auth, 401) ∧ !rejected ∧ saved.engine = demoted', input: p6 },
  { id: 'P7', name: 'LLM not configured, a fallback available', when: 'idle ∧ !runnable ∧ fallback', input: { ...base, config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }) } },
  { id: 'P7b', name: 'A refused key, a fallback available', when: 'idle ∧ rejected ∧ fallback', input: { ...base, config: llm, rejected: [SVC.id], saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }) } },
  { id: 'P8', name: 'LLM not configured, no fallback', when: 'idle ∧ !runnable ∧ !fallback', input: { ...base, config: { ...llmNoKey, fallback: { enabled: false } }, saved: llmProvider({ available: false, chain: ['openai-compat'] }) } },
  { id: 'P8b', name: 'A refused key, no fallback', when: 'idle ∧ rejected ∧ !fallback', input: { ...base, config: { ...llm, fallback: { enabled: false } }, rejected: [SVC.id], saved: llmProvider({ available: false, chain: [SVC.id] }) } },
  { id: 'P9', name: 'Paused', when: 'stopped ∧ fatal', input: { ...base, config: llm, saved: llmProvider(), page: page({ state: 'stopped', requested: 8, done: 0, fatal: 'auth: User not found.' }) } },
  { id: 'P10', name: 'Chrome language pack downloading', when: 'chrome ∧ pack = downloading', input: { ...base, config: { ...config, provider: 'chrome-builtin' }, saved: provider({ providerId: 'chrome-builtin', available: false, fallback: { id: 'google-web' }, engine: { id: 'chrome-builtin' } }), pack: 'downloading' } },
  { id: 'P11', name: 'Image translation paused', when: 'images.fatal', input: { ...base, config: llm, saved: llmProvider(), session: llmProvider(), page: page({ state: 'on', requested: 20, done: 12 }, { running: { provider: SVC.id, target: 'cmn', engine: SVC.id, revision: 'r1' }, images: { total: 6, requested: 2, done: 0, failed: 0, fatal: 'auth: User not found.' } }) } },
  { id: 'P12', name: 'Narrow window shown stacked', when: 'mode !== preference', input: { ...base, session: provider(), page: page({ state: 'on', requested: 10, done: 10 }, { preference: 'side', mode: 'stack' }) } },
  { id: 'P13', name: 'Switched to a service that cannot run', when: 'on ∧ running.revision ≠ savedRevision ∧ !runnable', input: { ...base, savedRevision: 'r2', config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }), session: provider(), page: page({ state: 'on', requested: 31, done: 24 }) } },
  { id: 'P15', name: 'Prompt menu', when: 'llm ∧ menu = prompt', input: { ...base, config: llm, saved: llmProvider(), menu: 'prompt' } },
  { id: 'P16', name: 'Style menu', when: 'menu = style', input: { ...base, menu: 'style' } },
  { id: 'PE', name: 'An action failed', when: 'the last action threw (S-P-90)', input: base, error: 'Could not establish connection. Receiving end does not exist.' },
  // The two pages that are not the full text (§4.0b): the popup works there, and its entries open the paper's versions
  { id: 'P17', name: 'Abstract or PDF page', when: 'page === null ∧ entry.html', input: { ...base, page: null, entry: abs('2501.07202v1') } },
  { id: 'P17a', name: 'Abstract or PDF page, no HTML version', when: 'page === null ∧ entry.html === null', input: { ...base, page: null, entry: abs('hep-th/9711200', { html: null }) } },
  { id: 'P17b', name: 'Abstract or PDF page, service cannot run, no fallback', when: 'page === null ∧ entry.html ∧ !runnable ∧ !fallback', input: { ...base, page: null, config: { ...llmNoKey, fallback: { enabled: false } }, saved: llmProvider({ available: false, chain: ['openai-compat'] }), entry: abs('2501.07202v1') } },
  { id: 'P17c', name: 'Abstract or PDF page, service cannot run, a fallback available', when: 'page === null ∧ entry.html ∧ !runnable ∧ fallback', input: { ...base, page: null, config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }), entry: abs('2501.07202v1') } },
  { id: 'PR', name: 'The PDF reader open', when: 'page === null ∧ entry.readerOpen', input: { ...base, page: null, entry: abs('2501.07202v1', { kind: 'pdf', readerOpen: true }) } },
]
