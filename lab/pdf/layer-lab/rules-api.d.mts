// rules-api.mjs's types: the layer lab's rules routes
import type { IncomingMessage, ServerResponse } from 'node:http'
import type * as RulesModule from '../../../src/pdf-reader/engine/rules/layout.mjs'
import type { RuleChange } from './rules-model.mjs'

/** the rule set's file, from the repository's root */
export declare const RULES_PATH: string
/** what a save answers with */
export interface SaveAnswer { ok: true; version: number; sha256: string; bytes: number; changed: RuleChange[] }
export interface RulesApiOptions {
  /** the repository holding the file */
  root: string
  /** the lab's own origin (a function: the port is known once the server listens) */
  origin: () => string
  /** the engine's rules module */
  rules: Pick<typeof RulesModule, 'readRules' | 'writeRules' | 'RulesRefusal' | 'RULES_CAP'>
  /** the web's rules route by environment; none given, none asked */
  published?: { staging?: string | null; production?: string | null }
  fetch?: typeof fetch
}
export declare function createRulesApi(o: RulesApiOptions): {
  /** answers a request for one of the lab's rules routes and says it did (true), or leaves it (false) */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>
}
