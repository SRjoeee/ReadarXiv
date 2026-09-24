// Configuration storage: WXT's storage item with versioned migrations + zod validation on read and write (after Read Frog's config/storage.ts).
// The migrations are the only way the stored shape changes (DESIGN §9). A migration's parameter type is meant to describe the version it
// came from; the older ones lean on `Omit<Config, …>` and so inherit fields added later — left as they are, the v13 → v14 one is exact.
import { storage } from 'wxt/utils/storage'
import { DEFAULT_PRELOAD } from '@/core/scheduler/lazy'
import { DEFAULT_PROMPTS_CONFIG } from '@/providers/prompt-library'
import { fromBcp47 } from './languages'
import { type Appearance, BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES, DEFAULT_APPEARANCE, type StyleProfile, newProfileId } from './appearance'
import { CONFIG_VERSION, DEFAULT_CONFIG, DEFAULT_PDF_READER, MODE_VALUES, configSchema, normalizeGlossary, type Config } from './schema'
import { defaultServiceName, newServiceId } from './services'

const CONFIG_KEY = 'local:config'

export const configItem = storage.defineItem<Config>(CONFIG_KEY, {
  fallback: DEFAULT_CONFIG,
  version: CONFIG_VERSION,
  migrations: {
    // v1 -> v2: the prompt library added; the stored API key and the other fields kept as they were
    2: (v1: Omit<Config, 'version' | 'prompts' | 'preload'>) => ({ ...v1, version: 2 as const, prompts: DEFAULT_PROMPTS_CONFIG }),
    // v2 -> v3: the viewport translation range added (§10)
    3: (v2: Omit<Config, 'version' | 'preload' | 'targetLanguage'> & { version: 2; targetLanguage: string }) => ({ ...v2, version: 3 as const, preload: { ...DEFAULT_PRELOAD } }),
    // v3 -> v4: the target language from BCP-47 to ISO 639-3 (zh-CN → cmn, zh-TW → cmn-Hant, ja → jpn)
    4: (v3: Omit<Config, 'version' | 'targetLanguage' | 'fallback'> & { version: 3; targetLanguage: string }) => ({ ...v3, version: 4 as const, targetLanguage: fromBcp47(v3.targetLanguage) }),
    // v4 -> v5: the engine fallback chain added, on by default (hard rule 3: a failure must be recoverable and never take the extension down)
    5: (v4: Omit<Config, 'version' | 'fallback' | 'glossary'> & { version: 4 }) => ({ ...v4, version: 5 as const, fallback: { enabled: true } }),
    // v5 -> v6: the glossary added, empty by default (an empty glossary enters neither the prompt nor the cache key, so the behaviour is as before)
    6: (v5: Omit<Config, 'version' | 'glossary' | 'style'> & { version: 5 }) => ({ ...v5, version: 6 as const, glossary: [] }),
    // v6 -> v7: the translation style added (default none, the appearance as before the feature), and the old glossary
    // tidied into the limits v7 added — untidied, one over-long term would fail the whole configuration's validation and fall back to the defaults (Codex on #52)
    7: (v6: Omit<Config, 'version' | 'style' | 'image'> & { version: 6 }) => ({
      ...v6,
      version: 7 as const,
      glossary: normalizeGlossary(v6.glossary),
      style: { preset: 'none' as const, customCss: '' },
    }),
    // v7 -> v8: the image translation's mode gate added (§15), all three modes on by default
    8: (v7: Omit<Config, 'version' | 'image'> & { version: 7 }) => ({ ...v7, version: 8 as const, image: { modes: [...MODE_VALUES] } }),
    // v8 -> v9: three tunable parameters on the translation style (§7.5). The defaults must leave the appearance pixel for
    // pixel as before: an empty colour = follow the original, opacity 1 = opaque, an empty accent = each preset's own default
    // The shape is the one v9 stored, spelled out here: `Config` has moved on (v12 dropped `style`)
    // and a migration must keep describing the version it came from
    9: (v8: Omit<Config, 'version' | 'services' | 'appearance'> & { version: 8; style: { preset: string; customCss: string } }) =>
      ({ ...v8, version: 9 as const, style: { ...v8.style, color: '', opacity: 1, accent: '' } }),
    // v9 -> v10: the `provider` enum gains 'microsoft'. **Not one field changed; the bump is for downgrades** — unbumped,
    // a reader who stored microsoft and reinstalled an older build keeps version 9, the `version > CONFIG_VERSION` guard
    // below does not fire, zod fails on the enum, and the whole configuration is **silently reset to the defaults**, every
    // setting lost; at 10 the older build reports plainly “the stored configuration is v10, this extension supports up to v9” (Codex on #115)
    10: (v9: Omit<Config, 'version'> & { version: 9 }) => ({ ...v9, version: 10 as const }),
    // v10 -> v11: the image switch the popup shows (`image.enabled`). Derived from what the reader
    // had: any mode ticked means it was on, an empty list means it was off
    11: (v10: Omit<Config, 'version' | 'image'> & { version: 10; image: { modes: Config['image']['modes'] } }) =>
      ({ ...v10, version: 11 as const, image: { enabled: v10.image.modes.length > 0, modes: v10.image.modes } }),
    // v11 -> v12: user-added services replace the single endpoint; appearance profiles replace the
    // preset. Total: every v11 value maps somewhere, so nothing falls back to defaults
    12: (v11: Omit<Config, 'version' | 'services' | 'appearance'> & { version: 11; openaiCompat: V11Endpoint; style: V11Style }) => {
      const { openaiCompat, style, ...rest } = v11
      const edited = openaiCompat.apiKey !== '' || openaiCompat.baseURL !== 'https://openrouter.ai/api/v1' || openaiCompat.model !== 'deepseek/deepseek-v4-flash'
      const wasLlm = v11.provider === 'openai-compat'
      const services = wasLlm || edited
        ? [{ id: newServiceId(), kind: 'openai-compat' as const, name: defaultServiceName(openaiCompat.model), baseURL: openaiCompat.baseURL, apiKey: openaiCompat.apiKey, model: openaiCompat.model, thinking: openaiCompat.thinking ?? 'disabled' }]
        : []
      const provider = wasLlm ? services[0]!.id : v11.provider
      return { ...rest, version: 12 as const, provider, services, appearance: migrateStyle(style) }
    },
    // v13: the interface's own language. `auto` is what every existing reader had in effect
    13: (v12: Omit<Config, 'version' | 'uiLanguage'> & { version: 12 }) => ({ ...v12, version: 13 as const, uiLanguage: 'auto' }),
    // v13 -> v14: nothing new to the reader. `reading` had come in by a schema default alone (7c02d83), so a value
    // migrated to 13 and never saved since has none; DESIGN §9 ends evolution by default — the version says what is
    // stored — and v14 writes the field every such reader had in effect. Only an **absent** field: `null` or any other
    // wrong value is a hand edit and fails validation, named, as before. The value itself may be anything a hand edit
    // left at version 13 — `null` included — and a migration must not throw on it: what it builds fails the schema
    // and takes the documented fallback (Copilot on #209, twice)
    14: (v13: (Omit<Config, 'version' | 'reading'> & { version: 13; reading?: Config['reading'] }) | null) =>
      ({ ...v13, version: 14 as const, reading: v13?.reading === undefined ? { sentenceHighlight: true } : v13.reading }),
    // v14 -> v15: the preload margin may be `all` (the whole paper at once), and the half-screen stop is gone from the
    // settings page (the owner, 2026-09-17). A margin below one screen was that stop; it becomes one screen, the
    // nearest stop that remains, rather than a value the page would show as one screen and run as half. Any other
    // value stays. A hand-edited value of the wrong type is left for the schema to name, as before
    15: (v14: (Omit<Config, 'version' | 'preload'> & { version: 14; preload?: unknown }) | null) => {
      const preload = v14?.preload as { margin?: unknown; threshold?: unknown } | undefined
      const margin = typeof preload?.margin === 'number' && preload.margin < 900 ? 900 : preload?.margin
      return { ...v14, version: 15 as const, preload: { ...preload, margin } }
    },
    // v15 -> v16: where a translation asked for from an abstract or PDF page opens. Everyone gets the new default, a
    // new tab: before this the entry navigated the tab, which took the reader's page away, and nobody chose that.
    // **A `reading` that is not an object is passed through untouched**, as every migration here does: repairing a
    // hand-edited value would hide it, and the documented fallback names the field instead (Copilot on #209)
    16: (v15: (Omit<Config, 'version' | 'reading'> & { version: 15; reading?: unknown }) | null) => {
      const reading = v15?.reading
      const filled = reading !== null && typeof reading === 'object' && !Array.isArray(reading)
        ? { ...(reading as Record<string, unknown>), openIn: 'new-tab' as const }
        : reading
      return { ...v15, version: 16 as const, reading: filled }
    },
    // v16 -> v17: the floating button's state, inside the configuration. Test builds of 0.4.1 stored this shape
    17: (v16: (Omit<Config, 'version'> & { version: 16 }) | null) =>
      ({ ...v16, version: 17 as const, floatingEntry: { enabled: true, side: 'right' as const, position: 0.66, locked: false } }),
    // v17 -> v18: and out of it again, before any release: it is written by a drag, from any tab, and a whole-object
    // write from one more context could put back a snapshot older than another context's save (Devin on #250). It
    // lives under its own key with one writer (background/floating-entry.ts); where a test build had dragged it to
    // is not carried over — a button back in its default place is no loss
    18: (v17: (Omit<Config, 'version'> & { version: 17; floatingEntry?: unknown }) | null) => {
      if (typeof v17 !== 'object' || v17 === null) return v17
      const { floatingEntry: _moved, ...rest } = v17
      return { ...rest, version: 18 as const }
    },
    // v18 -> v19: the PDF reader's settings (the reader's design, §9.1), with their defaults: until now it kept its own
    // under another key, never released, which is not carried over
    19: (v18: (Omit<Config, 'version' | 'pdfReader'> & { version: 18 }) | null) =>
      typeof v18 !== 'object' || v18 === null ? v18 : { ...v18, version: 19 as const, pdfReader: { ...DEFAULT_PDF_READER } },
  },
})

