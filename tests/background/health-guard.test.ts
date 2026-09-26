import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { shouldMarkRefusal } from '@/entrypoints/background/health-guard'

// Whether a chain's `auth` failure should mark the service health record (finding 2, Task 13): an old chain's request
// failing after the reader has already replaced a bad key must not re-mark the new one.
const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-old', model: 'x/y', thinking: 'disabled' as const }
const configWith = (apiKey: string) => ({ ...DEFAULT_CONFIG, services: [{ ...SVC, apiKey }] })

describe('shouldMarkRefusal', () => {
  it('marks when the failing chain\'s key is still the service\'s key stored now', () => {
    expect(shouldMarkRefusal(configWith('sk-old'), configWith('sk-old'), SVC.id)).toBe(true)
  })

  it('does not mark when the key has since changed: the failure is the old key\'s, not the one in force', () => {
    expect(shouldMarkRefusal(configWith('sk-old'), configWith('sk-new'), SVC.id)).toBe(false)
  })

  it('does not mark a service since deleted', () => {
    expect(shouldMarkRefusal(configWith('sk-old'), { ...DEFAULT_CONFIG, services: [] }, SVC.id)).toBe(false)
  })

  it('does not mark a free engine\'s id: it is nobody\'s service', () => {
    expect(shouldMarkRefusal(configWith('sk-old'), configWith('sk-old'), 'microsoft')).toBe(false)
  })
})
