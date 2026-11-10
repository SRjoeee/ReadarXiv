// @vitest-environment node
// The adapter's reading of the wrap's babel-name groups (pipeline/instrument.mjs): a name's occurrence `n<occ>` owns its word's
// glyphs as the name (ROLE.name) and its label `n<occ>.l`, the number TeX set right before it (own.mjs MR 6c), as its label
// (ROLE.label), both of the one unit the name's key makes
import { ROLE } from '@readarxiv/engine'
import { describe, expect, it } from 'vitest'
import { nameGroupOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

describe('a babel name’s groups as the instrument owns them', () => {
  it('reads an occurrence’s word as the name and its number before it as its label, nothing else as a name’s', () => {
    expect(nameGroupOf('n3')).toEqual({ occurrence: 'n3', role: ROLE.name })
    expect(nameGroupOf('n3.l')).toEqual({ occurrence: 'n3', role: ROLE.label })
    expect(nameGroupOf('n3.p')).toBeNull()
    expect(nameGroupOf('u3.l')).toBeNull()
    expect(nameGroupOf(null)).toBeNull()
  })
})
