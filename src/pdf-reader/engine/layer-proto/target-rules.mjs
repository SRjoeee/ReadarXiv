// src/pdf-reader/engine/layer-proto/target-rules.mjs
// The instant layer's choices for a target, made in one place. v0 sets a translation by choices that differ by target:
// its fit's parameters (layer2.mjs defaultParams), the leading relative to the original's pitch and adaptive fill (D),
// which floats take the target's names and what those are (caption-names.mjs), the hyphenation patterns it loads, and the
// CJK family it draws in (font-roles.mjs). Each was decided where it was used; here the run asks for all of them at its
// open, by one call, so that a rule set read as data (the next engine plan, "rules as data") replaces this module's body
// alone and no reader ever decides one. Until then the choices are the built-in ones, unchanged: the set's schema 1,
// version 1. Not every target-dependent branch is here yet: those inside the fit and the breaking (layer2.mjs, Korean's
// and the alphabets' breaking at spaces, Traditional Chinese's centred punctuation, a German word's patterns, the CJK
// class) move with the rule set, field by field
import { captionNames } from '../caption-names.mjs'
import { cjkFacesOf } from '../font-roles.mjs'
import { defaultParams } from './layer2.mjs'

/** the built-in rules' identity: what a rule set loaded as data names itself by, its schema and its version */
export const BUILTIN_RULES = Object.freeze({ schema: 1, version: 1 })

/**
 * Every choice v0 makes for `target`, built in: `params`, the fit's (defaultParams', with the leading on the original's
 * own pitch, leadRel false, the maintainer's ruling on S3-11 of 2026-10-07, and adaptive fill on, D, his choice on S3-12
 * the same day); `labels`, the target's names of a figure and a table (null: none, each label kept as the original's);
 * `patterns`, the hyphenation patterns to load (English's for every target's Latin words, and German's and Russian's for
 * those targets); `cjkFaces`, the script's CJK family, its Kai and the designs it is light beside (null: none). A fresh
 * object each call: a run may change its own
 */
export function rulesFor(target) {
  return {
    schema: BUILTIN_RULES.schema,
    version: BUILTIN_RULES.version,
    target,
    params: { ...defaultParams(target), leadRel: false, adaptiveFill: { band: 0.05, track: 0.05, size: 1.1 } },
    labels: captionNames(target),
    patterns: ['en', ...(target === 'de' ? ['de'] : []), ...(target === 'ru' ? ['ru'] : [])],
    cjkFaces: cjkFacesOf(target),
  }
}
