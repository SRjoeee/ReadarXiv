// Simplified Chinese: the project's first set of interface copy, and the type every other pack is checked against
// (a pack must have its shape; one missing key does not compile).
// The voice is the product's, not a conversation's: a state is a noun, a button a verb, and an error says what
// happened and what to do. The copy ids are those of docs/UI.md §3. Comments here are for developers and are in
// English like the rest of the code; only the strings are Chinese.
import type { ProviderErrorKind } from '@/providers/types'
import { PREVIEW_SOURCE, PREVIEW_TARGET } from './preview'

/** What the settings page says about a field the schema refused (config/schema.ts, config/appearance.ts, config/services.ts) */
const FIELD: Record<string, string> = {
  provider: '不是有效的翻译服务',
  glossary: '术语表总长超过上限，会显著增加每次请求的 token',
  color: '不是有效的颜色值',
  css: '只填声明，不写选择器和花括号',
  baseURL: '不是有效的地址',
  apiKey: 'API Key 不合法',
  model: '模型名不能为空',
  name: '名称长度不合法',
}

const S = {
  brand: 'Read arXiv', // S-P-01
  settings: '设置', // S-P-02, and the button on every note
  notArxiv: '打开 arXiv 论文的 HTML 页面后即可翻译', // S-P-03
  rows: {
    service: '翻译服务', // S-P-10
    language: '目标语言', // S-P-20
    prompt: '提示词', // S-P-47
    highlight: '对照高亮', // S-P-80
    highlightTitle: '悬停时高亮对应句子；仅译文模式下停留可查看原文', // S-P-81
    images: '图片翻译', // S-P-85
    style: '译文样式', // S-P-82; the same name as “Reading · Translation style” in the settings: the two are one thing
    manageStyles: '管理译文样式…', // S-P-83: the last row of the style menu, opening the settings at “Reading”
  },
  service: {
    microsoft: 'Microsoft 翻译',
    google: 'Google 翻译',
    llm: 'LLM',
    chrome: 'Chrome 翻译',
    free: '免费', // S-P-44
    chrome_ready: '浏览器内置，无需联网', // S-P-46
    llm_noKey: '尚未配置 API Key', // S-P-45: the LLM item's hint until a key is set
    microsoft_unsupported: '不支持当前目标语言',
    chrome_download: '下载', // S-P-40
    chrome_downloading: '语言包下载中', // S-P-41
    chrome_unavailable: '当前不可用', // S-P-42 / S-P-43
    manage: '管理翻译服务…', // S-P-48: the last row of the menu, opens the settings page
  },
  menu: {
    searchLanguages: '搜索语言', // S-P-22
    noMatch: '没有匹配的语言', // S-P-23
  },
  note: {
    // S-P-30: {service put aside}: {reason}. The page now runs on {service in use}
    replaced: (from: string, reason: string, to: string) => `${from}：${reason}。本页已改用 ${to}`,
    // S-P-31: {why the chosen service cannot run}, this time {service} will be used
    willFallback: (why: string, to: string) => `${why}，本次将使用 ${to}`,
    // S-P-32: the chosen service cannot run and nothing takes over; the reason alone
    cannotRun: (why: string) => why,
    llmNoKey: 'LLM 尚未配置 API Key',
    chromeNoPack: 'Chrome 翻译的语言包尚未下载',
    chromeDownloading: 'Chrome 翻译的语言包下载中，约需 1 分钟',
    microsoftUnsupported: 'Microsoft 翻译不支持当前目标语言',
    serviceGone: '选中的翻译服务已被删除，请重新选择', // S-P-32d
    paused: (reason: string) => `${reason}。请检查设置后重新翻译`, // S-P-33
    imagesPaused: (reason: string) => `图片翻译已暂停：${reason}`, // S-P-35
    noHtml: 'arXiv 没有这篇论文的 HTML 版本，无法翻译',
  },
  /** The guided install on the settings page (S-O-30…36). The popup keeps the one-line version above */
  // an abstract or PDF page's two entries, the reader's to choose (S-P-50b; the reader's design, §2, §15)
  entry: { html: 'HTML 翻译', pdf: 'PDF 翻译' },
  primary: {
    translate: '翻译本页', // S-P-50
    restore: '显示原文', // S-P-51 / S-P-53
    retranslate: '重新翻译', // S-P-52
  },
  failed: {
    text: (n: number) => `${n} 处翻译失败`, // S-P-60
    retry: '重试', // S-P-61
  },
  mode: {
    stack: '上下', // S-P-70; the order is MODE_ORDER's
    side: '左右',
    only: '仅译文',
    stackTitle: '译文紧跟在原文下方', // S-P-71
    sideTitle: '原文与译文并排；窗口较窄时按上下显示', // S-P-72
    onlyTitle: '隐藏原文，参考文献仍保留双语', // S-P-73
    narrow: '窗口较窄，暂按上下显示', // S-P-74
    stackPdf: 'PDF 对照不支持上下排列', // S-P-75: the popup while the PDF reader is open
  },
  actionFailed: (message: string) => message, // S-P-90
  /** The popup action found no active tab to talk to (shared/messages.ts throws NoActiveTabError) */
  noActiveTab: '没有活动标签页',
  /** A change the store refused because the saved settings cannot be read (config/storage.ts ConfigUnreadableError); S-O-02 is where the reader acts */
  settingsUnreadable: '设置读取失败，更改未保存，请到设置页处理',
  /** The text inside the paper page (S-I) and the context menu, from the same pack as the popup */
  page: {
    retry: '重试', // S-I-02
    menuToggle: '翻译本页 / 显示原文', // the context menu (issue #146)
    alreadyOn: '翻译已开启，滚动会继续翻',
    sessionOver: '这次翻译已经停止',
    notPaper: '不是 arXiv HTML 页面',
    nothingToTranslate: '这一页没有可翻译的内容',
    abstractLink: (brand: string) => `双语版本（${brand}）`, // the entry on the abstract page (issue #146)
    /** The floating button on arXiv's pages (UI.md S-I-06); the corner controls' wording follows Read Frog's, whose they are */
    floating: {
      panel: '控制面板',
      options: '悬浮按钮选项',
      lock: '锁定位置',
      unlock: '解锁位置',
      hideForNow: '本次隐藏',
      hideAlways: '不再显示',
    },
    viewer: { open: '放大查看', zoomIn: '放大', zoomOut: '缩小', close: '关闭' },
    backendSilent: '扩展后台没有响应',
    backendSilentWith: (detail: string) => `扩展后台没有响应：${detail}`,
    noService: '未配置 API key，请先到设置页填写',
  },
} as const

