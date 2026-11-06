// @readarxiv/translate: the translator contract, its adapters and the chain that falls back between them
// (interfaces/translate/DECISION.md). A host makes one chain, `chainOf(ports)`, and translates through it; a row is keyed
// by `identityOf(translators)` besides unit id and target.

/** What `@readarxiv/translate` is for: the translator contract, its adapters and the chain that falls back between them */
export const TRANSLATE_PURPOSE =
  'the translator contract, its adapters and the chain that falls back between them' as const

export { ACCEPT_DIGEST, accept, asOut, projectionOf, type Refusal, validSentences } from './accept.ts'
export { chainOf, identityOf, keyOf, realClock } from './chain.ts'
export {
  type Chain,
  type Clock,
  type ElKind,
  Fault,
  type FaultCode,
  type Fetch,
  type FetchInit,
  type FetchReply,
  type Gate,
  type Lang,
  type Limits,
  type Note,
  type OutPiece,
  type PaperContext,
  type Piece,
  type Ports,
  type Remedy,
  type Result,
  type Sentences,
  type Signal,
  type SpanStyle,
  type Store,
  type TranslateOptions,
  type Translator,
  type UnconfiguredCode,
  type UnitIn,
  type Why,
} from './contract.ts'
export { type ChromeApi, type ChromeOptions, type ChromeSession, chrome } from './adapters/chrome.ts'
export { type GoogleOptions, google } from './adapters/google.ts'
export { type MicrosoftOptions, microsoft } from './adapters/microsoft.ts'
