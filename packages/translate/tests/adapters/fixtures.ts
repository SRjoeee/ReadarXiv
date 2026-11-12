// The adapters' fixture units and recorded replies. The replies marked "as it came" are Microsoft's, quoted from the
// repository's own tests (tests/pdf-reader/mt-wire.test.ts, the comparison of 2026-10-05 over 2610.02069 and of
// 2026-10-07 over 1706.03762; readarxiv-web worker/tests/mt.test.ts's reading table); none is fetched here.
import type { UnitIn } from '../../src/contract.ts'
import { el, quiet, span, t, unit } from '../pieces.ts'

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

/** 1810.04805v2's units as staging's bundle holds them (2026-11-08; ids the source reader's, `src` not on any wire): a group
 *  whose head is a declaration TeX holds for the rest of the group (`{\bf \bert}`, `{\em all}`), a span that is not `must` */
export const BERT_ABSTRACT: UnitIn = unit('bert-abstract', [
  t('We introduce a new language representation model called '),
  span('1', 'other', [el('2', 'other'), t(' '), el('4', 'macro')]),
  t(', which stands for '),
  span('7', 'bold', [t('B')]),
  t('idirectional '),
  span('11', 'bold', [t('E')]),
  t('ncoder '),
  span('15', 'bold', [t('R')]),
  t('epresentations from '),
  span('19', 'bold', [t('T')]),
  t('ransformers. Unlike recent language representation models'),
  el('23', 'other'),
  el('24', 'cite'),
  t(',  '),
  el('26', 'macro'),
  t(
    ' is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers. As a result, the pre-trained BERT model can be fine-tuned with just one additional output layer to create state-of-the-art models for a wide range of tasks, such as question answering and language inference, without substantial task-specific architecture modifications. ',
  ),
])
export const BERT_STRATEGIES: UnitIn = unit('bert-strategies', [
  t('\nThere are two existing strategies for applying pre-trained language representations to downstream tasks: '),
  span('1', 'other', [el('2', 'other'), t(' feature-based')]),
  t(' and '),
  span('6', 'other', [el('7', 'other'), t(' fine-tuning')]),
  t('. The feature-based approach, such as ELMo'),
  el('11', 'other'),
  el('12', 'cite'),
  t(
    ', uses task-specific architectures that include the pre-trained representations as additional features. The fine-tuning approach, such as the Generative Pre-trained Transformer (OpenAI GPT)',
  ),
  el('14', 'other'),
  el('15', 'cite'),
  t(', introduces minimal task-specific parameters, and is trained on the downstream tasks by simply fine-tuning '),
  span('17', 'other', [el('18', 'other'), t(' all')]),
  t(
    ' pre-trained parameters. The two approaches share the same objective function during pre-training, where they use unidirectional language models to learn general language representations.',
  ),
])
/** Microsoft's replies to them, as staging stored them: the raw text rebuilt from the stored rows, which today's reading of it
 *  gives back byte for byte */
export const BERT_ABSTRACT_REPLY = JSON.stringify({
  text: '我们引入了一个名为@a#的新语言表示模型，代表Transformers的双向编码器表示。与近期的语言表示模型@b#不同，@c#设计为通过在所有层中对左右上下文联合条件，预训练无标签文本的深度双向表示。因此，预训练的BERT模型只需增加一层输出即可微调，创建适用于多种任务（如问答和语言推理）的先进模型，而无需对任务特定的架构进行重大修改。',
})
export const BERT_STRATEGIES_REPLY = JSON.stringify({
  text: '目前已有两种策略将预训练语言表示应用于下游任务：@a# 基于特征和 @b# 微调。基于特征的方法，如ELMo @c#，使用任务专用架构，将预训练表示作为附加功能。微调方法，如生成预训练变换器（OpenAI GPT）@d#，引入任务特定参数极少，下游任务则通过微调@e#所有预训练参数进行训练。这两种方法在预训练阶段共享相同的目标函数，即使用单向语言模型学习一般语言表示。',
})
/** Microsoft's fixture units: the shared ones and the units only its wire reads differently */
/** a display inside a group inside a span's head (a group holding a display, `{\small $$ x = y. $$}`): the head's last
 *  element is the display, whose own stop and boundary its marker carries */
