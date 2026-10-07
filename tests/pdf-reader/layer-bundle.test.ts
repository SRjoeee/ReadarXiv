import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PIPELINE_VERSION as LIVE_PIPELINE } from '@/pdf-reader/engine/live.mjs'
import { PDFJS, PIPELINE_VERSION } from '@/pdf-reader/engine/versions.mjs'

// The layer bundle (the layer-only plan §3, A2's E7): one JSON file a paper version, written by the engine where the
// paper is prepared and read by both readers with the engine's one parser, within bounds. Synthetic inputs only: the
// five papers' bundles are checked by spikes/bundle-check.mjs

describe('the versions a bundle names', () => {
  it('PDFJS is the pinned pdfjs-dist, and PIPELINE_VERSION one constant that live.mjs re-exports', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }
    expect(PDFJS).toBe(pkg.dependencies['pdfjs-dist'])
    expect(JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8')).version).toBe(PDFJS)
    expect(PIPELINE_VERSION).toBe('10')
    expect(LIVE_PIPELINE).toBe(PIPELINE_VERSION)
  })
})
