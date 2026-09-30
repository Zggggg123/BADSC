// 验证子路径部署：把 web/ 当作 /badsc/ 提供，确认相对路径引用仍然正确。
// 这是"能否部署到 example.com/badsc/"这一判断的实测依据。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..', 'web');
const port = Number(process.argv[2] || 8793);
const prefix = '/badsc';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === prefix) urlPath = prefix + '/';
  if (!urlPath.startsWith(prefix + '/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const rel = urlPath.slice(prefix.length + 1);
  const filePath = path.join(root, rel === '' ? 'index.html' : rel);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => console.log(`[subpath] http://127.0.0.1:${server.address().port}${prefix}/`));
