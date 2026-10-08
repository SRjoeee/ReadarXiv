// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRulesApi, RULES_PATH } from '../../lab/pdf/layer-lab/rules-api.mjs'
import * as rules from '@/pdf-reader/engine/rules/layout.mjs'

// The layer lab's rules API (lab/pdf/layer-lab/rules-api.mjs, the rules-as-data plan §7): the lab saves, reads and loads the
// layout rule set through three routes of its own server, and the file it writes is a rule-set PR's whole change. The module
// is handed the repository's root, so every test works in a temporary git repository holding a copy of the built-in set and
// never touches the worktree's real file

const BUILTIN = resolve('src/pdf-reader/engine/rules/layout-rules.json')
const JSON_TYPE = 'application/json'
// biome-ignore lint/suspicious/noExplicitAny: a set under edit has no fixed shape
type Edit = any

const dirs: string[] = []
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise(done => { s.close(done); s.closeAllConnections() })))
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** git in a temporary repository, with nothing of the maintainer's configuration (signing, hooks, identity) */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'lab', GIT_AUTHOR_EMAIL: 'lab@example.invalid', GIT_COMMITTER_NAME: 'lab', GIT_COMMITTER_EMAIL: 'lab@example.invalid' },
  }).trim()
}
/** a repository whose one commit holds the built-in set at `src/pdf-reader/engine/rules/layout-rules.json` */
function repo(): { dir: string; file: string; first: string } {
  const dir = mkdtempSync(join(tmpdir(), 'axt-rules-api-'))
  dirs.push(dir)
  const file = join(dir, RULES_PATH)
  mkdirSync(dirname(file), { recursive: true })
  copyFileSync(BUILTIN, file)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', RULES_PATH)
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'the built-in set')
  return { dir, file, first: git(dir, 'rev-parse', 'HEAD') }
}

interface Reply { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: Edit }
/** the lab's server, on a free port of 127.0.0.1: the API alone, anything else a 404 */
async function lab(dir: string, o: { published?: { staging?: string | null; production?: string | null } } = {}): Promise<{ origin: string; dir: string; call: (method: string, path: string, o?: { headers?: Record<string, string | undefined>; body?: string | Buffer }) => Promise<Reply> }> {
  let origin = ''
  const api = createRulesApi({ root: dir, origin: () => origin, rules, ...(o.published ? { published: o.published } : {}) })
  const server = createServer((req, res) => { api.handle(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end() } }, () => { res.writeHead(500); res.end() }) })
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  origin = `http://127.0.0.1:${port}`
  const call = (method: string, path: string, { headers = {}, body }: { headers?: Record<string, string | undefined>; body?: string | Buffer } = {}) => new Promise<Reply>((done, fail) => {
    const h = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined)) as Record<string, string>
    const req = request({ host: '127.0.0.1', port, method, path, headers: h }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: Edit = null
        try { parsed = JSON.parse(text) } catch {}
        done({ status: res.statusCode ?? 0, headers: res.headers, text, json: parsed })
      })
    })
    req.on('error', fail)
    req.end(body)
  })
  return { origin, dir, call }
}
const builtin = (edit?: (s: Edit) => void): Edit => { const s = JSON.parse(readFileSync(BUILTIN, 'utf8')); edit?.(s); return s }
/** the built-in set's version and note: what a first save replaces */
const { version: V, note: NOTE } = builtin() as { version: number; note: string }
/** the digest of the file as it is now, as the ETag a GET gives it */
const etagOf = (dir: string) => `"${createHash('sha256').update(readFileSync(join(dir, RULES_PATH))).digest('hex')}"`
/** a save: JSON from the lab's own origin, built on the file as it is when the save is sent (its digest as If-Match) */
const save = (l: Awaited<ReturnType<typeof lab>>, set: unknown, headers: Record<string, string | undefined> = {}) =>
  l.call('POST', '/api/rules', { headers: { 'content-type': JSON_TYPE, origin: l.origin, 'if-match': etagOf(l.dir), ...headers }, body: typeof set === 'string' ? set : JSON.stringify(set) })
/** the lines `git diff` shows changed in the rules file, without the file headers */
const changedLines = (dir: string) => git(dir, 'diff', '-U0', '--', RULES_PATH).split('\n').filter(x => /^[+-]/.test(x) && !/^(\+\+\+|---)/.test(x))
/** what a directory holds beside the rules file: nothing else may be left behind by a refused save */
const siblings = (file: string) => readdirSync(dirname(file))