interface V11Endpoint { baseURL: string; apiKey: string; model: string; thinking?: 'enabled' | 'disabled' }
interface V11Style { preset: string; customCss: string; color: string; opacity: number; accent: string }

/**
 * v11 `style` → the profile lists (DESIGN §9). An underline preset becomes a copy of “Same as the original” with
 * that underline; `custom` keeps its declarations; the removed effects keep their colour on the
 * follow-original profile; an accent colour becomes the reader's own band profile
 */
function migrateStyle(style: V11Style): Appearance {
  const a: Appearance = { ...DEFAULT_APPEARANCE, styles: [...BUILT_IN_STYLES], highlights: [...BUILT_IN_HIGHLIGHTS] }
  const underline: Record<string, { underline: StyleProfile['underline']; thickness: 1 | 2 }> = {
    underline: { underline: 'solid', thickness: 1 }, dotted: { underline: 'dotted', thickness: 1 }, dashed: { underline: 'dashed', thickness: 1 },
    'dashed-bold': { underline: 'dashed', thickness: 2 }, wavy: { underline: 'wavy', thickness: 1 }, 'wavy-bold': { underline: 'wavy', thickness: 2 },
  }
  const vars = { color: style.color, opacity: style.opacity }
  const own = (name: string, over: Partial<StyleProfile>): string => {
    const id = newProfileId('style')
    a.styles = [...a.styles, { ...BUILT_IN_STYLES[0]!, ...vars, ...over, id, name }]
    return id
  }
  const kept = underline[style.preset]
  if (kept) a.activeStyle = own('下划线', kept)
  else if (style.preset === 'custom') a.activeStyle = own('自定义', { css: style.customCss })
  else if (style.preset === 'blur' || style.preset === 'green' || style.preset === 'muted') {
    a.activeStyle = style.preset
    a.styles = a.styles.map(s => (s.id === style.preset ? { ...s, ...(style.color ? { color: style.color } : {}), opacity: style.opacity } : s))
  } else {
    a.activeStyle = 'follow'
    a.styles = a.styles.map(s => (s.id === 'follow' ? { ...s, ...vars } : s))
  }
  if (style.accent) {
    const id = newProfileId('hl')
    a.highlights = [...a.highlights, { id, name: '自定义', color: style.accent, opacity: 0.22 }]
    a.activeHighlight = id
  }
  return a
}

