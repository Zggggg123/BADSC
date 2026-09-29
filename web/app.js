import { MAX_DEK_BYTES, decodeDek, encodeShareCode, decodeShareCode, parseDeck } from './codec.js';

const $ = (id) => document.getElementById(id);
let downloadBytes = null;
let downloadName = '';
let conversionId = 0;

function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}

function valueText(value) {
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

function clearResult(message = '上传文件后可复制分享码；输入分享码后可下载 .dek。') {
  downloadBytes = null;
  downloadName = '';
  $('generated-code').value = '';
  $('code-length').textContent = '';
  $('download-filename').textContent = '';
  $('deck-name').textContent = '';
  for (const id of ['deck-country', 'deck-spec1', 'deck-spec2', 'deck-count']) $(id).textContent = '';
  $('source-tag').textContent = '';
  $('source-tag').classList.add('hidden');
  $('overview-content').classList.add('hidden');
  $('share-section').classList.add('hidden');
  $('download-section').classList.add('hidden');
  $('overview-empty').classList.remove('hidden');
  $('output-empty').classList.remove('hidden');
  $('overview-empty').querySelector('p').textContent = '转换后，卡组信息将在这里显示。';
  $('output-empty').querySelector('p').textContent = message;
  $('result-kind').textContent = '等待转换';
}

function renderDeck(deck, source) {
  const cards = Object.values(deck.set2).reduce((sum, group) => sum + (Array.isArray(group) ? group.length : 0), 0);
  $('deck-name').textContent = valueText(deck.name);
  $('deck-country').textContent = valueText(deck.country);
  $('deck-spec1').textContent = valueText(deck.spec1);
  $('deck-spec2').textContent = valueText(deck.spec2);
  $('deck-count').textContent = String(cards);
  $('source-tag').textContent = source === 'upload' ? '来自 .dek' : '来自分享码';
  $('source-tag').classList.remove('hidden');
  $('overview-empty').classList.add('hidden');
  $('overview-content').classList.remove('hidden');
  $('output-empty').classList.add('hidden');
}

function friendlyError(error) {
  if (error instanceof SyntaxError) return '卡组内容格式无效，无法读取基本信息。';
  if (error instanceof Error) return error.message;
  return '转换失败，请检查输入后重试。';
}

async function convertFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.dek')) throw new Error('请选择 .dek 文件。');
  if (file.size > MAX_DEK_BYTES) throw new Error('.dek 文件不能超过 1 MB。');
  const original = new Uint8Array(await file.arrayBuffer());
  const { plain } = await decodeDek(original);
  const deck = parseDeck(plain);
  const code = await encodeShareCode(original);
  return { deck, code, source: 'upload' };
}

async function convertCode() {
  const code = $('code-input').value.trimEnd();
  if (!code.trim()) throw new Error('请先粘贴完整分享码。');
  const { original, plain } = await decodeShareCode(code);
  const deck = parseDeck(plain);
  const filename = String(deck.name || 'BADSC-还原卡组')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) + '.dek';
  return { deck, original, filename, source: 'code' };
}

async function runConversion(source, action) {
  const id = ++conversionId;
  clearResult('正在转换，请稍候…');
  $('result-kind').textContent = '处理中';
  setStatus(source === 'upload' ? '正在读取并生成分享码…' : '正在校验并还原卡组…');
  try {
    const result = await action();
    if (id !== conversionId) return;
    renderDeck(result.deck, result.source);
    if (result.source === 'upload') {
      $('generated-code').value = result.code;
      $('code-length').textContent = `${result.code.length} 字符`;
      $('share-section').classList.remove('hidden');
      $('result-kind').textContent = '分享码';
      setStatus('分享码已生成，可以复制。');
    } else {
      downloadBytes = result.original;
      downloadName = result.filename;
      $('download-filename').textContent = result.filename;
      $('download-section').classList.remove('hidden');
      $('result-kind').textContent = '.dek 文件';
      setStatus('卡组已还原，可以下载 .dek 文件。');
    }
  } catch (error) {
    if (id !== conversionId) return;
    const message = friendlyError(error);
    clearResult('转换失败，请检查输入后重试。');
    $('overview-empty').querySelector('p').textContent = '本次转换没有生成卡组信息。';
    $('result-kind').textContent = '转换失败';
    setStatus(message, true);
  }
}

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
  clearResult();
  setStatus('分享码已修改，点击确定开始转换。');
});
$('code-input').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') decode();
});
$('copy-button').addEventListener('click', async () => {
  const code = $('generated-code').value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    setStatus('分享码已复制。');
  } catch {
    $('generated-code').focus();
    $('generated-code').select();
    setStatus('复制失败，已选中分享码，请手动复制。', true);
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