describe('saving (POST /api/rules)', () => {
  it('refuses a POST that is not application/json, and writes nothing', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    const body = JSON.stringify(builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'tune' }))
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonp', undefined]) {
      const r = await l.call('POST', '/api/rules', { headers: { 'content-type': type, origin: l.origin }, body })
      expect(r.status, String(type)).toBe(415)
      expect(r.json.ok, String(type)).toBe(false)
    }
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
  })

  it('accepts a charset on the JSON type', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    const r = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'tune' }), { 'content-type': 'application/json; charset=utf-8' })
    expect(r.status).toBe(200)
  })

  it('refuses a POST from another origin, or from none, and writes nothing', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    const set = builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'tune' })
    const port = new URL(l.origin).port
    for (const origin of ['https://example.com', `http://localhost:${port}`, `http://127.0.0.1:${Number(port) + 1}`, `${l.origin}.evil.example`, `${l.origin}/`, 'null', undefined]) {
      const r = await save(l, set, { origin })
      expect(r.status, String(origin)).toBe(403)
      expect(r.json.ok, String(origin)).toBe(false)
    }
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
  })

  it('writes a valid set in its canonical form, its version the file\'s plus one', async () => {
    const { dir, file } = repo()
    const l = await lab(dir)
    const set = builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'zh leads a little looser' })
    const r = await save(l, set)
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.version).toBe(V + 1)
    const written = readFileSync(file, 'utf8')
    const expected = rules.writeRules(rules.parseRules({ ...set, version: V + 1 }))
    expect(written).toBe(expected)
    // (canonical: the file is what writeRules makes of what it holds)
    expect(rules.writeRules(rules.parseRules(JSON.parse(written)))).toBe(written)
    const parsed = JSON.parse(written)
    expect(parsed.version).toBe(V + 1)
    expect(parsed.note).toBe('zh leads a little looser')
    expect(parsed.scripts.Hans.leadBase).toBe(1.35)
    // (the answer names the digest of the bytes written, the version, and the changed fields)
    expect(r.json.sha256).toBe((await rules.readRules(new TextEncoder().encode(written))).sha256)
    expect(r.json.changed).toEqual([{ path: 'scripts.Hans.leadBase', from: 1.3, to: 1.35 }])
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
    // (the next save is built on the version the file now has)
    const again = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.4; s.note = 'looser still'; s.version = V + 1 }))
    expect(again.json.version).toBe(V + 2)
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(V + 2)
  })

  it('shows a change to the script as one field line and the version in a git diff', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'zh leads looser' }))
    expect(changedLines(dir)).toEqual([
      `-  "version": ${V},`,
      `-  "note": ${JSON.stringify(NOTE)},`,
      `+  "version": ${V + 1},`,
      '+  "note": "zh leads looser",',
      '-      "leadBase": 1.3,',
      '+      "leadBase": 1.35,',
    ])
  })

  it('shows a first override of a language as its field line, and the comma the line before it gains', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    await save(l, builtin(s => { s.languages.zh.leadBase = 1.35; s.note = 'zh only' }))
    const lines = changedLines(dir)
    expect(lines).toContain('+      "leadBase": 1.35')
    expect(lines).toContain(`+  "version": ${V + 1},`)
    // (zh's labels line is the block's last, so it gains the comma: JSON's, not the lab's)
    expect(lines.filter(x => x.includes('"labels"'))).toHaveLength(2)
    expect(lines).toHaveLength(7)
  })

  it('answers the fields that changed, across the set', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    const r = await save(l, builtin(s => {
      s.note = 'several'
      s.scripts.Jpan.leadBase = 1.45
      s.languages.ko.leadBase = 1.2
      s.languages.zh.labels = null
      s.hyphenation.en.left = 3
      s.scripts.Latn.adaptiveFill = null
    }))
    expect(r.status).toBe(200)
    expect(r.json.changed.map((c: { path: string }) => c.path).sort()).toEqual(['hyphenation.en.left', 'languages.ko.leadBase', 'languages.zh.labels', 'scripts.Jpan.leadBase', 'scripts.Latn.adaptiveFill'])
  })

  it('requires a note: an empty, blank or missing one is refused naming the note, and nothing is written', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    for (const note of ['', '   \n\t', undefined]) {
      const r = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; if (note === undefined) delete s.note; else s.note = note }))
      expect(r.status, String(note)).toBe(422)
      expect(r.json.field, String(note)).toBe('note')
    }
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('answers an invalid set\'s RulesRefusal field, and writes nothing', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    const cases: [string, (s: Edit) => void, string][] = [
      ['a leading above its range', s => { s.scripts.Hans.leadBase = 5 }, 'scripts.Hans.leadBase'],
      ['a language\'s own field out of range', s => { s.languages.ja.step = 0.5 }, 'languages.ja.step'],
      ['an unknown key', s => { s.scripts.Latn.shine = true }, 'scripts.Latn.shine'],
      ['a wrong type, named', s => { s.hyphenation.minWord = '5' }, 'hyphenation.minWord'],
      ['a face the catalog lacks', s => { s.scripts.Hans.cjkFaces.group = 'no-such-group' }, 'scripts.Hans.cjkFaces.group'],
      ['a target missing', s => { delete s.languages.fr }, 'languages.fr'],
      ['the extension\'s Portuguese missing', s => { delete s.languages.pt }, 'languages.pt'],
      ['a label with a control character', s => { s.languages.de.labels.figure = 'Abb\u0007' }, 'languages.de.labels.figure'],
    ]
    for (const [name, edit, field] of cases) {
      const r = await save(l, builtin(s => { s.note = 'x'; edit(s) }))
      expect(r.status, name).toBe(422)
      expect(r.json.ok, name).toBe(false)
      expect(r.json.field, name).toBe(field)
      expect(typeof r.json.why, name).toBe('string')
    }
    // (and what is not a set at all)
    for (const [name, body, field] of [['not JSON', '{"schema": ', 'json'], ['not an object', '[1, 2]', 'set'], ['malformed UTF-8', Buffer.from([0x7b, 0x22, 0xff, 0xfe])]] as [string, string | Buffer, string?][]) {
      const r = await l.call('POST', '/api/rules', { headers: { 'content-type': JSON_TYPE, origin: l.origin }, body })
      expect(r.status, name).toBe(422)
      if (field) expect(r.json.field, name).toBe(field)
      else expect(['utf8', 'json']).toContain(r.json.field)
    }
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
  })

  it('refuses a body over the rule set\'s cap without reading it all, and writes nothing', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    const r = await l.call('POST', '/api/rules', { headers: { 'content-type': JSON_TYPE, origin: l.origin }, body: `{"note": "${'x'.repeat(rules.RULES_CAP)}"}` })
    expect(r.status).toBe(413)
    expect(r.json.field).toBe('bytes')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('refuses a set that changes nothing: a save is a change', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    // (only the note differs, which is not a field)
    const r = await save(l, builtin(s => { s.note = 'a different note' }))
    expect(r.status).toBe(409)
    expect(r.json.error).toBe('unchanged')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('refuses a save built on a file that changed without a new version (a checkout, a hand edit), and writes nothing', async () => {
    const { dir, file } = repo()
    const l = await lab(dir)
    // (the page read the file; then another tool replaced it with other values at the same version)
    const read = etagOf(dir)
    const handEdited = rules.writeRules(rules.parseRules(builtin(s => { s.scripts.Hans.leadBase = 1.31; s.note = 'edited by hand' })))
    writeFileSync(file, handEdited)
    const r = await save(l, builtin(s => { s.scripts.Hans.spaceMax = 0.5; s.note = 'built on the file as read' }), { 'if-match': read })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ ok: false, error: 'stale', version: V })
    expect(r.json.sha256).toBe(etagOf(dir).slice(1, -1))
    expect(readFileSync(file, 'utf8')).toBe(handEdited)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
    // (built on the file as it now is, the same change is written)
    const again = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.31; s.scripts.Hans.spaceMax = 0.5; s.note = 'built on the file as it is' }))
    expect(again.status).toBe(200)
    expect(again.json.version).toBe(V + 1)
  })

  it('refuses a save that does not name the file it was built on (an If-Match of the digest the file came with), and writes nothing', async () => {
    const { dir, file } = repo()
    const before = readFileSync(file)
    const l = await lab(dir)
    const set = builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'tune' })
    const good = etagOf(dir)
    // (none; a weak tag, which never matches; the any-file form; the wrong length; capitals; the digest unquoted)
    for (const header of [undefined, `W/${good}`, '*', `"${good.slice(2, -1)}"`, good.toUpperCase(), good.slice(1, -1)]) {
      const r = await save(l, set, { 'if-match': header })
      expect(r.status, String(header)).toBe(428)
      expect(r.json, String(header)).toMatchObject({ ok: false, error: 'precondition' })
    }
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
  })

  it('does not interleave two saves: the one that comes second, built on the version the first replaced, is refused', async () => {
    const { dir, file } = repo()
    const l = await lab(dir)
    const [a, b] = await Promise.all([
      save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'a' })),
      save(l, builtin(s => { s.scripts.Hans.leadBase = 1.4; s.note = 'b' })),
    ])
    const [won, lost] = a.status === 200 ? [a, b] : [b, a]
    expect([won.status, lost.status]).toEqual([200, 409])
    expect(won.json.version).toBe(V + 1)
    expect(lost.json.error).toBe('stale')
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written.version).toBe(V + 1)
    expect(written.note).toBe(won === a ? 'a' : 'b')
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
  })

  it('refuses a set built on another version than the file\'s, and writes nothing: a second tab does not take the first one\'s edit away', async () => {
    const { dir, file } = repo()
    const l = await lab(dir)
    // (two tabs read the file's version; the first saves a change to leadBase)
    const first = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'first tab' }))
    expect(first.status).toBe(200)
    const after = readFileSync(file)
    // (the second, which still has that version, saves a change to another field)
    const second = await save(l, builtin(s => { s.scripts.Hans.spaceMax = 0.5; s.note = 'second tab' }))
    expect(second.status).toBe(409)
    expect(second.json).toMatchObject({ ok: false, error: 'stale', version: V + 1 })
    expect(readFileSync(file).equals(after)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')).scripts.Hans.leadBase).toBe(1.35)
    expect(siblings(file)).toEqual([RULES_PATH.split('/').pop()])
    // (a version ahead of the file's is as stale: the set was not built on this file)
    const ahead = await save(l, builtin(s => { s.scripts.Hans.spaceMax = 0.5; s.note = 'ahead'; s.version = 9 }))
    expect(ahead.status).toBe(409)
    expect(ahead.json.error).toBe('stale')
    expect(readFileSync(file).equals(after)).toBe(true)
    // (built on the file as it now is, the same change is written)
    const third = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.scripts.Hans.spaceMax = 0.5; s.note = 'second tab, reloaded'; s.version = V + 1 }))
    expect(third.status).toBe(200)
    expect(third.json.version).toBe(V + 2)
  })

  it('answers a file it cannot read as such and writes nothing', async () => {
    const { dir, file } = repo()
    writeFileSync(file, '{ "schema": 1 }')
    const l = await lab(dir)
    const r = await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'x' }))
    expect(r.status).toBe(500)
    expect(r.json.error).toBe('file')
    expect(readFileSync(file, 'utf8')).toBe('{ "schema": 1 }')
  })

  it('allows no other method on the route', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    for (const method of ['PUT', 'DELETE', 'PATCH']) expect((await l.call(method, '/api/rules', { headers: { origin: l.origin } })).status, method).toBe(405)
  })
})

