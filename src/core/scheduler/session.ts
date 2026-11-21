// A page session's id (DESIGN §4.3, §4.5): the scope the background binds a tab's requests to and withdraws them by,
// and the document's own id in the page's action epoch. A random UUID: unique however many are made at once, with no
// white space, and its first eight characters (the diagnostics' scope tag, `shared/diagnostics.ts`) tell sessions apart.
import { getRandomUUID } from '@/shared/uuid'

export function newSessionId(): string {
  return getRandomUUID()
}
