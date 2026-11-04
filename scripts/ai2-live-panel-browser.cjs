// Real React panel + live gateway; not login/full recruiter-page acceptance.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const fs = require('node:fs');
(async () => {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const config = JSON.parse(input); input = '';
  const fe = path.resolve(__dirname, '../../Nexthire-FE');
  const requireFe = createRequire(path.join(fe, 'package.json'));
  const { createServer } = await import(require('node:url').pathToFileURL(requireFe.resolve('vite')).href);
  const { chromium } = requireFe('playwright');
  let server, browser;
  const errors = [], requests = [];
  try {
    server = await createServer({ root: fe, define: { 'import.meta.env.VITE_AI2_DEMO_ENABLED': JSON.stringify(config.frontendEnabled ? 'true' : 'false') },
      server: { host: '127.0.0.1', port: 15173, strictPort: true }, plugins: [{ name: 'live-panel-entry', configureServer(vite) {
        vite.middlewares.use('/__live_panel__', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__live_panel__', '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/tests/ai2/ai2-live-harness.tsx"></script></body></html>'));
        });
      } }] });
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.AI1_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/\/ai2-(demo|pool)(?:\?|$)/.test(request.url())) requests.push(request.url()); });
    page.on('response', async response => {
      if (/\/ai2-(demo|pool)(?:\?|$)/.test(response.url())) {
        const body = await response.json().catch(() => null);
        console.log(JSON.stringify({ route: response.url().includes('ai2-pool') ? 'pool' : 'score', httpStatus: response.status(), status: body?.data?.status, reason: body?.data?.reason, schema: body?.data?.schemaVersion }));
      }
    });
    await page.addInitScript(value => { window.ai2LiveConfig = value; }, { token: config.token, applicationId: config.applicationId, jobId: config.jobId });
    await page.goto('http://127.0.0.1:15173/__live_panel__');
    await page.getByRole('heading', { name: /Local AI2 E2E/ }).waitFor();
    const panel = page.locator('section[aria-label]');
    if (!config.frontendEnabled) {
      await page.waitForTimeout(800);
      assert.equal(await panel.count(), 0);
      assert.equal(requests.length, 0);
    } else {
      await panel.waitFor();
      await page.waitForFunction(() => document.querySelector('section[aria-label]')?.getAttribute('aria-busy') === 'false');
      assert.equal(requests.length, 2, 'Score and pool must both use live gateway');
      const text = await panel.innerText();
      assert.ok(!/Suggestions could not be loaded|Chưa thể tải gợi ý/.test(text));
      assert.ok(!/Suggested review position|Gợi ý xem thứ \d/.test(text), 'No ranking may escape quality gate');
      assert.ok(/Content assessment quality is not validated|Chất lượng đánh giá nội dung chưa được xác nhận|No comparison order available|Chưa có thứ tự so sánh/.test(text));
      const details = panel.locator('details');
      if (await details.count()) assert.equal(await details.getAttribute('open'), null);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(config.output, config.frontendEnabled ? 'live-panel-enabled.png' : 'live-panel-default-off.png') });
    fs.writeFileSync(path.join(config.output, config.frontendEnabled ? 'browser-enabled.json' : 'browser-disabled.json'), JSON.stringify({ success: true, frontendEnabled: config.frontendEnabled, liveAi2Requests: requests.length, errors, scope: 'Real panel and live gateway/DB; local signed JWT; no login UI/full page/worker/storage coverage' }, null, 2));
    console.log(JSON.stringify({ success: true, frontendEnabled: config.frontendEnabled, liveAi2Requests: requests.length }));
  } finally { await browser?.close(); await server?.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
