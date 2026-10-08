// The network of a browser check, and the guard over it. Every http(s) request of the browser, the extension's service
// worker's too, goes through one route table: the origins it names are answered by the handlers it gives, and a request to
// any other origin, or to a path its handler names no answer for, is a violation — it is refused, written down, and the
// check that owns the table fails the run on it (`violations`). Nothing that is not named reaches the network.
//
// A table is a list of [origin, handler]. A handler is given the route and the URL, answers it (fulfil, abort, or leave it
// unanswered for good), and returns false where it knows no answer for that path. The loopback is named like any other
// origin: a handler that continues the request (`route.continue()`) is how a local server of the check is reached.
//
// The browser's resolver is the second wall (`RESOLVER_WALL`, a switch of the browser): a name it is not told to map
// does not resolve, so that what no route saw cannot leave the machine either (an offscreen document of the extension is
// no page the context lists, and a request it made would be seen by no route).

/** the browser's switch that leaves every name but the loopback unresolved: routes answer before resolution */
export const RESOLVER_WALL = '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'

/** who asked, for a violation's record: the service worker, or the frame's address */
function askerOf(request) {
  if (request.serviceWorker()) return 'the extension\'s service worker'
  try { return request.frame().url().slice(0, 80) || 'a page' } catch { return 'a page' }
}

/** the table installed on a context: { violations } (each { method, url, from }), `hosts` the origins it names */
export async function routeTable(context, entries) {
  const table = new Map(entries)
  const violations = []
  await context.route(url => url.protocol === 'http:' || url.protocol === 'https:', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const handler = table.get(url.origin)
    if (handler && (await handler(route, url)) !== false) return
    violations.push({ method: request.method(), url: url.href, from: askerOf(request) })
    await route.abort('blockedbyclient').catch(() => {})
  })
  return { violations, hosts: [...table.keys()] }
}
