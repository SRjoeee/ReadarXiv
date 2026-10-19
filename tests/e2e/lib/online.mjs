// The e2e scripts that go online: those that reach arXiv, a translation engine or our server through the real network rather
// than a route table or a server on this machine. Each one runs only when asked to (AXT_E2E_ONLINE=1), under the project's
// User-Agent on every page and request, and never against our production server: a run goes to staging or to a server on
// this machine. An online script calls goOnline() right after its imports (no browser starts without the opt-in), and
// launches every browser context through online(), which refuses an extension whose reader talks to production.
// tests/e2e/lib/online.test.ts holds the list of them and checks both.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** the opt-in: an online script runs only where this is set to 1 */
export const ONLINE = 'AXT_E2E_ONLINE'
/** what every online page and request says it is: the project, never Playwright's own browser string */
export const PROJECT_UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
/** our server's production hosts, which no e2e run may reach; and staging's, where a run goes instead */
export const PRODUCTION_HOSTS = Object.freeze(['readarxiv.com', 'www.readarxiv.com'])
export const PRODUCTION_API = 'https://readarxiv.com'
export const STAGING_API = 'https://app-staging.readarxiv.org'

/** `url`, where it is not our production server; an error naming it where it is */
export function refuseProduction(url) {
  const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  if (PRODUCTION_HOSTS.includes(host)) throw new Error(`${url} is Read arXiv's production server: an e2e run goes to staging (${STAGING_API}) or to a server on this machine`)
  return url
}

/** the reader's server the build at `build` talks to (wxt.config.ts READER_API): staging's where its manifest grants staging
 *  (pnpm build:staging, a development build), production's else; null where there is no build there */
export function readerServerOf(build) {
  const file = join(build, 'manifest.json')
  if (!existsSync(file)) return null
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  return (manifest.host_permissions ?? []).includes(`${STAGING_API}/*`) ? STAGING_API : PRODUCTION_API
}

/** an online script's first call (`name`: its package script, or its file): without AXT_E2E_ONLINE=1 it says, on one line,
 *  how to opt in and exits (2: not run) before any browser starts */
export function goOnline(name, { env = process.env, exit = code => process.exit(code), log = line => console.error(line) } = {}) {
  if (env[ONLINE] === '1') return true
  log(`${name} goes online (arXiv, translation engines, the reader's server): run it with ${ONLINE}=1, on a staging build (pnpm build:staging)`)
  return exit(2)
}

/** a browser context's launch options for an online run: the project's User-Agent on its pages (`userAgent`) and, through
 *  Chromium's own switch, on everything else the browser sends (its workers, the extension's service worker and its
 *  fetches); and each extension it loads (`--load-extension=`) one whose reader talks to staging, never production */
export function online(options = {}) {
  const args = options.args ?? []
  for (const a of args) {
    if (!a.startsWith('--load-extension=')) continue
    for (const dir of a.slice('--load-extension='.length).split(',')) {
      const server = readerServerOf(dir)
      if (server) refuseProduction(server)
    }
  }
  return { ...options, userAgent: PROJECT_UA, args: [...args, `--user-agent=${PROJECT_UA}`] }
}
