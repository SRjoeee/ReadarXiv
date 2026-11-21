// The sentence every appearance preview is drawn on — the settings tiles, the editor's preview and
// the popup's style menu. One sentence, so a reader comparing two of them compares the styles.
// Its own module because every locale imports it and it is not itself translated: the source stays
// English (it is standing in for a paper) and the target stays in the language being previewed.
export const PREVIEW_SOURCE = 'The Fourier transform is bounded.'
export const PREVIEW_TARGET = '傅里叶变换是有界的。'
/** `PREVIEW_TARGET`'s own language, whatever the interface language is set to (UI.md §1, fonts: a CJK text draws in its
 *  element's language's face) */
export const PREVIEW_LANG = 'zh-CN'