describe('reading the worktree\'s file (GET /api/rules)', () => {
  it('answers the file\'s bytes with their digest as the ETag', async () => {
    const { dir, file } = repo()
    const l = await lab(dir)
    const r = await l.call('GET', '/api/rules')
    expect(r.status).toBe(200)
    expect(r.text).toBe(readFileSync(file, 'utf8'))
    const { sha256 } = await rules.readRules(readFileSync(file))
    expect(r.headers.etag).toBe(`"${sha256}"`)
    expect(String(r.headers['content-type'])).toContain(JSON_TYPE)
    // (HEAD answers the headers alone)
    const head = await l.call('HEAD', '/api/rules')
    expect(head.status).toBe(200)
    expect(head.headers.etag).toBe(`"${sha256}"`)
    expect(head.text).toBe('')
  })

  it('answers what a save wrote', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'x' }))
    const r = await l.call('GET', '/api/rules')
    expect(JSON.parse(r.text).version).toBe(V + 1)
  })
})

describe('reading a commit\'s file (GET /api/rules?ref=)', () => {
  /** a repository with a second commit, where the file is a version on */
  async function twoCommits() {
    const r = repo()
    const l = await lab(r.dir)
    await save(l, builtin(s => { s.scripts.Hans.leadBase = 1.35; s.note = 'second' }))
    git(r.dir, 'add', RULES_PATH)
    git(r.dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'the next version')
    return { ...r, l, second: git(r.dir, 'rev-parse', 'HEAD') }
  }

  it('answers that commit\'s file for a full or an abbreviated sha', async () => {
    const { dir, first, second, l } = await twoCommits()
    const atFirst = git(dir, 'show', `${first}:${RULES_PATH}`)
    const atSecond = git(dir, 'show', `${second}:${RULES_PATH}`)
    expect(JSON.parse(atFirst).version).toBe(V)
    expect(JSON.parse(atSecond).version).toBe(V + 1)
    for (const ref of [first, first.slice(0, 7), first.toUpperCase()]) {
      const r = await l.call('GET', `/api/rules?ref=${ref}`)
      expect(r.status, ref).toBe(200)
      expect(r.text.trim(), ref).toBe(atFirst)
      expect(r.headers['x-rules-commit'], ref).toBe(first)
      const { sha256 } = await rules.readRules(new TextEncoder().encode(r.text))
      expect(r.headers.etag, ref).toBe(`"${sha256}"`)
    }
    const r = await l.call('GET', `/api/rules?ref=${second.slice(0, 10)}`)
    expect(JSON.parse(r.text).version).toBe(V + 1)
  })

  it('answers an existing branch\'s file (a local branch, a remote-tracking one), not a tag\'s', async () => {
    const { dir, first, l } = await twoCommits()
    git(dir, 'branch', 'exp/older', first)
    git(dir, 'tag', 'v-older', first)
    git(dir, 'update-ref', 'refs/remotes/origin/pr-7', first)
    for (const ref of ['exp/older', 'origin/pr-7']) {
      const r = await l.call('GET', `/api/rules?ref=${encodeURIComponent(ref)}`)
      expect(r.status, ref).toBe(200)
      expect(JSON.parse(r.text).version, ref).toBe(V)
      expect(r.headers['x-rules-commit'], ref).toBe(first)
    }
    const main = await l.call('GET', '/api/rules?ref=main')
    expect(JSON.parse(main.text).version).toBe(V + 1)
    expect((await l.call('GET', '/api/rules?ref=v-older')).status).toBe(404)
  })

  it('refuses a ref that is not a commit or a branch', async () => {
    const { dir, first, l } = await twoCommits()
    const tree = git(dir, 'rev-parse', `${first}^{tree}`)
    const blob = git(dir, 'rev-parse', `${first}:${RULES_PATH}`)
    const refused = [
      tree, blob, 'deadbeef', 'no-such-branch', 'HEAD', 'FETCH_HEAD', 'refs/heads/main', 'HEAD~1', `${first}~0`, `${first}^`, `${first}:${RULES_PATH}`, 'main@{1}', '@{u}',
      '--version', '-x', '--output=/tmp/x', 'main..HEAD', 'a//b', 'ma in', 'main;ls', '$(id)', '`id`', '*', '', '../x', 'main/', 'x.lock',
    ]
    for (const ref of refused) {
      const r = await l.call('GET', `/api/rules?ref=${encodeURIComponent(ref)}`)
      expect(r.status, JSON.stringify(ref)).toBeGreaterThanOrEqual(400)
      expect(r.status, JSON.stringify(ref)).toBeLessThan(500)
      expect(r.json.ok, JSON.stringify(ref)).toBe(false)
    }
    // (a request naming no ref, or two, is not one)
    expect((await l.call('GET', '/api/rules?ref=')).status).toBe(400)
    expect((await l.call('GET', `/api/rules?ref=${first}&ref=${first}`)).status).toBe(400)
  })

  it('names a commit that has no rules file as such', async () => {
    const { dir, l } = await twoCommits()
    writeFileSync(join(dir, 'other.txt'), 'x')
    git(dir, 'rm', '-q', RULES_PATH)
    git(dir, 'add', 'other.txt')
    git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'no rules')
    const r = await l.call('GET', '/api/rules?ref=main')
    expect(r.status).toBe(404)
    expect(r.json.error).toBe('ref')
  })

  it('does not run anything a ref carries', async () => {
    const { dir, l } = await twoCommits()
    const marker = join(dir, 'ran')
    for (const ref of [`main;touch ${marker}`, `$(touch ${marker})`, `main&&touch ${marker}`]) await l.call('GET', `/api/rules?ref=${encodeURIComponent(ref)}`)
    expect(readdirSync(dir)).not.toContain('ran')
  })
})

