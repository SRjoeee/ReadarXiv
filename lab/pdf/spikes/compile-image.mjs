// lab/pdf/spikes/compile-image.mjs
// The one place the lab's Docker compiles name their image, and the identity every compile cache key carries. A compile kept by
// what it compiles (layout-make.mjs, layer-fixtures.mjs, layout-paper-check.mjs, layout-marks-gate.mjs) is the same bytes only
// on the same TeX Live: two images give two LaTeX releases, two amsmath, two formats, and the files alone cannot tell them apart.
//
//   COMPILE_IMAGE     a full image reference with a digest (name[:tag]@sha256:<64 hex>); default: the `texlive` of
//                     lab/pdf/compile-image.json, which the web container and the gate pack are pinned to
//   COMPILE_PLATFORM  docker's --platform (linux/amd64 to emulate on an arm64 host); default: unset, the host's
//
// The identity (`COMPILE_IDENTITY`) is the digest, and the platform where one is asked: it goes into every cache key, so that a
// cache of another image simply misses. `checkCompileImage()` refuses to run unless the local image of that reference is that
// digest (and that platform), before any compile is made or any cache read.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PIN = new URL('../compile-image.json', import.meta.url)
const REF = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/

/** the image reference a compile uses: `env.COMPILE_IMAGE`, else the pin's texlive; throws unless it names a digest */
export function compileImageRef(env = process.env, pin = PIN) {
  const ref = env.COMPILE_IMAGE || JSON.parse(readFileSync(pin, 'utf8')).texlive
  if (typeof ref !== 'string' || !REF.test(ref)) throw new Error(`the compile image must be name[:tag]@sha256:<digest>, not ${JSON.stringify(ref)} (COMPILE_IMAGE, lab/pdf/compile-image.json)`)
  return ref
}
/** docker's `--platform <p>` arguments for `env.COMPILE_PLATFORM`, none where unset */
export function platformArgs(env = process.env) {
  const p = env.COMPILE_PLATFORM
  if (!p) return []
  if (!/^[a-z0-9]+\/[a-z0-9]+(\/[a-z0-9]+)?$/.test(p)) throw new Error(`COMPILE_PLATFORM: ${JSON.stringify(p)} is not os/arch`)
  return ['--platform', p]
}
/** what a cache key carries of the image: its digest, and the platform where one is asked */
export function identityOf(ref, platform = []) {
  return `${ref.slice(ref.indexOf('@') + 1)}${platform.length ? `|${platform[1]}` : ''}`
}

export const COMPILE_IMAGE = compileImageRef()
export const PLATFORM = platformArgs()
export const COMPILE_IDENTITY = identityOf(COMPILE_IMAGE, PLATFORM)

/** throws unless the local image of `ref` is its digest (and `platform`'s architecture); `ask` is docker's inspect, replaceable */
export async function checkCompileImage(ref = COMPILE_IMAGE, platform = PLATFORM, ask = args => run('docker', args)) {
  const digest = ref.slice(ref.indexOf('@') + 1)
  let info
  try {
    info = JSON.parse((await ask(['image', 'inspect', '--format', '{{json .}}', ref])).stdout)
  } catch (e) {
    throw new Error(`the compile image ${ref} is not on this machine (docker image inspect: ${String(e?.stderr ?? e?.message ?? e).trim().split('\n')[0]}); the lab never pulls it in a compile`)
  }
  const digests = (info.RepoDigests ?? []).map(d => d.slice(d.indexOf('@') + 1))
  if (!digests.includes(digest)) throw new Error(`the local ${ref.slice(0, ref.indexOf('@'))} is ${digests.join(', ') || 'untagged'}, not ${digest}`)
  const arch = platform.length ? platform[1].split('/')[1] : null
  if (arch && info.Architecture !== arch) throw new Error(`the local ${ref} is ${info.Architecture}, not ${arch} (COMPILE_PLATFORM)`)
  return info
}
