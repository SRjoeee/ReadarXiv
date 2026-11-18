#!/usr/bin/env node
// The machine-path gate. This repository is public, and a path of the maintainer's machine is no reader's: a default that
// names a home or a disk works on one machine and tells every other reader where that machine keeps its files. So no tracked
// file outside parked/ holds an absolute path into a home directory (`/Users/<name>/`, `/home/<name>/`, `C:\Users\<name>\`)
// or onto a mounted volume (`/Volumes/<name>`): a tool that needs such a place reads it from an environment variable and says
// which one where it is unset, and a record names the place in words. parked/ is kept as it was parked (parked/README.md).
//
// Read as text, every line of every tracked file but a binary one (a NUL in its first 8 KiB). A path counts from its first
// slash: one inside another path or a URL (`/System/Volumes/Data`, `https://host/Users/<name>`) is not one; a file URL's is.
// MADE_UP holds the test inputs that stand for some machine's home, each in the one file that uses it (and here, where they
// are listed).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** an absolute path into a home directory or onto a mounted volume, from its first slash to its first segment's end */
export const MACHINE_PATH = /(?<![\w.~-])(?:\/(?:Users|home|Volumes)\/[^\s/'"`<>()[\]{},;:*$\\]+|[A-Za-z]:\\\\?Users\\\\?[^\s\\'"`<>]+)/g
/** the directory the gate leaves alone */
export const PARKED = 'parked/'
/** a made-up home a test passes as some machine's, by the one file that uses it */
export const MADE_UP = new Map([
  ['tests/scripts/merge-gate.test.ts', ['/home/u']],
  ['tests/scripts/build-ref.test.ts', ['/Users/alice']],
  ['scripts/check-machine-paths.mjs', ['/home/u', '/Users/alice']],
])

/** the machine paths in a text: `{ line, path }`, line numbers from 1 */
export function pathsIn(text, allowed = []) {
  const found = []
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(MACHINE_PATH)) if (!allowed.includes(m[0])) found.push({ line: i + 1, path: m[0] })
  })
  return found
}

/** every tracked file under `root` that holds a machine path, parked/ and binary files left out */
export function check(root = '.', files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)) {
  const held = []
  let read = 0
  for (const file of files) {
    if (file.startsWith(PARKED)) continue
    let bytes
    try { bytes = readFileSync(join(root, file)) } catch { continue }
    if (bytes.subarray(0, 8192).includes(0)) continue
    read++
    for (const p of pathsIn(bytes.toString('utf8'), MADE_UP.get(file))) held.push({ file, ...p })
  }
  return { held, read }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { held, read } = check()
  if (held.length > 0) {
    console.error('A tracked file names a path of a machine (read it from an environment variable, or name the place in words):')
    for (const h of held) console.error(`  ${h.file}:${h.line}: ${h.path}`)
    process.exit(1)
  }
  console.log(`machine paths: none in ${read} tracked files outside ${PARKED}`)
}
