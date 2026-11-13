// The reader's offline browser checks (stage 2's exit): the harness page built with the reader's own plugin, served on the
// loopback with the fixtures' objects, in Chromium behind a route table that answers our server's origin and the stand-in of
// arXiv's and refuses any other request (a violation fails the run). Each check prints one line; the run exits 1 if any fails.
//
//   node packages/reader/e2e/run.mjs [--only=<part of a name>|…] [--browser=chromium|webkit|firefox]
//   AXT_PAPER=<dir with arxiv.pdf> runs the stack's checks on that paper too (a lab paper, read in place, never copied)
//   AXT_LINK=<latency ms>,<KB/s> shapes every page's link in Chromium (the first laid page's measurements: the slices of a CJK
//   target are its last wait); AXT_DELTA_MS the pace of a corpus paper's rows arriving (one delta of DELTAS a step, 1000 ms)
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { kindShown } from '../src/compose/classes.ts'
import { createContents, plainOf } from '../src/session/contents.ts'
import { judgePunct, measurePunct, PUNCT_TARGETS, punctRows } from './punct.mjs'
import { answerBytes, startServer } from './server.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../../..')
const argOf = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const only = argOf('only')?.split('|') ?? null
const browserName = argOf('browser') ?? 'chromium'
const RESOLVER_WALL = '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'

await build({ configFile: join(HERE, 'vite.config.ts'), logLevel: 'warn' })

const sample = join(REPO, 'tests/fixtures/pdf/sample-1/sample-1.pdf')
const papers = { '2600.00001v1': sample }
if (process.env.AXT_PAPER) papers.lab = join(process.env.AXT_PAPER, 'arxiv.pdf')
const objects = new Map(Object.entries(papers).map(([id, f]) => [`/api/v2/o/arxiv/${id.replace('.', '_')}.pdf`, f]))
// the fixtures (packages/reader/e2e/fixtures: ours; AXT_LAB_FIXTURES=<id>,… : lane L1's bundles of corpus papers and the
// baseline's dumps, read in place from lab-data): each one's A, its bundle's objects under our server's paths, its dumps and rows
const FIX = join(HERE, 'fixtures')
const LAB = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11'
const fixtures = {}
for (const name of readdirSync(FIX)) {
  const d = join(FIX, name)
  if (!existsSync(join(d, 'arxiv.pdf'))) continue
  fixtures[name] = { pdf: join(d, 'arxiv.pdf'), bundle: join(d, 'bundle'), files: d, dumps: {}, rows: {} }
}
for (const id of (process.env.AXT_LAB_FIXTURES ?? '').split(',').filter(Boolean)) {
  const papersJson = JSON.parse(readFileSync(join(LAB, 'baseline/corpora/papers.json'), 'utf8'))
  const p = papersJson.papers.find((x) => x.id === id)
  if (!p) throw new Error(`no corpus paper ${id}`)
  fixtures[id] = {
    pdf: join(p.dir, 'arxiv.pdf'),
    bundle: join(LAB, 'lanes/L1-out4/bundles', id),
    files: join(LAB, 'baseline/reader'),
    dumps: { zh: `${id}-zh.reader.json` },
    rows: { zh: null },
    face: 'cjk',
  }
}
const indexOf = {}
/** the stand-in of our server's v2 routes: each paper's document; a scenario a check sets (`modes[seg]`): 'not-opened' (a 404
 *  until the open, then preparing for `prepareMs`, then the document), 'stale' (a layer of another build and no run of the
 *  target until the open, then that layer while the paper is prepared again for `prepareMs`, then a newer catalog with the
 *  target's rows), else the document at once; and every ask, logged */
const docs = {},
  rowsObjects = new Map(),
  modes = {},
  v2log = []
/** each corpus paper's rows in DELTAS objects (`modes[seg]` 'deltas') */
const DELTAS = 10
const deltasOf = {}
/** each paper's twin head: its head's bytes and a newline, another catalog digest over the same layer (a scenario's newer
 *  catalog, `recatalog`), its object by path; and its layer made again (`stale`'s new build): a head whose parts are its own,
 *  each part without its last flow (a page laid from it lays one member fewer than one laid from the part before) */
const twins = {},
  rebuilt = {},
  twinObjects = new Map()
/** each paper's bundle and its head's parts, for its layer made again in a directory of its own (`moved`) */
const bundleOf = {},
  partsOfHead = {}
for (const [name, f] of Object.entries(fixtures)) {
  const head = JSON.parse(readFileSync(join(f.bundle, 'head.json'), 'utf8'))
  const seg = `${head.paper.id.replace('.', '_')}v${head.paper.version}`
  objects.set(`/api/v2/o/arxiv/${seg}.pdf`, f.pdf)
  for (const file of readdirSync(f.bundle))
    if (/^[0-9a-f]{64}\./.test(file)) objects.set(`/api/v2/o/p/${seg}/fx/${file.split('.')[0]}`, join(f.bundle, file))
  const headDigest = readdirSync(f.bundle)
    .find((x) => x.endsWith('.head'))
    .split('.')[0]
  {
    const bytes = Buffer.concat([readFileSync(join(f.bundle, `${headDigest}.head`)), Buffer.from('\n')])
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    twins[seg] = { path: `p/${seg}/fx/${sha256}`, sha256, bytes: bytes.length }
    twinObjects.set(`/api/v2/o/p/${seg}/fx/${sha256}`, bytes)
  }
  {
    const object = (b) => {
      const sha256 = createHash('sha256').update(b).digest('hex')
      twinObjects.set(`/api/v2/o/p/${seg}/fx/${sha256}`, b)
      return { path: `p/${seg}/fx/${sha256}`, sha256, bytes: b.length }
    }
    const h = JSON.parse(readFileSync(join(f.bundle, `${headDigest}.head`), 'utf8'))
    bundleOf[seg] = f.bundle
    partsOfHead[seg] = h.parts.filter(Boolean)
    const members = {}
    const parts = h.parts.map((d) => {
      if (!d) return d
      const part = JSON.parse(readFileSync(join(f.bundle, `${d}.part`), 'utf8'))
      const flows = part.flows.length > 1 ? part.flows.slice(0, -1) : part.flows
      members[part.page] = flows.flat().length
      return object(Buffer.from(JSON.stringify({ ...part, flows }))).sha256
    })
    rebuilt[seg] = {
      catalog: object(Buffer.from(JSON.stringify({ ...h, parts }))),
      parts: parts.filter(Boolean),
      members,
    }
  }
  indexOf[name] = {
    paper: `${head.paper.id}v${head.paper.version}`,
    seg,
    original: `/api/v2/o/arxiv/${seg}.pdf`,
    objects: `/api/v2/o/p/${seg}/fx/`,
    head: headDigest,
    dumps: f.dumps,
    rows: f.rows,
    face: f.face ?? null,
  }
  // our server's document of the paper (L5's PaperDoc): its layer the bundle, the target's rows the fixture's rows as one object
  const files = readdirSync(f.bundle)
  const refOf = (digest) => {
    const file = files.find((x) => x.startsWith(`${digest}.`))
    return { path: `p/${seg}/fx/${digest}`, sha256: digest, bytes: statSync(join(f.bundle, file)).size }
  }
  // (the source's units, as a prepare hands them out before its marked compile (the engine's prepare.ts `units`), named by our
  // server's document ahead of the objects the head names, in `prepare.units` and `layer.units` alike: every Units object the
  // prepare told. The same units under the same ids in an object of other bytes, since the bundle's units hold what the source
  // does not state (the units located and born on A, the names' variants); here, the head's units less their last that is no
  // heading. A reader that took the document's list for the layer's listed every heading of the contents twice and counted every
  // unit twice: staging, round RB1, 2026-11-13, 2608.25210v2's 25 headings as 50 entries)
  const sourceRef = (() => {
    const all = head.units.flatMap((u) => JSON.parse(readFileSync(join(f.bundle, `${u}.units`), 'utf8')).units)
    const last = all.findLastIndex((u) => u.kind !== 'heading')
    const b = Buffer.from(JSON.stringify({ format: 1, units: all.filter((_, i) => i !== last) }))
    const sha256 = createHash('sha256').update(b).digest('hex')
    twinObjects.set(`/api/v2/o/p/${seg}/fx/${sha256}`, b)
    return { path: `p/${seg}/fx/${sha256}`, sha256, bytes: b.length }
  })()
  indexOf[name].source = sourceRef.sha256
  const targets = {}
  const sources = Object.keys(f.dumps).length ? Object.keys(f.dumps).map((t) => [t, null]) : [['de', 'de.rows.json']]
  for (const [t, rf] of sources) {
    const bytes = rf
      ? readFileSync(join(f.files, rf))
      : Buffer.from(JSON.stringify(rowsOfDump(JSON.parse(readFileSync(join(f.files, f.dumps[t]), 'utf8')))))
    const sha = createHash('sha256').update(bytes).digest('hex')
    rowsObjects.set(`/api/v2/o/r/${seg}/${t}/fx/${sha}`, bytes)
    const n = JSON.parse(bytes.toString('utf8')).rows.length
    // (a corpus paper: its rows as our server's run writes them, in the units' reading order, every unit but those the paper
    // keeps (a unit the dump has no row of read as its own text), cut into DELTAS objects: `modes[seg]` 'deltas' gives them one
    // at a time, a translation under way)
    if (!rf) {
      const dumpRows = new Map(JSON.parse(bytes.toString('utf8')).rows.map((r) => [r.id, r]))
      const plain = (ps) => ps.map((x) => (x.t === 'text' ? x.s : x.content ? plain(x.content) : '')).join('')
      const all = []
      for (const u of head.units)
        for (const x of JSON.parse(readFileSync(join(f.bundle, `${u}.units`), 'utf8')).units)
          if (!x.kept && !all.some((r) => r.id === x.id))
            all.push(
              dumpRows.get(x.id) ?? {
                id: x.id,
                ok: true,
                content: [{ t: 'text', s: plain(x.content) || '·' }],
                by: 'fx',
              },
            )
      const list = []
      for (let k = 0; k < DELTAS; k++) {
        const b = Buffer.from(
          JSON.stringify({
            format: 1,
            rows: all.slice(Math.floor((k * all.length) / DELTAS), Math.floor(((k + 1) * all.length) / DELTAS)),
          }),
        )
        const sha = createHash('sha256').update(b).digest('hex')
        rowsObjects.set(`/api/v2/o/r/${seg}/${t}/fx/${sha}`, b)
        list.push({ path: `r/${seg}/${t}/fx/${sha}`, sha256: sha, bytes: b.length })
      }
      deltasOf[seg] = { target: t, list, total: all.length }
    }
    targets[t] = {
      attempt: 1,
      state: 'done',
      why: null,
      retryAt: null,
      at: 0,
      translator: 'fx',
      units: null,
      rows: [{ path: `r/${seg}/${t}/fx/${sha}`, sha256: sha, bytes: bytes.length }],
      done: n,
      total: n,
      view: 1,
    }
  }
  docs[seg] = {
    v: 1,
    pv: seg,
    epoch: 'e1',
    rev: 1,
    paper: head.paper.id,
    version: head.paper.version,
    prepare: {
      attempt: 1,
      state: 'done',
      why: null,
      retryAt: null,
      at: 0,
      build: 'fx',
      stage: null,
      units: [sourceRef, ...head.units.map(refOf)],
      html: null,
    },
    layer: {
      catalog: refOf(headDigest),
      units: [sourceRef, ...head.units.map(refOf)],
      format: 1,
      build: 'fx',
      stale: false,
    },
    targets,
  }
}
/** a corpus dump's rows: a row a unit, its text the dump's (what is painted is the dump) */
function rowsOfDump(dump) {
  return {
    format: 1,
    rows: dump.units.map((u) => ({
      id: u.id,
      ok: true,
      content: [{ t: 'text', s: u.lines.map((l) => l.text).join(' ') }],
      by: 'baseline',
    })),
  }
}
const fixtureRoute = {
  prefix: '/fixtures/',
  handle(_req, res, url) {
    const [, , name, file] = url.pathname.split('/')
    const f = fixtures[name]
    if (!f) return false
    if (file === 'index.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(indexOf[name]))
    }
    // (a corpus paper's rows: those of its dump's units, a row each, whatever their text: the dump is what is painted)
    if (/\.rows\.json$/.test(file) && f.rows[file.split('.')[0]] === null) {
      const dump = JSON.parse(readFileSync(join(f.files, f.dumps[file.split('.')[0]]), 'utf8'))
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          format: 1,
          rows: dump.units.map((u) => ({
            id: u.id,
            ok: true,
            content: [{ t: 'text', s: u.lines.map((l) => l.text).join(' ') }],
            by: 'baseline',
          })),
        }),
      )
    }
    // (the full-width punctuation's check's rows, punct.mjs: written for it, given the fixture's own units' ids)
    const punct = /^([a-zA-Z-]+)\.rows\.json$/.exec(file ?? '')?.[1]
    if (punct && PUNCT_TARGETS.includes(punct) && existsSync(join(f.files, 'de.rows.json'))) {
      const rows = punctRows(punct, JSON.parse(readFileSync(join(f.files, 'de.rows.json'), 'utf8')).rows)
      if (rows) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(rows))
      }
    }
    const at = join(f.files, file)
    if (!existsSync(at)) return false
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(readFileSync(at))
  },
}
/** a paper's layer made again in a directory of its own (`moved`): the stale scenario's new build (`rebuilt`: its head, its own
 *  parts, the add-on and the units as they were), every object under `fx2`, the document naming it there */
const movedDoc = (d) => ({
  ...d,
  rev: 3,
  layer: {
    ...d.layer,
    catalog: { ...rebuilt[d.pv].catalog, path: rebuilt[d.pv].catalog.path.replace('/fx/', '/fx2/') },
    units: d.layer.units.map((u) => ({ ...u, path: u.path.replace('/fx/', '/fx2/') })),
  },
})
/** an object of the layer made again, by its digest: the bundle's file, or one of the new build's */
const movedObject = (seg, digest) => {
  const file = readdirSync(bundleOf[seg]).find((x) => x.startsWith(`${digest}.`))
  return file ? readFileSync(join(bundleOf[seg], file)) : (twinObjects.get(`/api/v2/o/p/${seg}/fx/${digest}`) ?? null)
}
/** a paper of a stale layer once opened (worker v2 machine.ts): prepared again, the old layer served meanwhile, the target's
 *  work made by the open and not started (none of the wanted units told yet) */
const staleOpened = (d, target) => ({
  ...d,
  rev: 3,
  prepare: { ...d.prepare, attempt: 2, state: 'running', stage: 'compiling' },
  layer: { ...d.layer, stale: true },
  targets: target ? { [target]: { ...d.targets[target], attempt: 0, state: 'none', rows: [], done: 0, total: 0 } } : {},
})
const v2Route = {
  prefix: '/api/v2/',
  handle(req, res, url) {
    const json = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(JSON.stringify(body))
    }
    // (an original our server cannot give now: the original lost)
    if (url.pathname.startsWith('/api/v2/o/broken/')) return json(503, { error: 'unavailable' })
    // (a layer made again in a directory of its own, `moved`, as the first part of the old one is asked: that part and every
    // object of the old directory after it gone, as our server answers an object deleted (404, its word `gone`); the new
    // directory's objects served)
    const mv = /^\/api\/v2\/o\/p\/([^/]+)\/(fx2?)\/([0-9a-f]{64})$/.exec(url.pathname)
    if (mv && modes[mv[1]]?.kind === 'moved') {
      const m = modes[mv[1]]
      if (mv[2] === 'fx') {
        if (!m.switched && partsOfHead[mv[1]].includes(mv[3])) {
          m.switched = true
          m.from = v2log.length
        }
        if (!m.switched) return false
        m.gone = (m.gone ?? 0) + 1
        return json(404, { error: 'gone' })
      }
      const bytes = movedObject(mv[1], mv[3])
      if (!bytes) return json(404, { error: 'gone' })
      answerBytes(req, res, bytes)
      return true
    }
    if (url.pathname.startsWith('/api/v2/papers/')) {
      const seg = url.pathname.slice('/api/v2/papers/'.length)
      v2log.push({ what: 'follow', seg, query: url.search, at: performance.now() })
      const d = docs[seg] ?? Object.values(docs).find((x) => x.pv.replace(/v\d+$/, '') === seg)
      if (!d) return json(404, { error: 'not-found' })
      const m = modes[d.pv]
      // (a paper not opened, whose open is refused for now: the visitor's new papers spent, an hour on, in the open's answer as our
      // server words it; a prepare that cannot be made, with our server's word on arXiv's HTML version)
      if (m?.kind === 'refused') return json(404, { error: 'not-opened' })
      if (m?.kind === 'cannot')
        return json(200, {
          ...d,
          rev: 2,
          layer: null,
          prepare: { ...d.prepare, state: 'failed', why: 'cannot-typeset', html: m.html },
          targets: {},
        })
      if (m?.kind === 'not-opened' && !m.opened) return json(404, { error: 'not-opened' })
      if (m?.kind === 'not-opened' && performance.now() - m.opened < (m.prepareMs ?? 800))
        return json(200, {
          ...d,
          rev: 1,
          layer: null,
          prepare: { ...d.prepare, state: 'running', stage: 'compiling' },
          targets: {},
        })
      // (the target still running for `runningMs` after the prepare, the first half of its rows in: the run under way, some of
      // it there and the rest to come, as the reader waits for a run, chrome/events.ts)
      if (m?.kind === 'not-opened' && m.runningMs && performance.now() - m.opened < (m.prepareMs ?? 800) + m.runningMs)
        return json(200, {
          ...d,
          rev: 2,
          targets: Object.fromEntries(
            Object.entries(d.targets).map(([t, x]) => {
              const all = JSON.parse(rowsObjects.get(`/api/v2/o/${x.rows[0].path}`).toString('utf8'))
              const bytes = Buffer.from(
                JSON.stringify({ ...all, rows: all.rows.slice(0, Math.ceil(all.rows.length / 2)) }),
              )
              const sha256 = createHash('sha256').update(bytes).digest('hex')
              const path = x.rows[0].path.replace(x.rows[0].sha256, sha256)
              rowsObjects.set(`/api/v2/o/${path}`, bytes)
              return [t, { ...x, state: 'running', rows: [{ path, sha256, bytes: bytes.length }] }]
            }),
          ),
        })
      // (then the run done, its rows whole: a document newer than the running one)
      if (m?.kind === 'not-opened' && m.runningMs) return json(200, { ...d, rev: 3 })
      // (the target's rows arriving: one delta more each `every` ms from the first follow, the run done with the last)
      if (m?.kind === 'deltas') {
        const ds = deltasOf[d.pv]
        m.start ??= performance.now()
        const k = Math.min(ds.list.length, 1 + Math.floor((performance.now() - m.start) / m.every))
        m.told = Math.max(m.told ?? 0, k)
        return json(200, {
          ...d,
          rev: 1 + k,
          targets: {
            [ds.target]: {
              ...d.targets[ds.target],
              state: k < ds.list.length ? 'running' : 'done',
              rows: ds.list.slice(0, k),
              done: Math.round((k * ds.total) / ds.list.length),
              total: ds.total,
            },
          },
        })
      }
      // (a layer of another build than the one our server runs and no run of the target (staging, 2026-11-08: PIPELINE 77 to 78,
      // 1706.03762v7): served as it is, nothing started, until an open; then the old layer while the paper is prepared again,
      // the target's run made and not started; then the new build's catalog, a head of parts of its own, and the target's rows)
      if (m?.kind === 'stale') {
        if (!m.opened)
          return json(200, {
            ...d,
            rev: 2,
            prepare: { ...d.prepare, attempt: 1 },
            layer: { ...d.layer, stale: true },
            targets: {},
          })
        if (performance.now() - m.opened < m.prepareMs) return json(200, staleOpened(d, url.searchParams.get('t')))
        return json(200, {
          ...d,
          rev: 4,
          prepare: { ...d.prepare, attempt: 2 },
          layer: { ...d.layer, catalog: rebuilt[d.pv].catalog },
        })
      }
      // (the target's run started again on the rows held (staging, 2026-11-11: 2610.21924v1's attempts 3 and 4 after a deploy):
      // done, the paper being prepared again so that the follow keeps a run's pace; then a new attempt running whose rows are the
      // same, restated in an object of their own; then that attempt done)
      if (m?.kind === 'again') {
        m.start ??= performance.now()
        const k = Math.floor((performance.now() - m.start) / m.after)
        const t = Object.keys(d.targets)[0]
        const was = d.targets[t].rows[0]
        const bytes = Buffer.concat([rowsObjects.get(`/api/v2/o/${was.path}`), Buffer.from('\n')])
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const path = was.path.replace(was.sha256, sha256)
        rowsObjects.set(`/api/v2/o/${path}`, bytes)
        const again = { path, sha256, bytes: bytes.length }
        m.again = sha256
        m.phase = Math.min(2, k)
        return json(200, {
          ...d,
          rev: 2 + m.phase,
          prepare: m.phase < 2 ? { ...d.prepare, attempt: 2, state: 'running', stage: 'compiling' } : d.prepare,
          targets: {
            [t]:
              m.phase === 0
                ? d.targets[t]
                : {
                    ...d.targets[t],
                    attempt: 2,
                    state: m.phase === 1 ? 'running' : 'done',
                    rows: [again],
                    done: m.phase === 1 ? 0 : d.targets[t].done,
                  },
          },
        })
      }
      // (a newer catalog once the check says so: the same layer under the twin head. Our server makes one by a prepare again,
      // the layer before it served meanwhile, and the follow keeps its pace of a run while that prepare runs; a document in
      // which nothing runs is followed again on the reader's wake alone, reader.ts: an object answered gone)
      if (m?.kind === 'recatalog')
        return m.switched
          ? json(200, { ...d, rev: 3, layer: { ...d.layer, catalog: twins[d.pv] } })
          : json(200, { ...d, rev: 2, prepare: { ...d.prepare, state: 'running', stage: 'compiling' } })
      // (a layer made again in a directory of its own once a part of the old one is asked: nothing runs before or after)
      if (m?.kind === 'moved') return json(200, m.switched ? movedDoc(d) : { ...d, rev: 2 })
      return json(200, { ...d, rev: 2 })
    }
    if (url.pathname === '/api/v2/open' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const ask = JSON.parse(body || '{}')
        v2log.push({ what: 'open', ask, at: performance.now() })
        const d = Object.values(docs).find((x) => x.paper === ask.paper)
        if (!d) return json(404, { error: 'not-found' })
        const m = modes[d.pv]
        // (a refusal of the open's new work, as format's OpenAnswer has it: the paper's document, nothing started, and the
        // refusal's instant, its wait to the millisecond and in seconds)
        const refusedFor = (why, s) => ({
          doc: {
            ...d,
            rev: 0,
            layer: null,
            prepare: { ...d.prepare, state: 'none', stage: null, units: [] },
            targets: {},
          },
          follow: null,
          refused: { why, retryAt: Date.now() + s * 1000, retryAfterMs: s * 1000, retryAfterS: s },
        })
        if (m?.kind === 'refused') return json(200, refusedFor('quota', 3600))
        // (our server at capacity for the first `busy` opens: refused in the open's answer, asked again a second on)
        if (m?.busy > 0) {
          m.busy--
          return json(200, refusedFor('busy', 1))
        }
        if (m) m.opened ??= performance.now()
        if (m?.kind === 'stale') return json(200, { doc: staleOpened(d, ask.target), follow: null })
        json(200, {
          doc: {
            ...d,
            rev: 1,
            layer: null,
            prepare: { ...d.prepare, state: 'running', stage: 'compiling' },
            targets: {},
          },
          follow: null,
        })
      })
      return true
    }
    const rows = rowsObjects.get(url.pathname)
    if (rows) {
      res.writeHead(200, {
        'content-type': 'application/json',
        etag: `"${url.pathname.split('/').pop().slice(0, 16)}"`,
      })
      res.end(rows)
      return true
    }
    const twin = twinObjects.get(url.pathname)
    if (twin) {
      answerBytes(req, res, twin)
      return true
    }
    return false
  },
}
/** our site's static files the reader's own typesetter reads (compose/served.ts): the faces' tables, their slices and the
 *  hyphenation patterns, where this machine has them (the website's build's, read in place: licensed faces are never copied
 *  here); none, the checks that need them say so and pass nothing */
const SITE = {
  tables:
    process.env.AXT_FACE_TABLES ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/refactor-read/web/src/fonts/static',
  slices: (
    process.env.AXT_FACE_SLICES ??
    '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache/static/static-fonts:/Users/cheongzhiyan/Developer/readarxiv-web-wt/rate-limit/web/public/static-fonts'
  ).split(':'),
  hyph: process.env.AXT_HYPH ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache/static/hyph',
}
const siteHas = existsSync(join(SITE.tables, 'index.json')) && SITE.slices.some((d) => existsSync(d))
const siteLog = []
const siteRoute = {
  prefix: '/',
  handle(_req, res, url) {
    const table = /^\/static-fonts\/([a-z0-9-]+)\.json$/.exec(url.pathname)?.[1]
    const slice = /^\/static-fonts\/([0-9a-f]{16}\.woff2)$/.exec(url.pathname)?.[1]
    const hyph = /^\/hyph\/([a-z-]+)\.json$/.exec(url.pathname)?.[1]
    if (!table && !slice && !hyph) return false
    siteLog.push(url.pathname + url.search)
    const file = table
      ? join(SITE.tables, `${table}.json`)
      : slice
        ? SITE.slices.map((d) => join(d, slice)).find((f) => existsSync(f))
        : join(SITE.hyph, `${hyph}.json`)
    if (!file || !existsSync(file)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': slice ? 'font/woff2' : 'application/json' })
    return res.end(readFileSync(file))
  },
}
const server = await startServer({ out: join(HERE, '.out'), objects, routes: [fixtureRoute, v2Route, siteRoute] })

const pw = await import('playwright')
const browser = await pw[browserName].launch({ args: browserName === 'chromium' ? [RESOLVER_WALL] : [] })
const violations = []
const LINK = (() => {
  const m = /^(\d+),(\d+)$/.exec(process.env.AXT_LINK ?? '')
  return m ? { latency: Number(m[1]), bytesPerS: Number(m[2]) * 1024 } : null
})()
async function newPage(o = {}) {
  const context = await browser.newContext({
    viewport: o.viewport ?? { width: 1400, height: 900 },
    ...(o.screen ? { screen: o.screen } : {}),
    deviceScaleFactor: o.dpr ?? 1,
  })
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    if (url.origin === server.origin) return route.continue()
    // the stand-in of arXiv's own server: its PDF by ranges, no entity-tag promised
    if (url.origin === 'https://arxiv.org' && url.pathname.startsWith('/pdf/')) {
      const file =
        papers[url.pathname.slice(5)] ??
        Object.entries(indexOf)
          .map(([n, x]) => (x.paper === url.pathname.slice(5) ? fixtures[n].pdf : null))
          .find(Boolean)
      if (file) {
        const bytes = readFileSync(file),
          m = /^bytes=(\d+)-(\d+)$/.exec(req.headers().range ?? '')
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range, etag, content-length',
          'content-type': 'application/pdf',
        }
        if (!m) return route.fulfill({ status: 200, headers, body: bytes })
        const a = Number(m[1]),
          b = Math.min(Number(m[2]), bytes.length - 1)
        return route.fulfill({
          status: 206,
          headers: { ...headers, 'content-range': `bytes ${a}-${b}/${bytes.length}` },
          body: bytes.subarray(a, b + 1),
        })
      }
    }
    // the stand-in of arXiv's abstract page (its citation_title) and its HTML version (none: 404)
    if (url.origin === 'https://arxiv.org' && /^\/(abs|html)\//.test(url.pathname)) {
      const id = url.pathname.split('/')[2] ?? ''
      const known = Object.values(indexOf).some((x) => x.paper.replace(/v\d+$/, '') === id.replace(/v\d+$/, ''))
      const headers = { 'access-control-allow-origin': '*', 'content-type': 'text/html' }
      if (url.pathname.startsWith('/html/') || !known) return route.fulfill({ status: 404, headers, body: '' })
      return route.fulfill({
        status: 200,
        headers,
        body: `<!doctype html><meta name="citation_title" content="A paper of our own (${id})"><title>${id}</title>`,
      })
    }
    violations.push(`${req.method()} ${url.href}`)
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    // (arXiv's answer that a paper has no HTML version is a 404 the reader asks for: expected)
    if (
      m.type() === 'error' &&
      !(/status of 404/.test(m.text()) && /^https:\/\/arxiv\.org\/html\//.test(m.location()?.url ?? ''))
    )
      errors.push(m.text())
  })
  // (AXT_LINK=<latency ms>,<KB/s>: the link shaped by the browser, for the measurements of the first laid page)
  if (LINK && browserName === 'chromium') {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: LINK.latency,
      downloadThroughput: LINK.bytesPerS,
      uploadThroughput: LINK.bytesPerS,
    })
  }
  await page.goto(`${server.origin}/${o.path ?? ''}`)
  return { page, context, errors }
}

/** the resident memory (MiB) of the browser's renderer processes and of its GPU process, read by ps from the pids the browser's
 *  CDP names (the page's renderer runs its dedicated workers, PDF.js's among them; a GPU-backed canvas lives in the GPU process) */