/**
 * Why the latest `getConfig()` fell back; `null` when the configuration is fine.
 * Each execution context (popup / content / background) keeps the result of its own call — they share no memory,
 * and the popup calls `getConfig()` itself anyway, so reading this variable gives exactly its own conclusion
 */
let fallbackReason: FallbackReason | null = null

/**
 * For the UI: did the configuration fall back to the defaults. On a fallback the reader's API key, engine and mode
 * are all out of effect, and the reader must see it. **The material for the explanation, not a sentence**: the sentence is written in the interface language, and this layer knows no locale pack (Codex on #161)
 */
export function configFallbackReason(): FallbackReason | null {
  return fallbackReason
}

/**
 * `tooNew`: the stored version is newer than this extension. `upgradeFailed`: older, so a migration should have
 * carried it here and did not — WXT runs every step before it writes anything, so a step that threw left the value as
 * it was (a later build that fixes the step may still read it; a reset replaces it). `invalid`: the structure fails
 * the schema, `where` being the failing field
 */
export type FallbackReason =
  | { kind: 'tooNew'; stored: number; supported: number }
  | { kind: 'upgradeFailed'; stored: number; supported: number }
  | { kind: 'invalid'; where: string; message: string }
  | { kind: 'unknown' }

/**
 * Say why it fell back. Two known causes:
 * (1) the stored version is newer than this extension — an older build installed, and WXT refuses a downgrade migration (measured: a v7 configuration + a v6 extension);
 * (2) the structure fails the schema — edited by hand and broken, or a field over its limit
 */
