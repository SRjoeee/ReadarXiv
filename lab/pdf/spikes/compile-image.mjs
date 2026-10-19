// lab/pdf/spikes/compile-image.mjs
// The one place the lab's Docker compiles name their image, and the identity every compile cache key carries. A compile kept by
// what it compiles (layout-make.mjs, layer-fixtures.mjs, layout-paper-check.mjs, layout-marks-gate.mjs) is the same bytes only
// on the same TeX Live: two images give two LaTeX releases, two amsmath, two formats, and the files alone cannot tell them apart.
//
//   COMPILE_IMAGE     a full image reference with a digest (name[:tag]@sha256:<64 hex>); default: the `texlive` of the year's
//                     entry of lab/pdf/compile-images.json, which the web container and the gate packs are pinned to
//   COMPILE_YEAR      the TeX Live year whose pinned image a compile uses (2023); default: the pins' `default` (2025). An image
//                     named by COMPILE_IMAGE is taken over it
//   COMPILE_PLATFORM  docker's --platform (linux/amd64 to emulate on an arm64 host); default: unset, the host's
//   NATIVE_TEX=1      the compile is made by this machine's TeX Live through lab/pdf/spikes/native-tex/ (a `docker` stand-in first
//                     on PATH), not by an image: no image is checked and the identity is `native`, so that such a compile never
//                     answers a cache key of an image, nor an image's a native one
//
// The identity (`COMPILE_IDENTITY`) is the digest, and the platform where one is asked: it goes into every cache key, so that a
// cache of another image simply misses. `checkCompileImage()` refuses to run unless the local image of that reference is that
// digest (and that platform), before any compile is made or any cache read.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PINS = new URL('../compile-images.json', import.meta.url)
const REF = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/

/** the image reference a compile uses: `env.COMPILE_IMAGE`, else the texlive of `year`'s pin (`env.COMPILE_YEAR`, else the pins'
 *  default); throws unless it names a digest, or where no image is pinned for the year */
export function compileImageRef(env = process.env, year = env.COMPILE_YEAR || null, pins = PINS) {
  let ref = env.COMPILE_IMAGE
  if (!ref) {
    const j = JSON.parse(readFileSync(pins, 'utf8'))
    const y = year === null || year === undefined || year === '' ? j?.default : String(year)
    if (!j?.images || !Object.hasOwn(j.images, y)) throw new Error(`no compile image is pinned for TeX Live ${y} (COMPILE_YEAR, lab/pdf/compile-images.json)`)
    ref = j.images[y]?.texlive
  }
  if (typeof ref !== 'string' || !REF.test(ref)) throw new Error(`the compile image must be name[:tag]@sha256:<digest>, not ${JSON.stringify(ref)} (COMPILE_IMAGE, lab/pdf/compile-images.json)`)
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
/** the identity of a run: `native` under NATIVE_TEX=1, else the image's */
export function compileIdentity(env = process.env, ref = compileImageRef(env), platform = platformArgs(env)) {
  return env.NATIVE_TEX === '1' ? 'native' : identityOf(ref, platform)
}
/** the image a `--image` option names: a full reference with a digest (a tag names whatever it points to today, and a cache keyed by it
 *  would answer for another image after a retag), else the default of the run */
export function imageFromArg(value, env = process.env) {
  if (value === null || value === undefined) return compileImageRef(env)
  if (!REF.test(value)) throw new Error(`--image ${JSON.stringify(value)}: give the image by digest, name[:tag]@sha256:<digest>; a tag is not an identity`)
  return value
}

export const COMPILE_IMAGE = compileImageRef()
export const PLATFORM = platformArgs()
export const COMPILE_IDENTITY = compileIdentity(process.env, COMPILE_IMAGE, PLATFORM)

/** the image's content id for a cache key: `native` under NATIVE_TEX=1 (no image to inspect), else the id docker gives the image
 *  `ref` on `platform` */
export async function imageIdOf(ref = COMPILE_IMAGE, platform = PLATFORM, ask = args => run('docker', args), env = process.env) {
  if (env.NATIVE_TEX === '1') return 'native'
  return (await ask(['image', 'inspect', ...platform, ref, '--format', '{{.Id}}'])).stdout.trim()
}

/** throws unless the local image of `ref` is its digest (and `platform`'s architecture); `ask` is docker's inspect, replaceable */
export async function checkCompileImage(ref = COMPILE_IMAGE, platform = PLATFORM, ask = args => run('docker', args), env = process.env) {
  // (a native compile has no image to check)
  if (env.NATIVE_TEX === '1') return {}
  const digest = ref.slice(ref.indexOf('@') + 1)
  let info
  try {
    info = JSON.parse((await ask(['image', 'inspect', ...platform, '--format', '{{json .}}', ref])).stdout)
  } catch (e) {
    throw new Error(`the compile image ${ref} is not on this machine (docker image inspect: ${String(e?.stderr ?? e?.message ?? e).trim().split('\n')[0]}); the lab never pulls it in a compile; for a compile by this machine's TeX Live through native-tex/, set NATIVE_TEX=1`)
  }
  const digests = (info.RepoDigests ?? []).map(d => d.slice(d.indexOf('@') + 1))
  if (!digests.includes(digest)) throw new Error(`the local ${ref.slice(0, ref.indexOf('@'))} is ${digests.join(', ') || 'untagged'}, not ${digest}`)
  const arch = platform.length ? platform[1].split('/')[1] : null
  if (arch && info.Architecture !== arch) throw new Error(`the local ${ref} is ${info.Architecture}, not ${arch} (COMPILE_PLATFORM)`)
  return info
}
