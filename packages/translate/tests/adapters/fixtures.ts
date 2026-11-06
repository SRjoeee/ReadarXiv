// The adapters' fixture units and recorded replies. The replies marked "as it came" are Microsoft's, quoted from the
// repository's own tests (tests/pdf-reader/mt-wire.test.ts, the comparison of 2026-10-05 over 2610.02069 and of
// 2026-10-07 over 1706.03762; readarxiv-web worker/tests/mt.test.ts's reading table); none is fetched here.
import type { UnitIn } from '../../src/contract.ts'
import { el, span, t, unit } from '../pieces.ts'

export const UNITS: UnitIn[] = [
  /* 0 */ unit('plain', [t('We study the problem. It is hard.')], true),
  /* 1 */ unit(
    'inline',
    [
      t('Let '),
      el('m1', 'math'),
      t(' be as in '),
      el('c1', 'cite'),
      t('. See Section '),
      el('r1', 'ref'),
      t(' for more.'),
    ],
    true,
  ),
  /* 2 */ unit('styled', [
    span('b', 'bold', [t('Bold words')]),
    t(' and '),
    span('l', 'link', [t('a link '), span('i', 'italic', [t('inside')])], true),
    t(' end.'),
  ]),
  /* 3 */ unit('display', [t('We have'), el('d1', 'display', '.'), t(' Then we go on.')], true),
  /* 4 */ unit('adjacent', [
    t('Values '),
    el('a', 'math'),
    t(' '),
    el('b', 'math'),
    t(', and '),
    el('c', 'cite'),
    el('d', 'cite'),
    t(' hold.'),
  ]),
  /* 5 */ unit('whole', [span('e', 'bold', [t('Whole bold heading')])]),
  /* 6 */ unit('label', [span('lab', 'label', [t('Setup:')], true), t(' we train the model for 3 epochs.')], true),
  /* 7 */ unit('specials', [t('a < b & c > d @ home # 95'), el('p', 'other'), t(' accuracy.')]),
  /* 8 */ unit('group', [t('A link around a formula: '), span('g', 'link', [el('gm', 'math')], true), t(' done.')]),
  /* 9 */ unit('note', [t('Words'), el('f', 'note-mark'), t('. More words follow here.')], true),
  // the units of Microsoft's recorded replies, as typed pieces
  /* 10 */ unit('ninio', [
    t('It matters on seasonal timescales'),
    el('a', 'cite'),
    t(', alters the jet stream'),
    el('b', 'cite'),
    t(' and the surface'),
    el('c', 'cite'),
    t(', as the quasi-biennial oscillation and El Ni'),
    el('d', 'other'),
    t('o southern oscillations do.'),
  ]),
  /* 11 */ unit('threshold', [
    t('We use the 30 km zonal wind threshold:'),
    el('d', 'display'),
    t(' thresholds'),
    el('u', 'math'),
    t(' hold.'),
  ]),
  /* 12 */ unit('rmse', [t('We can quantify the forecast skill of the emulator using the RMSE: '), el('d', 'display')]),
  /* 13 */ unit('model', [t('The model '), el('a', 'math'), t(' reads.')]),
  /* 14 */ unit('auto', [
    t('At each step the model is auto-regressive'),
    el('a', 'cite'),
    t(', consuming the previously generated symbols.'),
  ]),
  /* 15 */ unit('percent', [t('We reach 95'), el('p', 'other'), t(' accuracy.')]),
  /* 16 */ unit('times', [t('a 3'), el('x', 'math'), t('10 speed-up')]),
]

