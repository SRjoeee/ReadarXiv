// How the reader is being worked, pointer or keyboard, for its focus rings (better-accessibility: the ring is the
// keyboard's; the maintainer, 2026-09-26). The browser's :focus-visible is right for every control but a text field,
// which it rings after a press too, since typing follows: the page's field and the language menu's search, ringed on a
// click, with the menu's first option beside them. `data-axt-pointer` on <html> marks the pointer's turn, from a press
// until a key that moves or acts (typing is left to it); reader.css takes those rings off while it is there
const KEYBOARD = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape'])

export function trackModality(doc: Document = document): () => void {
  const root = doc.documentElement
  const onPointer = () => root.setAttribute('data-axt-pointer', '')
  const onKey = (e: KeyboardEvent) => { if (KEYBOARD.has(e.key)) root.removeAttribute('data-axt-pointer') }
  doc.addEventListener('pointerdown', onPointer, true)
  doc.addEventListener('keydown', onKey, true)
  return () => {
    doc.removeEventListener('pointerdown', onPointer, true)
    doc.removeEventListener('keydown', onKey, true)
    root.removeAttribute('data-axt-pointer')
  }
}
