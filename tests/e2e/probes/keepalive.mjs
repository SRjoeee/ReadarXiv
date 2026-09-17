// Keep-alive probe (DESIGN §15.3, run 2026-09-17): does an open `connectNative` port by itself keep an MV3
// service worker past its 30 s idle limit? The port is opened inside the worker over CDP, the debugger is detached and
// no page of the extension is open, so nothing but the port is in the picture. Needs the helper installed
// (helper/install.sh) and a build in .output. Usage: node tests/e2e/probes/keepalive.mjs <chrome binary> [seconds]
import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { copyWithGrants } from '../ext-copy.mjs'

/** tests/e2e/: the profile and the extension copy live beside the suites' own (both patterns are ignored by git) */
const E2E = fileURLToPath(new URL('../', import.meta.url))
const CHROME = process.argv[2]
const SECONDS = Number(process.argv[3] ?? 75)
const SRC = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const EXT = copyWithGrants(SRC, `${E2E}.ext-keepalive`, { permissions: ['nativeMessaging'] })
const PROFILE = `${E2E}.profile-keepalive`
const HOST = 'io.github.srjoeee.arxivtranslate'
const INSTALLED = `${homedir()}/Library/Application Support/Google/Chrome/NativeMessagingHosts/${HOST}.json`
const PORT = 9334
const sleep = ms => new Promise(r => setTimeout(r, ms))
const helperAlive = () => { try { return execSync('pgrep -f axt-helper', { encoding: 'utf8' }).trim() !== '' } catch { return false } }

// Chrome lists targets over HTTP (/json/list); the worker is driven through its own DevTools socket, opened for the
// evaluation and closed right after — so that no debugger is attached while the idle timer runs.
const list = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
const workers = async () => (await list()).filter(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))
const ours = async () => (await workers()).filter(t => t.url.includes(extId))
async function evaluateIn(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const reply = new Promise(res => { ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result ?? { error: d.error }) } })
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
  const out = await reply
  ws.close()
  return out.result?.value ?? JSON.stringify(out)
}
async function closePage(id) { await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`) }

function launch() {
  return spawn(CHROME, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
}
async function waitForCdp() { for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return } catch { await sleep(250) } } throw new Error('no CDP') }

// A Chrome left over from an earlier run would answer on the port instead of the one launched here (it happened: three
// runs talked to a zombie whose profile had been deleted from under it)
if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false)) { console.log(`FAIL port ${PORT} is already in use`); process.exit(1) }
rmSync(PROFILE, { recursive: true, force: true })
// An unpacked extension's id is derived from its absolute path (the first 32 hex digits of its SHA-256, 0-9a-f → a-p),
// so the host manifest can be written before the only launch
const extId = createHash('sha256').update(EXT).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)))
const m = JSON.parse(readFileSync(INSTALLED, 'utf8'))
m.allowed_origins = [`chrome-extension://${extId}/`]
mkdirSync(`${PROFILE}/NativeMessagingHosts`, { recursive: true })
writeFileSync(`${PROFILE}/NativeMessagingHosts/${HOST}.json`, JSON.stringify(m, null, 2))

const chrome = launch()
await waitForCdp()
let target
// The worker starts on install; if it is slow to appear (a loaded machine), opening a page of the extension wakes it
for (let i = 0; i < 120 && !target; i++) {
  target = (await ours())[0]
  if (target) break
  if (i === 20) await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extId}/options.html`, { method: 'PUT' })
  await sleep(250)
}
if (!target) {
  console.log(`FAIL no worker for ${extId}; targets: ${(await list()).map(t => `${t.type}:${t.url.slice(0, 80)}`).join(' | ')}`)
  chrome.kill('SIGTERM'); process.exit(1)
}
for (const t of await list()) if (t.url.includes('options.html')) await closePage(t.id)
const opened = await evaluateIn(target, `
  (() => { try {
    const p = chrome.runtime.connectNative(${JSON.stringify(HOST)});
    globalThis.__probe = { port: p, disconnected: null, replies: [] };
    p.onDisconnect.addListener(() => { globalThis.__probe.disconnected = chrome.runtime.lastError?.message ?? 'clean' });
    p.onMessage.addListener(m => globalThis.__probe.replies.push(JSON.stringify(m).slice(0, 80)));
    p.postMessage({ v: 1, cmd: 'ping', id: 'probe' });
    return 'port opened';
  } catch (e) { return 'threw: ' + e } })()`)
console.log(`open: ${JSON.stringify(opened)}`)
await sleep(2000)
const state = await evaluateIn(target, 'JSON.stringify({ disconnected: globalThis.__probe?.disconnected, replies: globalThis.__probe?.replies })')
console.log(`after 2s: ${state} helper=${helperAlive()}`)
const t0 = Date.now()
let last = ''
while (Date.now() - t0 < SECONDS * 1000) {
  last = `t=${Math.round((Date.now() - t0) / 1000)}s worker=${(await ours()).length} helper=${helperAlive()}`
  console.log(last)
  await sleep(5000)
}
console.log(last.includes('worker=1') && last.includes('helper=true') ? `RESULT: worker and helper both alive after ${SECONDS} s with only the open port (no debugger attached)` : `RESULT: worker or helper gone before ${SECONDS} s`)
chrome.kill('SIGTERM')
rmSync(`${E2E}.ext-keepalive`, { recursive: true, force: true })