const O = {
  title: '设置',
  nav: { services: '翻译服务', reading: '阅读', 'pdf-reader': 'PDF 阅读器', prompts: '提示词与术语', data: '数据' },
  /** S-O-05: the interface language. Not the target language, so it sits under the navigation, away from it */
  uiLanguage: '界面语言',
  uiLanguageAuto: '跟随浏览器',
  /** The second half of the notice shown when the settings cannot be read (config/storage.ts reports the cause, not a sentence) */
  fallbackWhy: {
    tooNew: (stored: number, supported: number) => `存储里的配置是 v${stored}，这个版本只认到 v${supported}（可能装过更新的版本）`,
    upgradeFailed: (stored: number, supported: number) => `存储里的配置是 v${stored}，升级到 v${supported} 时出错。之后的版本或许仍能读出；重置会覆盖它们`,
    invalid: (where: string, message: string) => (where ? `${where}：${message}` : message),
    /** The sentence for a field the schema refused, by the field's name; the zod message itself is the diagnostic */
    field: FIELD,
    unknown: '未知原因',
  },
  fallbackNotice: '设置读取失败，当前使用默认设置；已保存的 API Key 与服务选择均未生效。原设置保留未动，重置后可重新填写。',
  fallbackReset: '重置设置',
  fallbackResetConfirm: '确认重置',
  fallbackResetFailed: '重置没有成功，请再试一次',
  services: {
    /** One validation failure of the drawer's form, and what joins several, in this language's punctuation */
    issue: (field: string, message: string) => `${field}：${FIELD[String(field).split('.').pop() ?? ''] ?? `不合法（${message}）`}`,
    issueSeparator: '；',
    builtIn: '内置服务',
    mine: '我的服务',
    empty: '还没有添加服务。添加后即可使用 LLM 翻译。',
    add: '添加服务',
    edit: '编辑',
    imagesHint: '译文叠在图上，鼠标悬停查看原文',
    imageModes: '在这些模式下显示图片译文',
    imageModesHint: '只影响显示：切到没勾的模式时叠加层隐藏，切回来再显示，不重新识别',
    autoFallback: '出问题时自动改用免费服务',
    autoFallbackHint: 'API Key 失效、额度用尽或断网时，翻译不会停下',
    name: '名称',
    namePlaceholder: '例如 DeepSeek V4 Flash',
    baseURL: '接口地址',
    baseURLHint: 'OpenRouter、DeepSeek、Ollama 等 OpenAI 兼容接口',
    apiKey: 'API Key',
    apiKeyClear: '清除',
    apiKeyLocalHint: '本机地址可以不填',
    model: '模型',
    more: '更多选项',
    thinking: '深度思考',
    thinkingHint: '翻译不需要推理，开启会明显变慢',
    /** Asking for access to the endpoint's address failed (entrypoints/options/permissions.ts reports which way) */
    permission: {
      badURL: '接口地址不合法',
      denied: (origin: string) => `没有拿到访问 ${origin} 的权限，浏览器的弹窗里需要点「允许」`,
    },
    connect: '连接',
    connecting: '连接中…',
    connected: (ms: number) => `已连接 · ${ms} ms`,
    delete: '删除',
    deleteConfirm: '确认删除',
    cancel: '取消',
    newTitle: '添加服务',
    editTitle: '编辑服务',
  },
  reading: {
    newProfile: '新配置',
    styles: '译文样式',
    stylesHint: '选中的样式立即生效',
    highlights: '背景高亮',
    highlightsHint: '悬停时用来标出对应句子的底色',
    add: '添加配置',
    reset: '重置',
    resetHint: '把内置配置恢复原样，自己添加的保留',
    editTitle: '编辑配置',
    editAria: (name: string) => `编辑配置：${name}`,
    name: '名称',
    color: '文字颜色',
    bandColor: '底色',
    followText: '跟随原文',
    custom: '自定义',
    opacity: '透明度',
    underline: '下划线',
    underlines: { none: '无', solid: '实线', dotted: '点线', dashed: '虚线', wavy: '波浪' },
    thickness: '线宽',
    blur: '悬停前模糊',
    blurHint: '译文先糊着，鼠标停上去才清晰，适合自测',
    advanced: '高级',
    advancedHint: '只填声明，不写选择器和花括号；字体与字号仍随论文',
    /** The four ways advanced CSS is refused (core/renderer/style-values.ts reports which) */
    advancedRejected: {
      closeBrace: '不要写右花括号：这里只填声明，选择器由扩展补上',
      openBrace: '不要写左花括号：这里只填声明，选择器由扩展补上',
      atRule: '不支持 @ 规则',
      angle: '不能包含 <',
    },
    duplicate: '复制一份',
    /** What a copy is called: the shown name + this suffix (duplicateStyle in config/appearance.ts) */
    copySuffix: '副本',
    delete: '删除',
    done: '完成',
    preloadRange: '提前翻译的范围',
    preloadRangeHint: '屏幕下方多远的段落先翻；越近越省费用，整篇则一开始就全部请求',
    preloadStops: ['一屏', '两屏', '三屏', '整篇'],
    openIn: '译文在哪里打开',
    openInHint: '从论文的摘要页或 PDF 打开时，译文是这篇论文的 HTML 版本',
    openInStops: ['新标签页', '当前标签页'],
    floatingEntry: '显示悬浮按钮',
    floatingEntryHint: '在 arXiv 的摘要页、PDF 和论文全文页贴在窗口边缘：翻译、控制面板、设置',
    threshold: '开始翻译的时机',
    thresholdHint: '段落露出多少才开始翻',
    thresholdStops: ['刚露出', '露出一半', '完全露出'],
    /** The names of the profiles shipped with the extension (`BUILT_IN_STYLES` / `BUILT_IN_HIGHLIGHTS`): they are ours,
     *  not the reader's writing, so they follow the interface language; once the reader renames one, the reader's name shows */
    builtInStyles: { follow: '与原文相同', green: '绿色', blue: '蓝色', amber: '琥珀', muted: '淡一档', blur: '模糊' },
    builtInHighlights: { 'soft-green': '柔和绿', sand: '淡黄', sky: '淡蓝' },
    preview: '预览',
    previewSource: PREVIEW_SOURCE,
    previewTarget: PREVIEW_TARGET,
  },
  prompts: {
    /** Prompt management (S-O-6x): the built-in one, the reader's own, and variable buttons that insert at the caret */
    manager: {
      view: '查看',
      viewTitle: '查看内置提示词',
      copy: '复制并自定义',
      /** What a copy of the built-in prompt is called (the same thing as the appearance profiles' copySuffix; each language keeps its own punctuation) */
      copyOf: (name: string) => `${name}（副本）`,
      copyTitle: '复制并自定义',
      custom: '自定义',
      edit: '编辑',
      editTitle: '编辑提示词',
      remove: '删除',
      removeConfirm: '确认删除',
      create: '新建',
      createTitle: '新建提示词',
      /** The two ways importing a prompt file fails (providers/prompt-file.ts reports which) */
      importFailed: {
        notJson: '这个文件不是合法的 JSON',
        badShape: '文件格式不对：应是 [{ "name", "systemPrompt", "prompt" }] 这样的数组，name 与 prompt 必填',
      },
      importFile: '导入 JSON',
      exportMine: '导出自定义',
      imported: (n: number) => `已导入 ${n} 条`,
      saved: '已保存',
      added: '已加入列表',
      addToList: '加入列表',
      close: '关闭',
      cancel: '取消',
      nameEmpty: '名称不能为空',
      promptEmpty: '用户提示词不能为空',
      systemPrompt: 'System prompt（收发协议会自动追加在它后面，改不掉）',
      userPrompt: '用户提示词',
      name: '名称',
      insert: '插入变量：',
      /** The descriptions of the two prompts shipped with the extension, by id */
      builtIn: {
        default: '通用学术翻译：术语用既定译法，人名、期刊名、代码与链接保留原文',
        'precision-rewrite': '"翻译即改写"：摆脱原文句法、消除翻译腔，按目标语言的表达习惯重写，术语与格式照旧',
      },
      tokens: {
        targetLanguage: '目标语言的英文名',
        input: '待翻译的 JSON 段落（用户消息里必须有）',
        paperTitle: '论文标题',
        abstract: '论文摘要',
        sectionTitle: '当前章节标题',
        glossary: '术语表',
      },
    },
    title: '提示词', glossaryTooBig: '术语表太长，超出上限后没有保存；请减少条目或缩短内容', glossary: '术语表', glossaryHint: '每行「原文, 译文」，让同一篇里的译法一致', glossaryCount: (n: number) => `${n} 条`, onlyLlm: '只对 LLM 服务生效',
    /** The glossary's line-by-line problems (providers/glossary.ts reports which) */
    glossaryIssue: {
      /** The whole sentence is the pack's to assemble: punctuation is part of a language, and the Chinese sentence is not built the way "Line 1: ..." is */
      noSeparator: (n: number) => `第 ${n} 行缺少分隔符，应写成「原文, 译文」`,
      emptySource: (n: number) => `第 ${n} 行原文为空`,
      emptyTarget: (n: number) => `第 ${n} 行译文为空`,
    },
    glossaryPlaceholder: 'token, 词元\nembedding, 嵌入' },
  close: '关闭',
  /** S-O-55: the PDF reader's section; its other rows are the reader's own words (R) */
  pdfReader: { enabled: '在 arXiv 的 PDF 上使用对照阅读器' },
  data: {
    cache: '已缓存的译文',
    cacheHint: '换了服务、模型或提示词会自动分开存，通常不用清',
    cacheLine: (entries: number, mb: string) => `${entries} 条 · ${mb} MB`,
    cacheError: '没能读取缓存',
    pdf: '已缓存的 PDF 译文', // S-O-73
    pdfLine: (papers: number, mb: string) => `${papers} 篇 · ${mb} MB`,
    clear: '清空',
    clearConfirm: '确认清空',
    cleared: '已清空',
    diagnostics: '诊断日志',
    diagnosticsHint: '最近几百条运行记录：请求失败、服务切换、页面事件。不含 API 密钥与论文正文，可随问题反馈一并附上',
    diagnosticsExport: '导出',
    diagnosticsError: '没能导出',
  },
} as const

