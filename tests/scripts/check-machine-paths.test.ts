import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { check, pathsIn } from '../../scripts/check-machine-paths.mjs'

// scripts/check-machine-paths.mjs: no tracked file outside parked/ names a home directory or a mounted volume. The paths
// below are made here from their parts, so that this file holds none itself.
const abs = (...parts: string[]) => `/${parts.join('/')}`
const HOME = abs('Users', 'someone')
const DISK = abs('Volumes', 'Disk_1')

describe('a path of a machine', () => {
  it('is an absolute path into a home directory or onto a mounted volume, read to its first segment', () => {
    expect(pathsIn(`const LAB = '${HOME}/lab-data'`)).toEqual([{ line: 1, path: HOME }])
    expect(pathsIn(`a\n// ${DISK}/archive/frozen`)).toEqual([{ line: 2, path: DISK }])
    expect(pathsIn(`cd ${abs('home', 'runner')}/work`)).toEqual([{ line: 1, path: abs('home', 'runner') }])
    expect(pathsIn(`file://${HOME}/a.png`)).toEqual([{ line: 1, path: HOME }])
    const windows = ['C:', 'Users', 'someone'].join('\\')
    expect(pathsIn(`"${windows}\\a"`).map((p) => p.path)).toEqual([windows])
  })
  it('is not a path inside another path or a URL, a name in words, a placeholder or a home-relative path', () => {
    expect(pathsIn(`df -g ${abs('System', 'Volumes', 'Data')}`)).toEqual([])
    expect(pathsIn(`https://example.org${HOME}`)).toEqual([])
    expect(pathsIn('a home directory (/Users/<name>/) named in words')).toEqual([])
    expect(pathsIn('~/.cache/readarxiv/fixtures')).toEqual([])
  })
  it('leaves a made-up home its file lists', () => {
    expect(pathsIn(`'${abs('home', 'u')}'`, [abs('home', 'u')])).toEqual([])
  })
})

describe('the check over a tree', () => {
  let root: string
  const put = (path: string, content: string | Buffer) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'axt-machine-paths-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('holds every file it is given but parked/ and a binary one, by file and line', () => {
    put('lab/a.mjs', `// one\nconst X = process.env.X ?? '${HOME}/x'\n`)
    put('parked/b.mjs', `const Y = '${HOME}/y'\n`)
    put('docs/c.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), Buffer.from(`${HOME}/z`)]))
    put('docs/d.md', 'Read from AXT_LAB_DATA, none by default.\n')
    const { held, read } = check(root, ['lab/a.mjs', 'parked/b.mjs', 'docs/c.png', 'docs/d.md'])
    expect(held).toEqual([{ file: 'lab/a.mjs', line: 2, path: HOME }])
    expect(read).toBe(2)
  })
})
