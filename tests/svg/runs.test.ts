import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isTranslatable } from '@/core/image'
import { looksLikeCode, runsOf } from '@/core/svg'

const FIXTURE_DIR = join(import.meta.dirname, '../fixtures/svg')
const svgOf = (name: string) =>
  new DOMParser().parseFromString(readFileSync(join(FIXTURE_DIR, name), 'utf8'), 'image/svg+xml').documentElement

/** Everything the two fixtures produce that gets past `isTranslatable`, split by what it is. */
const PROSE = [
  'closure',
  'dense',
  'wall time per epoch [ms]',
  'No sanitization forwidth',
  'Pythonto C',
  'Python',
]

const CODE = [
  '1   iflog_counting == 8:',
  '2       self.cms = cmsc.CMS_Log8(width=self.width, depth=self.depth)',
  '1   staticint',
  '2   CMS_VARIANT(_init)(CMS_TYPE*self, PyObject*args, PyObject*kwds){',
  'staticchar*kwlist[] = {"width", "depth", NULL};',
  'uint32_tw;',
  'if(!PyArg_ParseTupleAndKeywords(args, kwds, "II", kwlist,',
  '&w, &self->depth)) {',
  'return-1;}',
  'if(self->depth  < 1 || self->depth > 32) {',
  'char* msg = "Depth must be in the range 1-16";',
  'PyErr_SetString(PyExc_ValueError, msg);}',
  'shortinthash_length = -1;',
  'while(0 != w)',
  'hash_length++, w >>= 1;',
  'if(hash_length < 0)',
  'hash_length = 0;',
  'self->width = 1 << hash_length;',
  'self->hash_mask = self->width -1;',
  'HyperLogLog_init(&self->hll, 16);',
  'self->table = (CMS_CELL_TYPE**) malloc(self->depth * ',
  'sizeof(CMS_CELL_TYPE*));',
  'inti;',
  'for(i = 0; i < self->depth; i++){',
  'self->table[i] = (CMS_CELL_TYPE*)calloc(self->width, ',
  'sizeof(CMS_CELL_TYPE));}',
  'return0;}',
]

describe('what to translate in a figure (#121)', () => {
  it('keeps every label the fixtures draw', () => {
    // `wall time per epoch [ms]` is the one that matters: its brackets are a unit, so the brace
    // rule must not count `[]`
    expect(PROSE.filter(looksLikeCode)).toEqual([])
  })

  it('rejects every source line the fixtures draw', () => {
    expect(CODE.filter(t => !looksLikeCode(t))).toEqual([])
  })

  it('the two lists are exactly what the fixtures produce, nothing invented', () => {
    // Otherwise the corpus above could drift away from the figures it claims to describe and the
    // two tests would go on passing against a fiction
    const seen: string[] = []
    for (const name of ['2609.03768-fig_closure.svg', '2608.29808-bounter-case.svg']) {
      for (const run of runsOf(svgOf(name))) if (isTranslatable(run.text)) seen.push(run.text)
    }
    expect([...seen].sort()).toEqual([...PROSE, ...CODE].sort())
  })

  it('leaves labels whose parenthesis is a unit, not a call', () => {
    // Every one of these is a real legend from the corpus that an earlier "the bracket touches the
    // name, so it is a call" rule rejected. Measured over 428 translatable runs, that rule was the
    // only thing rejecting 11 of them and every one was a label (Codex on #134). It was also
    // catching nothing the other rules missed.
    for (const text of [
      'LZwindow55–270keV(oneevent)',
      'sideband350–590keV(empty)',
      'conservativesolarceiling(thermalized)',
      'nominalsolarceiling(coolingcomputed)',
      'nominalsolarceiling(δ=341keV)',
      'fullZcoupling,excluded(δ=364keV)',
      '270–350keV(nopublishedcounts)',
      'ΓN/log(N)',
      '/dy(×2)',
      'Time(s)',
      'Accuracy(%)',
    ]) {
      expect([text, looksLikeCode(text)]).toEqual([text, false])
    }
  })

  it('leaves prose that merely mentions punctuation alone', () => {
    for (const text of ['Energy (GeV)', 'Accuracy [%]', 'Fig. 3: results', 'p < 0.05', 'x-axis, log scale', 'Time (s) vs. depth']) {
      expect([text, looksLikeCode(text)]).toEqual([text, false])
    }
  })

  it('a sentence that names one identifier is a sentence: the four titles of 2607.24653v2\'s roofline figure were left in English for an `sm_89` and a `train_gpt` (reader\'s report)', () => {
    for (const text of [
      'MiniTriton CUDA-core roofline — NVIDIA L20 (sm_89), fp32',
      'MiniTriton tensor-core roofline — NVIDIA L20 (sm_89)',
      'train_gpt convergence — minitriton vs torch eager',
      'train_gpt fp32 — single GPU vs DDP ×2',
    ]) {
      expect([text, looksLikeCode(text)]).toEqual([text, false])
    }
  })

  it('an identifier on its own, or outnumbering the words beside it, is still code: the same figure\'s legend', () => {
    for (const text of ['flash_attn', 'solve_tril', 'gpt50m_step', 'return hash_length', 'if(hash_length < 0)']) {
      expect([text, looksLikeCode(text)]).toEqual([text, true])
    }
    // A snake-case name being called is code however many words follow: the arguments are words too
    expect(looksLikeCode('if(!PyArg_ParseTupleAndKeywords(args, kwds, "II", kwlist,')).toBe(true)
  })

  it('what a string literal holds is what the program says, not what the run is: the words in it do not make a line of code a sentence (Codex and Devin on #274)', () => {
    for (const text of [
      'status_message = "unable to load model"',
      "status_message = 'unable to load model'",
      'print(f"unable to load {model_name} right now")',
    ]) {
      expect([text, looksLikeCode(text)]).toEqual([text, true])
    }
    // Nor do the words of what a name is assigned: a line that opens with an identifier and an equals sign is a statement
    expect(looksLikeCode('status_message = await response.text()')).toBe(true)
    expect(looksLikeCode('total_loss += criterion(outputs, labels) * weight')).toBe(true)
    // — opens with: a sentence may state a setting (`==` is an operator already)
    expect(looksLikeCode('trained with batch_size = 32 and the default schedule')).toBe(false)
    // Nor the words of a comment at the line's end: the run is the code before it
    expect(looksLikeCode('return result_value  # use the cached result when available')).toBe(true)
    expect(looksLikeCode('flush(out_buf) // nothing else holds the lock at this point')).toBe(true)
    // — a marker set off by space on both sides: inside a word it is the label's own (`# of`, a URL)
    expect(looksLikeCode('share of train_gpt runs solved (# of 50), see https://example.org/a_b for the rest')).toBe(false)
    // A label may quote a name, and an apostrophe is no quotation mark
    for (const text of ['the "train_gpt" run converges faster than before', 'Kimi\'s train_gpt loss, per step']) {
      expect([text, looksLikeCode(text)]).toEqual([text, false])
    }
  })

  it('catches code that has no punctuation of its own', () => {
    // `int i;` with the space dropped, and a listing gutter that merged into its line
    expect(looksLikeCode('inti;')).toBe(true)
    expect(looksLikeCode('1   staticint')).toBe(true)
  })
})
