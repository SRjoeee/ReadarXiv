import { describe, expect, it } from 'vitest'
import { FRAMES_TEX, readStates, STATE_TEX } from '../../src/marks/statements.ts'

describe('TeX’s own statements beside the marks', () => {
  it('brackets a draft frame by points alone, whatever the marks’ state (a running head’s logo too)', () => {
    expect(FRAMES_TEX).toContain('\\axt@point{g\\the\\axt@g a}')
    expect(FRAMES_TEX).toContain('\\axt@point{g\\the\\axt@g b}')
    expect(FRAMES_TEX).toContain('\\axt@point{g\\the\\axt@g t}')
    expect(FRAMES_TEX).not.toContain('\\axtmark')
  })
  it('states the font, the baseline skip and the measure at each mark TeX sets, by a message alone (no node)', () => {
    expect(STATE_TEX).toContain('\\message{^^JAXT-STATE #1 ')
    expect(STATE_TEX).not.toMatch(/\\(?:pdfliteral|special|pdfextension|hbox|kern|hskip|vadjust)/)
  })
  it('reads each mark’s first statement, its 79-column wraps joined, the font’s name last whatever it holds', () => {
    const wrapped = 'AXT-STATE 12s T1/lmr/m/n/10/12.0pt plus 1.0pt/345.0pt/0.0pt/0.0pt/0.0pt/1/0///lmr10 at 10.0pt;'
    const log = [
      'some line',
      wrapped.slice(0, 79),
      wrapped.slice(79),
      'AXT-STATE p3.2a TU/lmr/b/it/9/11.0pt/300.0pt/10.0pt/0.0pt/-5.0pt/-2/2/10.0pt/290.0pt/[lmroman9-bold]:mapping=a/b;',
      'AXT-STATE 12s T1/lmr/m/n/12/14.0pt/345.0pt/0.0pt/0.0pt/0.0pt/1/0///lmr12;',
      'AXT-STATE 4s /////12.0pt/345.0pt/0.0pt/0.0pt/0.0pt/1/0///cmr10;',
    ].join('\n')
    const s = readStates(log)
    expect(s.get('12s')).toEqual({
      font: { encoding: 'T1', family: 'lmr', series: 'm', shape: 'n', size: 10 },
      name: 'lmr10 at 10.0pt',
      baselineskip: 12,
      measure: { hsize: 345, leftskip: 0, rightskip: 0, hangindent: 0, hangafter: 1, parshape: 0 },
    })
    expect(s.get('p3.2a')).toEqual({
      font: { encoding: 'TU', family: 'lmr', series: 'b', shape: 'it', size: 9 },
      name: '[lmroman9-bold]:mapping=a/b',
      baselineskip: 11,
      measure: {
        hsize: 300,
        leftskip: 10,
        rightskip: 0,
        hangindent: -5,
        hangafter: -2,
        parshape: 2,
        indent: 10,
        length: 290,
      },
    })
    // (no NFSS: plain TeX's font alone)
    expect(s.get('4s')?.font).toBeNull()
    expect(s.get('4s')?.name).toBe('cmr10')
  })
})
