// A check-up of the build output: Chrome validates a content script strictly as UTF-8 before loading it, and a Unicode
// noncharacter (U+FFFF etc.) in the file makes it refuse the whole extension with "It isn't UTF-8 encoded".
// Met 2026-09-04: the content side imported @/cache/index by mistake and bundled Dexie, which uses "￿" as a key-range upper bound.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT = '.output/chrome-mv3'
const CONTENT_DIR = join(OUT, 'content-scripts')

const isNoncharacter = code =>
  (code >= 0xd800 && code <= 0xdfff) || (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe || code === 0xfeff

function scan(path) {
  const bytes = readFileSync(path)
  const problems = []
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problems.push('starts with a BOM')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    problems.push('not valid UTF-8')
    return problems
  }
  const found = new Set()
  for (const ch of text) if (isNoncharacter(ch.codePointAt(0))) found.add(`U+${ch.codePointAt(0).toString(16).toUpperCase()}`)
  if (found.size > 0) problems.push(`contains the Unicode noncharacters ${[...found].join(', ')}, which Chrome refuses to load`)
  return problems
}

let failed = false

// The licences that go with every copy (scripts/third-party-notices.mjs): written through a WXT hook, and a hook that
// stopped being called would leave a package that builds, loads and breaks three licences. React is in every build
// of this extension, so its entry standing for "the list was written" cannot go stale
const NOTICES = join(OUT, 'licenses/third-party.txt')
const notices = existsSync(NOTICES) ? readFileSync(NOTICES, 'utf8') : ''
for (const [what, ok] of [
  [`${join(OUT, 'LICENSE')} is the project's licence`, existsSync(join(OUT, 'LICENSE')) && readFileSync(join(OUT, 'LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE')],
  [`${NOTICES} lists the bundled packages`, /^react \d[^\n]* — MIT$/m.test(notices)],
  [`${NOTICES} holds Apache-2.0's own text`, notices.includes('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')],
]) {
  if (ok) console.log(`✓ ${what}`)
  else {
    failed = true
    console.error(`✗ ${what}: it does not`)
  }
}
let unloadable = false
for (const name of readdirSync(CONTENT_DIR)) {
  const path = join(CONTENT_DIR, name)
  if (!statSync(path).isFile()) continue
  const problems = scan(path)
  if (problems.length > 0) {
    failed = true
    unloadable = true
    console.error(`✗ ${path}\n  ${problems.join('\n  ')}`)
  } else {
    console.log(`✓ ${path}`)
  }
}
if (failed) {
  if (unloadable) console.error('\nThe content script cannot be loaded by Chrome. Usual cause: the content side imports a module meant for the background only (such as the Dexie cache implementation in @/cache).')
  process.exit(1)
}
