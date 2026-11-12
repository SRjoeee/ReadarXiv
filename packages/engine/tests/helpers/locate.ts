// locate as the package's tests call it: the source's, its ownership's check (Located.disagreements, locate/ownership.ts)
// required to find nothing but what is carried (a glyph today's figure text made of a printed line lists and does not own,
// written through `takeAsStated` until that fault's fix). Everything else locate.ts exports, as it exports it. A case whose
// finding is a fault of its own content calls the source's locate until the fault's fix, and says so.
import { expect } from 'vitest'
import { locate as locateOf } from '../../src/locate/locate.ts'

export * from '../../src/locate/locate.ts'

export function locate(...args: Parameters<typeof locateOf>): ReturnType<typeof locateOf> {
  const located = locateOf(...args)
  expect(
    located.disagreements.filter((d) => !d.carried),
    'the ownership check: no disagreement but the carried',
  ).toEqual([])
  return located
}
