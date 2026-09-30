// Cloudflare Pages 的 _headers 不支持通配覆盖顺序，用 Functions 精确控制响应头。
// 若你的平台支持 _headers（Netlify / Cloudflare Pages 静态模式），优先用 web/_headers。
// 本文件仅示意：把 web/ 作为发布目录时，需要保证 .wasm 的 Content-Type 正确。
//
// 说明：站点对错误 MIME 有降级能力（见 docs/DEPLOYMENT.md 第二节），
// 因此本文件不是必需的，而是为消除控制台告警、恢复 instantiateStreaming 快路径。

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  const url = new URL(context.request.url);
  const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));

  if (TYPES[ext]) headers.set('Content-Type', TYPES[ext]);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', CSP);

  const isSnapshot = /^\/dictionaries\/[0-9a-f]{16}\.json$/.test(url.pathname);
  headers.set('Cache-Control', isSnapshot ? 'public, max-age=31536000, immutable' : 'no-cache');

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
