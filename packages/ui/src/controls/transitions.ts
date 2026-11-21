// A change of theme without its colours fading one by one (better-ui: suppress transitions on a theme switch): every
// transition but a motion's is off while `change` runs, the new colours resolved under it, and on again two frames
// later. Only `translate` may transition: a thumb's slide is the one motion a change of appearance asks for

/** every transition but `translate` off while `change` runs, the style flushed under the override, restored two frames later */
export function withoutTransitions(doc: Document, change: () => void): void {
  const off = doc.createElement('style')
  off.textContent = '*,*::before,*::after{transition-property:translate !important}'
  doc.head.append(off)
  change()
  // read for its side effect: the style is flushed while the override stands, so no transition starts
  void doc.body.offsetHeight
  requestAnimationFrame(() => requestAnimationFrame(() => off.remove()))
}
