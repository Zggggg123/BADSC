const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const host = '127.0.0.1';
const port = 8765;
const root = path.join(__dirname, 'web');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/i18n.js', ['i18n.js', 'text/javascript; charset=utf-8']],
  ['/codec.js', ['codec.js', 'text/javascript; charset=utf-8']],
  ['/bads3-binary.js', ['bads3-binary.js', 'text/javascript; charset=utf-8']],
  ['/bads3-columns.js', ['bads3-columns.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/vendor/index.web.js', ['vendor/index.web.js', 'text/javascript; charset=utf-8']],
  ['/vendor/pkg.web/brotli_wasm.js', ['vendor/pkg.web/brotli_wasm.js', 'text/javascript; charset=utf-8']],
  ['/vendor/pkg.web/brotli_wasm_bg.wasm', ['vendor/pkg.web/brotli_wasm_bg.wasm', 'application/wasm']],
]);

const server = http.createServer((req, res) => {
  let item = files.get(req.url);
  if (!item && /^\/dictionaries\/(manifest|[0-9a-f]{16})\.json$/.test(req.url)) {
    item = [req.url.slice(1), 'application/json; charset=utf-8'];
  }
  if (req.method !== 'GET' || !item || !fs.existsSync(path.join(root, item[0]))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': item[1],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
  });
  fs.createReadStream(path.join(root, item[0])).pipe(res);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log(`BADSC 本地网页：${url}`);
  if (process.platform === 'win32' && process.env.BADSC_NO_BROWSER !== '1') {
    spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' }).unref();
  }
});