async function processMiB() {
  if (browserName !== 'chromium') return null
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  await cdp.detach()
  const { execFileSync } = await import('node:child_process')
  const rss = (type) => {
    const pids = processInfo.filter((p) => p.type === type).map((p) => p.id)
    if (!pids.length) return 0
    const out = execFileSync('ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' })
    return +(
      out
        .split('\n')
        .filter(Boolean)
        .reduce((a, x) => a + Number(x.trim()), 0) / 1024
    ).toFixed(1)
  }
  return { renderer: rss('renderer'), gpu: rss('GPU') }
}
const results = []
async function check(name, fn) {
  if (only && !only.some((o) => name.includes(o))) return
  const t = performance.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, ms: Math.round(performance.now() - t), detail })
    console.log(`ok   ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e) })
    console.log(`FAIL ${name}: ${e?.message ?? e}`)
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}
const waitFor = async (page, fn, arg, ms = 15_000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 })
const sameBoxes = (boxes) =>
  boxes.every(
    (b) =>
      b.left &&
      b.right &&
      Math.abs(b.left[0] - b.right[0]) < 0.02 &&
      Math.abs(b.left[1] - b.right[1]) < 0.02 &&
      b.left[2] === b.right[2],
  )

// ---------------------------------------------------------------- deliverable 3: the page stack under the right pane
for (const [id, label] of [['2600.00001v1', 'sample-1'], ...(process.env.AXT_PAPER ? [['lab', 'lab']] : [])]) {
  const url = `/api/v2/o/arxiv/${id.replace('.', '_')}.pdf`
  await check(`stack: the original at once (${label})`, async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(
      page,
      () =>
        window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1) &&
        window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'left' && m.page === 1),
    )
    const marks = await page.evaluate(() => window.__h.marks)
    const first = (side) => marks.find((m) => m.what === 'drawn' && m.side === side && m.page === 1)?.at
    await context.close()
    assert(!errors.length, errors.join('; '))
    return { pages: r.pages, leftPage1Ms: Math.round(first('left')), rightPage1Ms: Math.round(first('right')) }
  })
  await check(`stack: every slot is the left's page box, at every scale (${label})`, async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(page, () => window.__h.probe()['right.sized'] === window.__h.probe().pages)
    // (the left's eager sizes: its pagesloaded told again; both are set within a frame of each other)
    await page.waitForTimeout(300)
    const at1 = await page.evaluate(() => window.__h.boxes())
    assert(sameBoxes(at1), `at the first scale: ${JSON.stringify(at1.find((b) => !sameBoxes([b])))}`)
    const scales = []
    for (const step of [
      (z) => z.zoomBy(1.25),
      (z) => z.zoomBy(1.25),
      (z) => z.zoomTo('page-fit'),
      (z) => z.zoomTo(2.37),
      (z) => z.zoomTo('page-width'),
    ]) {
      await page.evaluate(`(${step.toString()})(window.__h.panes)`)
      await page.waitForTimeout(700)
      const b = await page.evaluate(() => window.__h.boxes())
      const s = await page.evaluate(() => window.__h.panes.scale)
      scales.push(s)
      assert(sameBoxes(b), `at scale ${s}: ${JSON.stringify(b.find((x) => !sameBoxes([x])))}`)
    }
    await context.close()
    assert(!errors.length, errors.join('; '))
    return { scales }
  })
  await check(`stack: a pinch over the right, about its point, committed once (${label})`, async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    const before = await page.evaluate(() => window.__h.panes.scale)
    const steps = await page.evaluate(async () => {
      const p = window.__h.panes,
        r = document.querySelector('.axt-pane.right').getBoundingClientRect()
      const at = [r.left + r.width / 2, r.top + r.height / 3]
      let previews = 0
      for (let i = 0; i < 8; i++) {
        p.pinch('right', 1.05, at)
        if (p.probe().pinching) previews++
        await new Promise((f) => requestAnimationFrame(f))
      }
      return { previews, scaleDuring: p.scale }
    })
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      scale: window.__h.panes.scale,
      pinching: window.__h.panes.probe().pinching,
      boxes: window.__h.boxes(),
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(steps.scaleDuring === before, 'a step wrote the scale')
    assert(
      after.pinching === null && Math.abs(after.scale - Math.round(before * 1.05 ** 8 * 100) / 100) < 0.011,
      `committed at ${after.scale} from ${before}`,
    )
    assert(sameBoxes(after.boxes), `boxes differ after the pinch: ${JSON.stringify(after.boxes)}`)
    return { from: before, to: after.scale, previews: steps.previews }
  })
  await check(`stack: far pages let go within the budget, the focus kept (${label})`, async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate((u) => window.__h.open(u), url)
    if (r.pages < 8) {
      await context.close()
      return { skipped: `${r.pages} pages` }
    }
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    await page.evaluate(() => window.__h.panes.right.focus(1))
    const walk = []
    for (const n of [Math.ceil(r.pages / 2), r.pages, 1, r.pages]) {
      await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
      await waitFor(
        page,
        (n) => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === n),
        n,
      )
      await page.waitForTimeout(200)
      walk.push(
        await page.evaluate(() => {
          const p = window.__h.panes.probe()
          return { views: p['right.views'], near: p['right.near'], pixels: p['right.pixels'] }
        }),
      )
    }
    const focus = await page.evaluate(() => ({
      body: document.activeElement === document.body,
      page: document.activeElement?.dataset?.pageNumber ?? null,
    }))
    const budget = await page.evaluate(() => {
      const gb = navigator.deviceMemory
      return gb ? Math.min(128, Math.max(32, gb * 16)) * 2 ** 20 : 32 * 2 ** 20
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!focus.body, 'the focus fell to <body>')
    // (every view a near page's, or a far one the budget keeps)
    for (const w of walk)
      assert(w.pixels * 4 <= budget + w.near * 8e6, `views ${w.views}, near ${w.near}, pixels ${w.pixels}`)
    return { pages: r.pages, walk, focus: focus.page }
  })
}

// ---------------------------------------------------------------- deliverable 4: composing the right pane
const laidShown = (page, n) =>
  waitFor(
    page,
    (n) => window.__h.marks.some((m) => m.what === 'shown' && m.page === n && String(m.key).startsWith('laid:')),
    n,
    20_000,
  )
for (const name of Object.keys(fixtures)) {
  const lab = !!fixtures[name].face
  const target = lab ? 'zh' : 'de'
  await check(`compose: the original at once, then each laid page equal to its Page (${name})`, async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    const firstOriginal = await page.evaluate(() =>
      window.__h.marks.find((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1),
    )
    const layer = await page.evaluate(([n, t]) => window.__h.layer(n, { target: t }), [name, target])
    const laidPages = await page.evaluate(() =>
      [...window.__h.pages.entries()].filter(([, p]) => p.members.some((m) => m.state === 'laid')).map(([n]) => n),
    )
    const per = []
    for (const n of laidPages.slice(0, lab ? 4 : 8)) {
      await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
      await laidShown(page, n)
      await page.waitForTimeout(150)
      const shot = await page
        .locator(`.axt-pane.right .axt-slot[data-page-number="${n}"] > .axt-slot-view`)
        .screenshot({
          animations: 'disabled',
          ...(process.env.AXT_SHOTS ? { path: join(HERE, '.shots', `${name}-p${n}.png`) } : {}),
        })
      const ink = await page.evaluate(([n, png]) => window.__h.overlayInk(n, png), [n, shot.toString('base64')])
      // (the page view's canvas and the crops' canvas: their pixels, the CSS box each is laid out in (before a turn), the turn)
      const grid = await page.evaluate((n) => {
        const slot = document.querySelector(`.axt-pane.right .axt-slot[data-page-number="${n}"]`)
        const of = (c) => {
          if (!c) return null
          const st = getComputedStyle(c)
          return {
            px: [c.width, c.height],
            css: [Number.parseFloat(st.width), Number.parseFloat(st.height)],
            turn: Number(c.dataset.axtTurn ?? 0),
          }
        }
        return {
          view: of(slot?.querySelector('.canvasWrapper > canvas')),
          crops: of(slot?.querySelector('.axt-over > canvas.axt-crops')),
        }
      }, n)
      const text = await page.evaluate((n) => window.__h.textOf(n), n)
      if (process.env.AXT_DEBUG)
        console.log(JSON.stringify({ n, text: text.text.slice(0, 600), laid: text.laid.map((t) => t.slice(0, 40)) }))
      per.push({
        n,
        ...ink,
        // (each member's runs of text, in order, in the layer's text: the translation read in reading order)
        textOk: text.runs.every((rs) => rs.every((t) => text.text.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')))),
        // (the first member whose translation the layer reads before the one before it, or not at all past it; none: in order)
        outOfOrder: (() => {
          let at = 0
          const all = text.text.replace(/\s+/g, '')
          for (const [k, rs] of text.runs.entries())
            for (const t of rs) {
              const i = all.indexOf(t.replace(/\s+/g, ''), at)
              if (i < 0) return text.ords[k]
              at = i
            }
          return null
        })(),
        copied: text.copied.length,
        grid,
      })
    }
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(layer.proved, 'the original is not the one the layer was made over')
    for (const x of per) {
      assert(!x.error, x.error)
      // I3: the translations' ink in their regions, on no other ink (lab papers' dumps are painted in another face: reported)
      if (!lab)
        assert(
          x.outside === 0 && x.onInk <= Math.max(4, 0.002 * x.ink),
          `page ${x.n}: ${x.outside} px of ${x.ink} outside its regions, ${x.onInk} on other ink, at ${JSON.stringify(x.where)}`,
        )
      // I4: every element of a laid member an item (none kept in these fixtures but displays)
      if (!lab) assert(x.crops === x.elements, `page ${x.n}: ${x.crops} crops for ${x.elements} elements`)
      // the page view and the crops on one pixel grid, the page's exact scale from its top-left corner: each canvas shown pixel for
      // pixel (its CSS box whole px, its pixels that box at the ratio: a box of a fraction of a px is resampled to the whole px
      // the compositor snaps it to, 1587 px shown in 1588 at the page's right edge), the crops' the page view's
      for (const [k, c] of Object.entries(x.grid).filter(([, c]) => c))
        assert(
          c.css.every((v, i) => Number.isInteger(v) && v * 2 === c.px[i]),
          `page ${x.n}: the ${k} canvas, ${c.px.join('×')} px in ${c.css.join('×')} CSS px at a ratio of 2`,
        )
      // (the crops in the page view's own frame, a turned page's too: its pixels and its box the page view's, nothing turned by
      // CSS, so that a crop's ink stands on the page view's pixel for its place: a canvas drawn upright and turned about its
      // own box stands its frame's fraction of a px off where the page view, cut at its box, puts the same point)
      if (x.grid.crops)
        assert(
          !x.grid.crops.turn &&
            x.grid.crops.px.every((v, i) => v === x.grid.view?.px[i]) &&
            x.grid.crops.css.every((v, i) => v === x.grid.view?.css[i]),
          `page ${x.n}: the crops' canvas ${x.grid.crops.px.join('×')} px in ${x.grid.crops.css.join('×')}${x.grid.crops.turn ? `, turned ${x.grid.crops.turn}` : ''}; the page view's ${x.grid.view?.px.join('×')} in ${x.grid.view?.css.join('×')}`,
        )
      // I8: the text layer reads each laid member's translation, in order; a selection of it copies it
      assert(
        x.textOk && x.outOfOrder === null && x.copied > 0,
        `page ${x.n}: the text layer reads ${x.textOk ? `member ${x.outOfOrder} out of order` : 'not every translation'}`,
      )
    }
    return {
      originalPage1Ms: Math.round(firstOriginal.at),
      layer,
      pages: per.map((x) => ({
        n: x.n,
        ink: x.ink,
        outside: x.outside,
        onInk: x.onInk,
        crops: x.crops,
        cropsGrid: x.grid.crops?.px ?? null,
      })),
    }
  })
}

// A laid page gone far is kept off the view within the budget (stack.ts goFar, docs/PDF-READER.md §11.8 "No flash coming back"):
// its drawing held out of the layout tree while it is kept (`data-axt-kept`), so that no relayout of the document walks it (a
// face added to the document re-lays every text node laid out: verification/reader-perf.md §1), its slot keeping its box; and
// put back as it was as the page comes near: no new drawing, the same pixels on the page's grid, the pane's scroll height never
// moved. Kept, it holds one bitmap, its page view's: its crops canvas let go and a copy of its crops' box kept off the
// document, drawn back in the task it returns (§11.8 "A kept page holds one bitmap"). A pane a third of a page high: page 1 is
// far (past one pane's height) once the pane is at its end.
await check(
  'stack: a far laid page kept out of the layout tree, back pixel for pixel, the scroll height unmoved (s1-columns)',
  async () => {
    const { page, context, errors } = await newPage({ dpr: 2, viewport: { width: 1400, height: 300 } })
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await waitFor(page, () => window.__h.probe()['right.sized'] === window.__h.probe().pages)
    const slot = '.axt-pane.right .axt-slot[data-page-number="1"]'
    const state = () =>
      page.evaluate((sel) => {
        const s = document.querySelector(sel)
        const pane = document.querySelector('.axt-pane.right')
        const holder = s?.querySelector(':scope > .axt-slot-view')
        const p = window.__h.panes.probe()
        const crops = s?.querySelector('.axt-over > canvas.axt-crops')
        const view = s?.querySelector('.canvasWrapper > canvas')
        return {
          kept: !!s?.hasAttribute('data-axt-kept'),
          boxes: holder ? holder.getClientRects().length : -1,
          height: pane.scrollHeight,
          made: p['right.made'],
          restored: p['right.restored'],
          keptN: p['right.kept'],
          agains: p['right.agains'],
          keptPx: p['right.keptPixels'],
          // (its crops canvas's bitmap, and the box of its crops a copy holds while the page is away)
          crops: crops ? [crops.width, crops.height] : null,
          away: crops?.dataset.axtAway?.split(',').map(Number) ?? null,
          viewPx: view ? view.width * view.height : 0,
        }
      }, slot)
    /** page 1's crops canvas: its size and its pixels' digest, every channel (FNV-1a over getImageData) */
    const cropsOf = () =>
      page.evaluate((sel) => {
        const c = document.querySelector(`${sel} .axt-over > canvas.axt-crops`)
        if (!c?.width || !c.height) return null
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let h = 2166136261
        for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619)
        return [c.width, c.height, h >>> 0]
      }, slot)
    const toTop = () => page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    // (no pointer moved in this check: nothing lit on either pane)
    await toTop()
    await page.waitForTimeout(300)
    const before = await page.locator(`${slot} > .axt-slot-view`).screenshot({ animations: 'disabled' })
    const s0 = await state()
    const crops0 = await cropsOf()
    await page.evaluate(() => {
      const p = document.querySelector('.axt-pane.right')
      p.scrollTop = p.scrollHeight
    })
    await waitFor(page, () => !window.__h.panes.right.near(1))
    await page.waitForTimeout(300)
    const s1 = await state()
    // (the jump back: in the frame that draws it, page 1's drawing already in the layout tree. A callback asked from the jump's
    // scroll event runs in that frame before its layout and paint, after the stack's own, asked from the same event earlier)
    // (and its crops canvas in that frame: the page-sized canvas again, its pixels the ones it held before it went far)
    const jump = await page.evaluate(
      (sel) =>
        new Promise((done) => {
          const p = document.querySelector('.axt-pane.right')
          p.addEventListener(
            'scroll',
            () =>
              requestAnimationFrame(() => {
                const c = document.querySelector(`${sel} .axt-over > canvas.axt-crops`)
                let crops = null
                if (c?.width && c.height) {
                  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
                  let h = 2166136261
                  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619)
                  crops = [c.width, c.height, h >>> 0]
                }
                done({ kept: document.querySelector(sel).hasAttribute('data-axt-kept'), crops })
              }),
            { once: true },
          )
          p.scrollTop = 0
        }),
      slot,
    )
    const inJumpFrame = jump.kept
    await waitFor(page, () => window.__h.panes.right.near(1))
    await page.waitForTimeout(300)
    const s2 = await state()
    const after = await page.locator(`${slot} > .axt-slot-view`).screenshot({ animations: 'disabled' })
    // (a zoom while it is far: what changed while it was out is laid out as it comes back, its overlay in its slot's box at the
    // new scale, its page view drawn again at it)
    await page.evaluate(() => {
      const p = document.querySelector('.axt-pane.right')
      p.scrollTop = p.scrollHeight
    })
    await waitFor(page, () => !window.__h.panes.right.near(1))
    const s3 = await state()
    // (the moment it goes back into the layout tree, whenever that is (the zoom may bring it near): its crops canvas then,
    // before any frame is drawn of it)
    await page.evaluate((sel) => {
      const s = document.querySelector(sel)
      window.__backAt = null
      new MutationObserver((_, o) => {
        if (s.hasAttribute('data-axt-kept')) return
        const c = s.querySelector('.axt-over > canvas.axt-crops')
        window.__backAt = c ? [c.width, c.height] : null
        o.disconnect()
      }).observe(s, { attributes: true, attributeFilter: ['data-axt-kept'] })
    }, slot)
    await page.evaluate(() => window.__h.panes.zoomBy(1.25))
    await page.waitForTimeout(800)
    const zoomed = await page.evaluate(() => window.__h.panes.scale)
    await toTop()
    await waitFor(
      page,
      (z) =>
        window.__h.marks.some(
          (m) => m.what === 'drawn' && m.side === 'right' && m.page === 1 && Math.abs(m.scale - z) < 1e-6,
        ),
      zoomed,
    )
    await page.waitForTimeout(300)
    const s4 = await state()
    const backAt = await page.evaluate(() => window.__backAt)
    const z = await page.evaluate((sel) => {
      const s = document.querySelector(sel)
      const r = (e) => {
        const b = e?.getBoundingClientRect()
        return b ? [b.width, b.height].map((v) => Math.round(v * 100) / 100) : null
      }
      return {
        kept: s.hasAttribute('data-axt-kept'),
        slot: r(s),
        holder: r(s.querySelector(':scope > .axt-slot-view')),
        svg: r(s.querySelector('.axt-over > svg')),
      }
    }, slot)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!s0.kept && s0.boxes > 0, `page 1 in view: ${JSON.stringify(s0)}`)
    assert(s1.kept && s1.keptN >= 1, `page 1 far but not kept: ${JSON.stringify(s1)}`)
    assert(s1.boxes === 0, `page 1 far and kept, its drawing still laid out (${s1.boxes} boxes)`)
    assert(
      s0.height === s1.height && s1.height === s2.height,
      `the pane's scroll height moved: ${s0.height}, ${s1.height}, ${s2.height}`,
    )
    assert(
      !s2.kept && s2.boxes > 0 && s2.made === s1.made && s2.restored > s1.restored,
      `page 1 back: ${JSON.stringify({ far: s1, back: s2 })}`,
    )
    assert(inJumpFrame === false, 'page 1 still out of the layout tree in the frame that draws the jump back to it')
    // (Q7: a far kept page holds one bitmap, its page view's, and a copy of its crops' box; the budget counts both)
    assert(
      crops0 && s1.crops?.[0] * s1.crops?.[1] === 0 && s1.away?.length === 4,
      `page 1 far and kept: its crops canvas ${JSON.stringify(s1.crops)} (near ${JSON.stringify(crops0)}), its copy ${JSON.stringify(s1.away)}`,
    )
    assert(
      s1.keptN === 1 && s1.keptPx === s1.viewPx + s1.away[2] * s1.away[3],
      `page 1 kept: the budget counts ${s1.keptPx} px for its page view's ${s1.viewPx} and its copy's ${JSON.stringify(s1.away)}`,
    )
    // (back in the jump's own frame with the crops it held, pixel for pixel with alpha, from the copy: no crop render)
    assert(
      JSON.stringify(jump.crops) === JSON.stringify(crops0) && s2.agains === s1.agains,
      `page 1 back: its crops canvas in the jump's frame ${JSON.stringify(jump.crops)}, before it went far ${JSON.stringify(crops0)}; crops drawn again ${s1.agains} -> ${s2.agains}`,
    )
    // (a zoom while it was far: no copy fits; its crops drawn again at the new scale before it goes back into the layout tree)
    assert(
      backAt?.[0] > 0 && s3.away?.length === 4 && backAt[0] !== crops0[0] && s4.agains > s3.agains,
      `page 1 back after a zoom while far: its crops canvas as it went back into the layout tree ${JSON.stringify(backAt)} (the grid before ${crops0?.slice(0, 2)}); crops drawn again ${s3.agains} -> ${s4.agains}`,
    )
    assert(before.equals(after), 'page 1 back is not the same pixels as before it went far')
    const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= 1)
    assert(
      !z.kept && near(z.holder, z.slot) && near(z.svg, z.slot) && z.slot[0] > 0,
      `page 1 back after a zoom while far: ${JSON.stringify(z)}`,
    )
    return {
      height: s0.height,
      made: s2.made,
      restored: s2.restored,
      bytes: after.length,
      copy: s1.away,
      zoomed: { scale: zoomed, ...z, back: backAt, agains: [s3.agains, s4.agains] },
    }
  },
)

// ---------------------------------------------------------------- the links of a page laid by the reader's own typesetter
/** the fates of a part's link that draw it (packages/typeset lay/links.ts LinkFate: at its box, or moved with what it is over);
 *  `unmatched`, `unplaced`, `targets`, `off` drop it, `away` is another page's */
const DRAWN_FATES = ['free', 'unlaid', 'kept', 'crop', 'text', 'pair', 'whole']
/** page n's links as the reader's own typesetter made them: each part link of the page with its fate, the fates' lay against
 *  the committed page (one lay), an anchor each record; what is wrong, a sentence each */
async function typesetLinks(page, n) {
  const f = await page.evaluate((n) => window.__h.linkFatesOf(n), n)
  const anchors = await page.evaluate((n) => window.__h.linksOf(n), n)
  const wrong = []
  if (!f) return { f, anchors, here: [], wrong: [`page ${n}: no lay of its part`] }
  const here = f.links.filter((l) => l.page === n)
  for (const l of here)
    if (!DRAWN_FATES.includes(l.fate))
      wrong.push(`page ${n}: the link to ${JSON.stringify(l.to)} owned by ${JSON.stringify(l.owner)} ${l.fate}`)
  if (JSON.stringify(f.laid) !== JSON.stringify(f.committed))
    wrong.push(
      `page ${n}: the fates' lay ${JSON.stringify(f.laid)} is not the committed ${JSON.stringify(f.committed)}`,
    )
  if (anchors.length !== (f.committed?.length ?? -1) || (f.committed?.length ?? 0) < here.length)
    wrong.push(`page ${n}: ${here.length} links, ${f.committed?.length} records, ${anchors.length} anchors`)
  return { f, anchors, here, wrong }
}
await check(
  "compose: a laid page's links through the reader's own typesetter, every part link drawn by its fate and an anchor each: out of the paper through the host, inside it on the right, one no member owns at its own box (s1-columns)",
  async () => {
    if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns', { typeset: true }))
    await laidShown(page, 1)
    const p1 = await typesetLinks(page, 1)
    const ext = p1.anchors.find((l) => l.href === 'https://example.invalid/reader'),
      inner = p1.anchors.find((l) => l.href?.startsWith('#'))
    if (ext) await page.mouse.click(ext.rect.x + ext.rect.width / 2, ext.rect.y + ext.rect.height / 2)
    const before = await page.evaluate(() => document.querySelector('.axt-pane.right').scrollTop)
    if (inner) await page.mouse.click(inner.rect.x + inner.rect.width / 2, inner.rect.y + inner.rect.height / 2)
    // (a document this short ends before page 2 can stand at the top: the jump brings it into view. The jump is the pane's move
    // from where it stood: page 2 in view and the pane scrolled were both so before the click, and the reads of page 2 that
    // followed a late jump read it before the move, 642 px and 78 px from where it was then, 2026-11-13)
    const jumped = inner
      ? await waitFor(
          page,
          (y) => window.__h.panes.right.inView(2) && document.querySelector('.axt-pane.right').scrollTop !== y,
          before,
        ).then(
          () => true,
          () => false,
        )
      : false
    // (page 2: the figure's link, which no member owns, at its own box on A)
    const shown2 = await laidShown(page, 2).then(
      () => true,
      () => false,
    )
    const p2 = shown2 ? await typesetLinks(page, 2) : { f: null, anchors: [], here: [], wrong: ['page 2 not laid'] }
    const free = p2.here.find((l) => l.owner === null)
    const rec = free && (p2.f.committed ?? []).findIndex(([, to]) => JSON.stringify(to) === JSON.stringify(free.to))
    const boxes2 = shown2 ? await page.evaluate(() => window.__h.linkBoxesOf(2)) : []
    const freeA = free && p2.anchors.find((l) => l.href === free.to.url)
    const near = (a, b) => !!a && !!b && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1)
    if (freeA) await page.mouse.click(freeA.rect.x + freeA.rect.width / 2, freeA.rect.y + freeA.rect.height / 2)
    const external = await page.evaluate(() => window.__h.external)
    await context.close()
    assert(!errors.length, errors.join('; '))
    const wrong = [...p1.wrong, ...p2.wrong]
    assert(!wrong.length, wrong.join('; '))
    assert(ext && inner, `page 1's anchors ${JSON.stringify(p1.anchors)}`)
    assert(jumped, `the link inside the paper ${JSON.stringify(inner)} did not bring page 2 into view`)
    assert(
      free?.fate === 'free' && rec >= 0 && JSON.stringify(p2.f.committed[rec][0]) === JSON.stringify(free.box),
      `the link no member owns ${JSON.stringify(free)} not at its box: ${JSON.stringify(p2.f?.committed)}`,
    )
    assert(
      near(freeA?.rect, boxes2[rec]),
      `its anchor ${JSON.stringify(freeA?.rect)} against its box ${JSON.stringify(boxes2[rec])}`,
    )
    assert(
      JSON.stringify(external) === JSON.stringify(['https://example.invalid/reader', 'https://example.invalid/figure']),
      `opened ${JSON.stringify(external)}`,
    )
    return {
      fates: [...p1.here, ...p2.here].map((l) => l.fate),
      anchors: [p1.anchors.length, p2.anchors.length],
      external,
    }
  },
)
await check(
  "compose: a turned page's link through the reader's own typesetter, drawn by its fate, an anchor over its box, out of the paper through the host (s3-turned)",
  async () => {
    if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s3-turned'].original)
    await page.evaluate(() => window.__h.layer('s3-turned', { typeset: true }))
    await laidShown(page, 1)
    const p1 = await typesetLinks(page, 1)
    const boxes = await page.evaluate(() => window.__h.linkBoxesOf(1))
    const a = p1.anchors.find((l) => l.href === 'https://example.invalid/turned')
    if (a) await page.mouse.click(a.rect.x + a.rect.width / 2, a.rect.y + a.rect.height / 2)
    const external = await page.evaluate(() => window.__h.external)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!p1.wrong.length, p1.wrong.join('; '))
    const near = (x, y) => !!x && !!y && ['x', 'y', 'width', 'height'].every((k) => Math.abs(x[k] - y[k]) <= 1)
    assert(
      a && boxes.length === 1 && near(a.rect, boxes[0]),
      `the turned page's link ${JSON.stringify(a?.rect)} against its box ${JSON.stringify(boxes)}`,
    )
    assert(external.includes('https://example.invalid/turned'), `a click on it opened ${JSON.stringify(external)}`)
    return { fates: p1.here.map((l) => l.fate), anchors: p1.anchors.length }
  },
)
await check(
  "compose: a note the source ties to the author block follows the names option through the reader's own typesetter: off as printed, on its variant with the block's name, never its own row; off and on again the same two drawings (s4-author, ICML's footnote shape; the owner's ruling of 2026-11-13, PDF-READER §18.71)",
  async () => {
    if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
    const OFF = { figures: true, tables: true, heads: true, references: false, names: false }
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s4-author'].original)
    await page.evaluate((c) => window.__h.layer('s4-author', { typeset: true, classes: c }), OFF)
    await laidShown(page, 1)
    // (the footnote: the ink unit locate cut of the places its class stores, of the names, with a variant naming the author)
    const ord = await page.evaluate(
      () =>
        window.__h.parts
          .get(1)
          .flows.flat()
          .find((m) => m.kind === 'inknames')?.ord,
    )
    const note = () => page.evaluate((o) => window.__h.drawnOf(1).find((m) => m.ord === o), ord)
    const drawings = [await note()]
    for (const names of [true, false, true]) {
      const from = await page.evaluate(() => window.__h.marks.length)
      await page.evaluate((c) => window.__h.setClasses(c), { ...OFF, names })
      await waitFor(page, (n) => window.__h.marks.slice(n).some((m) => m.what === 'laid' && m.page === 1), from, 10_000)
      await page.waitForTimeout(300)
      drawings.push(await note())
    }
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(ord !== undefined, 'no note of the names on page 1')
    const [off, on, off2, on2] = drawings
    assert(off?.state === 'left' && off2?.state === 'left', `off: ${JSON.stringify([off, off2])}`)
    assert(JSON.stringify(on2) === JSON.stringify(on), `on again: ${JSON.stringify(on2)}`)
    // (the variant's row with the block's translation of the name, "Zur nnA eeL", set for its element; the note's own row reads
    // "nnA .eeL", the stop inside the reversed word)
    assert(
      on?.state === 'laid' && /:ot Zur nnA eeL\./.test(on.text) && !/\.eeL/.test(on.text),
      `on: ${JSON.stringify(on)}`,
    )
    assert(new Set(drawings.map((d) => JSON.stringify(d))).size === 2, `the drawings: ${JSON.stringify(drawings)}`)
    return { ord, off: off.state, on: on.text }
  },
)
await check(
  'compose: a crop the typesetter cut over two lines (a URL broken) read by the text layer and its copy once, whole, in order (s1-columns)',
  async () => {
    // (the formula "f(x)=x+1" is one item of PDF.js's text, as a URL may be; its crop cut after "f(x)=", the item's middle under
    // the head, the parts given no copy text of their own (2610.21547v1's URLs have none): each part reads the page's characters
    // under it, no space where the line breaks between them)
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns', { cut: { piece: '1', share: 5 / 8, text: ['', ''] } }))
    await laidShown(page, 1)
    await waitFor(page, () => !!window.__h.panes.right.page(1)?.querySelector('.axt-over .textLayer span'))
    const text = await page.evaluate(() => window.__h.textOf(1))
    const spans = await page.evaluate(() =>
      [...window.__h.panes.right.page(1).querySelectorAll('.axt-over .textLayer span')].map((x) => x.textContent),
    )
    await context.close()
    assert(!errors.length, errors.join('; '))
    const count = (s, t) => s.split(t).length - 1
    const around = (s) => {
      const i = s.indexOf('f(x)')
      return i < 0 ? s.slice(0, 120) : s.slice(Math.max(0, i - 30), i + 40)
    }
    assert(
      count(text.text, 'f(x)=') === 1 && count(text.text, 'x+1') === 1 && text.text.includes('f(x)=x+1'),
      `the layer reads ${JSON.stringify(around(text.text))}`,
    )
    const at = spans.indexOf('f(x)=')
    assert(
      at >= 0 && spans[at + 1] === 'x+1',
      `the parts' spans ${JSON.stringify(spans.slice(Math.max(0, at - 1), at + 3))}`,
    )
    const copied = text.copied
    assert(
      count(copied, 'f(x)=') === 1 && count(copied, 'x+1') === 1 && copied.includes('f(x)=x+1'),
      `the copy reads ${JSON.stringify(around(text.copied))}`,
    )
    return { layer: around(text.text), copied: around(text.copied) }
  },
)
await check(
  'compose: a crop carries its own ink and leaves another piece’s in its source behind, in the crops canvas of its page view (s1-columns)',
  async () => {
    // (the typesetter states a crop's own ink and its page's every piece's, typeset's lay/clips.ts, and the reader cuts it by
    // its own and a device pixel round it, clear of the others' (paint.ts cropsOf): 2610.21312v1-zh p5 t58, line 2's glyph
    // tops cut with line 1's formula and left behind as dots; here the formula's crop given the left half of its source as its
    // own ink and the right half as another piece's, and the crops canvas read: ink left of the edge, none right of it)
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    const r = await page.evaluate(() => window.__h.layer('s1-columns', { clip: { piece: '1', share: 1 / 2 } }))
    const n = r.clipped.page
    await laidShown(page, n)
    await waitFor(page, (n) => !!window.__h.panes.right.page(n)?.querySelector('.axt-over > canvas.axt-crops'), n)
    const ink = await page.evaluate(
      async ({ n, edge, box }) => {
        const c = window.__h.panes.right.page(n).querySelector('.axt-over > canvas.axt-crops')
        const [vx0, vy0, vx1, vy1] = (await window.__h.composed.getPage(n)).view
        const X = (x) => ((x - vx0) * c.width) / (vx1 - vx0),
          Y = (y) => ((vy1 - y) * c.height) / (vy1 - vy0)
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let left = 0,
          right = 0
        const cut = X(edge)
        for (let y = Math.floor(Y(box[3])); y < Math.ceil(Y(box[1])); y++)
          for (let x = Math.floor(X(box[0])); x < Math.ceil(X(box[2])); x++) {
            const i = (y * c.width + x) * 4
            if (d[i + 3] < 128 || 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 128) continue
            if (x + 1 <= cut) left++
            else if (x >= cut + 1) right++
          }
        return { left, right, px: [c.width, c.height] }
      },
      { n, edge: r.clipped.edge, box: r.clipped.box },
    )
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      ink.left > 0 && ink.right === 0,
      `the crop's ink: ${ink.left} px left of its own ink's edge, ${ink.right} right of it`,
    )
    return ink
  },
)
await check(
  'compose: a language switch reuses the composed document, the parts and the place; a unit not laid in the new language has its groups back on (s1-columns)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.evaluate(() => window.__h.panes.goToPage('right', 2))
    await laidShown(page, 2)
    await page.waitForTimeout(300)
    // (page 2's units laid with their groups off; the first one whose text group is off is refused in the new language)
    const was = await page.evaluate(() => window.__h.groupsOf(2))
    const refused = was.find((m) => m.state === 'laid' && m.off & 1 && typeof m.id === 'string')
    assert(refused, `no unit laid with its text off on page 2: ${JSON.stringify(was)}`)
    assert(
      was.every((m) => m.state !== 'laid' || [1, 2, 4].every((bit, i) => !(m.off & bit) || m.on[i] === false)),
      `a laid unit's group on: ${JSON.stringify(was)}`,
    )
    const asked = server.log.length
    const k = await page.evaluate(() => window.__h.marks.length)
    const r = await page.evaluate(
      (id) => window.__h.retarget('fr', 's1-columns', { rowsOf: 'de', refuse: [id] }),
      refused.id,
    )
    // (page 2 laid again in the new language and in place)
    await waitFor(
      page,
      (k) =>
        window.__h.marks.slice(k).some((m) => m.what === 'shown' && m.page === 2 && String(m.key).startsWith('laid:')),
      k,
    )
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => ({ place: window.__h.panes.reading(), probe: window.__h.composer.probe() }))
    const now = await page.evaluate(() => window.__h.groupsOf(2))
    const newAsks = server.log
      .slice(asked)
      .map((l) => l.path)
      .filter((p) => p.startsWith('/api/v2/'))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r.sameComposed, 'the composed document was opened again')
    assert(newAsks.length === 0, `asked again: ${newAsks.join(', ')}`)
    assert(
      r.before.place?.page === after.place?.page && Math.abs(r.before.place.at - after.place.at) < 0.02,
      `the place moved: ${JSON.stringify([r.before.place, after.place])}`,
    )
    // (the refused unit the original's on its page: every group of it on in `laid`; the others laid again, theirs off)
    const gone = now.find((m) => m.ord === refused.ord)
    assert(
      gone && gone.state !== 'laid' && gone.on.every((v) => v !== false),
      `the refused unit: ${JSON.stringify(gone)}`,
    )
    for (const m of now)
      if (m.state === 'laid')
        assert(
          [1, 2, 4].every((bit, i) => !(m.off & bit) || m.on[i] === false),
          `unit ${m.ord} laid with a group on: ${JSON.stringify(m)}`,
        )
    return {
      place: after.place,
      laidPages: after.probe.laidPages,
      objectsAskedAgain: newAsks.length,
      refused: { ord: refused.ord, before: refused.on, after: gone.on },
    }
  },
)
await check(
  "compose: a zoom and a pinch over a laid page keep it laid, its overlay the page's frame (s1-columns)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const frame = () =>
      page.evaluate(() => {
        const s = document.querySelector('.axt-pane.right .axt-slot[data-page-number="1"] > .axt-slot-view')
        const v = s.querySelector('.axt-over > svg').getBoundingClientRect(),
          c = s.getBoundingClientRect()
        return {
          key: window.__h.panes.right.showing(1),
          dw: Math.abs(v.width - c.width),
          dh: Math.abs(v.height - c.height),
        }
      })
    const out = []
    for (const z of ['zoomBy(1.25)', 'zoomTo(2)', "zoomTo('page-width')"]) {
      await page.evaluate(`window.__h.panes.${z}`)
      await page.waitForTimeout(800)
      out.push(await frame())
    }
    await page.evaluate(async () => {
      const p = window.__h.panes,
        r = document.querySelector('.axt-pane.right').getBoundingClientRect()
      for (let i = 0; i < 6; i++) {
        p.pinch('right', 1.06, [r.left + 300, r.top + 200])
        await new Promise((f) => requestAnimationFrame(f))
      }
    })
    await page.waitForTimeout(800)
    out.push(await frame())
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const f of out)
      assert(String(f.key).startsWith('laid:') && f.dw < 1.5 && f.dh < 1.5, `after a zoom: ${JSON.stringify(f)}`)
    return { steps: out.length }
  },
)