describe('the published current set (GET /api/rules/published)', () => {
  const routeLog: string[][] = []
  beforeEach(() => { routeLog.length = 0 })
  /** a stand-in for the web's rules route */
  async function route(answer: (url: string) => { status: number; body?: string; headers?: Record<string, string> }): Promise<string> {
    const asked: string[] = []
    const server = createServer((req, res) => { asked.push(`${req.method} ${req.url} ${JSON.stringify(req.headers)}`); const a = answer(req.url ?? ''); res.writeHead(a.status, a.headers); res.end(a.body ?? '') })
    servers.push(server)
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    routeLog.push(asked)
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/rules/s1`
  }

  it('is unavailable where the lab was given no URL', async () => {
    const { dir } = repo()
    const l = await lab(dir)
    const r = await l.call('GET', '/api/rules/published?env=staging')
    expect(r.status).toBe(404)
    expect(r.json.error).toBe('unavailable')
    expect((await l.call('GET', '/api/rules/published?env=elsewhere')).status).toBe(400)
  })

  it('passes the route\'s bytes and ETag on, asking for nothing about the maintainer', async () => {
    const { dir } = repo()
    const bytes = readFileSync(BUILTIN, 'utf8')
    const { sha256 } = await rules.readRules(new TextEncoder().encode(bytes))
    const url = await route(() => ({ status: 200, body: bytes, headers: { 'content-type': JSON_TYPE, etag: `"${sha256}"`, 'x-rules-version': '1' } }))
    const l = await lab(dir, { published: { staging: url } })
    const r = await l.call('GET', '/api/rules/published?env=staging')
    expect(r.status).toBe(200)
    expect(r.text).toBe(bytes)
    expect(r.headers.etag).toBe(`"${sha256}"`)
    expect(r.headers['x-rules-version']).toBe('1')
    // (the request carries a project user agent and no cookie, referrer or origin)
    const asked = routeLog[0]![0]!
    expect(asked).toContain('GET /api/v1/rules/s1')
    expect(asked.toLowerCase()).toContain('readarxiv-layer-lab')
    expect(asked.toLowerCase()).not.toMatch(/cookie|referer|origin|authorization/)
    // (production was given no URL)
    expect((await l.call('GET', '/api/rules/published?env=production')).status).toBe(404)
  })

  it('shows a route that answers 404, errors or is not there as unavailable', async () => {
    const { dir } = repo()
    const notFound = await route(() => ({ status: 404, body: '{"why":"unknown-schema"}' }))
    const broken = await route(() => ({ status: 500, body: 'oops' }))
    const l = await lab(dir, { published: { staging: notFound, production: broken } })
    const a = await l.call('GET', '/api/rules/published?env=staging')
    expect(a.status).toBe(404)
    expect(a.json.error).toBe('unavailable')
    const b = await l.call('GET', '/api/rules/published?env=production')
    expect(b.status).toBe(502)
    expect(b.json.error).toBe('unavailable')
    // (a URL nothing listens on)
    const dead = createServer()
    await new Promise<void>(done => dead.listen(0, '127.0.0.1', done))
    const port = (dead.address() as AddressInfo).port
    await new Promise(done => dead.close(done))
    const gone = await lab(dir, { published: { staging: `http://127.0.0.1:${port}/x` } })
    const c = await gone.call('GET', '/api/rules/published?env=staging')
    expect(c.status).toBe(502)
    expect(c.json.error).toBe('unreachable')
  })

  it('refuses an answer over the cap rather than reading it all', async () => {
    const { dir } = repo()
    const url = await route(() => ({ status: 200, body: 'x'.repeat(rules.RULES_CAP + 10) }))
    const l = await lab(dir, { published: { staging: url } })
    const r = await l.call('GET', '/api/rules/published?env=staging')
    expect(r.status).toBe(502)
    expect(r.json.error).toBe('too-large')
  })
})
