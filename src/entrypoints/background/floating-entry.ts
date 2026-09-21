// The floating button's state under its own storage key, and its only writer (DESIGN §4.0c; shared/entry-settings.ts
// says why it is not in the configuration). Every write is a patch merged into what is stored **at that moment**, and
// the writes run one after another, so two tabs' drags, or a drag and the settings page's switch, cannot undo each
// other — and none of them can touch the configuration.
import { storage } from 'wxt/utils/storage'
import { createSerialQueue } from '@/core/scheduler/serial'
import { DEFAULT_FLOATING_ENTRY, type FloatingEntryState } from '@/shared/entry-settings'

const KEY = 'local:floatingEntry'

/** The whole value or the defaults, as the configuration is read: a half-believed value is nobody's choice */
const valid = (value: unknown): value is FloatingEntryState => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.enabled === 'boolean' && (v.side === 'left' || v.side === 'right')
    && typeof v.position === 'number' && v.position >= 0 && v.position <= 1 && typeof v.locked === 'boolean'
}

export async function getFloatingEntry(): Promise<FloatingEntryState> {
  const stored = await storage.getItem<unknown>(KEY).catch(() => null)
  return valid(stored) ? stored : DEFAULT_FLOATING_ENTRY
}

/** One after another (core/scheduler/serial.ts): each patch merges into what the one before it stored */
const writes = createSerialQueue()

/**
 * Merge a patch into the stored state. Resolves to whether it was saved and to the state that is stored now — the
 * new one, or on a failure the one still there, which is what the page then shows: a change that was not saved must
 * not look saved (Devin on #250)
 */
export function patchFloatingEntry(patch: Partial<FloatingEntryState>): Promise<{ saved: boolean; floating: FloatingEntryState }> {
  return writes(async () => {
    const before = await getFloatingEntry()
    const next = { ...before, ...patch }
    if (!valid(next)) return { saved: false, floating: before }
    try {
      await storage.setItem(KEY, next)
      return { saved: true, floating: next }
    } catch {
      return { saved: false, floating: before }
    }
  })
}