await check(
  'compose: the highlight from lit on both panes, the same unit, what is painted is what is hit (s1-columns)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const ords = await page.evaluate(() =>
      window.__h.composer
        .laid(1)
        .members.filter((m) => m.state === 'laid')
        .map((m) => m.ord),
    )
    const out = []
    for (const ord of ords.slice(0, 4)) {
      for (const side of ['right', 'left']) {
        const pt = await page.evaluate(([o, s]) => window.__h.pointOf(1, o, s), [ord, side])
        if (!pt) continue
        await page.mouse.move(pt.x, pt.y)
        await page.waitForTimeout(80)
        const r = await page.evaluate(() => ({ lit: window.__h.highlight.lit, bands: window.__h.highlight.bands() }))
        out.push({
          ord,
          side,
          lit: r.lit?.id ?? null,
          bands: r.bands,
          // (its sentences' shapes; its displays, blocks of their own, never with it)
          want: { left: pt.left, right: pt.right },
        })
      }
    }
    await page.mouse.move(5, 5)
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => ({ lit: window.__h.highlight.lit, bands: window.__h.highlight.bands() }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const x of out)
      assert(
        x.lit === x.ord && x.bands.left === x.want.left && x.bands.right === x.want.right,
        `hovering ${x.side} over ${x.ord}: ${JSON.stringify(x)}`,
      )
    assert(
      after.lit === null && after.bands.left === 0 && after.bands.right === 0,
      `a miss kept ${JSON.stringify(after)}`,
    )
    return { hovers: out.length }
  },
)

await check(
  'compose: a sentence across a display lit as a bar on each of its rows, the display never with it, on both panes; the display alone where hovered (s1-columns, a member’s lit restated)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    // (a laid member's first four lines on A in one column, restated as the typesetter states a sentence going on past a display
    // (the owner's report of 2026-11-09, 2602.23285v2 p15): its first line one sentence, its second and fourth the next, its
    // third a display of its own (piece 901) between them; the same boxes on both panes)
    const got = await page.evaluate(() => {
      for (const m of window.__h.composer.laid(1).members) {
        if (m.state !== 'laid' || m.lit.dir || m.lit.left.length !== 1) continue
        const rows = [...m.lit.left[0]].sort((a, b) => b[3] - a[3]).slice(0, 4)
        if (
          rows.length < 4 ||
          rows.some((b, i) => i && Math.min(b[2], rows[i - 1][2]) - Math.max(b[0], rows[i - 1][0]) < 20)
        )
          continue
        const per = [[rows[0]], [rows[1], rows[3]]]
        m.lit = { left: per, right: per, own: [['901', [rows[2]]]] }
        return { ord: m.ord, row: rows[1], display: rows[2] }
      }
      return null
    })
    assert(got, 'no laid member of four lines in one column on page 1')
    const pointAt = (side, b) =>
      page.evaluate(
        ([s, b]) => {
          const el = window.__h.panes.pageElement(s, 1),
            q = window.__h.panes.boxOf(s, 1, b),
            r = el.getBoundingClientRect()
          return { x: r.left + el.clientLeft + q.left + q.width / 2, y: r.top + el.clientTop + q.top + q.height / 2 }
        },
        [side, b],
      )
    /** each pane's outlines painted and whether one of them holds the display's middle (the path's own fill) */
    const painted = () =>
      page.evaluate((d) => {
        const out = {}
        for (const side of ['left', 'right']) {
          const layer = window.__h.panes.pageElement(side, 1).querySelector(':scope > .axt-hl-layer')
          const q = window.__h.panes.boxOf(side, 1, d),
            mx = q.left + q.width / 2,
            my = q.top + q.height / 2
          let outlines = 0,
            filled = false
          for (const el of layer?.children ?? []) {
            const [L, T, W, H] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(el.style[k]))
            const path = el.querySelector('path')
            if (path) {
              outlines += (path.getAttribute('d').match(/M/g) ?? []).length
              if (path.isPointInFill(new DOMPoint(mx - L, my - T))) filled = true
            } else {
              outlines++
              if (mx >= L && mx <= L + W && my >= T && my <= T + H) filled = true
            }
          }
          out[side] = { outlines, filled }
        }
        return out
      }, got.display)
    const steps = {}
    for (const side of ['right', 'left']) {
      const pt = await pointAt(side, got.row)
      await page.mouse.move(pt.x, pt.y)
      await page.waitForTimeout(80)
      steps[`sentence from ${side}`] = {
        lit: await page.evaluate(() => window.__h.highlight.lit),
        ...(await painted()),
      }
    }
    const pd = await pointAt('left', got.display)
    await page.mouse.move(pd.x, pd.y)
    await page.waitForTimeout(80)
    steps.display = {
      lit: await page.evaluate(() => window.__h.highlight.lit),
      bands: await page.evaluate(() => window.__h.highlight.bands()),
      ...(await painted()),
    }
    await page.mouse.move(3, 3)
    await page.waitForTimeout(300)
    await page.evaluate((o) => window.__h.highlight.light({ id: o, s: -1 }), got.ord)
    steps.whole = { bands: await page.evaluate(() => window.__h.highlight.bands()), ...(await painted()) }
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const side of ['right', 'left']) {
      const x = steps[`sentence from ${side}`]
      assert(
        x.lit?.id === got.ord && x.lit.s === 1 && ['left', 'right'].every((p) => x[p].outlines === 2 && !x[p].filled),
        `the sentence hovered from the ${side}: ${JSON.stringify(x)}`,
      )
    }
    const d = steps.display
    assert(
      d.lit?.id === got.ord &&
        d.lit.s === -2 - 901 &&
        d.bands.left === 1 &&
        d.bands.right === 1 &&
        d.left.filled &&
        d.right.filled,
      `the display hovered: ${JSON.stringify(d)}`,
    )
    const w = steps.whole
    assert(
      w.bands.left === 2 && w.bands.right === 2 && ['left', 'right'].every((p) => w[p].outlines === 3 && !w[p].filled),
      `the member lit whole: ${JSON.stringify(w)}`,
    )
    return { ord: got.ord }
  },
)

await check(
  "compose: a turned page's highlight and links turned with it on both panes, its lines lit end to end, what is painted is what is hit (s3-turned)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s3-turned'].original)
    await page.evaluate(() => window.__h.layer('s3-turned'))
    await laidShown(page, 1)
    // (page 1, turned a quarter: its laid member of the most lines)
    const ord = await page.evaluate(() => {
      const ms = window.__h.composer.laid(1).members.filter((m) => m.state === 'laid')
      ms.sort((a, b) => b.lit.right.flat().length - a.lit.right.flat().length)
      for (const s of ['left', 'right']) window.__h.panes.pageElement(s, 1).id = `axt-shot-${s}`
      return ms[0].ord
    })
    const shoot = async () => ({
      left: (await page.locator('#axt-shot-left').screenshot({ animations: 'disabled' })).toString('base64'),
      right: (await page.locator('#axt-shot-right').screenshot({ animations: 'disabled' })).toString('base64'),
    })
    const unlit = await shoot()
    const pt = await page.evaluate((o) => window.__h.pointOf(1, o, 'right'), ord)
    await page.mouse.move(pt.x, pt.y)
    await page.waitForTimeout(150)
    const lit = await page.evaluate(() => window.__h.highlight.lit)
    const shot = await shoot()
    const sides = {}
    for (const side of ['left', 'right']) {
      const points = await page.evaluate(([o, s]) => window.__h.linePoints(1, o, s), [ord, side])
      const differ = await page.evaluate(
        ([a, b, at]) => window.__h.differAt(a, b, at),
        [unlit[side], shot[side], points.map((p) => p.at)],
      )
      // (each point hovered lights the same member: the point turned back into the page's frame finds its row)
      const hits = []
      for (const p of points) {
        await page.mouse.move(p.x, p.y)
        await page.waitForTimeout(40)
        hits.push(await page.evaluate(() => window.__h.highlight.lit?.id ?? null))
      }
      sides[side] = { points: points.length, unlitAt: differ.filter((d) => d === 0).length, hits }
    }
    // (its link turned with it: the anchor where the page's link box shows, a click on it out through the host)
    const links = await page.evaluate(() => window.__h.linksOf(1))
    const boxes = await page.evaluate(() => window.__h.linkBoxesOf(1))
    const a = links.find((l) => l.href?.startsWith('https:'))
    if (a) await page.mouse.click(a.rect.x + a.rect.width / 2, a.rect.y + a.rect.height / 2)
    const external = await page.evaluate(() => window.__h.external)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      a && boxes.length === 1 && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a.rect[k] - boxes[0][k]) <= 1),
      `the turned page's link ${JSON.stringify(a?.rect)} against its box ${JSON.stringify(boxes)}`,
    )
    assert(external.includes('https://example.invalid/turned'), `a click on it opened ${JSON.stringify(external)}`)
    assert(lit?.id === ord, `hovering ${ord} lit ${JSON.stringify(lit)}`)
    for (const [side, s] of Object.entries(sides)) {
      assert(s.points >= 6 && s.unlitAt === 0, `${side}: ${s.unlitAt} of ${s.points} points along the lines not lit`)
      assert(
        s.hits.every((h) => h === ord),
        `${side}: the points along the lines light ${JSON.stringify(s.hits)}, not ${ord}`,
      )
    }
    return { ord, points: { left: sides.left.points, right: sides.right.points } }
  },
)

// ---------------------------------------------------------------- deliverables 5 and 6: openReader with a fake host
const probe = (page) => page.evaluate((i) => window.__h.readers[i ?? 0].reader.probe(), 0)
const readerLaid = (page, i = 0) =>
  waitFor(
    page,
    (i) => {
      const p = window.__h.readers[i].reader.probe()
      return p.laidPages > 0 && p['at.rightDrawn'] !== undefined
    },
    i,
    25_000,
  ).catch(async (e) => {
    throw new Error(
      `${e.message.split('\n')[0]}: ${JSON.stringify(await page.evaluate((i) => ({ probe: window.__h.readers[i].reader.probe(), state: window.__h.readers[i].reader.state(), asked: window.__h.readers[i].asked.map((a) => a.url).slice(0, 12) }), i))}`,
    )
  })
await check(
  "reader: the original at once, the layer's code after the left's page 1, the pages laid (website host)",
  async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web' }))
    await readerLaid(page)
    const p = await probe(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      r.askedBeforeReturn.some((u) => u.startsWith(indexOf['s1-columns'].original)),
      `asked before openReader returned: ${JSON.stringify(r.askedBeforeReturn)}`,
    )
    assert(
      p['at.code'] >= p['at.leftDrawn'],
      `the layer's code (${p['at.code']} ms) before the left's page 1 (${p['at.leftDrawn']} ms)`,
    )
    assert(
      st.layer.s === 'ready' && st.original.s === 'open' && st.rows.s === 'complete',
      `state ${JSON.stringify([st.original, st.layer, st.rows])}`,
    )
    return { moments: Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('at.'))), rows: st.rows }
  },
)
/** a fixture's layer as its head names it: its units, the contents' entries the reader's own rule makes of them, and how many
 *  the view counts (those not kept, of a kind the toggles show by default) */
function headLayerOf(name) {
  const f = fixtures[name]
  const head = JSON.parse(readFileSync(join(f.bundle, 'head.json'), 'utf8'))
  const units = head.units.flatMap((u) => JSON.parse(readFileSync(join(f.bundle, `${u}.units`), 'utf8')).units)
  return {
    units,
    entries: createContents(units, head).entries(),
    counted: units.filter((u) => !u.kept && kindShown(u.kind)).length,
  }
}
await check(
  "contents: every heading one entry over our server's document, which names the source's units ahead of the head's: just opened, after a part is read, after the panel is closed and opened; the view's count the head's units'; the source's object never asked (staging RB1, 2026-11-13: 2608.25210v2's 25 headings listed as 50 entries)",
  async () => {
    const want = headLayerOf('s1-columns')
    const { page, context, errors } = await newPage({ path: 'chrome.html' })
    const asked = []
    page.on('request', (r) => asked.push(new URL(r.url()).pathname))
    await page.evaluate((n) => window.__c.open(n, {}), 's1-columns')
    await waitFor(
      page,
      () => (window.__c.reader?.probe().laidPages ?? 0) > 0 && window.__c.reader.state().view.outline.length > 0,
      null,
      25_000,
    )
    /** the panel's rows (their titles, whether shown), the reader's entries (their originals) and the view's count */
    const seen = () =>
      page.evaluate(() => {
        const s = window.__c.reader.state()
        const panel = document.getElementById('axt-contents')
        return {
          open: !!panel && !panel.inert,
          rows: [...(panel?.querySelectorAll('.toc-list > li') ?? [])].map(
            (li) => li.querySelector('.t')?.textContent ?? '',
          ),
          shown: [...(panel?.querySelectorAll('.toc-list > li') ?? [])].filter((li) => !li.hidden).length,
          entries: s.view.outline.map((e) => e.original),
          total: s.rows.total ?? null,
        }
      })
    const toggle = page.locator('button[aria-controls="axt-contents"]')
    await toggle.click()
    await page.waitForTimeout(200)
    const opened = await seen()
    // (a part read: the last entry gone to, its page's part read and its members placed, as a page brought near places them)
    const last = await page.evaluate(() => window.__c.reader.state().view.outline.at(-1)?.id ?? null)
    await page.evaluate((id) => window.__c.reader.do({ do: 'heading', id }), last)
    await waitFor(
      page,
      (id) => !!window.__c.reader.state().view.outline.find((e) => e.id === id)?.page,
      last,
      10_000,
    ).catch(() => undefined)
    await page.waitForTimeout(200)
    const placed = await seen()
    await toggle.click()
    await page.waitForTimeout(200)
    const closed = await seen()
    await toggle.click()
    await page.waitForTimeout(200)
    const again = await seen()
    await context.close()
    assert(!errors.length, errors.join('; '))
    const n = want.entries.length
    const once = (x) =>
      x.entries.length === n &&
      x.rows.length === n &&
      JSON.stringify(x.entries) === JSON.stringify(want.entries.map((e) => e.original))
    for (const [moment, x] of [
      ['just opened', opened],
      ['after a part is read', placed],
      ['after the panel is closed and opened', again],
    ])
      assert(x.open && once(x), `${moment}: ${n} headings wanted, ${JSON.stringify(x)}`)
    assert(!closed.open && once(closed), `closed: ${JSON.stringify(closed)}`)
    assert(opened.total === want.counted, `the view counts ${opened.total} units, the head names ${want.counted}`)
    const source = indexOf['s1-columns'].source
    assert(
      !asked.some((p) => p.endsWith(source)),
      `the source's object asked: ${asked.filter((p) => p.includes('/fx/'))}`,
    )
    return { entries: n, shown: again.shown, counted: opened.total }
  },
)
await check(
  "rows made here: the units the head names handed to the translator, each once, and the context's abstract once; the source's units our server's document names ahead of them never read (staging RB1, 2026-11-13)",
  async () => {
    const want = headLayerOf('s1-columns')
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'ext' }))
    await readerLaid(page)
    await waitFor(page, () => window.__h.readers[0].reader.state().rows.s === 'complete', null, 20_000)
    const x = await page.evaluate(() => ({
      translated: window.__h.readers[0].translated,
      asked: window.__h.readers[0].asked.map((a) => a.url),
      total: window.__h.readers[0].reader.state().rows.total,
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    const ids = want.units.filter((u) => !u.kept).map((u) => u.id)
    const first = x.translated[0]
    assert(
      first && first.ids.length === new Set(first.ids).size && [...first.ids].sort().join() === [...ids].sort().join(),
      `the first call: ${first?.ids.length} units (${new Set(first?.ids).size} ids), the head's ${ids.length}`,
    )
    const abstract = plainOf(want.units.find((u) => u.kind === 'abstract').content)
    const lead = abstract.slice(0, 32)
    assert(
      (first.context?.abstract ?? '').split(lead).length === 2,
      `the context's abstract holds its first words ${(first.context?.abstract ?? '').split(lead).length - 1} times`,
    )
    assert(x.total === want.counted, `the view counts ${x.total} units, the head names ${want.counted}`)
    const source = indexOf['s1-columns'].source
    assert(
      !x.asked.some((u) => u.endsWith(source)),
      `the source's object asked: ${x.asked.filter((u) => u.includes('/fx/'))}`,
    )
    return { asked: first.ids.length, calls: x.translated.length, counted: x.total }
  },
)
await check('reader: a paper being prepared, opened and followed to its layer (website host)', async () => {
  const seg = indexOf['s2-splits'].seg
  modes[seg] = { kind: 'not-opened', prepareMs: 600 }
  const { page, context, errors } = await newPage()
  await page.evaluate(() => window.__h.reader('s2-splits', { host: 'web' }))
  // (the layer's states as the reader told them, every one from its first: a poll's samples missed the preparing of a loaded
  // machine, its first one already past it, 2026-11-13)
  await waitFor(page, () => window.__h.readers[0].reader.state().layer.s === 'ready', null, 20_000).catch(
    () => undefined,
  )
  const seen = new Set(await page.evaluate(() => window.__h.readers[0].layers))
  await readerLaid(page)
  await context.close()
  delete modes[seg]
  // (the follow's 404 of a paper not opened is the browser's console line, and expected)
  assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
  const opens = v2log.filter((x) => x.what === 'open' && x.ask.paper === '2600.00003')
  assert(opens.length === 1 && opens[0].ask.target === 'de', `opens ${JSON.stringify(opens)}`)
  assert(seen.has('preparing') && seen.has('ready'), `layer states ${[...seen]}`)
  return { layer: [...seen] }
})
await check(
  'reader: a stale layer (another build than our server runs) with no run of the target: opened once, after the first follow; the old layer drawn and followed meanwhile; the new catalog, its own parts and its rows taken when they land (staging, 2026-11-08)',
  async () => {
    const seg = indexOf['s2-splits'].seg
    modes[seg] = { kind: 'stale', prepareMs: 1500 }
    const from = v2log.length
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s2-splits', { host: 'web' }))
      const seen = []
      const t0 = Date.now()
      for (;;) {
        const s = await page.evaluate(() => {
          const r = window.__h.readers[0].reader
          return { layer: r.state().layer.s, rows: r.state().rows.s, laid: r.probe().laidPages }
        })
        if (seen.at(-1) !== s.layer) seen.push(s.layer)
        if (s.rows === 'complete' && s.laid > 0) break
        if (Date.now() - t0 > 25_000)
          throw new Error(`not laid in 25 s: ${JSON.stringify({ s, seen, v2: v2log.slice(from).map((x) => x.what) })}`)
        await page.waitForTimeout(50)
      }
      const asked = await page.evaluate(() => window.__h.readers[0].asked.map((a) => a.url))
      // (the layer's states as the reader told them, every one from its first: the loop's polls began, on a loaded machine, with
      // the old layer already in, 2026-11-13)
      const told = await page.evaluate(() => window.__h.readers[0].layers)
      // (what the composer laid the new catalog's pages from: the parts it was given, as the engine's lay is handed them)
      const lays = await page.evaluate(() => {
        const marks = window.__h.marks
        const gen = Math.max(...marks.filter((m) => m.what === 'lay-asked').map((m) => m.gen))
        return marks.filter((m) => m.what === 'lay' && m.gen === gen).map((m) => [m.page, m.members])
      })
      await context.close()
      assert(!errors.length, errors.join('; '))
      const mine = v2log.slice(from).filter((x) => x.what === 'open' || x.seg === seg)
      const opens = mine.filter((x) => x.what === 'open')
      assert(opens.length === 1 && opens[0].ask.target === 'de', `opens ${JSON.stringify(opens)}`)
      assert(mine[0]?.what === 'follow', `the follow first: ${JSON.stringify(mine.slice(0, 2))}`)
      // (the old layer kept while the paper is prepared again: ready from its first document on, never let go)
      assert(told.join() === 'none,ready', `layer states ${told}`)
      // (the new catalog's pages laid from its own parts, never from the parts of the head before: staging, 1706.03762v7)
      const fresh = [rebuilt[seg].catalog.sha256, ...rebuilt[seg].parts]
      const unread = fresh.filter((d) => !asked.some((u) => u.endsWith(d)))
      assert(!unread.length, `the new layer's objects not read: ${unread}`)
      assert(
        lays.length && lays.every(([n, k]) => k === rebuilt[seg].members[n]),
        `the new catalog's pages laid from the parts before: ${JSON.stringify({ lays, members: rebuilt[seg].members })}`,
      )
      return { layer: told, follows: mine.length - opens.length, parts: rebuilt[seg].parts.length }
    } finally {
      delete modes[seg]
    }
  },
)
await check(
  "reader: a stale layer under the extension's host (rows made here): opened once naming no target, after the first follow; followed while the paper is prepared again, the old layer drawn meanwhile; the new catalog taken when it lands and laid from its own parts (#634 review)",
  async () => {
    const seg = indexOf['s2-splits'].seg
    modes[seg] = { kind: 'stale', prepareMs: 1500 }
    const from = v2log.length
    const fresh = [rebuilt[seg].catalog.sha256, ...rebuilt[seg].parts]
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s2-splits', { host: 'ext' }))
      const seen = []
      const t0 = Date.now()
      for (;;) {
        const s = await page.evaluate(() => {
          const x = window.__h.readers[0]
          const marks = window.__h.marks
          const gen = Math.max(0, ...marks.filter((m) => m.what === 'lay-asked').map((m) => m.gen))
          return {
            layer: x.reader.state().layer.s,
            rows: x.reader.state().rows.s,
            laid: x.reader.probe().laidPages,
            asked: x.asked.map((a) => a.url),
            lays: marks.filter((m) => m.what === 'lay' && m.gen === gen).map((m) => [m.page, m.members]),
          }
        })
        if (seen.at(-1) !== s.layer) seen.push(s.layer)
        const unread = fresh.filter((d) => !s.asked.some((u) => u.endsWith(d)))
        // (rows made here end over the old layer before the new one lands: done once the new catalog's pages are laid)
        const laidNew = s.lays.length && s.lays.every(([n, k]) => k === rebuilt[seg].members[n])
        if (!unread.length && laidNew && s.rows === 'complete' && s.laid > 0) break
        if (Date.now() - t0 > 25_000)
          throw new Error(
            `the new catalog not laid in 25 s: ${JSON.stringify({ layer: s.layer, rows: s.rows, laid: s.laid, unread: unread.length, seen, v2: v2log.slice(from).map((x) => x.what) })}`,
          )
        await page.waitForTimeout(50)
      }
      // (the layer's states as the reader told them, every one from its first, as in the check above)
      const told = await page.evaluate(() => window.__h.readers[0].layers)
      await context.close()
      assert(!errors.length, errors.join('; '))
      const mine = v2log.slice(from).filter((x) => x.what === 'open' || x.seg === seg)
      const opens = mine.filter((x) => x.what === 'open')
      assert(opens.length === 1 && opens[0].ask.target === null, `opens ${JSON.stringify(opens)}`)
      assert(mine[0]?.what === 'follow', `the follow first: ${JSON.stringify(mine.slice(0, 2))}`)
      assert(
        mine.every((x) => x.what === 'open' || !/[?&]t=/.test(x.query)),
        `a target named: ${JSON.stringify(mine)}`,
      )
      // (the old layer kept while the paper is prepared again: ready from its first document on, never let go)
      assert(told.join() === 'none,ready', `layer states ${told}`)
      return { layer: told, follows: mine.length - opens.length, parts: rebuilt[seg].parts.length }
    } finally {
      delete modes[seg]
    }
  },
)
await check(
  'reader: the page put away into the back-forward cache: our server not followed while away, followed anew once shown from it, the panes kept; a page that navigates away and back restored from the cache where the browser keeps it (L11 third round, item 8)',
  async () => {
    const seg = indexOf['s1-columns'].seg
    modes[seg] = { kind: 'not-opened', prepareMs: 120_000 }
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web' }))
      await waitFor(page, () => window.__h.readers[0].reader.state().layer.s === 'preparing', null, 20_000)
      const follows = () => v2log.filter((x) => x.what === 'follow' && x.seg === seg).length
      // (our server polled every 2 s while the paper is prepared)
      const a = follows()
      await page.waitForTimeout(4500)
      const live = follows() - a
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
      const b = follows()
      await page.waitForTimeout(6000)
      const away = follows() - b
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
      await page.waitForTimeout(1000)
      const back = follows() - b - away
      const drawn = await page.evaluate(() => document.querySelectorAll('canvas').length)
      // (a reading, not a gate: a real visit away and back, restored from the cache or loaded again as the browser keeps the page;
      // Playwright's Chromium loaded it again on the runs of 2026-11-07, so the events above are dispatched by hand)
      await page.evaluate(() => {
        window.__kept = true
        addEventListener('pageshow', (e) => {
          window.__persisted = e.persisted
        })
      })
      await page.goto(`${server.origin}/chrome.html`)
      await page.goBack()
      const cached = await page.evaluate(() => ({ kept: !!window.__kept, persisted: window.__persisted ?? null }))
      await context.close()
      assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
      assert(live >= 1 && away === 0 && back >= 1 && drawn > 0, JSON.stringify({ live, away, back, drawn }))
      return { live, away, back, drawn, cached }
    } finally {
      delete modes[seg]
    }
  },
)
/** a fixture opened with no engine (the reader's own typesetter), laid; what is drawn, the moments, the site's files asked */
async function typesetLaid(name, target, o = {}) {
  const from = siteLog.length
  const { page, context, errors } = await newPage(o)
  await page.evaluate(([n, t]) => window.__h.reader(n, { host: 'web', typeset: true, target: t }), [name, target])
  await waitFor(page, () => (window.__h.readers[0].reader.probe().laidPages ?? 0) > 0, null, 60_000)
  await waitFor(page, () => document.querySelectorAll('.axt-over > svg').length > 0, null, 10_000).catch(() => {})
  const p = await probe(page)
  const drawn = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('.axt-over > svg')]
    return {
      overlays: svg.length,
      words: svg
        .map((s) => s.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      faces: [...document.fonts].filter((f) => f.family.replace(/"/g, '').startsWith('axt-') && f.status === 'loaded')
        .length,
    }
  })
  return { page, context, errors, p, drawn, asked: () => siteLog.slice(from) }
}
await check(
  "reader: no engine given, the reader's own typesetter: the fixture's pages laid by layPage over our site's faces and patterns, the translation drawn; a toggle lays them again (the coordinator's priority of 2026-11-07)",
  async () => {
    if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
    const { page, context, errors, p, drawn, asked } = await typesetLaid('s1-columns', 'de')
    // (a toggle: the pages laid again, under the rules that leave what it leaves)
    const laysBefore = Number(p.lays ?? 0)
    await page.evaluate(() =>
      window.__h.readers[0].reader.do({
        do: 'set',
        prefs: { classes: { figures: false, tables: true, heads: true, references: true, names: false } },
      }),
    )
    await page.waitForTimeout(1500)
    const after = await probe(page)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(drawn.overlays > 0 && /[a-zäöüß]{4}/i.test(drawn.words) && drawn.faces > 0, JSON.stringify(drawn))
    assert(
      asked().includes('/static-fonts/index.json') && asked().some((u) => u.startsWith('/hyph/de')),
      JSON.stringify(asked()),
    )
    assert(
      Number(after.lays) > laysBefore && Number(after.laidPages) > 0,
      `the toggle: ${laysBefore} → ${JSON.stringify(after)}`,
    )
    return {
      firstLaidMs: p['at.firstLaid'],
      leftDrawnMs: p['at.leftDrawn'],
      laidPages: p.laidPages,
      faces: drawn.faces,
      asked: asked().length,
      lays: [laysBefore, after.lays],
      words: drawn.words.slice(0, 80),
    }
  },
)
for (const name of Object.keys(fixtures).filter((n) => !existsSync(join(FIX, n)))) {
  await check(
    `reader: no engine given, the reader's own typesetter on a corpus paper (${name}, zh): laid, drawn`,
    async () => {
      if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
      const { context, errors, p, drawn, asked } = await typesetLaid(name, 'zh')
      await context.close()
      assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
      assert(drawn.overlays > 0 && /\p{Script=Han}/u.test(drawn.words) && drawn.faces > 0, JSON.stringify(drawn))
      return {
        firstLaidMs: p['at.firstLaid'],
        composedOpenMs: p['at.composedOpen'],
        codeMs: p['at.code'],
        leftDrawnMs: p['at.leftDrawn'],
        laidPages: p.laidPages,
        faces: drawn.faces,
        asked: asked().length,
        slicesAsked: asked().filter((u) => u.endsWith('.woff2')).length,
        words: drawn.words.slice(0, 40),
      }
    },
  )
  await check(
    `reader: the typesetter's first page while the target's rows arrive (${name}, zh, ${DELTAS} deltas): laid before the last row is in`,
    async () => {
      if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
      const seg = indexOf[name].seg
      const every = Number(process.env.AXT_DELTA_MS ?? 1000)
      modes[seg] = { kind: 'deltas', every }
      const from = siteLog.length
      const { page, context, errors } = await newPage()
      try {
        await page.evaluate(([n]) => window.__h.reader(n, { host: 'web', typeset: true, target: 'zh' }), [name])
        // (the reader's own moments, and when its rows were complete, read each 50 ms)
        let rowsAt = null,
          slicesAtLaid = null
        for (const until = Date.now() + 120_000; Date.now() < until; ) {
          const p = await probe(page)
          if (rowsAt === null && p.rows === 'complete')
            rowsAt = Math.round(await page.evaluate(() => performance.now()))
          if (p.laidPages > 0 && slicesAtLaid === null)
            slicesAtLaid = siteLog.slice(from).filter((u) => u.endsWith('.woff2')).length
          if (p.laidPages > 0 && rowsAt !== null) break
          await page.waitForTimeout(50)
        }
        const p = await probe(page)
        assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
        assert(p.laidPages > 0, JSON.stringify(p))
        // (the rows ended and the first page laid before: a page laid only once the run is over is what this holds against.
        // Not on a shaped link (AXT_LINK), a measurement: there the composed document itself opens about as the rows end,
        // the harness's PDF.js worker read twice, no-store, at the shaped rate)
        assert(rowsAt !== null, `the rows never ended: ${JSON.stringify(p)}`)
        const open = p['at.open']
        assert(
          LINK || p['at.firstLaid'] < rowsAt - open,
          `the first page laid at ${p['at.firstLaid']} ms, once the rows had ended (${rowsAt - open} ms)`,
        )
        return {
          firstLaidMs: p['at.firstLaid'],
          rowsCompleteMs: rowsAt - open,
          composedOpenMs: p['at.composedOpen'],
          slicesAtLaid,
          deltasTold: modes[seg].told,
        }
      } finally {
        await context.close()
        delete modes[seg]
      }
    },
  )
}
/** the ink of a region of the page as shown: the sum over its device pixels of 1 - luma (Rec. 709), its screenshot decoded in
 *  the page */
