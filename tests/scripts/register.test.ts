import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// helper/register.sh is the one writer of the Native Messaging host manifest (INVENTORY P5): both installers end in it.
// Run against a throwaway HOME, so the machine's own manifests are never touched

const SCRIPT = join(import.meta.dirname, '../../helper/register.sh')
const HOST = 'io.github.srjoeee.arxivtranslate'
const ID_A = 'abcdefghijklmnopabcdefghijklmnop'
const ID_B = 'pppppppppppppppppppppppppppppppp'

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'axt-register-'))
  const bin = join(dir, 'axt-helper')
  writeFileSync(bin, '#!/bin/sh\necho 1.0\n')
  chmodSync(bin, 0o755)
  return { dir, bin }
}
const register = (dir: string, ...args: string[]) => execFileSync('bash', [SCRIPT, ...args], { env: { ...process.env, HOME: dir }, stdio: 'pipe' }).toString()
const manifests = (dir: string) => ['Google/Chrome', 'Chromium'].map(browser => join(dir, 'Library/Application Support', browser, 'NativeMessagingHosts', `${HOST}.json`))
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { name: string; description: string; path: string; type: string; allowed_origins: string[] }

describe('helper/register.sh', () => {
  it('writes the same manifest into the default user data directories of Chrome and Chromium', () => {
    const { dir, bin } = home()
    register(dir, bin, ID_A)
    for (const path of manifests(dir)) {
      expect(existsSync(path)).toBe(true)
      expect(read(path)).toEqual({
        name: HOST,
        description: 'The image recognition helper of Read arXiv (Apple Vision)',
        path: bin,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${ID_A}/`],
      })
    }
  })

  it('a later run keeps the ids an earlier one allowed — another profile, a dev build beside the installed one — each once, the new ones first', () => {
    const { dir, bin } = home()
    register(dir, bin, ID_A)
    register(dir, bin, ID_B, ID_A)
    for (const path of manifests(dir)) expect(read(path).allowed_origins).toEqual([`chrome-extension://${ID_B}/`, `chrome-extension://${ID_A}/`])
    // The binary path follows the run: the two installers build in different places, and the last one registered is the one Chrome starts
    const other = join(dir, 'other-helper')
    writeFileSync(other, '#!/bin/sh\n')
    chmodSync(other, 0o755)
    register(dir, other, ID_A)
    for (const path of manifests(dir)) expect(read(path).path).toBe(other)
  })

  it('an existing manifest with no origins — an empty list, or a file left empty by an interrupted write — does not stop a re-run (Codex on the #207 range)', () => {
    const { dir, bin } = home()
    const [chrome, chromium] = manifests(dir)
    mkdirSync(dirname(chrome as string), { recursive: true })
    writeFileSync(chrome as string, JSON.stringify({ name: HOST, path: bin, type: 'stdio', allowed_origins: [] }))
    mkdirSync(dirname(chromium as string), { recursive: true })
    writeFileSync(chromium as string, '')
    register(dir, bin, ID_A)
    for (const path of manifests(dir)) expect(read(path).allowed_origins).toEqual([`chrome-extension://${ID_A}/`])
  })

  it('refuses a malformed extension id and a binary that is not there, writing nothing', () => {
    const { dir, bin } = home()
    expect(() => register(dir, bin, 'not-an-id')).toThrow(/Not a valid extension id/)
    expect(() => register(dir, join(dir, 'missing'), ID_A)).toThrow(/Not an executable helper binary/)
    for (const path of manifests(dir)) expect(existsSync(path)).toBe(false)
  })
})
