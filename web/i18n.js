// 界面文案。改文案只动这里，不要在 app.js 里硬编码中文。
export const messages = {
  zh: {
    title: 'BADSC · 本地卡组转换',
    langAria: '切换语言',
    heading: '卡组与分享码，双向转换。',
    intro: '上传 .dek 获取分享码，或粘贴完整分享码还原 .dek。全部处理在浏览器内完成。',
    inputTitle: '输入',
    dropStrong: '拖入 .dek 文件',
    dropOr: '或',
    chooseFile: '选择 .dek 文件',
    maxSize: '最大 1 MB',
    orPaste: '或粘贴分享码',
    codeLabel: '完整分享码',
    codePlaceholder: '卡组名-内容码',
    decodeButton: '确定并还原 .dek',
    resultTitle: '转换结果',
    basicInfo: '基本信息',
    overviewEmpty: '转换后，卡组信息将在这里显示。',
    country: '阵营 ID',
    spec1: '专精 1 ID',
    spec2: '专精 2 ID',
    cardCount: '卡片数',
    outputTitle: '输出内容',
    outputEmpty: '上传文件后可复制分享码；输入分享码后可下载 .dek。',
    generatedLabel: '生成的完整分享码',
    copyButton: '复制分享码',
    restored: '已还原',
    downloadButton: '下载 .dek 文件',
    footnote: '仅显示卡组基本信息，不判断游戏版本兼容性。',

    statusIdle: '等待输入',
    convertingUpload: '正在读取并生成分享码…',
    convertingCode: '正在校验并还原卡组…',
    codeReady: '分享码已生成，可以复制。',
    deckReady: '卡组已还原，可以下载 .dek 文件。',
    codeCopied: '分享码已复制。',
    copyFailed: '复制失败，已选中分享码，请手动复制。',
    codeEdited: '分享码已修改，点击确定开始转换。',
    failRetry: '转换失败，请检查输入后重试。',
    failNoOverview: '本次转换没有生成卡组信息。',
    errPickDek: '请选择 .dek 文件。',
    errTooLarge: '.dek 文件不能超过 1 MB。',
    errEmptyCode: '请先粘贴完整分享码。',
    errSyntax: '卡组内容格式无效，无法读取基本信息。',
    errGeneric: '转换失败，请检查输入后重试。',
    fromUpload: '来自 .dek',
    fromCode: '来自分享码',
    charCount: (n) => `${n} 字符`,
    fallbackName: 'BADSC-还原卡组',
  },
  en: {
    title: 'BADSC · Local Deck Converter',
    langAria: 'Switch language',
    heading: 'Deck files and share codes, both ways.',
    intro: 'Upload a .dek file to get a share code, or paste a full share code to restore the .dek. Everything runs in your browser.',
    inputTitle: 'Input',
    dropStrong: 'Drop a .dek file',
    dropOr: 'or',
    chooseFile: 'Choose .dek file',
    maxSize: 'Up to 1 MB',
    orPaste: 'or paste a share code',
    codeLabel: 'Full share code',
    codePlaceholder: 'Deck name-content code',
    decodeButton: 'Restore .dek',
    resultTitle: 'Result',
    basicInfo: 'Deck info',
    overviewEmpty: 'Deck info will appear here after conversion.',
    country: 'Faction ID',
    spec1: 'Spec 1 ID',
    spec2: 'Spec 2 ID',
    cardCount: 'Cards',
    outputTitle: 'Output',
    outputEmpty: 'Upload a file to copy a share code; paste a share code to download the .dek.',
    generatedLabel: 'Generated full share code',
    copyButton: 'Copy share code',
    restored: 'Restored',
    downloadButton: 'Download .dek',
    footnote: 'Only basic deck info is shown; game-version compatibility is not checked.',

    statusIdle: 'Waiting for input',
    convertingUpload: 'Reading file and generating share code…',
    convertingCode: 'Verifying and restoring deck…',
    codeReady: 'Share code generated. You can copy it now.',
    deckReady: 'Deck restored. You can download the .dek file.',
    codeCopied: 'Share code copied.',
    copyFailed: 'Copy failed. The share code is selected—please copy it manually.',
    codeEdited: 'Share code changed. Click restore to convert.',
    failRetry: 'Conversion failed. Check your input and try again.',
    failNoOverview: 'No deck info was produced by this conversion.',
    errPickDek: 'Please choose a .dek file.',
    errTooLarge: '.dek files must be 1 MB or smaller.',
    errEmptyCode: 'Paste a full share code first.',
    errSyntax: 'Deck content format is invalid; basic info cannot be read.',
    errGeneric: 'Conversion failed. Check your input and try again.',
    fromUpload: 'from .dek',
    fromCode: 'from share code',
    charCount: (n) => `${n} chars`,
    fallbackName: 'BADSC-restored-deck',
  },
};

export const LANGS = ['zh', 'en'];
const STORAGE_KEY = 'badsc-lang';

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* 隐私模式下 localStorage 可能不可用 */ }
  return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function persistLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch { /* 忽略写入失败 */ }
}