/**
 * The PDF reader's words (the reader's design §15; docs/UI.md §3.5, S-R). Where the popup says the same thing the
 * reader takes the popup's string (S), so the two never drift apart: the service and language rows, the language
 * search, 对照高亮, 图片翻译, 设置, the failures' count and 重试, the reasons
 */
const R = {
  bar: '阅读器', // S-R-01: the toolbar's name, for screen readers
  contents: '目录', // S-R-02
  abstract: '在 arXiv 打开摘要页', // S-R-03
  display: { name: '显示', original: '原文', bilingual: '对照', translation: '译文' }, // S-R-04
  swap: '交换左右', // S-R-05
  sync: '同步滚动', // S-R-06
  zoom: { out: '缩小', in: '放大', value: '缩放比例', width: '适合宽度', page: '适合页面', actual: '实际大小' }, // S-R-07
  options: { name: '阅读选项', color: '高亮颜色', appearance: '外观', light: '浅色', dark: '深色', system: '跟随系统', dim: '深色时调暗页面' }, // S-R-08
  download: { name: '下载', translation: '译文 PDF', original: '原文 PDF' }, // S-R-09
  leave: '在默认查看器中打开', // S-R-10
  pill: { original: '原文页码', translation: '译文页码', previous: '上一页', next: '下一页' }, // S-R-11
  status: {
    loading: '正在加载', // S-R-12
    translating: '正在翻译',
    again: '正在按当前设置重新翻译',
    close: '关闭', // S-R-15: a notice's close button
    unsupported: (language: string) => `PDF 对照暂不支持${language}`, // S-R-13
    chooseLanguage: '选择语言',
    narrow: '窗口较窄，暂只显示译文', // S-R-14, after S-P-74
  },
}

const REASON: Record<ProviderErrorKind, string> = {
  'no-key': '尚未配置 API Key',
  auth: 'API Key 无效或已过期',
  'rate-limit': '请求过于频繁，稍后自动重试',
  timeout: '翻译超时',
  network: '网络连接失败',
  'bad-request': '翻译服务拒绝了请求',
  'invalid-response': '译文格式无效',
  unknown: '翻译失败',
  aborted: '',
}
export const zh = { S, O, R, REASON } as const