async function inkIn(page, clip) {
  const buf = await page.screenshot({ clip })
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const x = c.getContext('2d')
    x.drawImage(bmp, 0, 0)
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data
    let ink = 0
    for (let i = 0; i < d.length; i += 4) ink += 1 - (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
    return ink
  }, buf.toString('base64'))
}
/** the ink of laid page 1's overlay lines as drawn, each against the same runs drawn by a canvas's fillText (as PDF.js draws a
 *  page's text) in their computed faces, sizes and fills at their places: a line's own ink, what the page shows with it alone
 *  of the overlay's text less what it shows with none. `lines`: the regular expressions of the lines measured (the first line
 *  each matches), else the six longest lines of eight characters or more drawn upright in no small capitals */
async function linesInk(page, lines = null) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
  })
  const chosen = await page.evaluate((res) => {
    const texts = [...document.querySelector('.axt-over > svg').querySelectorAll('text')]
    const plain = (t) =>
      !t.hasAttribute('transform') &&
      [...t.querySelectorAll('tspan')].every((s) => getComputedStyle(s).fontVariantCaps === 'normal')
    const chars = (t) => [...t.textContent].filter((c) => /\S/u.test(c)).length
    if (res) return res.map((r) => texts.findIndex((t) => new RegExp(r, 'u').test(t.textContent))).filter((k) => k >= 0)
    return texts
      .map((t, k) => [k, chars(t)])
      .filter(([k, n]) => n >= 8 && plain(texts[k]))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k)
  }, lines)
  const out = []
  for (const k of chosen) {
    const clip = await page.evaluate(async (k) => {
      const t = document.querySelector('.axt-over > svg').querySelectorAll('text')[k]
      t.scrollIntoView({ block: 'center' })
      await new Promise((ok) => setTimeout(ok, 300))
      const r = t.getBoundingClientRect()
      return {
        x: Math.floor(r.left) - 2,
        y: Math.floor(r.top) - 2,
        width: Math.ceil(r.width) + 4,
        height: Math.ceil(r.height) + 4,
      }
    }, k)
    // (the overlay's lines shown: none (-1), line k alone, or all again (null))
    const show = (only) =>
      page.evaluate((only) => {
        const texts = document.querySelector('.axt-over > svg').querySelectorAll('text')
        texts.forEach((t, i) => {
          t.style.visibility = only === null ? '' : i === only ? 'visible' : 'hidden'
        })
      }, only)
    await show(-1)
    const none = await inkIn(page, clip)
    await show(k)
    const svg = await inkIn(page, clip)
    await show(null)
    const canvas = await page.evaluate(
      ([k, clip]) => {
        const svg = document.querySelector('.axt-over > svg')
        const t = svg.querySelectorAll('text')[k]
        const box = svg.getBoundingClientRect(),
          u = box.width / svg.viewBox.baseVal.width,
          d = devicePixelRatio
        const c = document.createElement('canvas')
        c.width = Math.round(clip.width * d)
        c.height = Math.round(clip.height * d)
        const x = c.getContext('2d', { alpha: false })
        x.fillStyle = '#fff'
        x.fillRect(0, 0, c.width, c.height)
        for (const s of t.querySelectorAll('tspan')) {
          const cs = getComputedStyle(s)
          x.font = `${cs.fontStyle} ${cs.fontWeight} ${Number(s.getAttribute('font-size')) * u * d}px ${cs.fontFamily}`
          x.fillStyle = cs.fill
          const xs = (s.getAttribute('x') ?? '0').trim().split(/\s+/).map(Number),
            y = (box.top + Number(s.getAttribute('y')) * u - clip.y) * d
          const at = (v) => (box.left + v * u - clip.x) * d
          if (xs.length > 1)
            for (const [i, ch] of [...s.textContent].entries()) x.fillText(ch, at(xs[i] ?? xs.at(-1)), y)
          else x.fillText(s.textContent, at(xs[0]), y)
        }
        const px = x.getImageData(0, 0, c.width, c.height).data
        let ink = 0
        for (let i = 0; i < px.length; i += 4)
          ink += 1 - (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255
        // (each run's script and ink: a run of Han, kana or Hangul, one of Latin letters or digits and none of those, its own
        // fill attribute where it names one)
        const runs = [...t.querySelectorAll('tspan')].map((s) => ({
          cjk: /[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}]/u.test(s.textContent),
          latin:
            /[\p{sc=Latn}\p{Nd}]/u.test(s.textContent) &&
            !/[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}]/u.test(s.textContent),
          own: s.getAttribute('fill'),
          fill: getComputedStyle(s).fill,
        }))
        return {
          ink,
          text: t.textContent.trim().slice(0, 24),
          fill: getComputedStyle(t.querySelector('tspan')).fill,
          runs,
        }
      },
      [k, clip],
    )
    out.push({
      text: canvas.text,
      fill: canvas.fill,
      runs: canvas.runs,
      svg: Math.round(svg - none),
      canvas: Math.round(canvas.ink),
    })
  }
  const state = await page.evaluate(() => ({
    decided: document.querySelector('.axt-reader').getAttribute('data-axt-layer-text'),
    rendering: getComputedStyle(document.querySelector('.axt-over > svg')).textRendering,
  }))
  const sum = (f) => out.reduce((a, l) => a + l[f], 0)
  return { ...state, ratio: +(sum('svg') / Math.max(1, sum('canvas'))).toFixed(3), lines: out }
}
await check(
  "compose: the overlay's text drawn at the weight a canvas draws it (PDF.js's page's own), in the layer's ink, the PDF's black, a CJK run today's #141414: geometricPrecision, or auto where the reader's fixed probe in a served face lays out alike under both, decided once a reader (docs/PDF-READER.md §11.8; the maintainer's report of 2026-11-08: lighter than today's)",
  async () => {
    if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
    const out = {}
    const corpus = Object.keys(fixtures).filter((n) => !existsSync(join(FIX, n)))
    for (const [name, target] of [['s1-columns', 'de'], ...corpus.map((n) => [n, 'zh'])]) {
      const { page, context, errors } = await typesetLaid(name, target, {
        dpr: 2,
        viewport: { width: 1600, height: 1000 },
      })
      const lines = process.env.AXT_INK_LINES && corpus.includes(name) ? process.env.AXT_INK_LINES.split('|') : null
      const got = await linesInk(page, lines)
      if (process.env.AXT_SHOTS) {
        const clip = await page.evaluate(() => {
          const svg = document.querySelector('.axt-over > svg')
          svg.scrollIntoView({ block: 'start' })
          const r = svg.getBoundingClientRect()
          return {
            x: r.x,
            y: Math.max(0, r.y),
            width: r.width,
            height: Math.min(r.height, innerHeight - Math.max(0, r.y)),
          }
        })
        await page.screenshot({ clip, path: join(HERE, '.shots', `${name}-ink-p1.png`) })
      }
      await context.close()
      assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
      out[name] = { ...got, target }
    }
    if (process.env.AXT_INK_OUT)
      (await import('node:fs')).writeFileSync(process.env.AXT_INK_OUT, `${JSON.stringify(out, null, 1)}\n`)
    for (const [name, got] of Object.entries(out)) {
      assert(got.lines.length > 0, `${name}: no line measured`)
      // (the rendering the root says is the one the overlay draws in: auto under the attribute, geometricPrecision without)
      assert(
        (got.decided === 'auto') === (got.rendering === 'auto') && /^(auto|geometricprecision)$/.test(got.rendering),
        `${name}: decided ${got.decided}, drawn in ${got.rendering}`,
      )
      // (the canvas's weight: macOS's geometricPrecision drew 0.80 of it; Chromium on Linux within 4 % under either)
      assert(
        Math.abs(got.ratio - 1) <= 0.06,
        `${name}: the overlay's ink ${got.ratio} of the canvas's ${JSON.stringify(got.lines)}`,
      )
      // (a run of no fill of its own in the layer's ink: a Latin run the PDF's own black (the owner's ruling of 2026-11-08,
      // #141414 before), a CJK run #141414, today's (his exception of 2026-11-08, typeset's display.ts CJK_INK))
      const runs = got.lines.flatMap((l) => l.runs).filter((r) => r.own === null || r.own === '#141414')
      assert(
        runs.every((r) => (r.cjk ? r.fill === 'rgb(20, 20, 20)' : !r.latin || r.fill === 'rgb(0, 0, 0)')),
        `${name}: runs of no fill of their own drawn in ${JSON.stringify(runs.filter((r) => r.cjk || r.latin).map((r) => [r.cjk ? 'cjk' : 'latin', r.fill]))}`,
      )
      assert(
        runs.some((r) => (got.target === 'de' ? r.latin : r.cjk)),
        `${name}: no run of its target's script measured`,
      )
    }
    return Object.fromEntries(
      Object.entries(out).map(([n, g]) => [
        n,
        { decided: g.decided, rendering: g.rendering, ratio: g.ratio, lines: g.lines.length },
      ]),
    )
  },
)
await check(
  "reader: the extension's host: arXiv's own PDF, rows made here, no target named to our server",
  async () => {
    const from = v2log.length
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'ext' }))
    await readerLaid(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    const asked = await page.evaluate(() => window.__h.readers[0].asked.map((a) => a.url))
    await context.close()
    assert(!errors.length, errors.join('; '))
    const mine = v2log.slice(from)
    assert(
      asked.some((u) => u.startsWith('https://arxiv.org/pdf/2600.00002v1')),
      `the original from ${asked[0]}`,
    )
    assert(
      mine.every((x) => (x.what === 'follow' ? !/[?&]t=/.test(x.query) : x.ask.target === null)),
      `a target named: ${JSON.stringify(mine)}`,
    )
    assert(st.rows.from === 'here' && st.rows.s === 'complete', JSON.stringify(st.rows))
    return { follows: mine.length, rows: st.rows }
  },
)
await check(
  "reader: a laid page's links reached by the pointer in a host's panes; no slot keeps the left's loading mark (L11 gap 5)",
  async () => {
    const { page, context, errors } = await newPage()
    // (the host's scrollers as both hosts' chrome gives them: a .viewerContainer a pane, its own .pdfViewer, under which
    // pdf_viewer.css draws a page's loading dots over it while it is marked loading)
    await page.evaluate(() => {
      const root = document.createElement('div')
      root.style.cssText = 'position:absolute;inset:0'
      const panes = { root }
      for (const side of ['left', 'right']) {
        const el = document.createElement('div')
        el.className = `viewerContainer axt-pane ${side}`
        el.id = side
        el.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
        root.append(el)
        panes[side] = el
      }
      document.body.append(root)
      window.__opened = []
      window.open = (u) => {
        window.__opened.push(String(u))
        return null
      }
      window.__h.given = panes
    })
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', panes: window.__h.given }))
    await readerLaid(page)
    // (the laid page put in place, the left's copy before it and its frame gone by)
    await page.waitForTimeout(400)
    const seen = await page.evaluate(() => {
      const right = window.__h.given.right
      const loading = [...right.querySelectorAll('.axt-slot')]
        .filter((s) => s.classList.contains('loading') || s.classList.contains('loadingIcon'))
        .map((s) => s.dataset.pageNumber)
      const slot = right.querySelector('.axt-slot[data-page-number="1"]')
      const a = [...(slot?.querySelectorAll('.axt-over a.axt-link') ?? [])].find((x) =>
        x.getAttribute('href')?.startsWith('https:'),
      )
      const r = a?.getBoundingClientRect()
      const x = r ? r.left + r.width / 2 : 0,
        y = r ? r.top + r.height / 2 : 0
      const hit = r ? document.elementFromPoint(x, y) : null
      return {
        loading,
        href: a?.getAttribute('href') ?? null,
        at: [x, y],
        hit: hit ? `${hit.tagName}.${hit.className}` : null,
        onLink: !!a && !!hit && hit.closest('a') === a,
      }
    })
    if (seen.href) await page.mouse.click(seen.at[0], seen.at[1])
    await page.waitForTimeout(200)
    const opened = await page.evaluate(() => window.__opened)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!seen.loading.length, `slots still marked loading: ${seen.loading}`)
    assert(seen.href && seen.onLink, `the pointer over the link meets ${seen.hit}`)
    assert(opened.length === 1 && opened[0] === seen.href, `opened ${JSON.stringify(opened)}`)
    return { href: seen.href, opened }
  },
)
/** the host page (chrome.html): the chrome over a reader of fixture `name`, with the host's parts `o`, laid */
async function chromeLaid(name, o = {}, page0 = {}) {
  const opened = await newPage({ ...page0, path: 'chrome.html' })
  await opened.page.evaluate(([n, x]) => window.__c.open(n, x), [name, o])
  await waitFor(opened.page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
  return opened
}

// ---------------------------------------------------------------- the pages dimmed in the dark (docs/PDF-READER.md §4.3)
/** the luma (Rec. 709, 0..255) of a region of the page as shown, its screenshot decoded in the page: its darkest pixel, its
 *  lightest and its median */
async function lumaIn(page, clip, path = null) {
  const buf = await page.screenshot({ clip, ...(path ? { path } : {}) })
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const x = c.getContext('2d')
    x.drawImage(bmp, 0, 0)
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data
    const all = []
    for (let i = 0; i < d.length; i += 4) all.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
    all.sort((a, b) => a - b)
    return { min: Math.round(all[0]), max: Math.round(all.at(-1)), median: Math.round(all[all.length >> 1]) }
  }, buf.toString('base64'))
}
/** s1-columns laid with its page 1 in runs of three inks (convert.ts inked: a run that names no fill, a CJK run in its own
 *  CJK_INK, a run of a colour of its own), the pages dimmed, the host's shape `shape`: the reader's class and the dim mark on
 *  one element (`root`: an element of the host's; `html`), the class on <body> and the mark on <html> under the harness's
 *  sheet alone (`body`), or both hosts' page (`chrome`: the package's chrome over openReader on <body>, the dim by its
 *  preferences, its appearance on <html>, its sheet). A crop (a formula of the original drawn in a translated line) read from
 *  the pixels too, dimmed and not: under the dim its ink was lost (staging, 2026-11-12: every inline formula of a translated
 *  paragraph a blank gap), the filter turning its ink light while its blend kept the darker of it and the dimmed page */
/** a crop's own ground (the median of its paper's pixels as shown) against the page's (the slot's median), the difference allowed
 *  in luma levels. A crop's paper is the page's white through the page canvas's own filter, so the two are equal: 29/29 dimmed
 *  and 255/255 undimmed in all four shapes (2026-11-12); 2 lets a paper pixel of 250..254 beside the ink through (dimmed, 29..32)
 *  and no box: a crop screened into the dimmed page read its paper 55. (Not the box's median: the page's crops are small
 *  formulas, 39x10 px, more than half their pixels ink or its edge, undimmed median 248 on 255) */
