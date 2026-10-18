// lab/pdf/layer-lab/notes.mjs
// The lab's notes are kept a moment after the last key press. What is kept is what was typed and for which fixture, taken when
// it was typed: the page reads neither the fixture nor the text box when the moment is up, by which time a fixture may have
// been opened and the box filled with another's note. A note still waiting when the page moves to another fixture, is
// exported or is closed is kept at once (`flush`).

/**
 * @param o.save   told (fixture, text) when a note is to be kept
 * @param o.delay  how long a note rests after the last key press, in milliseconds
 */
export function createNoteSaver({ save, delay = 400 }) {
  let timer = null
  let pending = null
  function flush() {
    clearTimeout(timer)
    timer = null
    if (!pending) return
    const { fixture, text } = pending
    pending = null
    save(fixture, text)
  }
  return {
    /** a note typed for a fixture (a note waiting for another fixture is kept first) */
    type(fixture, text) {
      if (pending && pending.fixture !== fixture) flush()
      pending = { fixture, text }
      clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    flush,
  }
}
