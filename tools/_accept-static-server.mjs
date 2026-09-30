// 验收用静态服务器：故意不为 .wasm 返回 application/wasm，
// 以模拟 GitHub Pages 等平台的行为，验证客户端的降级路径是否真的可用。
// 用法：node tools/_accept-static-server.mjs <端口> <wasm模式 correct|wrong>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const port = Number(process.argv[2] || 8791);
const wasmMode = process.argv[3] === 'wrong' ? 'wrong' : 'correct';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': wasmMode === 'wrong' ? 'application/octet-stream' : 'application/wasm',
  '.svg': 'image/svg+xml',
};

let wasmHits = 0;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wasm') wasmHits++;
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[static] listening on http://127.0.0.1:${port}/ wasm=${wasmMode}`);
});

process.on('SIGTERM', () => { console.log(`[static] wasm requests: ${wasmHits}`); server.close(); process.exit(0); });
