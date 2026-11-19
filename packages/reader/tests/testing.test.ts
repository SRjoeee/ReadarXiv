// `@readarxiv/reader/testing` (the manifest's `./testing`, src/testing/index.ts): the reader's internals a host's own tests and
// end-to-end scripts read, as `@readarxiv/translate/testing` gives the translators' test adapters. Each name is its module's
// own value, and none is one a public entry gives: a host imports a public name from the public entry. That no product imports
// the entry is the boundary gate's (scripts/check-boundary.mjs testingViolations; tests/scripts/package-boundary.test.ts).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as source from '../src/bytes/source.ts'
import * as store from '../src/bytes/store.ts'
import * as links from '../src/chrome/links.ts'
import * as status from '../src/chrome/status.ts'
import * as classes from '../src/compose/classes.ts'
import * as early from '../src/early.ts'
import * as entry from '../src/index.ts'
import * as client from '../src/session/client.ts'
import * as contents from '../src/session/contents.ts'
import * as machine from '../src/session/machine.ts'
import * as paper from '../src/session/paper.ts'
import * as testing from '../src/testing/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')) as { exports: Record<string, string> }

/** each name the entry gives, and the module whose own value it is */
const OWN: Record<string, Record<string, unknown>> = {
  kindShown: classes,
  createContents: contents,
  rangeSource: source,
  chunkStore: store,
  follow: client,
  objectStore: client,
  open: client,
  Refused: client,
  abstractTitleOf: paper,
  htmlVersionOf: paper,
  needsOf: machine,
  linkable: links,
  capsuleOf: status,
}

describe('@readarxiv/reader/testing', () => {
  it("is an entry of the package, as the translators' testing entry is of theirs", () => {
    expect(manifest.exports['./testing']).toBe('./src/testing/index.ts')
  })
  it("gives these thirteen names, each its module's own value", () => {
    expect(Object.keys(testing).sort()).toEqual(Object.keys(OWN).sort())
    for (const [name, mod] of Object.entries(OWN))
      expect((testing as Record<string, unknown>)[name], name).toBe(mod[name])
  })
  it('gives no name a public entry gives', () => {
    const shared = Object.keys(testing).filter((name) => name in entry || name in early)
    expect(shared).toEqual([])
  })
})
