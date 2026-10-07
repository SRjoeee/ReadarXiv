// Which host permissions the reader's services need, decided in one place (DESIGN §9, the configuration). A service's
// endpoint is not in the manifest, so its origin is asked for on the settings page and must be given back once no service
// uses it — otherwise the granted list grows with every edit (Codex on #6). Giving one back is irreversible for the
// page that needed it, so what "needed" means is one rule, here, over everything that may still use an origin: the
// stored services, and the origins a page holds — a form asking for one or connecting with it, a deletion whose undo is
// open (`originHold`) — plus whatever the caller knows to be in use (the background adds the chains still serving
// sessions). The rule's one caller is the background's keeper (entrypoints/background/origin-keeper.ts); the pages hold
// and ask. Pure: no browser, no storage — the caller reads the grants, the holds and the settings and passes them in.
import type { Config } from './schema'

/** A match pattern's parts, as Chrome reads one: the path never matters to a host permission */
interface Pattern {
  scheme: string
  host: string
  /** '' for no port named: any port, for a pattern; the scheme's default, for an address */
  port: string
}

const PATTERN = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*:[\]]+|\[[0-9a-f:.]+\])(?::(\d+|\*))?(\/.*)$/i

function parsePattern(pattern: string): Pattern | null {
  if (pattern === '<all_urls>') return { scheme: '*', host: '*', port: '' }
  const m = PATTERN.exec(pattern)
  return m ? { scheme: m[1]!.toLowerCase(), host: m[2]!.toLowerCase(), port: m[3] === '*' ? '' : (m[3] ?? '') } : null
}

/** Whether a grant in `broad` covers the origin `exact` — a host permission without a port covers every port */
function covers(broad: Pattern, exact: Pattern): boolean {
  const scheme = broad.scheme === '*' ? exact.scheme === 'http' || exact.scheme === 'https' : broad.scheme === exact.scheme
  const host = broad.host === '*' || broad.host === exact.host || (broad.host.startsWith('*.') && (exact.host === broad.host.slice(2) || exact.host.endsWith(broad.host.slice(1))))
  return scheme && host && (broad.port === '' || broad.port === exact.port)
}

/**
 * The pattern the extension asks for an address by — `https://host[:port]/*`, the port only when it is not the scheme's
 * default — or null for anything it never asks for: no address, another scheme. An address given as that pattern names
 * itself
 */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.host.includes('*')) return null
    return `${u.origin}/*`
  } catch {
    return null
  }
}

/** A grant the extension could have asked for itself: one origin, no wildcard, the whole of it */
function exactOrigin(pattern: string): Pattern | null {
  const parsed = parsePattern(pattern)
  return parsed && parsed.scheme !== '*' && !parsed.host.includes('*') && originOf(pattern) === pattern ? parsed : null
}

/**
 * The origins the services need: every stored service's, and every one `pending` names — the origins held by a page or
 * known in use otherwise, as addresses or as patterns. One pattern per origin
 */
export function originsNeeded(config: Pick<Config, 'services'>, pending: readonly string[] = []): Set<string> {
  const needed = new Set<string>()
  for (const url of [...config.services.map(s => s.baseURL), ...pending]) {
    const origin = originOf(url)
    if (origin) needed.add(origin)
  }
  return needed
}

/** The hosts the manifest itself grants, read from the manifest as the browser has it: never the extension's to give back */
export function manifestOrigins(manifest: { host_permissions?: readonly string[]; content_scripts?: readonly { matches?: readonly string[] }[] }): string[] {
  return [...(manifest.host_permissions ?? []), ...(manifest.content_scripts ?? []).flatMap(script => script.matches ?? [])]
}

/**
 * Which of the granted origins go back: those the extension asked for (one origin, no wildcard) that no needed origin
 * falls under and that the manifest does not grant. **None while the stored settings cannot be read**: that read
 * answers with the defaults, which say nothing of the addresses stored, and a permission kept a while is the safer
 * failure than one taken from a service still stored (#299 row 120). A grant in another shape — every site, a
 * wildcard — was the reader's own, given in the browser, and is left alone. Each origin once, in the order granted
 */
export function reconcileOrigins(o: { granted: readonly string[]; needed: Set<string>; settingsReadable: boolean; manifest: Iterable<string> }): { remove: string[] } {
  if (!o.settingsReadable) return { remove: [] }
  const fixed = [...o.manifest].map(parsePattern).filter((p): p is Pattern => p !== null)
  const needed = [...o.needed].map(exactOrigin).filter((p): p is Pattern => p !== null)
  const remove: string[] = []
  for (const granted of new Set(o.granted)) {
    const own = exactOrigin(granted)
    if (!own) continue
    // the manifest's own, or under one of its patterns: Chrome refuses to remove a required host, and it is not ours
    if (fixed.some(p => covers(p, own))) continue
    // a grant without a port covers a service on any port of its host
    if (needed.some(n => covers(own, n))) continue
    remove.push(granted)
  }
  return { remove }
}

/** The Web Locks name a page holds an origin under (one lock manager for every context of the extension) */
const HOLD = 'axt-origin'

/**
 * The name of a hold on the origin of `url`, carrying the service whose deletion is still undoable when there is one
 * — the background then leaves that service's sessions where they are (origin-keeper.ts). Null for an address with no origin
 */
export function originHold(url: string, service?: string): string | null {
  const origin = originOf(url)
  return origin ? `${HOLD} ${origin}${service ? ` ${service}` : ''}` : null
}

/** A hold's name read back; null for any other lock */
export function readHold(name: string): { origin: string; service?: string } | null {
  const [prefix, origin, service, ...rest] = name.split(' ')
  if (prefix !== HOLD || !origin || rest.length > 0 || exactOrigin(origin) === null) return null
  return service ? { origin, service } : { origin }
}
