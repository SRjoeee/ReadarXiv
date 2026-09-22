// What the reader prototype takes from the extension for figure text, from the extension's own source: OCR lines to
// translation boxes (DESIGN §15.1) and the image overlay with its material (§15.2, §15.5). Built by spikes/build-shared.mjs.
export { isTranslatable, linesToBoxes } from '@/core/image/boxes'
export { renderImage, setImageModes } from '@/core/renderer/image'
