// Documents of our server's for the reader's tests, whole as format's PaperDoc states them (packages/format/src/doc.ts): a test
// names what it is about, the rest is a document's own (a prepare not started, no layer, no target's run), so that a document
// a test hands the reader is one our server could write.
import type { PaperDoc } from '@readarxiv/format'

type Prepare = PaperDoc['prepare']
type Layer = NonNullable<PaperDoc['layer']>
export type Run = NonNullable<PaperDoc['targets'][string]>

export const prepareOf = (o: Partial<Prepare> = {}): Prepare => ({
  attempt: 1,
  state: 'none',
  why: null,
  retryAt: null,
  at: 0,
  build: null,
  stage: null,
  units: [],
  html: null,
  ...o,
})
export const layerOf = (o: Pick<Layer, 'catalog'> & Partial<Layer>): Layer => ({
  units: [],
  format: 1,
  build: 'test',
  stale: false,
  ...o,
})
export const runOf = (o: Partial<Run> = {}): Run => ({
  attempt: 1,
  state: 'none',
  why: null,
  retryAt: null,
  at: 0,
  translator: '0e2e00000000',
  units: null,
  rows: [],
  done: 0,
  total: 0,
  view: 1,
  ...o,
})
export const paperDoc = (o: Partial<PaperDoc> = {}): PaperDoc => ({
  v: 1,
  pv: '2600_00001v1',
  epoch: 'e1',
  rev: 1,
  paper: '2600.00001',
  version: 1,
  prepare: prepareOf(),
  layer: null,
  targets: {},
  ...o,
})