export const NESTED_DISPLAY: UnitIn[] = [
  unit('nested-stop', [
    t('We have'),
    span('s', 'other', [span('n', 'other', [el('d', 'display', '.')]), t(' Then we go on.')]),
  ]),
  unit('nested-ends', [
    t('We have '),
    span('s', 'other', [span('n', 'other', [el('d', 'display')])]),
    t(' '),
    el('m', 'math'),
    t(' that holds.'),
  ]),
  unit('nested-must', [
    t('We have'),
    span('g', 'link', [span('n', 'other', [el('d', 'display', '.')])], true),
    t(' Then we go on.'),
  ]),
  // (a display, then another element, before the span's first word: the head's marker ends at the display)
  unit('head-display-ref', [
    t('We have'),
    span('s', 'other', [el('d', 'display', '.'), t(' '), el('r', 'ref'), t(' Then we go on.')]),
  ]),
]
/** a run-in label after a forced break that ends no sentence (1810.04805v2 p8's shape, words of our own): the break states the
 *  line it ends (`stop` a line end, the source reader's run-in rule), inside a stretch of side-by-side elements; the second
 *  label begins after a full stop, and its break states nothing */
export const LABEL_AFTER_BREAK: UnitIn = unit(
  'label-after-break',
  [
    t('We compare two settings as follows:\n'),
    el('v', 'other'),
    t('\n'),
    el('b', 'other', '\n'),
    t('\n'),
    el('n', 'other'),
    span('h', 'bold', [t('No XYZ')], true),
    t(': A model trained without the XYZ task. '),
    el('b2', 'other'),
    t('\n'),
    el('n2', 'other'),
    span('h2', 'bold', [t('Only XYZ')], true),
    t(': A model trained with it alone.'),
  ],
  true,
)
/** elements inside words (2608.25210v2 p5's `str\_s`): an escaped character and a formula between two letters, which the
 *  word holds; a tie between two names, TeX's space, which it does not (the source reader types it `other`) */
export const INSIDE_WORDS: UnitIn = unit('inside-words', [
  t('The column str'),
  el('u', 'macro'),
  t('s holds Ni'),
  el('f', 'math'),
  t('B, by Jane'),
  el('tie', 'other'),
  t('Doe.'),
])
/** elements that set nothing (`silent`, the source reader's from TeX's tables: a key written to a file, a discretionary hyphen,
 *  `\noindent`, a declaration at a group's head), words of our own: on no wire, each back at the front of its innermost kept
 *  group where nothing of it went out before, else at its end; one beside an element that sets something rides in its marker */
export const SILENT: UnitIn = unit(
  'silent',
  [
    quiet('lab'),
    t('\nWe train an exam'),
    quiet('hy'),
    t('ple model'),
    el('c', 'cite'),
    quiet('k'),
    t(' on '),
    span('g', 'colour', [quiet('bf'), t(' every')]),
    t(' word, '),
    quiet('n'),
    t('then stop.'),
  ],
  true,
)
/** a kept span whose head sets nothing (`\textbf{\boldmath Setup:}`): back after its open */
export const SILENT_LABEL: UnitIn = unit('silent-label', [
  span('h', 'bold', [quiet('bm'), t('Setup:')], true),
  t(' we train it.'),
])
/** a span around all the rest but an element that sets nothing beside it (a cell's `\hline` before its `\multicolumn`): the
 *  span goes around the translation, the element outside it where it stands */
export const SILENT_AROUND: UnitIn = unit('silent-around', [
  quiet('hl'),
  t('\n'),
  span('m', 'other', [t('Method')]),
  t(' '),
])
/** run-in heads a paper's macro sets (2608.25210v2's `\topic{…}`, `{\bf #1.}`, words of our own): a kept span TeX ends with a
 *  stop of its own, which its source does not write (`stop`, the source reader's), written at the span's end on the wire; a
 *  span on no wire with one, written after its words */
export const HEAD_STOP: UnitIn = unit(
  'head-stop',
  [
    { t: 'span', id: 'h', style: 'bold', must: true, stop: '.', content: [t('Current methods are not reliable')] },
    t('  \nTo infer the source, one could rank sentences. We call it '),
    { t: 'span', id: 'f', style: 'bold', stop: '.', content: [t('verifiable sources')] },
    t(' Then we go on.'),
  ],
  true,
)
/** displays that state no stop of their own (the owner's report of 2026-11-09 on 2609.33403v1 §4.2, words of our own): TeX set
 *  the first at its sentence's end, the next sentence beginning after it ("… as: [display] The next …"), the second inside its
 *  sentence, which goes on after it ("… tuple: [display] where …") */
export const DISPLAY_ENDS: UnitIn = unit(
  'display-ends',
  [
    t('Each part is formalized as: '),
    el('d1', 'display'),
    t(' The next field is a list of effects, formalized as a tuple: '),
    el('d2', 'display'),
    t(' where kind is its kind.'),
  ],
  true,
)
/** a unit as the PDF's source reader states it, words of our own: its TeX source's own line ends, which TeX reads as spaces,
 *  and a citation that opens a sentence after a stop, its verb after it (the tags wire's cutter, lane fig-cut 2026-11-10: a
 *  line end cut a sentence, and the citation was read as the sentence before's) */
