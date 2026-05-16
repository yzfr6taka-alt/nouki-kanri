const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

(async () => {

  // =========================================================
  // 初期設定
  // =========================================================

  const logDir = path.join(__dirname, 'logs');

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = Date.now();

  let browser;
  let server;

  let hasError = false;

  const logs = {
    timestamp,
    errors: [],
    warnings: [],
    console: [],
    network: [],
    dom: [],
    functions: [],
    metrics: {},
    layout: {},
    runtimeErrors: []
  };

  // =========================================================
  // ログ保存関数
  // =========================================================

  function addError(msg) {

    hasError = true;

    console.error(msg);

    logs.errors.push(msg);
  }

  function addWarning(msg) {

    console.warn(msg);

    logs.warnings.push(msg);
  }

  function addConsole(type, msg) {

    logs.console.push({
      type,
      message: msg
    });
  }

  function analyzeError(msg) {

    if (msg.includes('is not defined')) {
      return '関数または変数未定義';
    }

    if (msg.includes('Cannot read')) {
      return 'DOM取得失敗';
    }

    if (msg.includes('Unexpected token')) {
      return 'JavaScript構文エラー';
    }

    if (msg.includes('Failed to fetch')) {
      return 'API通信失敗';
    }

    if (msg.includes('ERR_CONNECTION')) {
      return '通信接続失敗';
    }

    if (msg.includes('404')) {
      return 'ファイル不足';
    }

    if (msg.includes('Target closed')) {
      return 'ブラウザクラッシュ';
    }

    if (msg.includes('timeout')) {
      return 'タイムアウト';
    }

    return '不明';
  }

  // =========================================================
  // Promise Error監視
  // =========================================================

  process.on('unhandledRejection', reason => {

    addError('❌ Promise Error');
    addError(String(reason));

  });

  // =========================================================
  // Nodeクラッシュ監視
  // =========================================================

  process.on('uncaughtException', err => {

    addError('❌ Uncaught Exception');
    addError(String(err));

  });

  // =========================================================
  // タイムアウト監視
  // =========================================================

  const timeout = setTimeout(() => {

    addError('❌ タイムアウト（60秒超過）');

    process.exit(1);

  }, 60000);

  try {

    // =========================================================
    // index.html確認
    // =========================================================

    const indexPath = path.join(__dirname, 'index.html');

    if (!fs.existsSync(indexPath)) {

      throw new Error('index.html が存在しません');

    }

    // =========================================================
    // ローカルサーバ起動
    // =========================================================

    server = http.createServer((req, res) => {

      let reqPath = req.url;

      if (reqPath === '/') {
        reqPath = '/index.html';
      }

      const filePath = path.join(__dirname, reqPath);

      fs.readFile(filePath, (err, data) => {

        if (err) {

          addError(`❌ 404 : ${reqPath}`);

          res.writeHead(404);

          res.end('404');

          return;
        }

        res.writeHead(200);

        res.end(data);

      });

    });

    await new Promise(resolve => {

      server.listen(3000, resolve);

    });

    console.log('🚀 Local Server Start');

    // =========================================================
    // Puppeteer起動
    // =========================================================

    browser = await puppeteer.launch({

      headless: true,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]

    });

    browser.on('disconnected', () => {

      addError('💥 Chromiumクラッシュ');

    });

    const page = await browser.newPage();

    // =========================================================
    // Console解析
    // =========================================================

    page.on('console', msg => {

      const type = msg.type();

      const text = msg.text();

      console.log(`🖥 ${type}: ${text}`);

      addConsole(type, text);

      if (type === 'error') {

        addError(`❌ Console Error: ${text}`);

        addError(`👉 推定原因: ${analyzeError(text)}`);

      }

      if (type === 'warning') {

        addWarning(`⚠ Warning: ${text}`);

      }

    });

    // =========================================================
    // JS Runtime Error解析
    // =========================================================

    page.on('pageerror', err => {

      const msg = err.toString();

      addError('❌ JS Runtime Error');

      addError(msg);

      addError(`👉 推定原因: ${analyzeError(msg)}`);

      logs.runtimeErrors.push(msg);

    });

    // =========================================================
    // 通信失敗解析
    // =========================================================

    page.on('requestfailed', req => {

      const url = req.url();

      const errorText = req.failure()?.errorText;

      addError(`❌ 通信失敗: ${url}`);

      addError(`👉 ${errorText}`);

      logs.network.push({
        url,
        error: errorText
      });

    });

    // =========================================================
    // ページアクセス
    // =========================================================

    await page.goto('http://localhost:3000', {

      waitUntil: 'networkidle2',

      timeout: 30000

    });

    // =========================================================
    // 少し待機
    // =========================================================

    await new Promise(resolve => setTimeout(resolve, 2000));

    // =========================================================
    // HTML取得
    // =========================================================

    const html = await page.content();

    // =========================================================
    // HTML空チェック
    // =========================================================

    if (html.length < 100) {

      addError('❌ HTML生成失敗');

    }

    // =========================================================
    // DOM不足解析
    // =========================================================

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

      addError('❌ DOM不足');

      missingIds.forEach(id => {

        addError(`👉 ${id} が存在しません`);

        logs.dom.push(id);

      });

    }

    // =========================================================
    // 関数不足解析
    // =========================================================

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

      addError('❌ 関数不足');

      missingFunctions.forEach(fn => {

        addError(`👉 ${fn}`);

        logs.functions.push(fn);

      });

    }

    // =========================================================
    // CSS崩れ解析
    // =========================================================

    const layout = await page.evaluate(() => {

      return {

        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth,
        bodyHeight: document.body.scrollHeight

      };

    });

    logs.layout = layout;

    if (layout.bodyWidth > layout.windowWidth + 5) {

      addWarning('⚠ 横スクロール発生');

    }

    // =========================================================
    // メモリ解析
    // =========================================================

    const metrics = await page.metrics();

    logs.metrics = metrics;

    console.log('📊 Metrics');

    console.log(metrics);

    if (metrics.JSHeapUsedSize > 200000000) {

      addWarning('⚠ メモリ使用量が多い可能性');

    }

    // =========================================================
    // スクリーンショット保存
    // =========================================================

    await page.screenshot({

      path: path.join(logDir, `${timestamp}.png`),

      fullPage: true

    });

    // =========================================================
    // HTML保存
    // =========================================================

    fs.writeFileSync(

      path.join(logDir, `${timestamp}.html`),

      html

    );

    // =========================================================
    // JSONログ保存
    // =========================================================

    fs.writeFileSync(

      path.join(logDir, `${timestamp}.json`),

      JSON.stringify(logs, null, 2)

    );

    // =========================================================
    // 結果表示
    // =========================================================

    if (hasError) {

      console.error('');
      console.error('❌ 診断失敗');

    } else {

      console.log('');
      console.log('✅ 診断成功');

    }

  } catch (err) {

    addError('❌ システムエラー');

    addError(String(err));

  } finally {

    clearTimeout(timeout);

    // =========================================================
    // browser終了
    // =========================================================

    if (browser) {

      await browser.close();

    }

    // =========================================================
    // server終了
    // =========================================================

    if (server) {

      server.close();

    }

    // =========================================================
    // 最終ログ保存
    // =========================================================

    fs.writeFileSync(

      path.join(logDir, `${timestamp}-final.json`),

      JSON.stringify(logs, null, 2)

    );

    // =========================================================
    // Exit Code
    // =========================================================

    if (hasError) {

      process.exit(1);

    } else {

      process.exit(0);

    }

  }

})();
