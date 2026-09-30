import { MAX_DEK_BYTES, decodeDek, encodeShareCode, decodeShareCode, parseDeck } from './codec.js';
import { messages, detectLang, persistLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
let lang = detectLang();
let downloadBytes = null;
let downloadName = '';
let conversionId = 0;
// 当前结果状态：语言切换时要原样重绘，而不是清空重来。
let view = { kind: 'empty', deck: null, source: null, code: '', filename: '', error: null, statusKey: 'statusIdle', statusError: false };

/** 取当前语言文案；函数型词条（如字符数）用参数求值。 */
const t = (key, ...args) => {
  const value = messages[lang][key];
  return typeof value === 'function' ? value(...args) : value;
};

function applyStaticText() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('title');
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }
  for (const option of document.querySelectorAll('.lang-option')) {
    option.classList.toggle('is-active', option.dataset.lang === lang);
  }
}

function setStatus(key, isError = false) {
  view.statusKey = key;
  view.statusError = isError;
  $('status').textContent = t(key);
  $('status').classList.toggle('error', isError);
}

function valueText(value) {
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

function resetView() {
  downloadBytes = null;
  downloadName = '';
  view = { kind: 'empty', deck: null, source: null, code: '', filename: '', error: null, statusKey: 'statusIdle', statusError: false };
}

/** 单一渲染入口：所有 DOM 状态都由 view 推导，语言切换复用同一函数。 */
function render() {
  const hasDeck = view.deck !== null;
  $('overview-empty').textContent = view.kind === 'error' ? t('failNoOverview') : t('overviewEmpty');
  $('output-empty').textContent = view.kind === 'error' ? t('failRetry') : t('outputEmpty');
  $('overview-empty').classList.toggle('hidden', hasDeck);
  $('output-empty').classList.toggle('hidden', hasDeck);

  $('overview-content').classList.toggle('hidden', !hasDeck);
  if (hasDeck) {
    $('deck-name').textContent = valueText(view.deck.name);
    $('deck-country').textContent = valueText(view.deck.country);
    $('deck-spec1').textContent = valueText(view.deck.spec1);
    $('deck-spec2').textContent = valueText(view.deck.spec2);
    $('deck-count').textContent = String(view.deck.cards);
    $('source-tag').textContent = view.source === 'upload' ? t('fromUpload') : t('fromCode');
    $('source-tag').classList.remove('hidden');
  } else {
    $('source-tag').classList.add('hidden');
  }

  $('share-section').classList.toggle('hidden', view.kind !== 'code');
  if (view.kind === 'code') {
    $('generated-code').value = view.code;
    $('code-length').textContent = t('charCount', view.code.length);
  }

  $('download-section').classList.toggle('hidden', view.kind !== 'deck');
  if (view.kind === 'deck') $('download-filename').textContent = view.filename;

  $('status').textContent = t(view.statusKey);
  $('status').classList.toggle('error', view.statusError);
}

function countCards(deck) {
  return Object.values(deck.set2).reduce((sum, group) => sum + (Array.isArray(group) ? group.length : 0), 0);
}

function friendlyError(error) {
  if (error instanceof SyntaxError) return 'errSyntax';
  // codec.js 抛出的原始错误是中文文案，英文界面下无法逐句翻译，
  // 因此只认我们自己打的标记，其余统一走通用提示。
  if (error instanceof Error && error.badscKey) return error.badscKey;
  return 'errGeneric';
}

const fail = (key) => Object.assign(new Error(key), { badscKey: key });

async function convertFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.dek')) throw fail('errPickDek');
  if (file.size > MAX_DEK_BYTES) throw fail('errTooLarge');
  const original = new Uint8Array(await file.arrayBuffer());
  const { plain } = await decodeDek(original);
  const deck = parseDeck(plain);
  const code = await encodeShareCode(original);
  return { deck, code, source: 'upload' };
}

async function convertCode() {
  const code = $('code-input').value.trimEnd();
  if (!code.trim()) throw fail('errEmptyCode');
  const { original, plain } = await decodeShareCode(code);
  const deck = parseDeck(plain);
  const filename = String(deck.name || t('fallbackName'))
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) + '.dek';
  return { deck, original, filename, source: 'code' };
}

async function runConversion(source, action) {
  const id = ++conversionId;
  resetView();
  setStatus(source === 'upload' ? 'convertingUpload' : 'convertingCode');
  render();
  try {
    const result = await action();
    if (id !== conversionId) return;
    const deck = { ...result.deck, cards: countCards(result.deck) };
    if (result.source === 'upload') {
      view = { ...view, kind: 'code', deck, source: 'upload', code: result.code, statusKey: 'codeReady' };
    } else {
      downloadBytes = result.original;
      downloadName = result.filename;
      view = { ...view, kind: 'deck', deck, source: 'code', filename: result.filename, statusKey: 'deckReady' };
    }
    render();
  } catch (error) {
    if (id !== conversionId) return;
    resetView();
    view.kind = 'error';
    view.statusKey = friendlyError(error);
    view.statusError = true;
    render();
  }
}

function setLang(next) {
  lang = next;
  persistLang(lang);
  applyStaticText();
  // 保留已有结果，只把文案换成新语言。
  if (view.deck && view.kind !== 'error') view.statusKey = view.kind === 'code' ? 'codeReady' : 'deckReady';
  render();
}

applyStaticText();

const fileInput = $('file-input');
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (file) runConversion('upload', () => convertFile(file));
});
const decode = () => runConversion('code', convertCode);
$('decode-button').addEventListener('click', decode);
$('code-input').addEventListener('input', () => {
  ++conversionId;
  resetView();
  render();
  setStatus('codeEdited');
});
$('code-input').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') decode();
});
$('lang-toggle').addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));
$('copy-button').addEventListener('click', async () => {
  const code = $('generated-code').value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    setStatus('codeCopied');
  } catch {
    $('generated-code').focus();
    $('generated-code').select();
    setStatus('copyFailed', true);
  }
});
$('download-button').addEventListener('click', () => {
  if (!downloadBytes) return;
  const url = URL.createObjectURL(new Blob([downloadBytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

const dropZone = $('drop-zone');
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (file) runConversion('upload', () => convertFile(file));
});
