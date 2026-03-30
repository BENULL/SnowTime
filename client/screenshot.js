const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('http://localhost:3333/preview.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'preview.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved!');
})();