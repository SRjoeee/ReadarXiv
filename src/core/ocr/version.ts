/**
 * The model and the pipeline that produced a result: part of the OCR cache key (DESIGN §15.2), so it changes with the
 * model files (public/ocr), with `esearch-ocr`'s version, and with anything in recognise.ts that changes what a figure
 * is read as. **A module of its own**: the background computes cache keys from it and must not load the recogniser to
 * learn a string — imported from recognise.ts it brought the library into the service worker's bundle (measured)
 */
export const OCR_VERSION = 'ppocr-v6-tiny.1'
