import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { closureOf, portedInClosure, trackedFiles } from '../../scripts/check-boundary.mjs'

describe('the licence of what a reader loads', () => {
  const tracked: string[] = trackedFiles()
  const code = (f: string) => /\.(?:[cm]?[jt]sx?)$/.test(f) && !/\.d\.[cm]?ts$/.test(f)
  /** the shared interface: the reader's chrome (its controller's fold among it, model.ts) and the control kit */
  const shared = tracked.filter(f => /^(?:packages\/reader\/src\/chrome|packages\/ui\/src)\//.test(f) && code(f))

  // What section 19.3 says the web carries with the engine and the shared interface is so, and the registry holds its rows

  // The brief held the shared interface to the same empty closure, and it holds now: the four GPL-ported files it reached (the
  // language table, the configuration's prompt library and the providers' retry policy by the controller, Microsoft's by the
  // service menu) went with the chrome's move into packages/reader, its words the host's (parts.tsx) and the service menu the
  // extension's slot (src/pdf-reader/host/slots.tsx). The closure reaches nothing of the extension at all
  it('keeps the closure of packages/reader/src/chrome/** and packages/ui/src/** free of any ported file, and of the extension', () => {
    expect(shared.length).toBeGreaterThan(30)
    expect(portedInClosure(shared)).toEqual([])
    expect([...closureOf(shared)].filter((f: string) => f.startsWith('src/'))).toEqual([])
  })
})

// The front half moved from the engine into packages/engine: each old path re-exports its module through a transition path of
// the package (`@readarxiv/engine/today/<folder>/<file>`), a hole in the package's wall that only the old engine and the lab
// may use, until the cut-over deletes both