function describeFallback(stored: unknown, issues: readonly { path: PropertyKey[]; message: string }[]): FallbackReason {
  const version = (stored as { version?: unknown } | null)?.version
  if (typeof version === 'number' && version > CONFIG_VERSION) {
    return { kind: 'tooNew', stored: version, supported: CONFIG_VERSION }
  }
  if (typeof version === 'number' && version < CONFIG_VERSION) {
    return { kind: 'upgradeFailed', stored: version, supported: CONFIG_VERSION }
  }
  const issue = issues[0]
  if (!issue) return { kind: 'unknown' }
  return { kind: 'invalid', where: issue.path.map(String).join('.'), message: issue.message }
}

/**
 * A stored value failing the schema (a failed upgrade, a hand edit gone wrong) falls back to the defaults rather than
 * taking the extension down. **The fallback cannot be silent**: the reader's key is stored yet out of effect, the
 * translation quietly degrades to a free engine, and with no clue in the interface nobody would find out (met 2026-09-06: a v7 configuration + a v6 build)
 */
export async function getConfig(): Promise<Config> {
  const stored = await configItem.getValue()
  const parsed = configSchema.safeParse(stored)
  if (parsed.success) {
    fallbackReason = null
    return parsed.data
  }
  fallbackReason = describeFallback(stored, parsed.error.issues)
  // The cause and the failing field's path only: a validation message is not ours to vouch for, and the log never holds a stored value (hard rule 5)
  console.warn(`[axt] the stored configuration cannot be read, defaults in use: ${fallbackReason.kind}${fallbackReason.kind === 'invalid' ? ` at ${fallbackReason.where}` : ''}${'stored' in fallbackReason ? ` (v${fallbackReason.stored}, this build v${fallbackReason.supported})` : ''}`)
  return DEFAULT_CONFIG
}