export const SOURCE_LINES: UnitIn = unit(
  'source-lines',
  [
    t('Sampling remains\ncomputationally expensive. '),
    el('c', 'cite'),
    t(' proposes a one-step\nsampler. Then we go on.'),
  ],
  true,
)
/** an element glued to the words of a style pair after it, and one glued to a style pair's words before it (the tags reading
 *  takes the reply's white space back past the wire's own pair tags: text.ts glueOf) */
export const GLUED_PAST: UnitIn = unit('glued-past', [
  t('Set to ('),
  el('a', 'math'),
  span('s', 'italic', [t('A34')]),
  t(') and '),
  span('w', 'italic', [t('word')]),
  el('b', 'math'),
  t(' rest.'),
])
/** an element glued after another element's own stop (the reply's space before that stop is the glued element's to take back
 *  once the stop is out: text.ts glueOf) */
export const OWN_GLUED: UnitIn = unit('own-glued', [t('Values '), el('a', 'math', '.'), el('b', 'math'), t(' hold.')])
export const MICROSOFT_UNITS: UnitIn[] = [
  ...UNITS,
  /* 17 */ BERT_ABSTRACT,
  /* 18 */ BERT_STRATEGIES,
  /* 19, 20, 21, 22 */ ...NESTED_DISPLAY,
  /* 23 */ LABEL_AFTER_BREAK,
  /* 24 */ INSIDE_WORDS,
  /* 25, 26, 27 */ SILENT,
  SILENT_LABEL,
  SILENT_AROUND,
  /* 28 */ HEAD_STOP,
  /* 29 */ DISPLAY_ENDS,
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
  { unit: 17, raw: BERT_ABSTRACT_REPLY, taken: true, why: '`{\\bf \\bert}`, a group of no word, as it came' },
  {
    unit: 18,
    raw: BERT_STRATEGIES_REPLY,
    taken: true,
    why: '`{\\em all}`: a declaration at a group’s head, as it came',
  },
  {
    unit: 23,
    raw: ms(
      '我们比较以下两种设置：@a#\n@b# 无 XYZ @c#：一个未经 XYZ 任务训练的模型。@d#@e# 仅 XYZ @f#：一个仅用它训练的模型。',
      [49, 47, 49],
      [21, 28, 23],
    ),
    taken: true,
    why: "the line end after the break's marker kept and taken back, as Microsoft gave it on 2026-11-09 (words ours)",
  },
  { unit: 24, raw: ms('列 str@a#s 包含 Ni@a#B，作者 Jane @c# Doe。'), taken: false, why: 'a marker doubled' },
  {
    unit: 24,
    raw: ms('列 str@a#s 包含 Ni@b#B，作者 Jane @c# Doe。'),
    taken: true,
    why: 'the words holding an element back as they went, as Microsoft gave `str@a#s` on 2026-11-09',
  },
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
  {
    unit: 10,
    raw: '它在季节性时间尺度 <x id="1"/>上很重要，改变了急流 <x id="2"/>和地表 <x id="3"/>，正如准两年振荡和厄尔尼<x id="4"/>奥南方涛动那样。',
    taken: true,
    why: 'a space the reply sets before an element the source glued to its word: taken back (text.ts glueOf)',
  },
  {
    unit: 1,
    raw: '设<span id="1" translate="no">x1</span>如<span id="2" translate="no"></span>所述。x2<x id="4"/>更多内容见第<span id="3" translate="no">x3</span>节。',
    taken: false,
    why: 'an element emptied, its token left behind as text: the wire’s contract broken (tags.ts tokenOf)',
  },
  {
    unit: 4,
    raw: '数值<x id="1"/> <x id="2"/>，以及<x id="3"/><x id="4"/>成立（x7）。',
    taken: false,
    why: 'a string of the tokens’ form the text does not hold: the wire’s contract broken (tags.ts TOKEN_FORM)',
  },
  {
    unit: 20,
    raw: '设为（<x id="1"/><t id="2"> A34</t>）和<t id="3">单词 </t><x id="4"/> 其余。',
    taken: true,
    why: 'the white space beside a glued element taken back past the wire’s own pair tags (text.ts glueOf)',
  },
  {
    unit: 21,
    raw: '数值<x id="1"/> 。<x id="2"/> 成立。',
    taken: true,
    why: 'an element glued after another’s own stop: the stop out, then the space before it taken back (text.ts glueOf)',
  },
]
