// The connection test of a service the settings page would save (the redesign's design, §6.3): the endpoint's origin
// asked for — from the gesture that pressed Connect —, then one sample sentence translated through that endpoint alone:
// named, so that the chain's free fallback cannot answer for it (Codex on #59), and carried whole (`candidate`), so that
// a service not stored yet, or stored with another key, is the one asked. Nothing is stored here: the caller saves on
// success. Nor is an origin given back here: a caller connecting with an address no stored service uses holds its
// origin from before this call until the service is stored or the attempt is given up, then lets it go (ServiceForm,
// permissions.ts `holdOrigin`) — a give-back between the test and the save would leave the service stored without its
// permission (#299 F2c). The refused-key form's address is its stored service's own
import type { LangCode } from '@/config/languages'
import type { Service } from '@/config/services'
import type { ProviderErrorKind } from '@/providers/types'
import { wireFormatOfProvider } from '@/providers/wire-formats'
import { sendMessage } from '@/shared/messages'
import { O, reasonText } from '@/ui/strings'
import { PermissionError, ensureHostPermission } from './permissions'

/** The sample says whether the endpoint keeps our placeholders, so it is written in this service's wire format */
const SAMPLE_TAGS = 'Let <x id="1"/> be a <t id="2">connected</t> graph; see <x id="3"/>.'
const SAMPLE_MARKERS = 'Let @a# be a connected graph; see @b#.'

export type ServiceField = 'baseURL' | 'apiKey' | 'model'
export type ConnectResult = { ok: true; ms: number } | { ok: false; field: ServiceField | null; reason: string }

/** The field a failure points at: it takes the focus (§9) */
const FIELD_OF: Partial<Record<ProviderErrorKind, ServiceField>> = { auth: 'apiKey', 'no-key': 'apiKey', network: 'baseURL', timeout: 'baseURL', 'bad-request': 'model' }

export async function connectService(candidate: Service, target: LangCode): Promise<ConnectResult> {
  try {
    await ensureHostPermission(candidate.baseURL)
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
  return { ok: false, field: FIELD_OF[res.error.kind] ?? null, reason: O.services.failed(reasonText(res.error.kind) || res.error.message) }
}
