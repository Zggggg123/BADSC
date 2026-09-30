import { pathToFileURL } from 'node:url';
export async function launchBrowser() {
  let module;
  try { module = await import('playwright'); }
  catch (error) {
    if (!process.env.BADSC_PLAYWRIGHT_PATH) throw new Error('浏览器测试需要 Node.js 20+ 和 Playwright。请先运行 npm ci。', { cause: error });
    module = await import(pathToFileURL(process.env.BADSC_PLAYWRIGHT_PATH).href);
  }
  const playwright = module.default || module;
  const options = { headless: true };
  if (process.env.BADSC_BROWSER_CHANNEL) options.channel = process.env.BADSC_BROWSER_CHANNEL;
  if (process.env.BADSC_BROWSER_EXECUTABLE) options.executablePath = process.env.BADSC_BROWSER_EXECUTABLE;
  return playwright.chromium.launch(options);
}
