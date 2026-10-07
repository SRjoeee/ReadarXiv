// The connection test of a service the settings page would save (the redesign's design, §6.3): the endpoint's origin
// asked for — from the gesture that pressed Connect —, then one sample sentence translated through that endpoint alone:
// named, so that the chain's free fallback cannot answer for it (Codex on #59), and carried whole (`candidate`), so that
// a service not stored yet, or stored with another key, is the one asked. Nothing is stored here: the caller saves on
// success. An origin this attempt granted is given back when it fails — nothing was stored that uses it
import type { LangCode } from '@/config/languages'
import type { Service } from '@/config/services'
import { getConfig } from '@/config/storage'
import type { ProviderErrorKind } from '@/providers/types'
import { wireFormatOfProvider } from '@/providers/wire-formats'
import { sendMessage } from '@/shared/messages'
import { O, reasonText } from '@/ui/strings'
import { PermissionError, ensureHostPermission, releaseHostPermission } from './permissions'

/** The sample says whether the endpoint keeps our placeholders, so it is written in this service's wire format */
const SAMPLE_TAGS = 'Let <x id="1"/> be a <t id="2">connected</t> graph; see <x id="3"/>.'
const SAMPLE_MARKERS = 'Let @a# be a connected graph; see @b#.'

export type ServiceField = 'baseURL' | 'apiKey' | 'model'
export type ConnectResult = { ok: true; ms: number } | { ok: false; field: ServiceField | null; reason: string }

/** The field a failure points at: it takes the focus (§9) */
const FIELD_OF: Partial<Record<ProviderErrorKind, ServiceField>> = { auth: 'apiKey', 'no-key': 'apiKey', network: 'baseURL', timeout: 'baseURL', 'bad-request': 'model' }

export async function connectService(candidate: Service, target: LangCode): Promise<ConnectResult> {
  let granted: boolean
  try {
    granted = await ensureHostPermission(candidate.baseURL)
  } catch (e) {
    // the permission request only says which kind; the sentence is the pack's (Codex on #161)
    return { ok: false, field: 'baseURL', reason: e instanceof PermissionError && e.kind === 'denied' ? O.services.permission.denied(e.origin ?? '') : O.services.permission.badURL }
  }
  const t0 = performance.now()
  const res = await sendMessage({
    type: 'axt:translate',
    providerId: candidate.id,
    candidate,
    request: { segments: [{ id: 'sample', text: wireFormatOfProvider(candidate.id) === 'markers' ? SAMPLE_MARKERS : SAMPLE_TAGS }], source: 'en', target, context: { sectionTitle: O.services.connect } },
  }).catch((e: unknown) => ({ ok: false as const, error: { kind: 'unknown' as const, message: e instanceof Error ? e.message : String(e), isolatable: false } }))
  if (res.ok) return { ok: true, ms: Math.round(performance.now() - t0) }
  if (granted) await getConfig().then(c => releaseHostPermission(candidate.baseURL, c.services.map(s => s.baseURL))).catch(() => undefined)
  return { ok: false, field: FIELD_OF[res.error.kind] ?? null, reason: O.services.failed(reasonText(res.error.kind) || res.error.message) }
}