/** Microsoft's raw replies (as the adapter keeps them: the item's text, with its sentence lengths where given) */
const ms = (text: string, src?: number[], tr?: number[]) => JSON.stringify(src && tr ? { text, src, tr } : { text })
export const MICROSOFT_REPLIES: { unit: number; raw: string; taken: boolean; why?: string }[] = [
  {
    unit: 10,
    raw: ms(
      '尤其是在亚季节到季节性的时间尺度@a#中，改变对流层喷射气流@b#，并可能引发地表@c#持续的极端寒爆发（如准两年振荡和El Ni @d##）等。',
    ),
    taken: true,
    why: '`@d##`, as it came',
  },
  {
    unit: 11,
    raw: ms('30kmのゾーン風の閾値を用います:@a# # 閾値@b#は成り立ちます。'),
    taken: true,
    why: '`@a# #`, as it came',
  },
  {
    unit: 12,
    raw: ms('我们可以用RMSE（@a）量化模拟器的预测技能：#'),
    taken: true,
    why: 'a bare marker, its `#` at the end, as it came',
  },
  { unit: 13, raw: ms('模型@a读。'), taken: true, why: 'a bare marker before a Han character (web reading table)' },
  {
    unit: 14,
    raw: ms('各ステップでモデルは自己回帰的 @a#(#)となり、以前に生成されたシンボルを消費します。'),
    taken: true,
    why: '`@a#(#)`, as it came',
  },
  { unit: 15, raw: ms('我们达到了 95 @a# 的准确率。'), taken: true, why: 'the space beside a digit taken back' },
  { unit: 16, raw: ms('3 @a# 10 倍的加速'), taken: true, why: 'the space before a digit taken back' },
  { unit: 13, raw: ms('模型 @a# @a# 读。'), taken: false, why: 'a marker doubled' },
  { unit: 13, raw: ms('模型读。'), taken: false, why: 'a marker lost' },
  { unit: 13, raw: ms('模型 @a# @c# 读。'), taken: false, why: 'a marker the unit lacks' },
  { unit: 13, raw: ms('@a#'), taken: false, why: 'every letter lost' },
  { unit: 13, raw: '{"text":"模型 @a# 读', taken: false, why: 'a JSON string cut halfway' },
  {
    unit: 2,
    raw: ms('粗体字和一个链接 @a#@b# 结束。'),
    taken: true,
    why: "the link came back empty: refilled with the words after it, to its sentence's end",
  },
  {
    unit: 2,
    raw: ms('粗体字和@a#一个链接@b#结束。'),
    taken: true,
    why: 'the link kept, the bold and the italic lost (not `must`)',
  },
  { unit: 2, raw: ms('粗体字和@b#一个链接@a#结束。'), taken: false, why: "the link's two markers reversed" },
  {
    unit: 3,
    raw: ms('我们有 @a#。然后我们继续。', [9, 15], [7, 6]),
    taken: true,
    why: "the reply's stop after a display's own taken off",
  },
  { unit: 6, raw: ms('@a#设置：@b#我们训练模型3个轮次。'), taken: true, why: 'a run-in label kept' },
  { unit: 6, raw: ms('设置：我们训练模型3个轮次。'), taken: false, why: 'a run-in label lost' },
  { unit: 5, raw: ms('完整的粗体标题'), taken: true, why: 'a span around the whole unit, on no wire' },
  { unit: 8, raw: ms('围绕公式的链接：@a#完成。'), taken: true, why: 'a link with no text, one marker' },
]

/** Google's raw replies (the translated item as it came back) */
export const GOOGLE_REPLIES: { unit: number; raw: string; taken: boolean; why?: string }[] = [
  { unit: 0, raw: '我们研究这个问题。<x id="1"/>这很难。', taken: true, why: 'a boundary marker back in place' },
  {
    unit: 0,
    raw: '我们研究这个问题。这很难。',
    taken: true,
    why: 'the boundary marker lost: no sentences, the translation stays',
  },
  { unit: 1, raw: '设<x id="1"/>如<x id="2"/>所述。<x id="4"/>更多内容见第<x id="3"/>节。', taken: true },
  {
    unit: 1,
    raw: '设<x id=\'1\' />如<x id=2/>所述。更多内容见第<x id="3"></x>节。',
    taken: true,
    why: 'the tolerated spellings of a tag',
  },
  {
    unit: 1,
    raw: '设< x id="1"/>如<x id="2"/>所述。更多内容见第<x id="3"/>节。',
    taken: false,
    why: 'a tag torn apart: the element lost',
  },
  {
    unit: 1,
    raw: '设<x id="1"/>如<x id="2"/><x id="2"/>所述。见第<x id="3"/>节。',
    taken: false,
    why: 'an element doubled',
  },
  { unit: 2, raw: '<t id="1">粗体字</t>和<t id="2">一个链接<t id="3">里面</t></t>结束。', taken: true },
  {
    unit: 2,
    raw: '粗体字和<t id="2">一个链接里面</t>结束。',
    taken: true,
    why: 'the bold and the italic lost (not `must`): unstyled',
  },
  { unit: 2, raw: '<t id="1">粗体字</t>和一个链接里面结束。', taken: false, why: 'the link lost' },
  { unit: 2, raw: '<t id="1">粗体字</t>和<t id="2">链接</t></t>结束。', taken: false, why: 'a close with no open' },
  { unit: 4, raw: '数值<x id="1"/> <x id="2"/>，以及<x id="3"/><x id="4"/>成立。', taken: true },
  { unit: 7, raw: 'a &lt; b &amp; c &gt; d @ 家 # 95<x id="1"/>准确率。', taken: true, why: 'entities read back' },
  {
    unit: 7,
    raw: 'a < b &#1114112; c<x id="1"/>​准确率。',
    taken: true,
    why: 'a bare `<`, an entity past U+10FFFF kept, a zero width space dropped',
  },
  { unit: 8, raw: '围绕公式的链接：<x id="1"/>完成。', taken: true },
]