const CROP_GROUND = 2
for (const shape of ['root', 'html', 'body', 'chrome']) {
  await check(
    `dim: the overlay's text in every ink, its crops and the highlight dimmed as the page's canvas is, whatever element carries the reader's class (${shape}; staging, 2026-11-12)`,
    async () => {
      const { page, context, errors } =
        shape === 'chrome' ? await chromeLaid('s1-columns', { inks: true }) : await newPage()
      if (shape !== 'chrome') {
        await page.evaluate((shape) => {
          const o = { host: 'web', inks: true }
          if (shape !== 'root') {
            // (the host's scrollers as both hosts' chrome gives them, the reader's root the element the shape names)
            const panes = { root: shape === 'html' ? document.documentElement : document.body }
            for (const side of ['left', 'right']) {
              const el = document.createElement('div')
              el.className = `viewerContainer axt-pane ${side}`
              el.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
              document.body.append(el)
              panes[side] = el
            }
            o.panes = panes
          }
          return window.__h.reader('s1-columns', o)
        }, shape)
        await readerLaid(page)
      }
      const dim = (on) =>
        shape === 'chrome'
          ? page.evaluate((on) => window.__c.controller.setPrefs({ theme: 'dark', dim: on }), on)
          : page.evaluate(
              ([shape, on]) =>
                (shape === 'root' ? window.__h.readers[0].root : document.documentElement).toggleAttribute(
                  'data-axt-dim',
                  on,
                ),
              [shape, on],
            )
      await dim(true)
      const P1 = '.axt-slot[data-page-number="1"]'
      await waitFor(
        page,
        (P1) =>
          !!document.querySelector(`${P1} .axt-over > svg tspan[fill="#c00000"]`) &&
          !!document.querySelector(`${P1} .axt-over > canvas.axt-crops`) &&
          !!document.querySelector('[data-axt-dim]'),
        P1,
      )
      // (the member of three inks in the right's view, the left following; a unit lit under the pointer, so that the highlight's
      // layers are there, then the pointer away)
      await page.evaluate((P1) => {
        document.querySelector(`${P1} .axt-over > svg tspan[fill="#141414"]`).scrollIntoView({ block: 'center' })
      }, P1)
      await page.waitForTimeout(400)
      const at = await page.evaluate((P1) => {
        const r = document.querySelector(`${P1} .axt-over > svg tspan[fill="#141414"]`).getBoundingClientRect()
        return [r.left + Math.min(r.width / 2, 20), r.top + r.height / 2]
      }, P1)
      await page.mouse.move(at[0], at[1])
      await page.waitForTimeout(200)
      const seen = await page.evaluate((P1) => {
        const slot = document.querySelector(P1)
        const f = (el) => (el ? getComputedStyle(el).filter : null)
        const canvas = [...document.querySelectorAll('.pdfViewer .page .canvasWrapper > canvas')].find(
          (c) => !c.closest('.axt-slot'),
        )
        // (the rules of the page's sheets that set `prop` on `el`: whose rule dims what)
        const rulesOf = (el, prop) => {
          const out = []
          const walk = (rules) => {
            for (const r of rules) {
              if (r.cssRules && !r.selectorText) walk(r.cssRules)
              else if (r.selectorText && r.style?.getPropertyValue(prop) && el?.matches(r.selectorText))
                out.push(r.selectorText)
            }
          }
          for (const sh of document.styleSheets) {
            try {
              walk(sh.cssRules)
            } catch {}
          }
          return out.filter((x) => /dim/.test(x))
        }
        const crops = slot.querySelector('.axt-over > canvas.axt-crops')
        return {
          by: {
            canvas: rulesOf(canvas, 'filter'),
            svg: rulesOf(slot.querySelector('.axt-over > svg'), 'filter'),
            crops: rulesOf(crops, 'filter'),
            blend: rulesOf(document.querySelector('.axt-hl-layer'), 'mix-blend-mode'),
          },
          reader: document.querySelector('.axt-reader')?.tagName.toLowerCase() ?? null,
          marked: document.querySelector('[data-axt-dim]')?.tagName.toLowerCase() ?? null,
          canvas: f(canvas),
          svg: f(slot.querySelector('.axt-over > svg')),
          crops: f(slot.querySelector('.axt-over > canvas.axt-crops')),
          blends: [...document.querySelectorAll('.axt-hl-layer')].map((l) => getComputedStyle(l).mixBlendMode),
          // (what the dim gives the link rings, the skeleton and the translating marks: custom properties, read where they apply)
          vars: Object.fromEntries(
            [
              ['ring', slot.querySelector('.axt-link'), '--axt-ring'],
              ['halo', slot.querySelector('.axt-link'), '--axt-ring-halo'],
              ['sk', slot, '--axt-sk'],
              ['skPaper', slot, '--axt-sk-paper'],
              ['trLight', slot, '--axt-tr-light'],
              ['trStill', slot, '--axt-tr-still'],
            ].map(([k, el, n]) => [k, el ? getComputedStyle(el).getPropertyValue(n).trim() : null]),
          ),
        }
      }, P1)
      // (the chrome's capsule, a toast in it: the chrome's tokens under the dark theme, the page's ground beside it)
      if (shape === 'chrome') {
        await page.evaluate(() => window.__c.controller.toast({ words: 'The translation did not load', ms: 8000 }))
        await page.waitForTimeout(400)
        seen.capsule = await page.evaluate(() => {
          const c = document.querySelector('.capsule')
          return c ? [getComputedStyle(c).backgroundColor, getComputedStyle(c).color] : null
        })
      }
      await page.mouse.move(3, 3)
      await page.waitForTimeout(300)
      // (the pixels: each ink's run against the page's ground, the slot's median; the crops out of sight, so that a run's box
      // holds its own ink alone)
      const boxes = await page.evaluate((P1) => {
        for (const c of document.querySelectorAll(`${P1} .axt-over > canvas.axt-crops`)) c.style.visibility = 'hidden'
        const svg = document.querySelector(`${P1} .axt-over > svg`)
        const g = svg.querySelector('tspan[fill="#141414"]').closest('g')
        // (a run's box within its page's)
        const page = document.querySelector(P1).getBoundingClientRect()
        const box = (spans) => {
          const rs = [...spans].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0)
          const x0 = Math.max(page.left, Math.min(...rs.map((r) => r.left))),
            y0 = Math.max(page.top, Math.min(...rs.map((r) => r.top))),
            x1 = Math.min(page.right, Math.max(...rs.map((r) => r.right))),
            y1 = Math.min(page.bottom, Math.max(...rs.map((r) => r.bottom)))
          return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
        }
        const first = [...g.querySelectorAll('text')].find((t) => t.querySelector('tspan:not([fill])'))
        const s = document.querySelector(P1).getBoundingClientRect()
        const y0 = Math.max(s.top, 0),
          y1 = Math.min(s.bottom, innerHeight)
        return {
          latin: box(first.querySelectorAll('tspan:not([fill])')),
          cjk: box(g.querySelectorAll('tspan[fill="#141414"]')),
          coloured: box(g.querySelectorAll('tspan[fill="#c00000"]')),
          ground: { x: s.left, y: y0, width: s.width, height: y1 - y0 },
        }
      }, P1)
      const luma = {}
      for (const [k, clip] of Object.entries(boxes))
        luma[k] = await lumaIn(page, clip, process.env.AXT_SHOTS ? join(HERE, '.shots', `dim-${shape}-${k}.png`) : null)
      const ground = luma.ground.median
      // (a crop's pixels, dimmed and not: the crops shown and the overlay's text out of sight, so that a crop's box holds its own
      // ink over the page view alone; the crop the opaque region of the crops' canvas with the most ink (a crop, or crops that
      // touch), read from the canvas itself and brought to the middle of its pane)
      const crop = await page.evaluate((P1) => {
        const slot = document.querySelector(P1)
        for (const c of slot.querySelectorAll('.axt-over > canvas.axt-crops')) c.style.visibility = ''
        slot.querySelector('.axt-over > svg').style.visibility = 'hidden'
        const c = slot.querySelector('.axt-over > canvas.axt-crops')
        const w = c.width,
          h = c.height
        const d = c.getContext('2d').getImageData(0, 0, w, h).data
        const luma = (p) => 0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]
        const seen = new Uint8Array(w * h)
        let best = null
        for (let s = 0; s < w * h; s++) {
          if (seen[s] || d[s * 4 + 3] === 0) continue
          let x0 = w,
            y0 = h,
            x1 = 0,
            y1 = 0,
            ink = 0
          const todo = [s]
          seen[s] = 1
          while (todo.length) {
            const p = todo.pop(),
              x = p % w,
              y = (p - x) / w
            x0 = Math.min(x0, x)
            y0 = Math.min(y0, y)
            x1 = Math.max(x1, x + 1)
            y1 = Math.max(y1, y + 1)
            if (d[p * 4 + 3] >= 128 && luma(p) < 128) ink++
            for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
              if (q >= 0 && !seen[q] && d[q * 4 + 3] > 0) {
                seen[q] = 1
                todo.push(q)
              }
          }
          if (!best || ink > best.ink) best = { px: [x0, y0, x1, y1], ink }
        }
        if (!best) return null
        // (the crop's own ground: its pixels of paper whose every neighbour is paper too, or outside the crop, so that a pixel of
        // the shot a device pixel off still reads the crop's ground or the page's, never its ink)
        const paperAt = (x, y) => {
          if (x < 0 || y < 0 || x >= w || y >= h) return true
          const p = y * w + x
          return d[p * 4 + 3] === 0 || luma(p) >= 250
        }
        const paper = []
        for (let y = best.px[1]; y < best.px[3]; y++)
          for (let x = best.px[0]; x < best.px[2]; x++) {
            if (d[(y * w + x) * 4 + 3] < 255) continue
            let all = true
            for (let dy = -1; dy <= 1 && all; dy++)
              for (let dx = -1; dx <= 1 && all; dx++) all = paperAt(x + dx, y + dy)
            if (all) paper.push(y * w + x)
          }
        const r = c.getBoundingClientRect()
        let el = slot.parentElement
        while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)))
          el = el.parentElement
        const s0 = el.getBoundingClientRect()
        el.scrollTop += r.top + ((best.px[1] + best.px[3]) / 2) * (r.height / h) - (s0.top + s0.height / 2)
        return { ...best, paper }
      }, P1)
      assert(crop && crop.ink > 0 && crop.paper.length > 0, `no crop of ink on page 1: ${JSON.stringify(crop)}`)
      await page.waitForTimeout(400)
      /** the crop as shown (its darkest and lightest pixels, and the median of its own ground's: the pixels `crop.paper`) and the
       *  page's ground (the median of the slot's part in view) */
      const cropShown = async (tag) => {
        const b = await page.evaluate(
          ([P1, px]) => {
            const slot = document.querySelector(P1)
            const c = slot.querySelector('.axt-over > canvas.axt-crops')
            const r = c.getBoundingClientRect(),
              s = slot.getBoundingClientRect()
            const k = r.width / c.width
            const x0 = Math.round(Math.max(s.left, r.left + px[0] * k)),
              y0 = Math.round(Math.max(s.top, 0, r.top + px[1] * k)),
              x1 = Math.round(Math.min(s.right, r.left + px[2] * k)),
              y1 = Math.round(Math.min(s.bottom, innerHeight, r.top + px[3] * k))
            const g0 = Math.max(s.top, 0),
              g1 = Math.min(s.bottom, innerHeight)
            return {
              crop: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
              // (the canvas's pixel at the shot's top-left corner, and its pixels a CSS px)
              at: [(x0 - r.left) / k, (y0 - r.top) / k, k, c.width],
              ground: { x: s.left, y: g0, width: s.width, height: g1 - g0 },
              blend: getComputedStyle(c).mixBlendMode,
            }
          },
          [P1, crop.px],
        )
        const path = (k) => (process.env.AXT_SHOTS ? join(HERE, '.shots', `dim-${shape}-${tag}-${k}.png`) : null)
        const buf = await page.screenshot({ clip: b.crop, ...(path('crop') ? { path: path('crop') } : {}) })
        const shown = await page.evaluate(
          async ([b64, at, paper]) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
            const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
            const c = new OffscreenCanvas(bmp.width, bmp.height)
            const x = c.getContext('2d')
            x.drawImage(bmp, 0, 0)
            const d = x.getImageData(0, 0, bmp.width, bmp.height).data
            const [ox, oy, k, cw] = at
            const ground = new Set(paper)
            const all = [],
              own = []
            for (let j = 0; j < bmp.height; j++)
              for (let i = 0; i < bmp.width; i++) {
                const p = (j * bmp.width + i) * 4
                const l = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]
                all.push(l)
                if (ground.has(Math.floor(oy + (j + 0.5) / k) * cw + Math.floor(ox + (i + 0.5) / k))) own.push(l)
              }
            const med = (v) => Math.round([...v].sort((a, b) => a - b)[v.length >> 1])
            return {
              min: Math.round(Math.min(...all)),
              max: Math.round(Math.max(...all)),
              paper: own.length ? med(own) : null,
              paperN: own.length,
            }
          },
          [buf.toString('base64'), b.at, crop.paper],
        )
        return { ...shown, ground: (await lumaIn(page, b.ground, path('ground'))).median, blend: b.blend, box: b.crop }
      }
      const crops = { dimmed: await cropShown('crop-dimmed') }
      // (and undimmed: the overlay drawn as it is; the crop as it is, the appearance's change let settle)
      await dim(false)
      await waitFor(page, () => !document.querySelector('[data-axt-dim]'))
      await page.waitForTimeout(600)
      crops.light = await cropShown('crop-light')
      const undimmed = await page.evaluate(
        (P1) => getComputedStyle(document.querySelector(`${P1} .axt-over > svg`)).filter,
        P1,
      )
      await context.close()
      assert(!errors.length, errors.join('; '))
      const runs = Object.fromEntries(['latin', 'cjk', 'coloured'].map((k) => [k, luma[k].max]))
      const detail = { ...seen, ground, runs, crop: { ink: crop.ink, px: crop.px, ...crops }, undimmed }
      assert(seen.canvas && seen.canvas !== 'none', `the host's canvas undimmed: ${JSON.stringify(detail)}`)
      assert(
        seen.svg === seen.canvas && seen.crops === seen.canvas,
        `the overlay's filters against the canvas's: ${JSON.stringify(detail)}`,
      )
      assert(
        seen.blends.length > 0 && seen.blends.every((b) => b === 'screen'),
        `the highlight's blend: ${JSON.stringify(detail)}`,
      )
      assert(
        seen.vars.ring === 'oklch(0.935 0.005 255)' &&
          seen.vars.skPaper === 'rgb(29 29 29)' &&
          seen.vars.trLight.includes('80%'),
        `the rings', the skeleton's and the translating marks' dim values: ${JSON.stringify(detail)}`,
      )
      for (const [k, v] of Object.entries(runs))
        assert(
          v >= ground + 60,
          `the ${k} run's lightest pixel ${v} against the ground's ${ground}: ${JSON.stringify(detail)}`,
        )
      // (a crop's ink shown on the page, dimmed as the runs' ink is and undimmed, and its own ground no box on it)
      const { dimmed: cd, light: cl } = crops
      assert(
        cd.max >= cd.ground + 60,
        `dimmed, the crop's lightest pixel ${cd.max} against the ground's ${cd.ground}: ${JSON.stringify(detail)}`,
      )
      assert(
        cl.min <= cl.ground - 60,
        `undimmed, the crop's darkest pixel ${cl.min} against the ground's ${cl.ground}: ${JSON.stringify(detail)}`,
      )
      for (const [k, x] of Object.entries(crops))
        assert(
          x.paperN > 0 && Math.abs(x.paper - x.ground) <= CROP_GROUND,
          `${k}, the crop's own ground ${x.paper} (${x.paperN} px) against the page's ${x.ground}: ${JSON.stringify(detail)}`,
        )
      assert(undimmed === 'none', `undimmed, the overlay's filter: ${undimmed}`)
      return detail
    },
  )
}
await check(
  "highlight: the band chosen in the reading options paints the highlight, its colour at its strength, on both panes, on a page light, dark and dimmed (the feature list's E2: the choice was stored and the band stayed green)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns')
    const P1 = '.pane[data-side="right"] .axt-slot[data-page-number="1"]'
    await waitFor(page, (P1) => !!document.querySelector(`${P1} .axt-over > svg tspan`), P1)
    /** a unit lit under the pointer (away first, so that it lights anew), each lit band's paint on both panes, and what the band
     *  `want` paints as the sheet mixes it (a probe of the same colour-mix, read the same way) */
    const lit = async (want) => {
      await page.mouse.move(3, 3)
      await page.waitForTimeout(250)
      const at = await page.evaluate((P1) => {
        const t = [...document.querySelectorAll(`${P1} .axt-over > svg tspan`)].find(
          (x) => (x.textContent ?? '').trim().length > 3,
        )
        t.scrollIntoView({ block: 'center' })
        const r = t.getBoundingClientRect()
        return [r.left + r.width / 2, r.top + r.height / 2]
      }, P1)
      await page.waitForTimeout(300)
      await page.mouse.move(at[0], at[1])
      await waitFor(
        page,
        () => document.querySelectorAll('.pane[data-side="left"] .axt-hl, .pane[data-side="right"] .axt-hl').length > 1,
        null,
        5000,
      )
      return page.evaluate((want) => {
        const paintOf = (el) =>
          el.classList.contains('axt-hl-shape')
            ? getComputedStyle(el.querySelector('path')).fill
            : getComputedStyle(el).backgroundColor
        const probe = document.createElement('div')
        probe.style.background = `color-mix(in oklab, ${want.colour} ${want.mix}, transparent)`
        document.body.append(probe)
        const wanted = getComputedStyle(probe).backgroundColor
        probe.remove()
        const sides = Object.fromEntries(
          ['left', 'right'].map((s) => [
            s,
            [...document.querySelectorAll(`.pane[data-side="${s}"] .axt-hl`)].map(paintOf),
          ]),
        )
        return { wanted, sides, dim: document.documentElement.hasAttribute('data-axt-dim') }
      }, want)
    }
    const GREEN = { colour: '#cdeccd', mix: '22%' },
      SAND = { colour: 'oklch(0.85 0.12 85)', mix: '30%' }
    const steps = { light: await lit(GREEN) }
    await page.evaluate(() => window.__c.controller.setPrefs({ highlight: { band: 'sand' } }))
    steps.chosen = await lit(SAND)
    await page.evaluate(() => window.__c.controller.setPrefs({ theme: 'dark', dim: false }))
    steps.dark = await lit(SAND)
    await page.evaluate(() => window.__c.controller.setPrefs({ theme: 'dark', dim: true }))
    steps.dimmed = await lit(SAND)
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const [k, s] of Object.entries(steps))
      for (const side of ['left', 'right'])
        assert(
          s.sides[side].length > 0 && s.sides[side].every((p) => p === s.wanted),
          `${k}, the ${side} pane's bands: ${JSON.stringify(s)}`,
        )
    assert(steps.light.wanted !== steps.chosen.wanted && !steps.dark.dim && steps.dimmed.dim, JSON.stringify(steps))
    return Object.fromEntries(Object.entries(steps).map(([k, s]) => [k, s.wanted]))
  },
)
await check(
  "chrome: a host's own controls in their places, each working: its way home first in the lead, its short link right after the title, its interface language the reading options' last row (L11 gap 2)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns', { slots: true })
    const en = await page.evaluate(() => window.__c.words('en'))
    const zh = await page.evaluate(() => window.__c.words('zh-CN'))
    const lead = await page.evaluate(() => {
      const el = document.querySelector('[data-zone="lead"]')
      const home = el.querySelector('[data-host="home"]').getBoundingClientRect()
      return {
        // (a control's tooltip, its next sibling, left out)
        children: [...el.children]
          .map((x) => x.dataset.host ?? (x.matches('.paper-title') ? 'title' : x.getAttribute('aria-label')))
          .filter((x) => x !== null),
        short: !!el.querySelector(':scope > .paper-title + [data-host="short"]'),
        home: [home.left + home.width / 2, home.top + home.height / 2],
      }
    })
    await page.mouse.click(lead.home[0], lead.home[1])
    await page.locator(`button[aria-label="${en.options}"]`).click()
    const last = await page.evaluate(
      () =>
        document.getElementById('pop-options')?.lastElementChild?.querySelector('[data-host]')?.dataset.host ?? null,
    )
    await page.locator('[data-host="ui"]').click()
    await waitFor(page, (w) => !!document.querySelector(`button[aria-label="${w}"]`), zh.options).catch(() => {})
    const after = await page.evaluate((w) => {
      const pop = document.getElementById('pop-options')
      return {
        bar: !!document.querySelector(`button[aria-label="${w.options}"]`),
        dim: [...(pop?.querySelectorAll('[role="switch"]') ?? [])]
          .map((x) => x.getAttribute('aria-label'))
          .includes(w.dim),
        clicked: window.__c.clicked,
        writes: window.__c.writes,
      }
    }, zh)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      JSON.stringify(lead.children) === JSON.stringify(['home', en.contents, 'title', 'short']) && lead.short,
      `the lead ${JSON.stringify(lead)}`,
    )
    assert(last === 'ui', `the reading options' last row ${last}`)
    assert(after.bar && after.dim, `the chrome after the pick: ${JSON.stringify(after)}`)
    assert(JSON.stringify(after.clicked) === JSON.stringify(['home', 'ui:zh-CN']), `clicked ${after.clicked}`)
    assert(
      after.writes.some((w) => w.ui === 'zh-CN'),
      `the reader wrote ${JSON.stringify(after.writes)}`,
    )
    return { lead: lead.children, last, clicked: after.clicked }
  },
)
await check(
  "chrome: a host's toast in the capsule's place, in its words and sign, for its time; the word it replaced back after it (L11 gap 6, difference 8)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns', { slots: true })
    const capsule = () =>
      page.evaluate(() => {
        const el = document.querySelector('.capsule:not([data-out])')
        return el
          ? {
              kind: el.getAttribute('data-kind'),
              said: el.querySelector('.sr-only')?.textContent ?? '',
              sign: el.querySelector('svg path')?.getAttribute('d') ?? null,
            }
          : null
      })
    // (the host's word for a crash with something on screen, as the website's page says it: 8 s)
    await page.evaluate(() => window.__c.controller.toast({ words: 'The translation did not load', ms: 8000 }))
    const lost = await capsule()
    await page.locator('[data-host="share"]').click()
    const copied = await capsule()
    await page.waitForTimeout(3300)
    const back = await capsule()
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      lost?.kind === 'toast' && lost.said === 'The translation did not load',
      `the crash's word ${JSON.stringify(lost)}`,
    )
    assert(
      copied?.kind === 'toast' && copied.said === 'Link copied' && copied.sign === 'M20 6 9 17l-5-5',
      `the share's word ${JSON.stringify(copied)}`,
    )
    assert(back?.said === 'The translation did not load', `after the share's word ${JSON.stringify(back)}`)
    return { lost: lost.said, copied: copied.said, back: back.said }
  },
)
await check(
  "chrome: a host's words for the capsule's states: a paper being made said as the translation it waits for, the first time, with the spinner; the catalogue's look (the progress line alone) where it gives none (L11 differences 1, 2; the coordinator's decision 1, 2026-11-11)",
  async () => {
    const seg = indexOf['s2-splits'].seg
    const seen = async (words) => {
      modes[seg] = { kind: 'not-opened', prepareMs: 2500 }
      try {
        const { page, context, errors } = await newPage({ path: 'chrome.html' })
        await page.evaluate((w) => window.__c.open('s2-splits', { words: w }), words)
        await waitFor(page, () => window.__c.reader?.state().layer.s === 'preparing', null, 20_000)
        // (past the 400 ms a run's wait lasts before its capsule enters)
        await page.waitForTimeout(700)
        const during = await page.evaluate(() => {
          const el = document.querySelector('.capsule:not([data-out])')
          return el
            ? {
                kind: el.getAttribute('data-kind'),
                said: el.querySelector('.sr-only')?.textContent,
                spinner: !!el.querySelector('svg.spin'),
              }
            : null
        })
        const line = await page.evaluate(
          () => document.querySelector('.progress-line')?.hasAttribute('data-on') ?? null,
        )
        await waitFor(page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
        await page.waitForTimeout(400)
        const after = await page.evaluate(
          () => document.querySelector('.capsule:not([data-out])')?.getAttribute('data-kind') ?? null,
        )
        await context.close()
        return { during, line, after, errors: errors.filter((e) => !/status of 404/.test(e)) }
      } finally {
        delete modes[seg]
      }
    }
    const host = await seen(true)
    const none = await seen(false)
    assert(!host.errors.length && !none.errors.length, [...host.errors, ...none.errors].join('; '))
    assert(
      host.during?.kind === 'progress' && host.during.said === 'Translating, the first time' && host.during.spinner,
      `the host's words while the paper is made: ${JSON.stringify(host.during)}`,
    )
    assert(host.after !== 'progress', `a capsule of the run after it: ${host.after}`)
    assert(none.during === null && none.line === true, `no words given: ${JSON.stringify(none)}`)
    return { host: host.during.said, none: { capsule: none.during, line: none.line } }
  },
)
await check(
  'chrome: one pane alone where the display says so, the reader opened on <body> (its marks on its root, none on <html>): the original alone, the translation alone, swapped, a narrow window the translation alone; the pane out of the display laid out still (PDF.js scrolls it), no page error (L11 third round, gaps 1 and 2)',
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns')
    const look = () =>
      page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const doc = document.querySelector('main.doc').getBoundingClientRect()
                const pane = (side) => {
                  const el = document.querySelector(`.pane[data-side="${side}"]`)
                  const r = el.getBoundingClientRect()
                  const cs = getComputedStyle(el)
                  return {
                    x: Math.round(r.left - doc.left),
                    w: Math.round(r.width),
                    shown: r.width > 0 && cs.visibility === 'visible' && cs.display !== 'none',
                    // (a page of PDF.js's viewer placed: what its scrolls need)
                    placed: !!el.querySelector('.pdfViewer .page')?.offsetParent,
                  }
                }
                done({
                  doc: Math.round(doc.width),
                  html: document.documentElement.getAttribute('data-axt-pdf-mode'),
                  root: document.body.getAttribute('data-axt-pdf-mode'),
                  left: pane('left'),
                  right: pane('right'),
                })
              }),
            ),
          ),
      )
    const shown = (display) =>
      waitFor(page, (d) => document.body.getAttribute('data-axt-pdf-mode') === d, display).then(look, () => {
        throw new Error(`never shown: ${display}`)
      })
    const both = await look()
    await page.evaluate(() => window.__c.controller.setDisplay('original'))
    const original = await shown('original')
    await page.evaluate(() => window.__c.controller.setDisplay('translation'))
    const translation = await shown('translation')
    // (the reader scrolls both of its panes to a page: the one out of the display too)
    await page.evaluate(() => window.__c.controller.goToPage('right', 2))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__c.controller.setDisplay('bilingual'))
    await shown('bilingual')
    await page.evaluate(() => window.__c.controller.setPrefs({ swapped: true }))
    await waitFor(page, () => document.body.hasAttribute('data-axt-swapped')).catch(() => {
      throw new Error('never swapped')
    })
    const swapped = await look()
    await page.evaluate(() => window.__c.controller.setPrefs({ swapped: false }))
    await page.setViewportSize({ width: 700, height: 900 })
    await waitFor(page, () => document.body.hasAttribute('data-axt-narrow')).catch(() => {
      throw new Error('never narrow')
    })
    const narrow = await look()
    await page.evaluate(() => window.__c.controller.goToPage('right', 3))
    await page.waitForTimeout(400)
    await context.close()
    assert(!errors.length, errors.join('; '))
    const half = (p, at, doc) => p.shown && Math.abs(p.w - (doc - 8) / 2) <= 1 && Math.abs(p.x - at) <= 1
    const whole = (p, doc) => p.shown && Math.abs(p.w - doc) <= 1 && p.x === 0
    assert(
      both.html === null &&
        both.root === 'bilingual' &&
        half(both.left, 0, both.doc) &&
        half(both.right, both.doc / 2 + 4, both.doc),
      `side by side: ${JSON.stringify(both)}`,
    )
    assert(whole(original.left, original.doc) && !original.right.shown, `the original: ${JSON.stringify(original)}`)
    assert(
      whole(translation.right, translation.doc) &&
        !translation.left.shown &&
        translation.left.w === 0 &&
        translation.left.placed,
      `the translation: ${JSON.stringify(translation)}`,
    )
    assert(swapped.right.x === 0 && swapped.left.x > swapped.right.x, `swapped: ${JSON.stringify(swapped)}`)
    assert(
      whole(narrow.right, narrow.doc) && !narrow.left.shown && narrow.left.placed,
      `a narrow window: ${JSON.stringify(narrow)}`,
    )
    return { original: original.left.w, translation: translation.right.w, narrow: narrow.right.w }
  },
)
await check(
  "chrome: the narrow window by the host's rule: the extension's keeps side by side chosen and says so; the website's shows the translation chosen, side by side greyed, and says so only once narrowed while reading (L11 difference 7)",
  async () => {
    const look = (page) =>
      page.evaluate(() => {
        const w = window.__c.words('en')
        const radio = (name) => document.querySelector(`.seg.display [role="radio"][aria-label="${name}"]`)
        return {
          bilingual: [
            radio(w.bilingual)?.getAttribute('aria-checked'),
            radio(w.bilingual)?.getAttribute('aria-disabled'),
          ],
          translation: radio(w.translation)?.getAttribute('aria-checked'),
          narrow: !!document.querySelector('.capsule[data-kind="narrow"]:not([data-out])'),
          right: !!window.__c.reader?.state().view.narrow,
        }
      })
    const out = {}
    for (const rule of ['told', 'shown']) {
      const { page, context, errors } = await chromeLaid('s1-columns', rule === 'told' ? {} : { narrow: rule }, {
        viewport: { width: 700, height: 900 },
      })
      await page.waitForTimeout(300)
      const opened = await look(page)
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.waitForTimeout(600)
      await page.setViewportSize({ width: 700, height: 900 })
      await page.waitForTimeout(600)
      const narrowed = await look(page)
      await context.close()
      assert(!errors.length, errors.join('; '))
      out[rule] = { opened, narrowed }
    }
    const { told, shown } = out
    assert(
      told.opened.right && told.opened.bilingual[0] === 'true' && told.opened.narrow,
      `the extension's, opened narrow: ${JSON.stringify(told.opened)}`,
    )
    assert(
      shown.opened.right &&
        shown.opened.translation === 'true' &&
        shown.opened.bilingual[1] === 'true' &&
        !shown.opened.narrow,
      `the website's, opened narrow: ${JSON.stringify(shown.opened)}`,
    )
    assert(
      shown.narrowed.translation === 'true' && shown.narrowed.narrow,
      `the website's, narrowed while reading: ${JSON.stringify(shown.narrowed)}`,
    )
    return out
  },
)
await check(
  "chrome: a refusal for now by the website's rules: the original alone, the translated displays greyed with swap and sync, the capsule's clock, its words with the time; the extension's keeps side by side, the switch whole; neither offers a retry, the session asking again by itself at our server's time (L11 second round, gaps 1, 2, 8; PDF-READER §8.1, flow-fixes F2)",
  async () => {
    const seg = indexOf['s1-columns'].seg
    modes[seg] = { kind: 'refused' }
    const look = async (site) => {
      const { page, context, errors } = await newPage({ path: 'chrome.html' })
      await page.evaluate((x) => window.__c.open('s1-columns', x), site ? { site: true } : { words: true })
      await waitFor(page, () => window.__c.reader?.state().layer.s === 'refused', null, 20_000)
      await waitFor(page, () => !!document.querySelector('.capsule[data-kind="notNow"]:not([data-out])'), null, 10_000)
      await page.waitForTimeout(400)
      const seen = await page.evaluate(() => {
        const w = window.__c.words('en')
        const radio = (n) => document.querySelector(`.seg.display [role="radio"][aria-label="${n}"]`)
        const button = (n) => document.querySelector(`button[aria-label="${n}"]`)
        const capsule = document.querySelector('.capsule[data-kind="notNow"]:not([data-out])')
        const st = window.__c.reader.state()
        return {
          shown: st.view.display,
          stored: st.prefs.display,
          translated: [radio(w.bilingual), radio(w.translation)].map((r) => r?.getAttribute('aria-disabled') ?? null),
          sideBySide: [button(w.swap), button(w.sync)].map((b) => b?.getAttribute('aria-disabled') ?? null),
          sign: window.__c.signOf(capsule),
          retry: !!capsule?.querySelector('button[data-action]'),
          said: capsule?.querySelector('.sr-only')?.textContent ?? null,
          due: st.layer.retryAt !== null && st.layer.retryAt > Date.now(),
        }
      })
      await context.close()
      return { seen, errors: errors.filter((e) => !/status of (404|429)/.test(e)) }
    }
    try {
      const site = await look(true)
      const own = await look(false)
      assert(!site.errors.length && !own.errors.length, [...site.errors, ...own.errors].join('; '))
      assert(
        site.seen.due &&
          site.seen.shown === 'original' &&
          site.seen.stored === 'bilingual' &&
          JSON.stringify(site.seen.translated) === '["true","true"]' &&
          JSON.stringify(site.seen.sideBySide) === '["true","true"]' &&
          site.seen.sign === 'clock' &&
          !site.seen.retry &&
          site.seen.said === 'Limit until later',
        `the website's: ${JSON.stringify(site.seen)}`,
      )
      assert(
        own.seen.shown === 'bilingual' &&
          JSON.stringify(own.seen.translated) === '[null,null]' &&
          JSON.stringify(own.seen.sideBySide) === '[null,null]' &&
          own.seen.sign === 'info' &&
          !own.seen.retry,
        `the extension's: ${JSON.stringify(own.seen)}`,
      )
      return { site: site.seen, own: own.seen }
    } finally {
      delete modes[seg]
    }
  },
)
await check(
  "chrome: the sync greyed until the sides can scroll together by the website's rule, whole once they can; the extension's not greyed by it (L11 second round, gap 9)",
  async () => {
    const out = {}
    for (const site of [true, false]) {
      const { page, context, errors } = await newPage({ path: 'chrome.html' })
      await page.evaluate(
        ([n, x]) => {
          window.__seen = []
          const look = () => {
            const b = document.querySelector(`button[aria-label="${window.__c.words('en').sync}"]`)
            if (!b) return
            // (side by side shown: the switch's own greying, not the display's)
            const shown = document.querySelector('.seg.display [role="radio"][aria-checked="true"]')
            if (shown?.getAttribute('aria-label') !== window.__c.words('en').bilingual) return
            const v = b.getAttribute('aria-disabled')
            if (window.__seen.at(-1) !== v) window.__seen.push(v)
          }
          new MutationObserver(look).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['aria-disabled'],
          })
          return window.__c.open(n, x)
        },
        ['s1-columns', site ? { site: true } : {}],
      )
      await waitFor(page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
      await page.waitForTimeout(300)
      const seen = await page.evaluate(() => ({
        greyed: window.__seen,
        available: [...new Set(window.__c.trail.map((r) => r.syncAvailable))],
        state: window.__c.reader.state().view.sync,
      }))
      await context.close()
      assert(!errors.length, errors.join('; '))
      out[site ? 'site' : 'own'] = seen
    }
    assert(
      out.site.greyed[0] === 'true' && out.site.greyed.at(-1) === null && out.site.state.available,
      `the website's: ${JSON.stringify(out.site)}`,
    )
    assert(
      out.own.greyed.every((v) => v === null),
      `the extension's: ${JSON.stringify(out.own)}`,
    )
    return out
  },
)
await check(
  "chrome: the original lost, where the host words its way to arXiv's PDF: the original's pane's card, the file sign, arXiv's PDF of the version its link, the translation's pane uncovered; the extension's the translation's pane's card, with no retry while the session opens the original again by itself (L11 second round, gap 3; PDF-READER §8.1, flow-fixes F2)",
  async () => {
    const paper = indexOf['s1-columns'].paper
    const look = async (x) => {
      const { page, context, errors } = await newPage({ path: 'chrome.html' })
      await page.evaluate((o) => window.__c.open('s1-columns', o), x)
      await waitFor(page, () => window.__c.reader?.state().original.s === 'failed', null, 20_000)
      await waitFor(page, () => !!document.querySelector('.pane .card'), null, 10_000)
      const seen = await page.evaluate(() => {
        const pane = (side) => document.querySelector(`.pane[data-side="${side}"]`)
        const card = (side) => pane(side).querySelector('.card')
        const left = card('left')
        return {
          left: left && {
            sign: window.__c.signOf(left),
            tone: left.getAttribute('data-tone'),
            words: left.querySelector('p')?.textContent,
            href: left.querySelector('a')?.getAttribute('href'),
            label: left.querySelector('a')?.textContent,
            covers: pane('left').hasAttribute('data-card'),
          },
          right: card('right') && {
            words: card('right').querySelector('p')?.textContent,
            retry: !!card('right').querySelector('button'),
          },
          rightCovered: pane('right').hasAttribute('data-card'),
        }
      })
      await context.close()
      return { seen, errors: errors.filter((e) => !/status of 503/.test(e)) }
    }
    const site = await look({ site: true, original: 'broken' })
    const own = await look({ words: true, original: 'broken' })
    assert(!site.errors.length && !own.errors.length, [...site.errors, ...own.errors].join('; '))
    assert(
      site.seen.left?.sign === 'file' &&
        site.seen.left.tone === 'wait' &&
        site.seen.left.words === 'The original cannot be shown here' &&
        site.seen.left.href === `https://arxiv.org/pdf/${paper}` &&
        site.seen.left.label === 'Open the PDF on arXiv' &&
        site.seen.left.covers &&
        site.seen.right === null &&
        !site.seen.rightCovered,
      `the website's: ${JSON.stringify(site.seen)}`,
    )
    assert(
      own.seen.left === null && own.seen.right?.words === 'The original could not be read' && !own.seen.right.retry,
      `the extension's: ${JSON.stringify(own.seen)}`,
    )
    return { site: site.seen, own: own.seen }
  },
)
await check(
  "chrome: the original lost and the translation not to be had now, by the website's rules: its page's bare bar (its way home and the reading options alone), the capsule telling the refusal beside the original's own card; the extension's whole bar, its card with no retry (the session opens the original again by itself), no capsule (L11 third round, gaps 4 and 5; flow-fixes F2)",
  async () => {
    const seg = indexOf['s1-columns'].seg
    modes[seg] = { kind: 'refused' }
    const look = async (x) => {
      const { page, context, errors } = await newPage({ path: 'chrome.html' })
      await page.evaluate((o) => window.__c.open('s1-columns', o), x)
      await waitFor(
        page,
        () => {
          const s = window.__c.reader?.state()
          return s?.original.s === 'failed' && s.layer.s === 'refused'
        },
        null,
        20_000,
      )
      await page.waitForTimeout(600)
      const seen = await page.evaluate(() => {
        const zones = Object.fromEntries(
          [...document.querySelectorAll('header.bar > [data-zone]')].map((z) => [
            z.dataset.zone,
            [...z.querySelectorAll('[data-host], button, [role="radiogroup"]')]
              .filter((el) => !el.closest('[popover]'))
              .map((el) => el.dataset.host ?? el.getAttribute('aria-label')),
          ]),
        )
        const capsule = document.querySelector('.capsule:not([data-out])')
        return {
          zones,
          line: !!document.querySelector('.progress-line'),
          capsule: capsule && {
            kind: capsule.getAttribute('data-kind'),
            said: capsule.querySelector('.sr-only')?.textContent ?? capsule.textContent,
          },
          left: !!document.querySelector('.pane[data-side="left"] .card a'),
          right: document.querySelector('.pane[data-side="right"] .card') && {
            words: document.querySelector('.pane[data-side="right"] .card p')?.textContent ?? null,
            retry: !!document.querySelector('.pane[data-side="right"] .card button'),
          },
        }
      })
      await context.close()
      return { seen, errors: errors.filter((e) => !/status of (503|404|429)/.test(e)) }
    }
    try {
      const site = await look({ site: true, slots: true, original: 'broken' })
      const own = await look({ words: true, slots: true, original: 'broken' })
      assert(!site.errors.length && !own.errors.length, [...site.errors, ...own.errors].join('; '))
      const en = { options: 'Reading options', zoom: 'Zoom in' }
      assert(
        JSON.stringify(site.seen.zones) === JSON.stringify({ lead: ['home'], centre: [], trail: [en.options] }) &&
          !site.seen.line &&
          site.seen.left &&
          site.seen.capsule?.kind === 'notNow' &&
          /^Limit/.test(site.seen.capsule.said),
        `the website's: ${JSON.stringify(site.seen)}`,
      )
      assert(
        own.seen.zones.lead?.includes('home') &&
          own.seen.zones.trail?.includes(en.zoom) &&
          own.seen.line &&
          // (its card, with no retry while the session opens the original again by itself: PDF-READER §8.1, flow-fixes F2)
          own.seen.right?.words === 'The original could not be read' &&
          !own.seen.right.retry &&
          own.seen.capsule === null,
        `the extension's: ${JSON.stringify(own.seen)}`,
      )
      return { site: site.seen, own: { capsule: own.seen.capsule, trail: own.seen.zones.trail?.length } }
    } finally {
      delete modes[seg]
    }
  },
)
await check(
  "chrome: our server at capacity, the open refused busy twice: the website's capsule waits in line (its words, the spinner, no retry), the display chosen standing, and goes on by itself into the first making's words; the extension's says the refusal, with no retry, and goes on by itself too (the coordinator's decision 5, 2026-11-11; PDF-READER §8.1, flow-fixes F2)",
  async () => {
    const seg = indexOf['s2-splits'].seg
    const look = async (x) => {
      modes[seg] = { kind: 'not-opened', prepareMs: 2500, busy: 2 }
      try {
        const { page, context, errors } = await newPage({ path: 'chrome.html' })
        await page.evaluate((o) => window.__c.open('s2-splits', o), x)
        const seen = []
        let layer = null
        const t0 = Date.now()
        while (Date.now() - t0 < 15_000) {
          const now = await page.evaluate(() => {
            const el = document.querySelector('.capsule:not([data-out])')
            return {
              layer: window.__c.reader?.state().layer.s ?? null,
              display: window.__c.reader?.state().view.display ?? null,
              capsule: el && {
                kind: el.getAttribute('data-kind'),
                said: el.querySelector('.sr-only')?.textContent ?? '',
                spinner: !!el.querySelector('svg.spin'),
                retry: !!el.querySelector('button[data-action]'),
              },
            }
          })
          const key = JSON.stringify([now.capsule, now.display])
          if (seen.at(-1)?.key !== key) seen.push({ key, ...now })
          layer = now.layer
          if (layer === 'ready') break
          await page.waitForTimeout(100)
        }
        const opens = v2log.filter((e) => e.what === 'open').length
        await context.close()
        return {
          seen: seen.map(({ key: _, ...s }) => s),
          layer,
          opens,
          errors: errors.filter((e) => !/status of 404/.test(e)),
        }
      } finally {
        delete modes[seg]
      }
    }
    const before = v2log.length
    const site = await look({ site: true })
    const own = await look({})
    assert(!site.errors.length && !own.errors.length, [...site.errors, ...own.errors].join('; '))
    const capsules = (x) => x.seen.map((s) => s.capsule).filter(Boolean)
    const queue = capsules(site).find((c) => c.said === 'Waiting in line')
    assert(
      queue?.kind === 'progress' &&
        queue.spinner &&
        !queue.retry &&
        capsules(site).some((c) => c.said === 'Translating, the first time') &&
        !capsules(site).some((c) => c.kind === 'notNow') &&
        // (waiting in line is a wait, not a refusal: the display chosen stands throughout, nothing jumps when the open is taken;
        // flow-fixes F5)
        site.seen.every((x) => x.display !== 'original') &&
        site.layer === 'ready',
      `the website's: ${JSON.stringify(site.seen)}`,
    )
    assert(
      capsules(own).some((c) => c.kind === 'notNow') && !capsules(own).some((c) => c.retry) && own.layer === 'ready',
      `the extension's: ${JSON.stringify(own.seen)}`,
    )
    return {
      site: capsules(site).map((c) => `${c.kind}:${c.said}`),
      own: capsules(own).map((c) => c.kind),
      asks: v2log.length - before,
    }
  },
)
await check(
  "chrome: a narrow window while the paper is made, by the website's rule: the original held, the switch at the original, the chip that shows the translation once some is there, pressed the translation shown; the extension's shows the translation alone from the first (L11 second round, gaps 7 and 4)",
  async () => {
    const seg = indexOf['s2-splits'].seg
    const look = async (x) => {
      modes[seg] = { kind: 'not-opened', prepareMs: 1500, runningMs: 8000 }
      try {
        const { page, context, errors } = await newPage({ path: 'chrome.html', viewport: { width: 700, height: 900 } })
        await page.evaluate((o) => window.__c.open('s2-splits', o), x)
        await waitFor(page, () => window.__c.reader?.state().layer.s === 'preparing', null, 20_000)
        await page.waitForTimeout(300)
        const radios = () =>
          page.evaluate(() => {
            const w = window.__c.words('en')
            return [w.original, w.bilingual, w.translation].map(
              (n) =>
                document
                  .querySelector(`.seg.display [role="radio"][aria-label="${n}"]`)
                  ?.getAttribute('aria-checked') ?? null,
            )
          })
        const preparing = {
          shown: await page.evaluate(() => window.__c.reader.state().view.display),
          radios: await radios(),
        }
        const chip = '.capsule[data-kind="progress"] button[data-action]'
        let pressed = null
        if (x.site) {
          await waitFor(page, (sel) => !!document.querySelector(sel), chip, 20_000).catch(async (e) => {
            const at = await page.evaluate(() => ({
              state: window.__c.reader?.state(),
              chrome: window.__c.controller.getState(),
              capsule: document.querySelector('.capsule')?.outerHTML ?? null,
            }))
            throw new Error(
              `${e.message}: ${JSON.stringify({ rows: at.state?.rows, layer: at.state?.layer, phase: at.chrome.phase, translated: at.chrome.translated, display: at.chrome.display, capsule: at.capsule?.slice(0, 300) })}`,
            )
          })
          const before = await page.evaluate(() => window.__c.reader.state().view.display)
          await page.locator(chip).click()
          await waitFor(page, () => window.__c.controller.getState().display === 'translation', null, 10_000)
          await waitFor(page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 20_000)
          pressed = {
            before,
            after: await page.evaluate(() => window.__c.reader.state().view.display),
            writes: await page.evaluate(() => window.__c.writes.map((w) => w.display).filter(Boolean)),
            radios: await radios(),
          }
        } else await waitFor(page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
        const trail = await page.evaluate(() => window.__c.trail.map((r) => `${r.phase}:${r.display}`))
        await context.close()
        return { preparing, pressed, trail, errors: errors.filter((e) => !/status of 404/.test(e)) }
      } finally {
        delete modes[seg]
      }
    }
    const site = await look({ site: true, narrow: 'shown' })
    const own = await look({})
    assert(!site.errors.length && !own.errors.length, [...site.errors, ...own.errors].join('; '))
    assert(
      site.preparing.shown === 'original' &&
        JSON.stringify(site.preparing.radios) === '["true","false","false"]' &&
        site.pressed?.before === 'original' &&
        site.pressed.after === 'translation' &&
        JSON.stringify(site.pressed.writes) === '["translation"]' &&
        JSON.stringify(site.pressed.radios) === '["false","false","true"]',
      `the website's: ${JSON.stringify(site)}`,
    )
    assert(
      own.preparing.shown === 'bilingual' && !own.trail.slice(1).some((t) => t.endsWith(':original')),
      `the extension's: ${JSON.stringify(own)}`,
    )
    return { site: { preparing: site.preparing, pressed: site.pressed }, own: own.preparing }
  },
)
await check(
  "reader: our server's word on arXiv's HTML version taken before any ask of arXiv's; the website's link in its own words (L11 second round, gap 5)",
  async () => {
    const seg = indexOf['s1-columns'].seg
    const paper = indexOf['s1-columns'].paper
    const out = {}
    for (const html of [true, false]) {
      modes[seg] = { kind: 'cannot', html }
      try {
        const { page, context, errors } = await newPage({ path: 'chrome.html' })
        const asked = []
        page.on('request', (r) => {
          if (/^https:\/\/arxiv\.org\/html\//.test(r.url())) asked.push(r.url())
        })
        await page.evaluate(() => window.__c.open('s1-columns', { site: true }))
        await waitFor(page, () => window.__c.reader?.state().layer.s === 'refused', null, 20_000)
        await page.waitForTimeout(600)
        const seen = await page.evaluate(() => {
          const a = document.querySelector('.capsule[data-kind="unavailable"] a[data-action]')
          return {
            html: window.__c.reader.state().paper.html,
            link: a && [a.getAttribute('href'), a.textContent],
          }
        })
        await context.close()
        assert(!errors.length, errors.join('; '))
        out[html] = { ...seen, asked }
      } finally {
        delete modes[seg]
      }
    }
    assert(
      out.true.html === `https://arxiv.org/html/${paper}#readarxiv` &&
        JSON.stringify(out.true.link) === '["https://example.org/store","Install the extension"]' &&
        !out.true.asked.length,
      `arXiv has one: ${JSON.stringify(out.true)}`,
    )
    assert(
      out.false.html === null && out.false.link === null && !out.false.asked.length,
      `none: ${JSON.stringify(out.false)}`,
    )
    return out
  },
)
await check(
  "reader: a face that cannot be had is the reader's state, the pages laid in its fallback (L11 second round, gap 6)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns', { faces: 'missing' })
    await waitFor(page, () => window.__c.reader.state().faces === 'lost', null, 10_000)
    const st = await page.evaluate(() => ({
      faces: window.__c.reader.state().faces,
      laid: window.__c.reader.probe().laidPages,
    }))
    const fine = await chromeLaid('s1-columns', {})
    const other = await fine.page.evaluate(() => window.__c.reader.state().faces)
    await context.close()
    await fine.context.close()
    assert(
      !errors.filter((e) => !/status of 404/.test(e)).length && !fine.errors.length,
      [...errors, ...fine.errors].join('; '),
    )
    assert(st.faces === 'lost' && st.laid > 0 && other === null, `faces ${JSON.stringify({ st, other })}`)
    return { ...st, other }
  },
)
await check(
  "reader: a paper arXiv does not have: the state says why (the original not found, the layer refused as not found), for the host's own page (L11 difference 3)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', paper: '2600.09999v1' }))
    await waitFor(page, () => {
      const s = window.__h.readers[0].reader.state()
      return s.original.s === 'failed' && s.layer.s === 'refused'
    })
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    await context.close()
    // (our server's 404s, of the original and of the follow, are the browser's console lines, and expected)
    assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
    assert(
      st.original.why === 'not-found' && st.layer.why === 'not-found' && !st.crashed,
      `state ${JSON.stringify([st.original, st.layer, st.crashed])}`,
    )
    return { original: st.original, layer: st.layer }
  },
)
await check(
  "reader: PDF.js's legacy build handed by the host: its modules and its worker, the pages drawn and laid as on the modern (L11 gap 3)",
  async () => {
    const from = server.log.length
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', legacy: true }))
    await readerLaid(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    const p = await probe(page)
    const scripts = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => new URL(e.name).pathname)
        .filter((x) => x.endsWith('.js') || x.endsWith('.mjs')),
    )
    await context.close()
    const asked = server.log.slice(from).map((x) => x.path)
    assert(!errors.length, errors.join('; '))
    const workers = asked.filter((x) => x.endsWith('pdf.worker.min.mjs'))
    assert(
      workers.length > 0 && workers.every((x) => /\/pdfjs\/[\d.]+\/legacy\/pdf\.worker\.min\.mjs$/.test(x)),
      `the workers asked: ${JSON.stringify(workers)}`,
    )
    assert(
      st.original.s === 'open' && st.layer.s === 'ready' && p.laidPages > 0,
      `state ${JSON.stringify([st.original, st.layer])}`,
    )
    return { workers: [...new Set(workers)], laidPages: p.laidPages, chunks: scripts.length }
  },
)
await check(
  'reader: close lets everything go, closed before PDF.js is in too; a second reader on the same page goes on',
  async () => {
    // (closed in the task that opened it, before PDF.js's modules are in: once they are, for the reader opened after it on the
    // same page, the closed one has made nothing: no sheet, no pane, no mark, no worker, no timer, no ticket)
    const early = await newPage()
    await early.page.evaluate(async () => {
      await window.__h.reader('s1-columns', { host: 'web', width: '50%', closeAtOnce: true })
      await window.__h.reader('s2-splits', { host: 'web', width: '50%' })
    })
    await readerLaid(early.page, 1)
    const closedEarly = await early.page.evaluate(() => {
      const r = window.__h.readers[0]
      return {
        root: r.root.childElementCount,
        attrs: r.root.getAttributeNames(),
        cls: r.root.className,
        probe: r.reader.probe(),
      }
    })
    await early.context.close()
    assert(!early.errors.length, early.errors.join('; '))
    assert(
      closedEarly.root === 0 &&
        !closedEarly.attrs.some((a) => a.startsWith('data-axt')) &&
        !/axt-/.test(closedEarly.cls),
      `closed before ready: root ${closedEarly.root} children, ${closedEarly.attrs}, class "${closedEarly.cls}"`,
    )
    assert(
      closedEarly.probe.workers === 0 && closedEarly.probe.clockDue === 0 && closedEarly.probe.live === 0,
      `closed before ready ${JSON.stringify(closedEarly.probe)}`,
    )
    const { page, context, errors } = await newPage()
    await page.evaluate(async () => {
      await window.__h.reader('s1-columns', { host: 'web', width: '50%' })
      await window.__h.reader('s2-splits', { host: 'web', width: '50%' })
    })
    await readerLaid(page, 0)
    await readerLaid(page, 1)
    // (each reader's faces in the document, by the reader's number in their family: `axt-<reader>-<face>`)
    const facesOf = () =>
      page.evaluate(() => [
        ...new Set(
          [...document.fonts]
            .map((f) => /^"?axt-(\d+)-/.exec(f.family)?.[1])
            .filter(Boolean)
            .sort(),
        ),
      ])
    // (a page counts as laid at its commit, before its drawing waits for its faces: both readers' faces in first)
    await waitFor(
      page,
      () => new Set([...document.fonts].map((f) => /^"?axt-(\d+)-/.exec(f.family)?.[1]).filter(Boolean)).size === 2,
      null,
      15_000,
    ).catch(() => {})
    const facesBefore = await facesOf()
    await page.evaluate(() => window.__h.readers[0].reader.close())
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      root: window.__h.readers[0].root.childElementCount,
      attrs: window.__h.readers[0].root.getAttributeNames(),
      a: window.__h.readers[0].reader.probe(),
      b: window.__h.readers[1].reader.probe(),
    }))
    const facesAfter = await facesOf()
    await page.evaluate(() => window.__h.readers[1].reader.do({ do: 'zoomBy', factor: 1.25 }))
    await page.waitForTimeout(700)
    const b2 = await page.evaluate(() => ({
      probe: window.__h.readers[1].reader.probe(),
      state: window.__h.readers[1].reader.state(),
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      after.root === 0 && !after.attrs.some((a) => a.startsWith('data-axt')),
      `root after close: ${after.root} children, ${after.attrs}`,
    )
    assert(
      after.a.workers === 0 && after.a.clockDue === 0 && after.a.live === 0,
      `left after close ${JSON.stringify(after.a)}`,
    )
    // (the closed reader's faces taken out of the document, the other's kept)
    assert(
      facesBefore.length === 2 && facesAfter.length === 1 && facesBefore.includes(facesAfter[0]),
      `the readers' faces in the document: ${JSON.stringify(facesBefore)} before the close, ${JSON.stringify(facesAfter)} after`,
    )
    assert(
      after.b.workers === 2 && after.b.laidPages > 0 && b2.probe.laidPages > 0 && b2.state.view.scale > 0,
      `the other reader ${JSON.stringify(b2.probe)}`,
    )
    return {
      early: { root: closedEarly.root, workers: closedEarly.probe.workers, live: closedEarly.probe.live },
      a: { workers: after.a.workers, live: after.a.live },
      b: { workers: after.b.workers, laidPages: b2.probe.laidPages },
    }
  },
)

await check(
  'reader: a run our server started again on the rows held (2610.21924v1 after a deploy, staging 2026-11-11) lays no page again: the rows taken again, their end told, the pages as they were',
  async () => {
    const seg = indexOf['s2-splits'].seg
    modes[seg] = { kind: 'again', after: 4000 }
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s2-splits', { host: 'web' }))
      const at = () =>
        page.evaluate(() => {
          const r = window.__h.readers[0].reader
          const marks = window.__h.marks
          return {
            rows: r.state().rows.s,
            laid: r.probe().laidPages,
            lays: r.probe().lays,
            gen: Math.max(0, ...marks.filter((x) => x.what === 'lay').map((x) => x.gen)),
          }
        })
      await waitFor(
        page,
        () => {
          const r = window.__h.readers[0].reader
          return r.state().rows.s === 'complete' && r.probe().laidPages > 0
        },
        null,
        25_000,
      )
      await page.waitForTimeout(500)
      const settled = await at()
      assert(modes[seg].phase === 0, `the run started again before the pages settled: ${JSON.stringify(settled)}`)
      // (the run started again, then done: its rows taken and ended again)
      const t0 = Date.now()
      for (;;) {
        const s = await at()
        if (modes[seg].phase === 2 && s.rows === 'complete') break
        if (Date.now() - t0 > 25_000) throw new Error(`the run started again never ended: ${JSON.stringify(s)}`)
        await page.waitForTimeout(100)
      }
      await page.waitForTimeout(500)
      const after = await at()
      const asked = await page.evaluate(() => window.__h.readers[0].asked.map((a) => a.url))
      await context.close()
      assert(!errors.length, errors.join('; '))
      assert(
        asked.some((u) => u.endsWith(modes[seg].again)),
        `the restated rows not read: ${JSON.stringify(asked)}`,
      )
      assert(
        after.lays === settled.lays && after.gen === settled.gen && after.laid === settled.laid,
        `pages laid again: ${JSON.stringify({ settled, after })}`,
      )
      return { settled, after }
    } finally {
      delete modes[seg]
    }
  },
)
// A settled paper is asked nothing more until the reader's wake (design-performance-2026-11-13 Q9: a settled tab asked once a
// minute, 60 asks an hour): its head answered gone (the paper's objects replaced) asks the document once; an hour of the page's
// clock after that, nothing
await check(
  'reader: a settled paper asked nothing more but on the wake: the head answered gone asks the document once, then an hour of nothing',
  async () => {
    const name = 's2-splits'
    const seg = indexOf[name].seg
    const head = `/api/v2/o/${docs[seg].layer.catalog.path}`
    const { page, context, errors } = await newPage()
    // (the page's clock faked from here, flowing as the real one until the check moves it)
    await page.clock.install()
    let gone = 0
    await context.route(`**${head}`, async (route) => {
      if (gone++ === 0) return route.fulfill({ status: 404, body: '' })
      return route.fallback()
    })
    const from = v2log.length
    const follows = () => v2log.slice(from).filter((x) => x.what === 'follow' && x.seg === seg).length
    await page.evaluate((n) => window.__h.reader(n, { host: 'web' }), name)
    // (the first document, the head answered gone, and the one ask that follows it)
    const t0 = Date.now()
    while (follows() < 2 && Date.now() - t0 < 10_000) await page.waitForTimeout(100)
    await page.waitForTimeout(2000)
    const afterGone = follows()
    // (an hour of the page's clock, the paper settled)
    await page.clock.fastForward('01:00:00')
    await page.waitForTimeout(2000)
    const afterHour = follows()
    await context.close()
    assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
    assert(
      gone >= 1 && afterGone === 2,
      `follows: ${afterGone} by the head answered gone (asked ${gone} times), 2 wanted`,
    )
    assert(afterHour === afterGone, `follows in an hour of a settled paper: ${afterHour - afterGone}`)
    return { follows: afterHour, headAsked: gone }
  },
)
// A part answered gone after the head was read (#640 review): the layer made again in a directory of its own once the composed
// document is open, as our server replaces a layer and later deletes the old one's objects. A part is read as its page comes
// near, long after the head: the reader that read the old head learns of the new layer only by asking the document again.
// Both hosts: the website's follow settled, waiting for a wake; the extension's none at all (rows made here, the layer final)
for (const host of ['web', 'ext'])
  await check(
    `reader: a part of the layer answered gone once its head was read asks the document once, and the layer our server serves now is laid without a reload (${host}'s host)`,
    async () => {
      if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
      const name = 's1-columns'
      const seg = indexOf[name].seg
      modes[seg] = { kind: 'moved', switched: false }
      try {
        const { page, context, errors } = await newPage()
        await page.evaluate(([n, h]) => window.__h.reader(n, { host: h, typeset: true, target: 'de' }), [name, host])
        // (the composed document open over the old layer, then its first part asked: the layer made again, the part gone)
        for (const t0 = Date.now(); !modes[seg].switched && Date.now() - t0 < 30_000; ) await page.waitForTimeout(50)
        assert(modes[seg].switched, 'no part of the first layer asked in 30 s')
        let s = null
        for (const t0 = Date.now(); Date.now() - t0 < 20_000; ) {
          s = await page.evaluate(() => {
            const x = window.__h.readers[0]
            return {
              layer: x.reader.state().layer.s,
              laid: x.reader.probe().laidPages,
              moved: x.asked.filter((a) => a.url.includes('/fx2/')).length,
            }
          })
          if (s.laid > 0 && s.moved > 0) break
          await page.waitForTimeout(100)
        }
        // (settled after it: no more asks of the document)
        await page.waitForTimeout(1500)
        // (counted from the moment the layer was made again, the stand-in's)
        const follows = v2log.slice(modes[seg].from).filter((x) => x.what === 'follow' && x.seg === seg).length
        const gone = modes[seg].gone
        await context.close()
        assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
        assert(
          s.laid > 0 && s.moved > 0,
          `the layer our server serves now not laid in 20 s: ${JSON.stringify({ ...s, follows, gone })}`,
        )
        assert(follows === 1, `follows after the part answered gone: ${follows}, 1 wanted`)
        return { ...s, follows, gone }
      } finally {
        delete modes[seg]
      }
    },
  )
await check(
  "reader: each composed document keeps its own layout: a newer catalog's pages laid by its layout, the older one's late layout dropped",
  async () => {
    const seg = indexOf['s1-columns'].seg
    modes[seg] = { kind: 'recatalog', switched: false }
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', holdFirstLay: true }))
      // (the first composed document's layout asked, and held; then the server names a newer catalog)
      await waitFor(page, () => window.__h.marks.some((m) => m.what === 'lay-asked' && m.gen === 1), null, 25_000)
      modes[seg].switched = true
      await waitFor(
        page,
        () =>
          window.__h.marks.some((m) => m.what === 'lay' && m.gen === 2) &&
          window.__h.readers[0].reader.probe().laidPages > 0,
        null,
        25_000,
      )
      // (the first layout comes late; then every near page laid again, by what to translate changed)
      const from = await page.evaluate(() => {
        window.__h.releaseLay()
        return window.__h.marks.length
      })
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        const r = window.__h.readers[0].reader
        const c = r.state().prefs.classes
        r.do({ do: 'set', prefs: { classes: { ...c, heads: !c.heads } } })
      })
      await waitFor(page, (n) => window.__h.marks.slice(n).some((m) => m.what === 'lay'), from, 10_000)
      await page.waitForTimeout(500)
      const gens = await page.evaluate(
        (n) =>
          window.__h.marks
            .slice(n)
            .filter((m) => m.what === 'lay')
            .map((m) => m.gen),
        from,
      )
      const probe = await page.evaluate(() => window.__h.readers[0].reader.probe())
      await context.close()
      assert(!errors.length, errors.join('; '))
      assert(
        gens.length > 0 && gens.every((g) => g === 2),
        `the pages laid after the first layout came, by generation: ${JSON.stringify(gens)}`,
      )
      return { laidAgain: gens.length, by: [...new Set(gens)], laidPages: probe.laidPages }
    } finally {
      delete modes[seg]
    }
  },
)

