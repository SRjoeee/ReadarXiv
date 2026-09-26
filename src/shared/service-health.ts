// The service health record (the redesign's design, §4): the reader's services whose key the endpoint refused. Not
// configuration — a fact the extension observed, not a choice — so a configuration that cannot be read never takes it
// with it. Written by the background when a request ends in `auth`, cleared by a connection that succeeds, a key
// update or the service's deletion; read by the background's chain, the popup and the settings page. It carries the id
// and when, nothing of the request, and never a key (hard rule 5)
import { storage } from 'wxt/utils/storage'

type Record_ = Record<string, { rejected: number }>
const item = storage.defineItem<Record_>('local:serviceHealth', { fallback: {} })

export async function rejectedServices(): Promise<Set<string>> {
  return new Set(Object.keys(await item.getValue()))
}

export async function markRejected(id: string): Promise<void> {
  const now = await item.getValue()
  if (now[id]) return
  await item.setValue({ ...now, [id]: { rejected: Date.now() } })
}

/** Says whether a mark was there to clear */
export async function clearRejected(id: string): Promise<boolean> {
  const now = await item.getValue()
  if (!now[id]) return false
  const { [id]: _gone, ...rest } = now
  await item.setValue(rest)
  return true
}

export function watchRejected(callback: (ids: Set<string>) => void): () => void {
  return item.watch(value => callback(new Set(Object.keys(value ?? {}))))
}
