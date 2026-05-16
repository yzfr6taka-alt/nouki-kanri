const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

(async () => {

  // ==================================================
  // logs フォルダ作成
  // ==================================================

  const logDir = path.join(__dirname, 'logs');

  fs.mkdirSync(logDir, {
    recursive: true
  });

  // 空フォルダ対策
  const keepFile = path.join(logDir, '.keep');

  if (!fs.existsSync(keepFile)) {

    fs.writeFileSync(
      keepFile,
      'keep'
    );

  }

  // 起動ログ
  fs.writeFileSync(
    path.join(logDir, 'startup.log'),
    `start: ${new Date().toISOString()}`
  );

  const timestamp = Date.now();

  // ==================================================
  // ログ管理
  // ==================================================

  const logs = {
    timestamp,
    errors: [],
    warnings: [],
    console: [],
    requests: [],
    metrics: {},
    domMissing: [],
    functionMissing: [],
    runtimeErrors: []
  };

  let hasError = false;

  function addError(msg) {

    hasError = true;

    console.error(msg);

    logs.errors.push(msg);

    fs.appendFileSync(
      path.join(logDir, 'error.log'),
      `${msg}\n`
    );
  }

  function addWarning(msg) {

    console.warn(msg);

    logs.warnings.push(msg);

    fs.appendFileSync(
      path.join(logDir, 'warning.log'),
      `${msg}\n`
    );
  }

  function saveLogs() {

    try {

      fs.writeFileSync(

        path.join(logDir, `${timestamp}.json`),

        JSON.stringify(logs, null, 2)

      );

    } catch (err) {

      console.error('❌ JSON保存失敗');

      console.error(err);

    }

  }

  // ==================================================
  // Promise Error
  // ==================================================

  process.on('unhandledRejection', reason => {

    addError('❌ Promise Error');

    addError(String(reason));

  });

  // ==================================================
  // Uncaught Exception
  // ==================================================

  process.on('uncaughtException', err => {

    addError('❌ Uncaught Exception');

    addError(String(err));

  });

  // ==================================================
  // タイムアウト
  // ==================================================

  const timeout = setTimeout(() => {

    addError('❌ タイムアウト（60秒）');

    saveLogs();

    process.exitCode = 1;

  }, 60000);

  // ==================================================
  // index.html確認
  // ==================================================

  const indexPath = path.join(__dirname, 'index.html');

  if (!fs.existsSync(indexPath)) {

    addError('❌ index.html が存在しません');

    saveLogs();

    process.exitCode = 1;

    return;
  }

  // ==================================================
  // HTTP Server
  // ==================================================

  const server = http.createServer((req, res) => {

    try {

      let reqPath = req.url || '/';

      // query削除
      reqPath = reqPath.split('?')[0];

      // / → index.html
      if (reqPath === '/') {

        reqPath = '/index.html';

      }

      // 先頭 / 削除
      reqPath = reqPath.replace(/^\/+/, '');

      const filePath = path.join(__dirname, reqPath);

      // ファイル無し
      if (!fs.existsSync(filePath)) {

        addWarning(`⚠ 404 : ${reqPath}`);

        res.writeHead(404);

        res.end('404');

        return;
      }

      const data = fs.readFileSync(filePath);

      res.writeHead(200);

      res.end(data);

    } catch (err) {

      addError(`❌ Server Error: ${err}`);

      res.writeHead(500);

      res.end('500');

    }

  });

  // ==================================================
  // server 起動
  // ==================================================

  await new Promise(resolve => {

    server.listen(3000, resolve);

  });

  console.log('🚀 Local Server Start');

  let browser;

  try {

    // ==================================================
    // Puppeteer 起動
    // ==================================================

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

    // ==================================================
    // Console解析
    // ==================================================

    page.on('console', msg => {

      const type = msg.type();

      const text = msg.text();

      console.log(`🖥 ${type}: ${text}`);

      logs.console.push({
        type,
        text
      });

      if (type === 'error') {

        addError(`❌ Console Error: ${text}`);

      }

      if (type === 'warning') {

        addWarning(`⚠ Warning: ${text}`);

      }

    });

    // ==================================================
    // JS Runtime Error
    // ==================================================

    page.on('pageerror', err => {

      const msg = err.toString();

      addError(`❌ JS Runtime Error: ${msg}`);

      logs.runtimeErrors.push(msg);

    });

    // ==================================================
    // 通信失敗
    // ==================================================

    page.on('requestfailed', req => {

      const url = req.url();

      const errorText = req.failure()?.errorText;

      addError(`❌ Request Failed: ${url}`);

      addError(`👉 ${errorText}`);

    });

    // ==================================================
    // request記録
    // ==================================================

    page.on('response', res => {

      logs.requests.push({
        url: res.url(),
        status: res.status()
      });

    });

    // ==================================================
    // ページアクセス
    // ==================================================

    await page.goto('http://localhost:3000', {

      waitUntil: 'domcontentloaded',

      timeout: 30000

    });

    // ==================================================
    // 少し待機
    // ==================================================

    await new Promise(resolve => {

      setTimeout(resolve, 3000);

    });

    // ==================================================
    // HTML取得
    // ==================================================

    const html = await page.content();

    // ==================================================
    // HTMLチェック
    // ==================================================

    if (html.length < 100) {

      addError('❌ HTMLが異常に短い');

    }

    // ==================================================
    // DOM不足解析
    // ==================================================

    const requiredIds = [
      'toName',
      'subject',
      'estDate',
      'itemTable',
      'preview'
    ];

    const missingIds = await page.evaluate(ids => {

      return ids.filter(id => {

        return !document.getElementById(id);

      });

    }, requiredIds);

    if (missingIds.length > 0) {

      addError('❌ DOM不足');

      missingIds.forEach(id => {

        addError(`👉 ${id}`);

        logs.domMissing.push(id);

      });

    }

    // ==================================================
    // 関数不足解析
    // ==================================================

    const requiredFunctions = [
      'openQuoteEditor',
      'calcTotal',
      'buildEstHTML'
    ];

    const missingFunctions = await page.evaluate(fns => {

      return fns.filter(fn => {

        return typeof window[fn] !== 'function';

      });

    }, requiredFunctions);

    if (missingFunctions.length > 0) {

      addError('❌ 関数不足');

      missingFunctions.forEach(fn => {

        addError(`👉 ${fn}`);

        logs.functionMissing.push(fn);

      });

    }

    // ==================================================
    // レイアウト崩れ検知
    // ==================================================

    const layout = await page.evaluate(() => {

      return {

        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth,
        bodyHeight: document.body.scrollHeight

      };

    });

    if (layout.bodyWidth > layout.windowWidth + 5) {

      addWarning('⚠ 横スクロール発生');

    }

    // ==================================================
    // メモリ解析
    // ==================================================

    logs.metrics = await page.metrics();

    console.log('📊 Metrics');

    console.log(logs.metrics);

    if (logs.metrics.JSHeapUsedSize > 200000000) {

      addWarning('⚠ メモリ使用量が多い可能性');

    }

    // ==================================================
    // スクリーンショット
    // ==================================================

    await page.screenshot({

      path: path.join(logDir, `${timestamp}.png`),

      fullPage: true

    });

    // ==================================================
    // HTML保存
    // ==================================================

    fs.writeFileSync(

      path.join(logDir, `${timestamp}.html`),

      html

    );

    // ==================================================
    // JSON保存
    // ==================================================

    saveLogs();

    // ==================================================
    // 結果
    // ==================================================

    if (hasError) {

      console.error('❌ 診断失敗');

      process.exitCode = 1;

    } else {

      console.log('✅ 診断成功');

    }

  } catch (err) {

    addError(`❌ SYSTEM ERROR: ${err}`);

    saveLogs();

    process.exitCode = 1;

  } finally {

    clearTimeout(timeout);

    // browser終了
    try {

      if (browser) {

        await browser.close();

      }

    } catch (err) {

      addWarning(`⚠ browser close error: ${err}`);

    }

    // server終了
    try {

      await new Promise(resolve => {

        server.close(resolve);

      });

    } catch (err) {

      addWarning(`⚠ server close error: ${err}`);

    }

    // 最終保存
    saveLogs();

  }

})();