// ---------------------------------------------------------------- stage 5a, deliverable 2 part A: today's behaviours over the stack
// (each check names the rows of lanes/L4/list-b.md and list-a.md it holds; docs/PDF-READER.md §11.7-§11.11, §17)
const S1 = indexOf['s1-columns'].original,
  SAMPLE = '/api/v2/o/arxiv/2600_00001v1.pdf'
const drawnOn = (page, side, n, key) =>
  waitFor(
    page,
    ([side, n, key]) =>
      window.__h.marks.some(
        (m) => m.what === 'drawn' && m.side === side && m.page === n && (key === null || String(m.key).startsWith(key)),
      ),
    [side, n, key],
  )
const shownKey = (page, n) => page.evaluate((n) => window.__h.panes.right.showing(n), n)

await check(
  'port: the skeleton while no original is drawn, every slot at its size, hidden from AT (B-226)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u, { borrow: true }), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const before = await page.evaluate(() => window.__h.panes.right.page(1).getBoundingClientRect().toJSON())
    await page.evaluate(() => window.__h.panes.drop())
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const p = window.__h.panes,
        s = p.right.page(1)
      return {
        slots: p.right.pages,
        sk: !!s.querySelector('.axt-sk'),
        lines: s.querySelectorAll('.axt-sk-lines').length,
        hidden: s.getAttribute('aria-hidden'),
        box: s.getBoundingClientRect().toJSON(),
        probe: p.right.probe(),
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r.slots === 4 && r.sk && r.lines > 0 && r.hidden === 'true', JSON.stringify(r))
    assert(
      Math.abs(r.box.width - before.width) < 0.5 && Math.abs(r.box.height - before.height) < 0.5,
      'the slot resized',
    )
    assert(r.probe.views === 0 && r.probe.skeletons >= 1, JSON.stringify(r.probe))
    return { skeletons: r.probe.skeletons, slots: r.slots }
  },
)