/** The refusal's `name`, a string of its own: it crosses the message boundary (shared/messages.ts `failure`), and a class's own name does not survive minification */
export const CONFIG_UNREADABLE = 'ConfigUnreadableError'

/** Thrown by `setConfig` while the stored value cannot be read: the write was refused and storage is as it was */
export class ConfigUnreadableError extends Error {
  constructor(readonly reason: FallbackReason) {
    super('the stored settings cannot be read, so nothing was saved')
    this.name = CONFIG_UNREADABLE
  }
}

/**
 * The one gate every write passes. **A stored value this build cannot read is never written over**: every writer
 * reads, patches and writes, and what it read was `DEFAULT_CONFIG` — one mode switch in the popup would replace the
 * reader's services and API keys with the defaults. A newer build's configuration is valid for that build, and a
 * broken one may be recoverable; the only way past is `resetConfig()`, which the reader chooses knowing what goes
 */
export async function setConfig(config: Config): Promise<void> {
  const next = configSchema.parse(config)
  const stored = await configItem.getValue()
  const readable = configSchema.safeParse(stored)
  if (!readable.success) {
    fallbackReason = describeFallback(stored, readable.error.issues)
    throw new ConfigUnreadableError(fallbackReason)
  }
  await configItem.setValue(next)
}

/**
 * The reader's explicit way out of an unreadable configuration (S-O-02): the stored value is replaced by the defaults.
 * **The value and WXT's version marker go in one write**, the way WXT's own migration writes them (one
 * `storage.local.set` of both keys; the marker lives at the item's key + `$`). `setValue` would not do: it writes the
 * marker only for an item that was empty, so a reset after `tooNew` would leave a v(N+1) marker beside a vN value and
 * the real upgrade to N+1 would skip its migration. Two writes would not do either: cut short between them, a vN
 * marker beside the newer build's value would make that build migrate a value already migrated (Devin on #228)
 */
export async function resetConfig(): Promise<void> {
  await storage.setItems([
    { key: CONFIG_KEY, value: DEFAULT_CONFIG },
    { key: `${CONFIG_KEY}$`, value: { v: CONFIG_VERSION } },
  ])
  fallbackReason = null
}

/**
 * A new reader's first target language (first-target.ts), written **only while nothing is stored**: an installation
 * that already has a configuration — the reader's own, or one this build cannot read — is never touched. The value and
 * the version marker go in one write, as in `resetConfig`. Says whether it wrote.
 *
 * The check and the write are two steps, and extension storage has no "create unless there" to make them one: a
 * surface saving between them would be written over (Devin on #272). Left so, knowingly — the gap is one read and one
 * write at the moment of installation, before any surface of ours can be open, and closing it for good is the
 * background's single writer that §9 defers
 */
export async function chooseFirstTarget(pick: () => Config['targetLanguage']): Promise<boolean> {
  if (await storage.getItem(CONFIG_KEY) !== null) return false
  await storage.setItems([
    { key: CONFIG_KEY, value: configSchema.parse({ ...DEFAULT_CONFIG, targetLanguage: pick() }) },
    { key: `${CONFIG_KEY}$`, value: { v: CONFIG_VERSION } },
  ])
  return true
}

export function watchConfig(callback: (config: Config) => void) {
  return configItem.watch(value => {
    const parsed = configSchema.safeParse(value)
    if (parsed.success) callback(parsed.data)
  })
}
