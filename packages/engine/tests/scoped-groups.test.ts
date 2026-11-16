import { describe, expect, it } from 'vitest'
import { passThroughOf } from '../src/instrument/instrument.ts'

// A bare group is a group only where it scopes a declaration (F9 (c)): LaTeX's declarations of a font, a size, a paragraph's
// shape or its line breaking, and \color, which last to the group's end. A placeholder that sets nothing and scopes nothing — a
// \relax, a \nobreak, a \protect, a discretionary hyphen — gives the group nothing to carry: TeX sets `{\relax Ch}ristoffel`,
// `{.\nobreak\kern0.3333em}` and `{Bu\-ce\-ta}` as it sets their content with no group, and the group, kept, cut its words for
// the wire (2610.21377v1's 176 initials). The group is written as its content (passThroughOf), as a group with no placeholder
// of that kind was already

type P = { t: string; s?: string; src?: string; id?: number }
const open = (id: number): P => ({ t: 'open', src: '{', id })
const close = (id: number): P => ({ t: 'close', src: '}', id })
const text = (s: string): P => ({ t: 'text', s })
const ph = (src: string): P => ({ t: 'ph', src })
const through = (pieces: P[]) => [...passThroughOf(pieces as never)].sort((a, b) => a - b)

describe('a bare group is kept only for a declaration it scopes (F9 (c))', () => {
  it('a group that scopes a size, a face or a colour: kept, as today', () => {
    expect(through([open(1), ph('\\small'), text('all'), close(1), text(' of it.')])).toEqual([])
    expect(through([open(1), ph('\\bfseries'), text('all'), close(1), text(' of it.')])).toEqual([])
    expect(through([open(1), ph('\\color{red}'), text('all'), close(1), text(' of it.')])).toEqual([])
  })
  it('a group whose placeholders set nothing and scope nothing: its content', () => {
    expect(through([text('the '), open(1), ph('\\relax'), text(' Ch'), close(1), text('ristoffel symbols')])).toEqual([
      1, 4,
    ])
    expect(
      through([text('A'), open(1), text('.'), ph('\\nobreak'), ph('\\kern0.3333em'), close(1), text('B. Writer')]),
    ).toEqual([1, 5])
    expect(
      through([text('J. '), open(1), text('Bu'), ph('\\-'), text('ce'), ph('\\-'), text('ta'), close(1), text(' and')]),
    ).toEqual([1, 7])
  })
  it('a group whose only content is an element: its content, as today', () => {
    expect(through([text('the value '), open(1), ph('$x^2$'), close(1), text(' holds')])).toEqual([1, 3])
  })
  it('a declaration inside a group of its own scopes nothing for the outer group: the outer one is its content', () => {
    expect(through([open(1), open(2), ph('\\em'), text('Bold'), close(2), text(' rest'), close(1)])).toEqual([0, 6])
  })
})