await check(
  "port: a waiting page is the left's own drawing, no second render, no text layer or links of its own; kept by CSS through a zoom until the left draws again; its own page view with the sync off, its text the paper's language (B-006, B-228, B-229, A-332)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u, { borrow: true }), SAMPLE)
    await drawnOn(page, 'left', 1, null)
    await drawnOn(page, 'right', 1, 'left')
    const r1 = await page.evaluate(() => {
      const p = window.__h.panes,
        s = p.right.page(1)
      const copy = s.querySelector('canvas.axt-slot-copy'),
        src = p.leftViewer.getPageView(0).canvas
      const px = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data]
      const at = [
        [10, 10],
        [Math.floor(src.width / 2), Math.floor(src.height / 3)],
        [src.width - 5, src.height - 5],
      ]
      copy.dataset.tag = 'first'
      return {
        copy: !!copy,
        same:
          !!copy && copy.width === src.width && at.every(([x, y]) => px(copy, x, y).join() === px(src, x, y).join()),
        text: !!s.querySelector('.textLayer'),
        annotations: !!s.querySelector('.annotationLayer'),
        made: p.right.probe().made,
        leftLang: document.querySelector('.axt-pane.left .textLayer')?.getAttribute('lang') ?? null,
        copies: p.right.probe().copies,
      }
    })
    await page.evaluate(() => window.__h.panes.zoomBy(1.25))
    const during = await page.evaluate(() => !!window.__h.panes.right.page(1).querySelector('canvas[data-tag="first"]'))
    await page.waitForTimeout(1000)
    const r2 = await page.evaluate(() => {
      const p = window.__h.panes,
        copy = p.right.page(1).querySelector('canvas.axt-slot-copy')
      return { copies: p.right.probe().copies, width: copy?.width, left: p.leftViewer.getPageView(0).canvas.width }
    })
    await page.evaluate(() => window.__h.panes.setSync(false))
    await drawnOn(page, 'right', 1, 'original')
    await page.waitForTimeout(300)
    const r3 = await page.evaluate(() => {
      const s = window.__h.panes.right.page(1)
      return {
        text: !!s.querySelector('.textLayer'),
        lang: s.querySelector('.textLayer')?.getAttribute('lang') ?? null,
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r1.copy && r1.same, `the copy: ${JSON.stringify(r1)}`)
    assert(!r1.text && !r1.annotations && r1.made === 0, `a second drawing: ${JSON.stringify(r1)}`)
    assert(r1.leftLang === 'en', `the left's text layer lang ${r1.leftLang}`)
    assert(during, 'the copy left as the zoom began')
    assert(r2.copies > r1.copies && r2.width === r2.left, `after the zoom: ${JSON.stringify(r2)}`)
    assert(r3.text && r3.lang === 'en', `the sync off: ${JSON.stringify(r3)}`)
    return { copies: r2.copies }
  },
)

await check(
  'port: Glint on near pages waiting for their rows, every value of its look, in shares of the page, gone in the task the page is put in place (B-274-B-283)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await waitFor(page, () => (window.__h.marksOf(1)?.count ?? 0) > 0)
    await page.waitForTimeout(150)
    const m = await page.evaluate(() => window.__h.marksOf(1))
    const members = await page.evaluate(
      () =>
        [...window.__h.parts.values()]
          .flatMap((p) => p.flows.flat())
          .filter((x) => x.lines.some((l) => l[0] === 1))
          .filter((x, i, a) => a.findIndex((y) => y.ord === x.ord) === i).length,
    )
    await page.evaluate(() => window.__h.panes.zoomBy(1.25))
    await page.waitForTimeout(900)
    const z = await page.evaluate(() => window.__h.marksOf(1))
    await page.evaluate(() => window.__h.rows.give())
    await laidShown(page, 1)
    const at = await page.evaluate(
      () =>
        window.__h.marks.find((x) => x.what === 'shown' && x.page === 1 && String(x.key).startsWith('laid:')).marksLeft,
    )
    const after = await page.evaluate(() => window.__h.marksOf(1))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(m.count === members, `${m.count} marks for ${members} paragraphs`)
    assert(m.ariaHidden === 'true' && m.pointerEvents === 'none', JSON.stringify(m))
    assert(m.delay === '0.3s' && m.fade === '0.4s' && m.run === '3.4s', `timing ${JSON.stringify(m)}`)
    assert(m.angle === '100deg' && /78%/.test(m.light), `look ${m.angle} ${m.light}`)
    assert(m.passes === m.count && m.starts.length === 1, `one light: ${m.passes} passes, starts ${m.starts}`)
    const moved = m.shares
      .flatMap((b, i) => b.map((v, k) => Math.abs(v - z.shares[i][k])))
      .reduce((a, b) => Math.max(a, b), 0)
    assert(moved < 0.002, `a zoom moved a mark by ${moved} of the page`)
    assert(at === 0 && after === null, `marks at the swap ${at}, after ${JSON.stringify(after)}`)
    // (reduced motion: the still veil, no light)
    const r = await newPage()
    await r.page.emulateMedia({ reducedMotion: 'reduce' })
    await r.page.evaluate((u) => window.__h.open(u), S1)
    await r.page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await waitFor(r.page, () => (window.__h.marksOf(1)?.count ?? 0) > 0)
    await r.page.waitForTimeout(450)
    const still = await r.page.evaluate(() => window.__h.marksOf(1))
    await r.context.close()
    assert(!r.errors.length, r.errors.join('; '))
    assert(still.before === 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(still.background), JSON.stringify(still))
    return { marks: m.count, still: still.background }
  },
)

await check(
  'port: another target in place: the page laid kept until its commit, muted meanwhile, the left untouched; rows that will not come put it back to the original (B-313-B-316, B-320, B-295, A-286, A-287)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const key1 = await shownKey(page, 1)
    const left0 = await page.evaluate(() => ({
      draws: window.__h.marks.filter((m) => m.what === 'drawn' && m.side === 'left').length,
      top: document.querySelector('.axt-pane.left').scrollTop,
    }))
    const ord = await page.evaluate(() => window.__h.composer.laid(1).members.find((m) => m.state === 'laid').ord)
    await page.evaluate(() => window.__h.retargetLater('xx', 's1-columns'))
    await page.waitForTimeout(400)
    const kept = await page.evaluate(
      ([ord]) => {
        const pt = window.__h.pointOf(1, ord, 'right')
        return {
          key: window.__h.panes.right.showing(1),
          muted: window.__h.composer.muted(1),
          hit: pt ? window.__h.highlight.at('right', pt.x, pt.y) : 'no point',
        }
      },
      [ord],
    )
    await page.evaluate(() => window.__h.rows.give())
    await waitFor(
      page,
      ([k]) => {
        const s = window.__h.panes.right.showing(1)
        return s?.startsWith('laid:') && s !== k
      },
      [key1],
    )
    const key2 = await shownKey(page, 1)
    const muted2 = await page.evaluate(() => window.__h.composer.muted(1))
    await page.evaluate(() => window.__h.retargetLater('yy', 's1-columns'))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.__h.rows.end())
    await waitFor(page, () => !String(window.__h.panes.right.showing(1)).startsWith('laid:'))
    const back = await shownKey(page, 1)
    const left1 = await page.evaluate(() => ({
      draws: window.__h.marks.filter((m) => m.what === 'drawn' && m.side === 'left').length,
      top: document.querySelector('.axt-pane.left').scrollTop,
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(kept.key === key1 && kept.muted && kept.hit === null, `kept: ${JSON.stringify(kept)}`)
    assert(key2 !== key1 && !muted2, `the new target's commit: ${key2}, muted ${muted2}`)
    assert(back === 'original', `rows that will not come: ${back}`)
    assert(
      left1.draws === left0.draws && left1.top === left0.top,
      `the left touched: ${JSON.stringify([left0, left1])}`,
    )
    return { kept: kept.key, next: key2, back }
  },
)

await check(
  "port: a laid page's crops drawn again 600 ms after a zoom; its text layers out of layout through the zoom's steps, a selection kept (B-258, B-403, B-404)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const crop = () =>
      page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        const c = s.querySelector('.axt-over > canvas.axt-crops')
        return c ? c.width : null
      })
    const w0 = await crop()
    // (a selection in the text layer, before the zoom)
    const sel0 = await page.evaluate(() => {
      const span = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer span')
      const r = document.createRange()
      r.selectNodeContents(span)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
      return getSelection().toString()
    })
    await page.evaluate(() => window.__h.panes.zoomBy(1.6))
    const during = await page.evaluate(() => {
      const st = window.__h.panes.right.element
      const tl = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer')
      const sel = getSelection()
      return {
        scaling: st.hasAttribute('data-axt-scaling'),
        display: getComputedStyle(tl).display,
        kept: sel.rangeCount === 1 && tl.contains(sel.getRangeAt(0).startContainer),
      }
    })
    await page.waitForTimeout(500)
    const w1 = await crop()
    await page.waitForTimeout(1100)
    const w2 = await crop()
    const after = await page.evaluate(() => {
      const st = window.__h.panes.right.element
      const tl = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer')
      return {
        scaling: st.hasAttribute('data-axt-scaling'),
        display: getComputedStyle(tl).display,
        sel: getSelection().toString(),
        agains: window.__h.panes.right.probe().agains,
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(w0 && w1 === w0 && w2 > w0, `the crops: ${w0} → ${w1} (500 ms) → ${w2} (1.6 s)`)
    assert(during.scaling && during.display === 'none' && during.kept, `during: ${JSON.stringify(during)}`)
    assert(!after.scaling && after.display !== 'none' && after.sel === sel0, `after: ${JSON.stringify(after)}`)
    return { crops: [w0, w2], agains: after.agains }
  },
)

await check(
  'port: a laid page far and back is its very drawing, its text layer with it; zoomed while far, drawn again at the new scale; held in place while it holds the focus; a budget of 0 keeps none (B-300, B-268, B-401, B-260, B-025, B-011, B-269)',
  async () => {
    const run = async (keep) => {
      const { page, context, errors } = await newPage({
        viewport: { width: 1400, height: 500 },
        screen: { width: 2560, height: 1600 },
      })
      await page.evaluate(([u, k]) => window.__h.open(u, k === null ? {} : { keepPixels: k }), [S1, keep])
      await page.evaluate(() => window.__h.layer('s1-columns'))
      await laidShown(page, 1)
      await page.evaluate(() => window.__h.panes.zoomTo(2))
      await page.waitForTimeout(1200)
      await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        s.querySelector('.axt-slot-view canvas').dataset.tag = 'p1'
        s.querySelector('.axt-over .textLayer').dataset.tag = 'p1'
      })
      const end = () =>
        page.evaluate(() => {
          const c = document.querySelector('.axt-pane.right')
          c.scrollTop = c.scrollHeight
        })
      const top = () => page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      await page.waitForTimeout(200)
      const far = await page.evaluate(() => window.__h.panes.right.probe())
      await top()
      await waitFor(page, () => window.__h.panes.right.near(1))
      await page.waitForTimeout(100)
      const back = await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        return {
          canvas: !!s.querySelector('.axt-slot-view canvas[data-tag="p1"]'),
          text: !!s.querySelector('.axt-over .textLayer[data-tag="p1"]'),
          key: window.__h.panes.right.showing(1),
        }
      })
      // (far, a zoom; back: the same drawing, drawn again at the new scale)
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      const marks0 = await page.evaluate(() => window.__h.marks.length)
      await page.evaluate(() => window.__h.panes.zoomTo(2.4))
      await page.waitForTimeout(800)
      await top()
      await waitFor(page, () => window.__h.panes.right.near(1))
      await page.waitForTimeout(1200)
      const again = await page.evaluate(
        ([m0]) =>
          window.__h.marks
            .slice(m0)
            .filter((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1)
            .map((m) => ({ key: m.key, scale: m.scale })),
        [marks0],
      )
      const dbg = await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        const c = s.querySelector('.axt-slot-view canvas')
        return {
          probe: window.__h.panes.right.probe(),
          canvas: c ? [c.width, c.style.width] : null,
          scale: window.__h.panes.scale,
          key: window.__h.panes.right.showing(1),
        }
      })
      // (the focus on a link of page 1 as it goes far: held in place; let go a task after the focus leaves)
      await page.evaluate(() => window.__h.panes.right.page(1).querySelector('a.axt-link')?.focus())
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      await page.waitForTimeout(150)
      const held = await page.evaluate(() => ({
        focusHeld: window.__h.panes.right.probe().focusHeld,
        active: document.activeElement?.className ?? null,
        drawn: !!window.__h.panes.right.page(1).querySelector('.axt-over'),
      }))
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(100)
      const left = await page.evaluate(() => ({
        focusHeld: window.__h.panes.right.probe().focusHeld,
        body: document.activeElement === document.body,
        kept: window.__h.panes.right.probe().kept,
      }))
      await context.close()
      assert(!errors.length, errors.join('; '))
      return { far, back, again, held, left, dbg }
    }
    const a = await run(null)
    assert(a.far.kept === 1, `kept off the view: ${JSON.stringify(a.far)}`)
    assert(a.back.canvas && a.back.text && String(a.back.key).startsWith('laid:'), `back: ${JSON.stringify(a.back)}`)
    assert(
      a.again.some((m) => String(m.key).startsWith('laid:') && Math.abs(m.scale - 2.4) < 0.01),
      `drawn again at 2.4: ${JSON.stringify(a.again)} ${JSON.stringify(a.dbg)}`,
    )
    assert(a.held.focusHeld === 1 && a.held.active === 'axt-link' && a.held.drawn, `held: ${JSON.stringify(a.held)}`)
    assert(a.left.focusHeld === 0, `let go: ${JSON.stringify(a.left)}`)
    const b = await run(0)
    assert(b.far.kept === 0, `a budget of 0 kept ${b.far.kept}`)
    assert(!b.back.canvas, 'a budget of 0 kept the drawing')
    return { kept: a.far.keptPixels, again: a.again.length, zero: b.far.kept }
  },
)

await check(
  "port: links named by the text under them, the PDF's border, the wash on hover, the ring on focus; a click on one levels nothing; the keyboard's jump takes the focus there (B-336-B-338, B-343, B-344, B-346-B-348, A-383)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const links = await page.evaluate(async () => {
      const s = window.__h.panes.right.page(1)
      const spans = [...s.querySelectorAll('.axt-over .textLayer span')]
      const anns = (await (await window.__h.composed.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Link')
      return [...s.querySelectorAll('a.axt-link')].map((a) => {
        const r = a.getBoundingClientRect()
        const under = spans
          .filter((x) => {
            const q = x.getBoundingClientRect()
            const cx = q.left + q.width / 2,
              cy = q.top + q.height / 2
            return q.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
          })
          .map((x) => x.textContent)
          .join(' ')
        const to = a.getAttribute('href')
        const ann = anns.find((x) => (x.url ?? '') === to || (to.startsWith('#') && !x.url))
        return {
          name: a.getAttribute('aria-label'),
          under: under.replace(/\s+/g, ' ').trim(),
          border: a.dataset.axtBorder ?? null,
          pdfBorder: !!(ann && ann.borderStyle?.width > 0 && ann.color),
          href: to,
          rect: r.toJSON(),
        }
      })
    })
    const box = links[0].rect
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(100)
    const wash = await page.evaluate(
      () =>
        getComputedStyle(
          window.__h.panes.right.page(1).querySelector('a.axt-link:hover > .axt-link-box') ?? document.body,
        ).backgroundColor,
    )
    const ring = await page.evaluate(() => {
      const a = window.__h.panes.right.page(1).querySelector('a.axt-link')
      a.focus({ focusVisible: true })
      const b = getComputedStyle(a.querySelector('.axt-link-box'))
      return { width: b.outlineWidth, style: b.outlineStyle }
    })
    // (a click on the link inside the paper: no levelling; the right jumps, the left follows)
    const inner = links.find((l) => l.href.startsWith('#'))
    const line0 = await page.evaluate(() => window.__h.panes.probe().readingLine)
    await page.mouse.click(inner.rect.x + inner.rect.width / 2, inner.rect.y + inner.rect.height / 2)
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => ({
      line: window.__h.panes.probe().readingLine,
      level: window.__h.panes.probe().levelError,
      inView2: window.__h.panes.right.inView(2),
      top: document.querySelector('.axt-pane.right').scrollTop,
    }))
    // (by the keyboard: Enter on the link, the focus at the place jumped to)
    await page.evaluate(() => {
      document.querySelector('.axt-pane.right').scrollTop = 0
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__h.panes.right.page(1).querySelector('a.axt-link[href^="#"]').focus())
    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)
    const focus = await page.evaluate(() => ({
      page: document.activeElement?.dataset?.pageNumber ?? null,
      cls: document.activeElement?.className ?? null,
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const l of links) {
      assert(
        l.name && (l.under ? l.name === l.under || l.under.includes(l.name) || l.name.includes(l.under) : true),
        `named ${JSON.stringify(l)}`,
      )
      assert(!!l.border === l.pdfBorder, `border ${JSON.stringify(l)}`)
    }
    assert(/255, 255, 0, 0\.2/.test(wash), `the wash ${wash}`)
    assert(ring.width === '2px' && ring.style === 'solid', `the ring ${JSON.stringify(ring)}`)
    assert(after.line === line0, `a click on a link levelled: ${line0} → ${after.line}`)
    // (a document this short ends before page 2 can stand at the top: the jump brings it into view, the left levelled)
    assert(after.inView2 && after.top > 0 && Math.abs(after.level ?? 0) <= 2, `the jump: ${JSON.stringify(after)}`)
    assert(focus.page === '2', `the keyboard's jump: the focus on ${JSON.stringify(focus)}`)
    // (the system's colours in forced colours)
    const fc = await newPage()
    await fc.page.emulateMedia({ forcedColors: 'active' })
    await fc.page.evaluate((u) => window.__h.open(u), S1)
    await fc.page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(fc.page, 1)
    const forced = await fc.page.evaluate(() => {
      const a = window.__h.panes.right.page(1).querySelector('a.axt-link')
      a.focus({ focusVisible: true })
      const b = getComputedStyle(a.querySelector('.axt-link-box'))
      return { width: b.outlineWidth, shadow: b.boxShadow }
    })
    await fc.context.close()
    assert(forced.width === '2px' && forced.shadow === 'none', `forced colours ${JSON.stringify(forced)}`)
    return { links: links.map((l) => l.name), wash }
  },
)

await check(
  'port: the highlight: its switch, the right mirroring until laid and drawn again as laid under a resting pointer, a scroll under a still pointer, a click holding nothing, the wash multiplied and screened, through a pinch and the left redrawn (B-409, B-217, B-472, B-478, B-453, B-451, B-411, B-446, B-447, B-136, A-224, B-241, B-448, B-459)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await page.waitForTimeout(400)
    const ords = await page.evaluate(() =>
      window.__h.composer
        .page(1)
        .members.map((m) => m.ord)
        .slice(0, 6),
    )
    const lit = () =>
      page.evaluate(() => ({ lit: window.__h.highlight.lit?.id ?? null, bands: window.__h.highlight.bands() }))
    // (off: nothing lit; on: the point lights)
    await page.evaluate(() => window.__h.highlight.setOn(false))
    const p0 = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[1]])
    await page.mouse.move(p0.x, p0.y)
    await page.waitForTimeout(120)
    const off = await lit()
    await page.evaluate(() => window.__h.highlight.setOn(true))
    await page.mouse.move(p0.x + 1, p0.y)
    await page.waitForTimeout(120)
    const mirrored = await lit()
    // (rows in under the resting pointer: drawn again as laid)
    await page.evaluate(() => window.__h.rows.give())
    await laidShown(page, 1)
    await page.waitForTimeout(250)
    const laid = await lit()
    // (a scroll under the still pointer lights what comes under it: two members of one column, the pane scrolled down by their
    // gap, the pointer on the lower one, then scrolled back up: the upper one comes under it)
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    const pick = await page.evaluate(() => {
      const c = document.querySelector('.axt-pane.right'),
        cr = c.getBoundingClientRect(),
        max = c.scrollHeight - c.clientHeight
      const pts = window.__h.composer
        .laid(1)
        .members.map((m) => ({ o: m.ord, p: window.__h.pointOf(1, m.ord, 'right') }))
        .filter((x) => x.p && x.p.y > cr.top + 20 && x.p.y < cr.bottom - 20)
      for (const A of pts)
        for (const B of pts)
          if (B.o !== A.o && Math.abs(B.p.x - A.p.x) < 80 && A.p.y - B.p.y > 30 && A.p.y - B.p.y <= max)
            return { A: A.p, a: A.o, B: B.p, b: B.o }
      return null
    })
    assert(pick, 'no two members to scroll between')
    const dy = pick.A.y - pick.B.y
    await page.evaluate(([dy]) => (document.querySelector('.axt-pane.right').scrollTop = dy), [dy])
    await page.waitForTimeout(250)
    await page.mouse.move(pick.A.x, pick.A.y - dy)
    await page.waitForTimeout(150)
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    const scrolled = {
      ...(await lit()),
      under: await page.evaluate(
        ([x, y]) => window.__h.highlight.at('right', x, y)?.id ?? null,
        [pick.A.x, pick.A.y - dy],
      ),
      a: pick.a,
      b: pick.b,
    }
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    // (a click holds nothing)
    const pc = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[1]])
    await page.mouse.click(pc.x, pc.y)
    await page.mouse.move(3, 3)
    await page.waitForTimeout(300)
    const released = await lit()
    // (the wash's blend)
    const blend = await page.evaluate(() => {
      const l = document.querySelector('.axt-pane.right .axt-hl-layer')
      const a = getComputedStyle(l).mixBlendMode
      document.getElementById('root').setAttribute('data-axt-dim', '')
      const b = getComputedStyle(l).mixBlendMode
      document.getElementById('root').removeAttribute('data-axt-dim')
      return [a, b]
    })
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(300)
    // (through a pinch: the band where its unit is, within 0.7 px; the point lights through the preview's transform)
    const q = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[2]])
    await page.mouse.move(q.x, q.y)
    await page.waitForTimeout(150)
    const share = () =>
      page.evaluate(() => {
        const s = window.__h.panes.right.page(1).getBoundingClientRect()
        const b = document.querySelector('.axt-pane.right .axt-hl-layer > *').getBoundingClientRect()
        return [(b.left - s.left) / s.width, (b.top - s.top) / s.height, b.width / s.width, s.width]
      })
    const s0 = await share()
    await page.evaluate(
      ([x, y]) => {
        for (let i = 0; i < 4; i++) window.__h.panes.pinch('right', 1.05, [x, y])
      },
      [q.x, q.y],
    )
    await page.waitForTimeout(50)
    const s1 = await share()
    const during = await page.evaluate(([x, y]) => window.__h.highlight.at('right', x, y)?.id ?? null, [q.x, q.y])
    await page.waitForTimeout(600)
    // (the left's page redrawn after a zoom keeps its layer: lit with the pointer away from the panes, so that the zoom's scroll
    // brings nothing else under it)
    await page.evaluate(() => {
      for (const c of document.querySelectorAll('.axt-pane')) c.dispatchEvent(new MouseEvent('mouseleave'))
    })
    await page.waitForTimeout(250)
    await page.evaluate(([o]) => window.__h.highlight.light({ id: o, s: -1 }), [ords[2]])
    const gaps = await page.evaluate(async () => {
      window.__h.panes.zoomBy(1.2)
      let missing = 0
      for (let i = 0; i < 24; i++) {
        await new Promise((f) => requestAnimationFrame(f))
        if (!document.querySelector('.axt-pane.left .page[data-page-number="1"] > .axt-hl-layer > *')) missing++
      }
      return missing
    })
    // (a sweep: one look a frame, each look's script)
    const sweep = await page.evaluate(async () => {
      const r = window.__h.panes.right.page(1).getBoundingClientRect()
      const c0 = window.__h.highlight.costs().looks
      let frames = 0
      for (let i = 0; i < 40; i++) {
        for (let k = 0; k < 3; k++)
          document.querySelector('.axt-pane.right').dispatchEvent(
            new MouseEvent('mousemove', {
              clientX: r.left + 40 + i * 10 + k,
              clientY: r.top + 80 + i * 12,
              bubbles: true,
            }),
          )
        await new Promise((f) => requestAnimationFrame(f))
        frames++
      }
      const c = window.__h.highlight.costs()
      const ms = c.ms.slice(-40).sort((a, b) => a - b)
      return { looks: c.looks - c0, frames, p50: ms[Math.floor(ms.length / 2)] }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(off.lit === null && off.bands.right === 0, `off lit ${JSON.stringify(off)}`)
    assert(
      mirrored.lit === ords[1] && mirrored.bands.right === mirrored.bands.left,
      `mirrored ${JSON.stringify(mirrored)}`,
    )
    assert(laid.lit === ords[1] && laid.bands.right > 0, `drawn again as laid ${JSON.stringify(laid)}`)
    assert(scrolled.under === scrolled.b && scrolled.lit === scrolled.b, `the scroll lit ${JSON.stringify(scrolled)}`)
    assert(released.lit === null, `a click held ${JSON.stringify(released)}`)
    assert(blend[0] === 'multiply' && blend[1] === 'screen', `the wash ${blend}`)
    assert(
      Math.abs(s1[0] - s0[0]) * s1[3] < 0.7 &&
        Math.abs(s1[1] - s0[1]) * s1[3] < 0.7 &&
        Math.abs(s1[2] - s0[2]) * s1[3] < 0.7,
      `the band in a pinch ${JSON.stringify([s0, s1])}`,
    )
    assert(during === ords[2], `the pointer through the preview lit ${during}`)
    assert(gaps === 0, `the left's band missing ${gaps} frames of the redraw`)
    assert(sweep.looks <= sweep.frames && sweep.p50 <= 0.26, `the sweep ${JSON.stringify(sweep)}`)
    return { sweep }
  },
)

await check('port: the smaller unit lights where two overlap (B-444, s2-splits)', async () => {
  const { page, context, errors } = await newPage()
  await page.evaluate((u) => window.__h.open(u), indexOf['s2-splits'].original)
  await page.evaluate(() => window.__h.layer('s2-splits'))
  await laidShown(page, 1)
  await page.waitForTimeout(300)
  const heads = await page.evaluate(() =>
    window.__h.composer
      .laid(1)
      .members.filter((m) => window.__h.composer.member(m.ord)?.kind === 'heading')
      .map((m) => m.ord),
  )
  const out = []
  for (const side of ['right', 'left'])
    for (const o of heads.slice(1, 5)) {
      const pt = await page.evaluate(([o, s]) => window.__h.pointOf(1, o, s), [o, side])
      if (!pt) continue
      out.push({
        side,
        o,
        hit: await page.evaluate(([s, x, y]) => window.__h.highlight.at(s, x, y)?.id ?? null, [side, pt.x, pt.y]),
      })
    }
  await context.close()
  assert(!errors.length, errors.join('; '))
  assert(out.length && out.every((x) => x.hit === x.o), `hits ${JSON.stringify(out)}`)
  return { heads: out.length }
})

