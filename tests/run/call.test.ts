import { describe, expect, it } from 'vitest'
import { textOf, textUnit, translateCall } from '@/core/run/call'

// The one envelope a session's requests go out in (DESIGN §8.0): the text run's batches, the image labels, the title, as
// units of the chain (stage 4b)

const BASE = { target: 'cmn', scope: 's1', context: { paperTitle: 'A Paper', abstract: 'About things.' } }
const UNITS = [textUnit('b1', 'Hello.')]

describe('translateCall', () => {
  it("carries the session's target and scope, and the units", () => {
    expect(translateCall(BASE, UNITS)).toEqual({ units: UNITS, target: 'cmn', context: BASE.context, scope: 's1' })
  })

  it("reads the units under their heading — for an image, its caption — on top of the paper's context", () => {
    const call = translateCall(BASE, UNITS, { sectionTitle: '3 Method' })
    expect(call.context).toEqual({ ...BASE.context, sectionTitle: '3 Method' })
    // The session's context is not written to
    expect(BASE.context).toEqual({ paperTitle: 'A Paper', abstract: 'About things.' })
  })

  it('leaves an empty context out, whichever way it is empty: it enters the store key of a translator that reads it', () => {
    expect(translateCall({ target: 'cmn' }, UNITS).context).toBeUndefined()
    expect(translateCall({ target: 'cmn', context: {} }, UNITS).context).toBeUndefined()
    // A heading alone is a context
    expect(translateCall({ target: 'cmn', context: {} }, UNITS, { sectionTitle: 'Figure 1' }).context).toEqual({ sectionTitle: 'Figure 1' })
  })

  it('names no scope where there is none', () => {
    expect(translateCall({ target: 'cmn' }, UNITS)).not.toHaveProperty('scope')
  })

  it('a text with no placeholder is a unit of one text piece, and its translation text again', () => {
    expect(textUnit('t', 'A & B')).toEqual({ id: 't', content: [{ t: 'text', s: 'A & B' }] })
    expect(textOf([{ t: 'text', s: 'one ' }, { t: 'el' }, { t: 'text', s: 'two' }])).toBe('one two')
  })
})
