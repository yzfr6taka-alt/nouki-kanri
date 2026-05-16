const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const timestamp = Date.now();

const errorLogs = [];

function logError(message) {
  console.error(message);
  errorLogs.push(message);
}

function analyzeError(msg) {
  if (msg.includes('is not defined')) return '関数または変数未定義';
  if (msg.includes('Cannot read properties of null')) return 'DOM取得失敗';
  if (msg.includes('Target closed')) return 'ブラウザクラッシュ';
  if (msg.includes('ERR_FILE_NOT_FOUND')) return 'index.html不足';
  if (msg.includes('Unexpected token')) return 'JavaScript構文エラー';
  if (msg.includes('Failed to fetch')) return 'API通信失敗';
  if (msg.includes('CORS')) return 'CORSエラー';
  return '不明';
}

(async () => {

  let hasError = false;
  let browser;

  const timeout = setTimeout(() => {
    logError('❌ タイムアウト（60秒）');
    process.exit(1);
  }, 60000);

  process.on('unhandledRejection', reason => {
    hasError = true;
    logError('❌ Promise Error');
    logError(String(reason));
  });

  process.on('uncaughtException', err => {
    hasError = true;
    logError('❌ Uncaught Exception');
    logError(String(err));
  });

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

    browser.on('disconnected', () => {
      hasError = true;
      logError('💥 Chromiumクラッシュ');
    });

    const page = await browser.newPage();

    page.on('pageerror', err => {
      hasError = true;

      const msg = err.toString();

      logError('❌ JS Runtime Error');
      logError(`[推定原因] ${analyzeError(msg)}`);
      logError(msg);
    });

    page.on('console', msg => {

      const text = msg.text();

      console.log(`🖥 ${msg.type()} : ${text}`);

      if (msg.type() === 'error') {

        hasError = true;

        if (text.includes('404')) {
          logError('👉 ファイル不足');
        }

        logError(`[推定原因] ${analyzeError(text)}`);
      }
    });

    page.on('requestfailed', req => {

      hasError = true;

      logError('🌐 通信失敗');
      logError(`${req.url()} - ${req.failure()?.errorText}`);
    });

    const targetUrl = `file://${indexPath}`;

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2000);

    const html = await page.content();

    if (html.length < 100) {
      hasError = true;
      logError('❌ HTML生成失敗');
    }

    const requiredIds = [
      'toName',
      'subject',
      'estDate',
      'itemTable',
      'preview'
    ];

    const missingIds = await page.evaluate((ids) => {

      const missing = [];

      ids.forEach(id => {

        if (!document.getElementById(id)) {
          missing.push(id);
        }

      });

      return missing;

    }, requiredIds);

    if (missingIds.length > 0) {

      hasError = true;

      logError('❌ DOM不足');

      missingIds.forEach(id => {
        logError(`👉 ${id} が存在しません`);
      });
    }

    const requiredFunctions = [
      'openQuoteEditor',
      'calcTotal',
      'buildEstHTML'
    ];

    const missingFunctions = await page.evaluate((fns) => {

      const missing = [];

      fns.forEach(fn => {

        if (typeof window[fn] !== 'function') {
          missing.push(fn);
        }

      });

      return missing;

    }, requiredFunctions);

    if (missingFunctions.length > 0) {

      hasError = true;

      missingFunctions.forEach(fn => {
        logError(`❌ 関数不足: ${fn}`);
      });
    }

    const layout = await page.evaluate(() => {

      return {
        width: document.body.scrollWidth,
        windowWidth: window.innerWidth
      };

    });

    if (layout.width > layout.windowWidth + 10) {

      hasError = true;

      logError('❌ 横スクロール発生');
    }

    const metrics = await page.metrics();

    console.log('📊 Metrics');
    console.log(metrics);

    await page.screenshot({
      path: path.join(logDir, `${timestamp}.png`),
      fullPage: true
    });

    fs.writeFileSync(
      path.join(logDir, `${timestamp}.html`),
      html
    );

    fs.writeFileSync(
      path.join(logDir, `${timestamp}.json`),
      JSON.stringify({
        timestamp,
        hasError,
        errors: errorLogs,
        metrics
      }, null, 2)
    );

  } catch (error) {

    hasError = true;

    logError('❌ 診断中に予期せぬエラー');
    logError(String(error));

  } finally {

    clearTimeout(timeout);

    if (browser) {
      await browser.close();
    }

    if (hasError) {

      console.error('');
      console.error('❌ 診断失敗');
      console.error('logs フォルダを確認してください');

      process.exit(1);

    } else {

      console.log('');
      console.log('✅ 診断成功');

      process.exit(0);
    }
  }

})();