await check(
  "port: the panes: three displays, swapped, the single display's fit at 1060 px, the right alone fitted to its pane, the page told by pagechanging, the sync available once the pages exist (A-022, A-027, A-032, A-145, B-234, B-236)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const panesOf = () =>
      page.evaluate(() => {
        const r = (s) => document.querySelector(`.axt-pane.${s}`).getBoundingClientRect()
        const vis = (s) =>
          getComputedStyle(document.querySelector(`.axt-pane.${s}`)).visibility !== 'hidden' &&
          getComputedStyle(document.querySelector(`.axt-pane.${s}`)).display !== 'none' &&
          r(s).width > 0
        return {
          mode: document.getElementById('root').getAttribute('data-axt-pdf-mode'),
          left: vis('left') ? [r('left').left, r('left').width] : null,
          right: vis('right') ? [r('right').left, r('right').width] : null,
          leftPage: window.__h.panes.pageElement('left', 1)?.clientWidth ?? 0,
          rightPage: window.__h.panes.pageElement('right', 1)?.clientWidth ?? 0,
        }
      })
    const bi = await panesOf()
    await page.evaluate(() => window.__h.panes.setSwapped(true))
    const sw = await panesOf()
    await page.evaluate(() => window.__h.panes.setSwapped(false))
    await page.evaluate(() => window.__h.panes.setDisplay('original'))
    await page.waitForTimeout(800)
    const orig = await panesOf()
    await page.evaluate(() => window.__h.panes.setDisplay('translation'))
    await page.waitForTimeout(800)
    const tr = await panesOf()
    await page.evaluate(() => window.__h.panes.setDisplay('bilingual'))
    await page.waitForTimeout(800)
    await page.evaluate(() => window.__h.panes.goToPage('left', 3))
    await page.waitForTimeout(500)
    const told = await page.evaluate(() => ({
      viewer: window.__h.panes.leftViewer.currentPageNumber,
      told: window.__h.marks.filter((m) => m.what === 'page' && m.side === 'left').at(-1)?.page,
      sync: window.__h.marks.filter((m) => m.what === 'sync').map((m) => m.available),
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      bi.mode === 'bilingual' && bi.left && bi.right && bi.left[0] < bi.right[0],
      `bilingual ${JSON.stringify(bi)}`,
    )
    assert(sw.right[0] < sw.left[0], `swapped ${JSON.stringify(sw)}`)
    assert(orig.mode === 'original' && orig.left && !orig.right, `original ${JSON.stringify(orig)}`)
    assert(Math.abs(orig.leftPage - Math.min(1060, orig.left[1] - 40)) < 2, `the single fit ${JSON.stringify(orig)}`)
    assert(tr.mode === 'translation' && tr.right && !tr.left, `translation ${JSON.stringify(tr)}`)
    assert(Math.abs(tr.rightPage - Math.min(1060, tr.right[1] - 40)) < 2, `the right alone ${JSON.stringify(tr)}`)
    assert(told.viewer === 3 && told.told === 3, `the page told ${JSON.stringify(told)}`)
    assert(told.sync.length && told.sync.at(-1) === true, `the sync ${JSON.stringify(told.sync)}`)
    return { single: orig.leftPage, alone: tr.rightPage }
  },
)

await check(
  "port: the follower: the right by the left's steps on the compositor, levelled at rest (a timer where no scrollend comes); a click levels the same point; a zoom's steps drawn once 400 ms after the last; a zoom and a display keep the reading place (B-008, B-012, B-013, B-014, B-232, B-233, B-235, B-237, B-239, A-029, A-219)",
  async () => {
    const out = {}
    for (const end of ['native', 'timer']) {
      const { page, context, errors } = await newPage()
      await page.evaluate(([u, e]) => window.__h.open(u, { scrollEnd: e }), [SAMPLE, end])
      await drawnOn(page, 'right', 1, null)
      await page.mouse.move(350, 400)
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(900)
      const rest = await page.evaluate(() => window.__h.panes.probe())
      // (the left drew what its pages show while the right's transform led: PDF.js picks its pages by its own scroll)
      const leftDrawn = await page.evaluate(() => {
        const n = window.__h.panes.pageOf('left')
        return window.__h.panes.leftViewer.getPageView(n - 1)?.renderingState
      })
      out[end] = { level: rest.levelError, compositing: rest.compositing, leftDrawn }
      if (end === 'timer') {
        await context.close()
        assert(!errors.length, errors.join('; '))
        continue
      }
      // (a click levels the same point at the click's height)
      await page.mouse.click(300, 500)
      await page.waitForTimeout(500)
      const click = await page.evaluate(() => {
        const n = window.__h.panes.pageOf('left')
        const a = window.__h.panes.pageElement('left', n).getBoundingClientRect(),
          b = window.__h.panes.pageElement('right', n).getBoundingClientRect()
        return { dy: Math.abs(a.top - b.top), line: window.__h.panes.probe().readingLine }
      })
      // (a zoom's steps: drawn once, after the last)
      const m0 = await page.evaluate(() => window.__h.marks.length)
      const place0 = await page.evaluate(() => window.__h.panes.reading())
      const tLast = await page.evaluate(async () => {
        let at = 0
        for (let i = 0; i < 3; i++) {
          if (i) await new Promise((f) => setTimeout(f, 60))
          window.__h.panes.zoomBy(1.1)
          at = performance.now() - window.__h.t0
        }
        return at
      })
      await page.waitForTimeout(1200)
      const draws = await page.evaluate(
        ([m0]) =>
          window.__h.marks
            .slice(m0)
            .filter((m) => m.what === 'drawn' && m.side === 'right' && m.page === window.__h.panes.pageOf('right'))
            .map((m) => ({ at: m.at, scale: m.scale })),
        [m0],
      )
      const place1 = await page.evaluate(() => ({
        p: window.__h.panes.reading(),
        level: window.__h.panes.probe().levelError,
      }))
      await page.evaluate(() => window.__h.panes.setDisplay('translation'))
      await page.waitForTimeout(800)
      const place2 = await page.evaluate(() => window.__h.panes.reading())
      await context.close()
      assert(!errors.length, errors.join('; '))
      out.click = click
      out.draws = draws
      out.lastStepAt = tLast
      out.places = [place0, place1.p, place2]
      out.zoomLevel = place1.level
    }
    for (const e of ['native', 'timer'])
      assert(Math.abs(out[e].level ?? 99) <= 2 && out[e].leftDrawn === 3, `${e}: ${JSON.stringify(out[e])}`)
    assert(out.native.compositing === true, 'no compositor follower in Chromium')
    assert(out.click.dy <= 1, `the click levelled ${JSON.stringify(out.click)}`)
    const final = out.draws.at(-1)?.scale
    const atFinal = out.draws.filter((d) => d.scale === final)
    assert(
      atFinal.length === 1 && atFinal[0].at >= out.lastStepAt + 380,
      `the steps drawn ${JSON.stringify(out.draws)} after ${out.lastStepAt}`,
    )
    assert(Math.abs(out.zoomLevel ?? 99) <= 2, `levelled after the zoom: ${out.zoomLevel}`)
    const [a, b, c] = out.places
    assert(
      a.page === b.page && Math.abs(a.at - b.at) < 0.03 && a.page === c.page && Math.abs(a.at - c.at) < 0.03,
      `the place ${JSON.stringify(out.places)}`,
    )
    return out
  },
)

await check(
  "port: the pinch: its steps in hundredths, its remainder carried, nothing drawn meanwhile, the point kept on both panes, another input commits it first, the paper's ends kept (A-215-A-218, A-220, A-222, B-027, B-010)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    await page.evaluate(() => window.__h.panes.zoomTo(1))
    await page.waitForTimeout(800)
    // (the remainder carried: two pinches of 1.004 from 1 commit 1.00 then 1.01)
    const carry = []
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const r = document.querySelector('.axt-pane.right').getBoundingClientRect()
        window.__h.panes.pinch('right', 1.004, [r.left + 200, r.top + 200])
      })
      await page.waitForTimeout(450)
      carry.push(await page.evaluate(() => window.__h.panes.scale))
    }
    // (a pinch's steps: told in hundredths, nothing made, the point under the pointer kept on both panes)
    const r = await page.evaluate(async () => {
      const p = window.__h.panes,
        c = document.querySelector('.axt-pane.right'),
        cr = c.getBoundingClientRect()
      const x = cr.left + 250,
        y = cr.top + 300
      const pointOf = (side) => {
        const pane = document.querySelector(`.axt-pane.${side}`).getBoundingClientRect()
        const n = p.pageOf(side)
        const el = p.pageElement(side, n).getBoundingClientRect()
        return [n, (pane.left + 250 - el.left) / el.width, (pane.top + 300 - el.top) / el.height]
      }
      const before = { right: pointOf('right'), left: pointOf('left') }
      const m0 = window.__h.marks.length,
        made0 = p.right.probe().made
      for (let i = 0; i < 6; i++) {
        p.pinch('right', 1.07, [x, y])
        await new Promise((f) => requestAnimationFrame(f))
      }
      const made1 = p.right.probe().made
      const scales = window.__h.marks
        .slice(m0)
        .filter((m) => m.what === 'scale')
        .map((m) => m.scale)
      await new Promise((f) => setTimeout(f, 700))
      return {
        before,
        after: { right: pointOf('right'), left: pointOf('left') },
        made: made1 - made0,
        scales,
        pinching: p.probe().pinching,
      }
    })
    // (another input commits the pinch first)
    const commit = await page.evaluate(() => {
      const p = window.__h.panes,
        cr = document.querySelector('.axt-pane.right').getBoundingClientRect()
      p.pinch('right', 1.1, [cr.left + 100, cr.top + 100])
      const was = p.probe().pinching
      p.zoomBy(1)
      return { was, now: p.probe().pinching }
    })
    await page.waitForTimeout(600)
    // (at the paper's end, a pinch in: the end is the paper's, never an empty foot)
    const foot = await page.evaluate(async () => {
      const p = window.__h.panes,
        c = document.querySelector('.axt-pane.right')
      c.scrollTop = c.scrollHeight
      await new Promise((f) => setTimeout(f, 300))
      const cr = c.getBoundingClientRect()
      for (let i = 0; i < 4; i++) {
        p.pinch('right', 0.9, [cr.left + 200, cr.bottom - 50])
        await new Promise((f) => requestAnimationFrame(f))
      }
      await new Promise((f) => setTimeout(f, 700))
      const last = p.pageElement('right', p.right.pages).getBoundingClientRect()
      return { over: c.scrollTop - (c.scrollHeight - c.clientHeight), gap: cr.bottom - last.bottom }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(carry[0] === 1 && carry[1] === 1.01, `the remainder: ${carry}`)
    assert(r.scales.length && r.scales.every((s) => Math.round(s * 100) / 100 === s), `the steps ${r.scales}`)
    assert(r.made === 0 && r.pinching === null, `made during ${r.made}, pinching ${r.pinching}`)
    for (const side of ['right', 'left']) {
      const [n0, x0, y0] = r.before[side],
        [n1, x1, y1] = r.after[side]
      assert(
        n0 === n1 && Math.abs(x0 - x1) < 0.01 && Math.abs(y0 - y1) < 0.01,
        `${side}'s point ${JSON.stringify([r.before[side], r.after[side]])}`,
      )
    }
    assert(commit.was !== null && commit.now === null, `another input ${JSON.stringify(commit)}`)
    assert(foot.over <= 1 && foot.gap >= 0, `the foot ${JSON.stringify(foot)}`)
    return { carry, steps: r.scales.length }
  },
)

await check(
  "the pinch's wheel is Ctrl's alone: a wheel with Ctrl, ⌘ held beside it or not, is the pinch's own; a wheel with ⌘ held, or ⌘⇧, is the reader's input and commits a pinch under way, as one without (§6.8; macOS's screenshot keys hold ⌘ while a scroll runs, the owner's report of 2026-11-10)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const rows = await page.evaluate(() => {
      const p = window.__h.panes,
        c = document.querySelector('.axt-pane.right'),
        cr = c.getBoundingClientRect()
      const out = []
      for (const keys of [
        { ctrlKey: true },
        { ctrlKey: true, metaKey: true },
        { metaKey: true },
        { metaKey: true, shiftKey: true },
      ]) {
        p.pinch('right', 1.05, [cr.left + 200, cr.top + 200])
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, ...keys }))
        out.push([Object.keys(keys).join('+'), p.probe().pinching !== null])
      }
      return out
    })
    await page.waitForTimeout(600)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      JSON.stringify(rows.map((r) => r[1])) === JSON.stringify([true, true, false, false]),
      `a pinch under way after each wheel ${JSON.stringify(rows)}`,
    )
    return rows
  },
)

await check(
  "port: the left's internals pinned, its root write quiet, the pages ahead held until the layer's first page or let go (B-149, B-019, B-047, B-050, B-231, B-017)",
  async () => {
    const { page, context, errors } = await newPage({ viewport: { width: 1400, height: 600 } })
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const pins = await page.evaluate(() => {
      const k = window.__h.kit,
        v = window.__h.panes.leftViewer,
        pv = v.getPageView(0)
      return {
        visible:
          typeof Object.getPrototypeOf(v)._getVisiblePages === 'function' || typeof v._getVisiblePages === 'function',
        renderingState: typeof pv.renderingState === 'number',
        updateVisibleArea: typeof k.viewer.PDFPageView.prototype.updateVisibleArea === 'function',
        detailView: 'detailView' in pv,
        outputScale: 'outputScale' in pv,
        rawDims: !!pv.viewport.rawDims,
        builder: typeof k.viewer.TextLayerBuilder === 'function',
        root: document.documentElement.style.getPropertyValue('--viewer-container-height'),
        held: window.__h.panes.aheadHeld,
      }
    })
    // (at the open: page 2 near the view, not in it, on both panes: neither drawn until the pages ahead are let go)
    await page.waitForTimeout(1200)
    const state = (near) =>
      page.evaluate(
        ([near]) => ({
          right: near.filter((n) =>
            window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === n),
          ),
          left: near.filter((n) => window.__h.panes.leftViewer.getPageView(n - 1)?.renderingState === 3),
        }),
        [near],
      )
    const near = await page.evaluate(() =>
      [1, 2, 3, 4].filter((n) => window.__h.panes.right.near(n) && !window.__h.panes.right.inView(n)),
    )
    const before = await state(near)
    const held = {
      near,
      drawn: before.right,
      left: before.left,
      held: await page.evaluate(() => window.__h.panes.aheadHeld),
    }
    await page.evaluate(() => window.__h.panes.letAheadGo())
    await page.waitForTimeout(1500)
    const after = await state(near)
    const go = after.right
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const [k, v] of Object.entries(pins)) if (k !== 'root' && k !== 'held') assert(v === true, `pin ${k}`)
    assert(pins.root === '' && pins.held === true, `the root ${JSON.stringify(pins)}`)
    assert(
      held.near.length && held.drawn.length === 0 && held.left.length === 0 && held.held,
      `held ${JSON.stringify(held)}`,
    )
    assert(
      go.length === held.near.length && after.left.length === held.near.length,
      `let go: ${JSON.stringify(after)} of ${held.near}`,
    )
    return { near: held.near }
  },
)

await check(
  "port: a laid page's text layer paints nothing, one copy for find and assistive technology, the paper's language with the translation's spans the target's, its cost; its commit writes nothing on the root but the overlay's text rendering, once, before any drawing is in place (B-386, B-398, B-400, B-407, A-333, B-023)",
  async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => {
      window.__h.rootWrites = 0
      // (the text rendering's decision, compose/text-rendering.ts: each write, whether an overlay was in place when it was made;
      // a write after one would restyle a page laid out already, B-023)
      window.__h.textWrites = []
      const seen = (rs) => {
        for (const r of rs)
          if (r.attributeName === 'data-axt-layer-text')
            window.__h.textWrites.push(!!document.querySelector('.axt-pane.right .axt-over'))
          else window.__h.rootWrites++
      }
      new MutationObserver(seen).observe(document.getElementById('root'), { attributes: true })
      new MutationObserver(seen).observe(document.documentElement, { attributes: true })
      return 0
    })
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const writes = await page.evaluate(() => window.__h.rootWrites)
    const textWrites = await page.evaluate(() => window.__h.textWrites)
    await page.waitForTimeout(400)
    const slot = page.locator('.axt-pane.right .axt-slot[data-page-number="1"] > .axt-slot-view')
    const a = await slot.screenshot({ animations: 'disabled' })
    await page.evaluate(() => {
      for (const t of document.querySelectorAll('.axt-pane.right .axt-over .textLayer')) t.style.visibility = 'hidden'
    })
    const b = await slot.screenshot({ animations: 'disabled' })
    await page.evaluate(() => {
      for (const t of document.querySelectorAll('.axt-pane.right .axt-over .textLayer')) t.style.visibility = ''
    })
    const r = await page.evaluate(() => {
      const s = window.__h.panes.right.page(1)
      const tl = s.querySelector('.axt-over .textLayer'),
        svg = s.querySelector('.axt-over > svg')
      const translated = [...tl.querySelectorAll('span[lang="de"]')].map((x) => x.textContent)
      const word = (translated.find((t) => t.trim().length > 6) ?? '').trim().split(/\s+/)[0]
      getSelection().removeAllRanges()
      const found = window.find(word)
      const at = getSelection().anchorNode?.parentElement?.closest('.textLayer') === tl
      return {
        lang: tl.getAttribute('lang'),
        translated: translated.length,
        svgHidden: svg.getAttribute('aria-hidden'),
        svgSelect: getComputedStyle(svg).userSelect,
        word,
        found,
        at,
        nodes: tl.querySelectorAll('*').length,
        textMs: window.__h.composer.timings().find((t) => t.n === 1)?.textMs ?? null,
      }
    })
    const tree = await page.locator('.axt-pane.right .axt-slot[data-page-number="1"]').ariaSnapshot()
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(writes === 0, `the commit wrote ${writes} attributes on the root`)
    assert(
      textWrites.length <= 1 && textWrites.every((placed) => !placed),
      `the text rendering written ${JSON.stringify(textWrites)} (true: with a drawing in place)`,
    )
    assert(a.equals(b), 'the text layer changed the paint')
    assert(r.lang === 'en' && r.translated > 0, `langs ${JSON.stringify(r)}`)
    assert(r.svgHidden === 'true' && r.svgSelect === 'none' && r.found && r.at, `one copy ${JSON.stringify(r)}`)
    const times = tree.split(r.word).length - 1
    assert(times === 1, `the word "${r.word}" ${times} times in the accessibility tree`)
    assert(r.nodes <= 2000, `nodes ${r.nodes}`)
    return { nodes: r.nodes, textMs: Math.round(r.textMs * 10) / 10, textWrites: textWrites.length }
  },
)

await check(
  "port: a host's scrollers keep their own .pdfViewer, one a pane, left in place emptied on close (the lane owner's)",
  async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate(async () => {
      const root = document.createElement('div')
      root.style.cssText = 'position:absolute;inset:0'
      const left = document.createElement('div'),
        right = document.createElement('div')
      for (const [el, id] of [
        [left, 'left'],
        [right, 'right'],
      ]) {
        el.className = `viewerContainer axt-pane ${id}`
        el.id = id
        el.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
        root.append(el)
      }
      document.body.append(root)
      window.__h.given = { root, left, right }
      return true
    })
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', panes: window.__h.given }))
    await readerLaid(page)
    const open = await page.evaluate(() => [
      window.__h.given.left.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelector(':scope > .pdfViewer').children.length,
    ])
    await page.evaluate(() => window.__h.readers[0].reader.close())
    await page.waitForTimeout(500)
    const closed = await page.evaluate(() => [
      window.__h.given.left.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelector(':scope > .pdfViewer')?.children.length ?? -1,
    ])
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r && open[0] === 1 && open[1] === 1 && open[2] > 0, `open ${open}`)
    assert(closed[0] === 1 && closed[1] === 1 && closed[2] === 0, `closed ${closed}`)
    return { open, closed }
  },
)

// ---------------------------------------------------------------- the commit and paint times against the baseline (engine-view-host §9)
const timings = {}
for (const name of Object.keys(fixtures)) {
  for (const rate of [1, 4]) {
    await check(`timing: a laid page's commit and paint at ${rate}x CPU (${name})`, async () => {
      const { page, context, errors } = await newPage()
      const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null
      const lab = !!fixtures[name].face
      await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
      await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      await page.evaluate(([n, t]) => window.__h.layer(n, { target: t }), [name, lab ? 'zh' : 'de'])
      const laidPages = await page.evaluate(() =>
        [...window.__h.pages.entries()].filter(([, p]) => p.members.some((m) => m.state === 'laid')).map(([n]) => n),
      )
      for (const n of laidPages.slice(0, 4)) {
        await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
        await laidShown(page, n)
      }
      const r = await page.evaluate(() => ({
        shown: window.__h.marks.filter((m) => m.what === 'shown' && String(m.key).startsWith('laid:')),
        overlay: window.__h.composer.timings(),
      }))
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      await context.close()
      assert(!errors.length, errors.join('; '))
      const rows = r.shown.map((m) => {
        const o = r.overlay.find((x) => x.n === m.page) ?? {}
        return {
          n: m.page,
          commitMs: +(m.swapMs + m.layoutMs).toFixed(1),
          swapMs: +m.swapMs.toFixed(1),
          layoutMs: +m.layoutMs.toFixed(1),
          drawMs: Math.round(m.drawMs),
          overlayMs: Math.round(o.overlayMs ?? 0),
          svgMs: +(o.svgMs ?? 0).toFixed(1),
          cropsMs: Math.round(o.cropsMs ?? 0),
          textMs: Math.round(o.textMs ?? 0),
        }
      })
      timings[`${name}@${rate}x`] = rows
      return rows.slice(0, 4)
    })
  }
}
if (process.env.AXT_TIMINGS_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_TIMINGS_OUT, `${JSON.stringify(timings, null, 1)}\n`)

// ---------------------------------------------------------------- the memory and paint of the two ways out of the residue
const ways = {}
for (const name of Object.keys(fixtures).filter((n) => fixtures[n].face)) {
  await check(
    `ways: memory and paint, (a) pages not laid from the original, (b) both panes the composed document (${name})`,
    async () => {
      const out = {}
      for (const way of ['a', 'b']) {
        const { page, context, errors } = await newPage()
        await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
        await waitFor(page, () =>
          window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1),
        )
        await page.evaluate(
          ([n, u]) => window.__h.layer(n, { target: 'zh', unlaid: u }),
          [name, way === 'b' ? 'composed' : 'original'],
        )
        await page.waitForTimeout(500)
        const re = way === 'b' ? await page.evaluate(() => window.__h.toComposed()) : null
        const w = await page.evaluate(() => window.__h.walk())
        await page.waitForTimeout(500)
        const mem = await processMiB()
        const draws = await page.evaluate(() => window.__h.marks.filter((m) => m.what === 'drawn').length)
        await context.close()
        assert(!errors.length, errors.join('; '))
        out[way] = { ...mem, walkMs: w.walkMs, draws, reopenMs: re?.reopenMs ?? null, views: w.probe['right.views'] }
      }
      ways[name] = out
      return out
    },
  )
}
if (process.env.AXT_WAYS_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_WAYS_OUT, `${JSON.stringify(ways, null, 1)}\n`)

// ---------------------------------------------------------------- deliverable 7: the stack under the left, against PDF.js's viewer
const leftRuns = {}
const leftPapers = [
  ['2600.00001v1', '/api/v2/o/arxiv/2600_00001v1.pdf'],
  ...Object.entries(indexOf)
    .filter(([n]) => fixtures[n].face)
    .map(([n, x]) => [n, x.original]),
  ...(process.env.AXT_PAPER ? [['lab', '/api/v2/o/arxiv/lab.pdf']] : []),
]
for (const [label, url] of leftPapers) {
  await check(
    `left: the stack against PDF.js's viewer, first paint, a scroll trace, memory, behaviours (${label})`,
    async () => {
      const runs = []
      for (const kind of ['viewer', 'stack', 'stack', 'viewer']) {
        const { page, context, errors } = await newPage()
        await page.evaluate(([u, k]) => window.__h.single(u, k), [url, kind])
        await waitFor(page, () => window.__h.one.drawn.some((d) => d.n === 1), undefined, 20_000)
        const first = await page.evaluate(() => window.__h.one.drawn.find((d) => d.n === 1).at)
        await page.waitForTimeout(800)
        const behaviours = await page.evaluate(() => window.__h.behaviours())
        const trace = await page.evaluate(() => window.__h.scrollTrace(4000, 40))
        await page.waitForTimeout(800)
        const mib = await processMiB()
        await context.close()
        assert(!errors.length, errors.join('; '))
        runs.push({
          kind,
          firstPaintMs: Math.round(first),
          ...trace,
          renderer: mib?.renderer ?? null,
          gpu: mib?.gpu ?? null,
          ...behaviours,
        })
      }
      leftRuns[label] = runs
      const of = (k) => runs.filter((r) => r.kind === k)
      const avg = (xs, f) => Math.round((xs.reduce((a, x) => a + (f(x) ?? 0), 0) / xs.length) * 10) / 10
      const sum = Object.fromEntries(
        ['viewer', 'stack'].map((k) => [
          k,
          {
            firstPaintMs: avg(of(k), (r) => r.firstPaintMs),
            p95: avg(of(k), (r) => r.p95),
            over50: avg(of(k), (r) => r.over50),
            drawn: avg(of(k), (r) => r.drawn),
            renderer: avg(of(k), (r) => r.renderer),
            gpu: avg(of(k), (r) => r.gpu),
            textPages: of(k)[0].textPages,
            selectionAcross: of(k)[0].selectionAcross > 0,
            anchors: of(k)[0].anchors,
          },
        ]),
      )
      return sum
    },
  )
}
if (process.env.AXT_LEFT_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_LEFT_OUT, `${JSON.stringify(leftRuns, null, 1)}\n`)

// ---------------------------------------------------------------- I1 and the split residue (lane L1's finding 2), both ways out
const residues = {}
for (const name of Object.keys(fixtures)) {
  await check(`I1: all groups on is arXiv's page, the split residue measured (${name})`, async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    const lab = !!fixtures[name].face
    await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
    await page.evaluate(([n, t]) => window.__h.layer(n, { target: t, rows: 'none' }), [name, lab ? 'zh' : 'de'])
    const r = await page.evaluate(() => window.__h.residue({ scale: 1.5 }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    const P = r.pages
    const sum = (f) => P.reduce((a, x) => a + f(x), 0)
    const pix = sum((x) => x.pixels)
    const allPages = P.filter((x) => x.all.px > x.self.px),
      laidRows = P.filter((x) => x.laid)
    const summary = {
      pages: P.length,
      self: { pagesTouched: P.filter((x) => x.self.px).length, px: sum((x) => x.self.px) },
      b: {
        pagesTouched: allPages.length,
        px: sum((x) => x.all.px),
        share: +((sum((x) => x.all.px) / pix) * 100).toFixed(5),
        maxDelta: Math.max(0, ...P.map((x) => x.all.max)),
      },
      a: {
        laidPages: laidRows.length,
        pagesTouched: laidRows.filter((x) => x.laid.px > x.self.px).length,
        px: sum((x) => x.laid?.px ?? 0),
        maxDelta: Math.max(0, ...laidRows.map((x) => x.laid.max)),
      },
      msA: sum((x) => x.msA),
      msW: sum((x) => x.msW),
    }
    residues[name] = { summary, pages: P }
    // (our own papers: every pixel of all groups on is arXiv's, but where the canvas differs from itself)
    if (!lab)
      assert(
        allPages.length === 0,
        `all groups on differs from arXiv's page on pages ${allPages.map((x) => x.n).join(', ')}`,
      )
    return summary
  })
}
if (process.env.AXT_RESIDUE_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_RESIDUE_OUT, `${JSON.stringify(residues, null, 1)}\n`)

// ---------------------------------------------------------------- the full-width punctuation (lane cjk-punct, punct.mjs)
// s1-columns laid by the reader's own typesetter in each CJK target, the interface the owner's (the document zh-CN), every laid
// page's drawing measured as the browser drew it (AXT_PUNCT_OUT=<file> writes the measures)
const punctOut = {}
for (const target of PUNCT_TARGETS)
  await check(
    `compose: full-width punctuation as its face draws it (s1-columns, ${target}): no mark's ink on a neighbour's, one place in its box a character in a face, every run drawn at the layout's advance (docs/PDF-READER.md §18.48)`,
    async () => {
      if (!siteHas) return { skipped: `no served faces at ${SITE.tables}` }
      const { page, context, errors } = await newPage({ viewport: { width: 5000, height: 900 } })
      try {
        await page.evaluate(() => {
          document.documentElement.lang = 'zh-CN'
        })
        await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
        await page.evaluate((t) => window.__h.layer('s1-columns', { typeset: true, target: t }), target)
        const laid = []
        for (const n of [1, 2]) {
          await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
          await waitFor(page, (n) => !!window.__h.composer.laid(n), n, 60_000)
          if (await page.evaluate((n) => window.__h.composer.laid(n).members.some((m) => m.state === 'laid'), n))
            laid.push(n)
        }
        const m = await measurePunct(page, laid)
        const v = judgePunct(m)
        punctOut[target] = { verdict: v, measures: m }
        assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
        assert(laid.length && !v.missing.length, `pages laid ${laid}; marks never drawn: ${v.missing.join('')}`)
        assert(
          !v.overlaps.length && !v.wandering.length && !v.advancesOff,
          JSON.stringify({ overlaps: v.overlaps, wandering: v.wandering, advances: v.advances, off: v.advancesOff }),
        )
        return {
          pages: laid,
          marks: v.marks,
          runs: v.runs,
          worstAdvance: v.worstAdvance,
          context: v.context,
          beside: v.beside,
        }
      } finally {
        await context.close()
      }
    },
  )
if (process.env.AXT_PUNCT_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_PUNCT_OUT, `${JSON.stringify(punctOut, null, 1)}\n`)

await browser.close()
await server.close()
if (violations.length)
  console.log(`FAIL route table: ${violations.length} requests off the fixtures: ${violations.slice(0, 5).join(', ')}`)
const failed = results.filter((r) => !r.ok).length + (violations.length ? 1 : 0)
console.log(
  `${results.length - results.filter((r) => !r.ok).length} of ${results.length} checks passed${violations.length ? ', route table violated' : ''}`,
)
process.exit(failed ? 1 : 0)
