const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {

  const logDir = path.join(__dirname, 'logs');

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  let browser;

  try {

    const indexPath = path.join(__dirname, 'index.html');

    if (!fs.existsSync(indexPath)) {
      throw new Error('index.html が存在しません');
    }

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();

    page.on('console', msg => {
      console.log(`🖥 ${msg.type()} : ${msg.text()}`);
    });

    page.on('pageerror', err => {
      console.error('❌ JS Error');
      console.error(err.toString());
    });

    page.on('requestfailed', req => {
      console.error('❌ 通信失敗');
      console.error(req.url());
    });

    await page.goto(`file://${indexPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.screenshot({
      path: path.join(logDir, 'screenshot.png'),
      fullPage: true
    });

    const html = await page.content();

    fs.writeFileSync(
      path.join(logDir, 'dump.html'),
      html
    );

    console.log('✅ 診断完了');

    await browser.close();

    process.exit(0);

  } catch (err) {

    console.error('❌ エラー');
    console.error(err);

    if (browser) {
      await browser.close();
    }

    process.exit(1);
  }

})();
