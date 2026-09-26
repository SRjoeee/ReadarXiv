// A radio group's keys (the reader's design, §13), for the display switch and the appearance: the arrows move the
// choice to the next one that can be had, wrapping, and the focus goes with it; only the chosen radio is in the tab order.
// And a radio's mark (the redesign's design, §6.2, §8; Part 3): 16 px, a 1.5 px ring of ink-3, ink when chosen, its dot
// growing from the centre (controls.css .radio) — the direct child of the element that is the radio (a row with
// role="radio" and aria-checked), whose state the sheet reads through it. Here, not in a Radio.tsx beside this file: on
// a case-insensitive disk `./Radio` and `./radio` are one import
import { createElement, type KeyboardEvent } from 'react'

export function radioKeys<T>(values: readonly T[], value: T, can: (v: T) => boolean, choose: (v: T) => void, focus: (index: number) => void) {
  return (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    let i = values.indexOf(value)
    for (let k = 0; k < values.length; k++) {
      i = (i + step + values.length) % values.length
      if (can(values[i] as T)) { choose(values[i] as T); focus(i); return }
    }
  }
}

export function Radio() {
  return createElement('span', { 'aria-hidden': 'true', className: 'radio' })
}
