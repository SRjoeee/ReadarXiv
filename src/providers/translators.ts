// The chain's translators, from the saved configuration (DESIGN §8.5): the chosen service first, then, with the fallback
// on, the free engines in today's order (the built-in engine, then Google's), each only where it keeps the chosen
// service's wire format: the first choice decides the format of the session (one page, one wire), so Microsoft (markers
// only) is no fallback, and the built-in engine (tags only) none behind Microsoft. Whether a translator serves the
// target now is its own `supports`, asked by the chain at every call and bounded there: a language pack downloaded
// since joins without a rebuild, and a probe that never answers holds nothing.
import { chrome, type ChromeApi, type Fetch, google, type Lang, microsoft, type Translator } from '@readarxiv/translate'
import { LANG_CODES } from '@/config/languages'
import type { Config } from '@/config/schema'
import { serviceOf, type Service } from '@/config/services'
import type { WireFormat } from '@/core/protector/tokens'
import { LLM_LIMITS, llmTranslator } from './llm'
import { langOf, microsoftServes } from './targets'
import type { ProviderKind } from './types'

export { langOf } from './targets'
import { WIRE_FORMATS } from './wire-formats'

/** a configuration code by its BCP-47 tag (the LLM prompt names the language by the configuration's code) */
const codeOfLang = (lang: Lang, preferred: string): string =>
  langOf(preferred) === lang ? preferred : (LANG_CODES.find(code => langOf(code) === lang) ?? lang)

/** What answered a result, as the page and the popup name it: a service id and its kind */
export interface Answerer {
  id: string
  kind: ProviderKind
  model?: string
}

export interface Translators {
  /** in the chain's order */
  translators: Translator[]
  /** by translator identity */
  answerers: ReadonlyMap<string, Answerer>
  /** the chosen service's own translator, first of `translators` */
  primary: Answerer
  /** the session's wire, the chosen service's first (WIRE_FORMATS) */
  renderPath: WireFormat
  /** the chosen service's request size: what a page cuts its calls by */
  maxBatchChars: number
  maxBatchItems: number
}

export interface TranslatorDeps {
  fetch: Fetch
  /** the platform's built-in `Translator`, or null where this browser has none */
  chromeApi: ChromeApi | null
  /** a test's LLM translator in place of the endpoint's */
  llm?: (service: Service, config: Config, onStatus?: (status: number) => void) => Translator
  /** told every failed request's HTTP status of the reader's service (the connection test's) */
  onStatus?: (status: number) => void
}

type Engine = 'microsoft' | 'google-web' | 'chrome-builtin'

/** One of the reader's services, or a built-in engine, as a translator */
export function translatorOf(id: string, config: Config, deps: TranslatorDeps, service = serviceOf(config, id)): { translator: Translator; answerer: Answerer; formats: readonly WireFormat[] } {
  if (service) {
    const translator = deps.llm?.(service, config, deps.onStatus) ?? llmTranslator(service, { prompts: config.prompts, codeOf: lang => codeOfLang(lang, config.targetLanguage), ...(deps.onStatus ? { onStatus: deps.onStatus } : {}) })
    return { translator, answerer: { id: service.id, kind: 'llm', model: service.model }, formats: WIRE_FORMATS['openai-compat'] }
  }
  // the shipped default, and where a deleted service's id lands
  const engine: Engine = id === 'google-web' || id === 'chrome-builtin' ? id : 'microsoft'
  if (engine === 'google-web') return { translator: google({ fetch: deps.fetch }), answerer: { id: engine, kind: 'mt' }, formats: WIRE_FORMATS[engine] }
  if (engine === 'chrome-builtin') return { translator: chrome({ api: deps.chromeApi }), answerer: { id: engine, kind: 'builtin' }, formats: WIRE_FORMATS[engine] }
  const ms = microsoft({ fetch: deps.fetch })
  const translator: Translator = microsoftServes(config.targetLanguage) ? ms : { ...ms, supports: async () => false }
  return { translator, answerer: { id: engine, kind: 'mt' }, formats: WIRE_FORMATS[engine] }
}

/** The free engines of the fallback, by priority: the built-in engine first (offline, under no rate limit), then Google's */
const FREE: readonly Engine[] = ['chrome-builtin', 'google-web']

export function translatorsOf(config: Config, deps: TranslatorDeps): Translators {
  const first = translatorOf(config.provider, config, deps)
  const renderPath = first.formats[0] ?? 'tags'
  const translators = [first.translator]
  const answerers = new Map<string, Answerer>([[first.translator.identity, first.answerer]])
  if (config.fallback.enabled) {
    for (const id of FREE) {
      if (id === first.answerer.id) continue
      const next = translatorOf(id, config, deps)
      if (!next.formats.includes(renderPath)) continue
      translators.push(next.translator)
      answerers.set(next.translator.identity, next.answerer)
    }
  }
  return {
    translators,
    answerers,
    primary: first.answerer,
    renderPath,
    maxBatchChars: first.answerer.kind === 'llm' ? LLM_LIMITS.chars : first.translator.limits.chars,
    maxBatchItems: first.answerer.kind === 'llm' ? LLM_LIMITS.units : first.translator.limits.units,
  }
}
