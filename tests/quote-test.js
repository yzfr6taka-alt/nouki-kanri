const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

(async () => {

  // ==================================================
  // logs フォルダ
  // ==================================================

  const logDir = path.join(__dirname, 'logs');

  fs.mkdirSync(logDir, {
    recursive: true
  });

  const timestamp = Date.now();

  // ==================================================
  // ログデータ
  // ==================================================

  const logs = {
    timestamp,
    errors: [],
    warnings: [],
    console: [],
    requests: [],
    metrics: {},
    domMissing: [],
    functionMissing: []
  };

  let hasError = false;

  function addError(msg) {

    hasError = true;

    console.error(msg);

    logs.errors.push(msg);
  }

  function addWarning(msg) {

    console.warn(msg);

    logs.warnings.push(msg);
  }

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
  // HTTP SERVER
  // ==================================================

  const server = http.createServer((req, res) => {

    try {

      let reqPath = req.url || '/';

      // query除去
      reqPath = reqPath.split('?')[0];

      // / → index.html
      if (reqPath === '/') {
        reqPath = '/index.html';
      }

      // 絶対パス防止
      reqPath = reqPath.replace(/^\/+/, '');

      const filePath = path.join(__dirname, reqPath);

      // ファイル無し
      if (!fs.existsSync(filePath)) {

        addWarning(`⚠ 404: ${reqPath}`);

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
  // server start
  // ==================================================

  await new Promise(resolve => {

    server.listen(3000, resolve);

  });

  console.log('🚀 local server start');

  // ==================================================
  // puppeteer
  // ==================================================

  let browser;

  try {

    browser = await puppeteer.launch({

      headless: true,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]

    });

    const page = await browser.newPage();

    // ==================================================
    // console
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

    });

    // ==================================================
    // JS ERROR
    // ==================================================

    page.on('pageerror', err => {

      addError(`❌ JS Runtime Error: ${err}`);

    });

    // ==================================================
    // request failed
    // ==================================================

    page.on('requestfailed', req => {

      const url = req.url();

      const errorText = req.failure()?.errorText;

      addError(`❌ Request Failed: ${url}`);

      addError(`👉 ${errorText}`);

    });

    // ==================================================
    // request log
    // ==================================================

    page.on('response', res => {

      logs.requests.push({
        url: res.url(),
        status: res.status()
      });

    });

    // ==================================================
    // goto
    // ==================================================

    await page.goto('http://localhost:3000', {

      waitUntil: 'domcontentloaded',

      timeout: 30000

    });

    // ==================================================
    // wait
    // ==================================================

    await new Promise(resolve => setTimeout(resolve, 3000));

    // ==================================================
    // HTML
    // ==================================================

    const html = await page.content();

    if (html.length < 100) {

      addError('❌ HTMLが異常に短い');

    }

    // ==================================================
    // screenshot
    // ==================================================

    await page.screenshot({

      path: path.join(logDir, `${timestamp}.png`),

      fullPage: true

    });

    // ==================================================
    // html save
    // ==================================================

    fs.writeFileSync(

      path.join(logDir, `${timestamp}.html`),

      html

    );

    // ==================================================
    // DOM CHECK
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
    // FUNCTION CHECK
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
    // layout
    // ==================================================

    const layout = await page.evaluate(() => {

      return {

        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth

      };

    });

    if (layout.bodyWidth > layout.windowWidth + 5) {

      addWarning('⚠ 横スクロール発生');

    }

    // ==================================================
    // metrics
    // ==================================================

    logs.metrics = await page.metrics();

    console.log('📊 metrics');

    console.log(logs.metrics);

  } catch (err) {

    addError(`❌ SYSTEM ERROR: ${err}`);

  }

  // ==================================================
  // close
  // ==================================================

  try {

    if (browser) {

      await browser.close();

    }

  } catch (err) {

    addWarning(`⚠ browser close error: ${err}`);

  }

  try {

    await new Promise(resolve => {

      server.close(resolve);

    });

  } catch (err) {

    addWarning(`⚠ server close error: ${err}`);

  }

  // ==================================================
  // save logs
  // ==================================================

  saveLogs();

  // ==================================================
  // exit code
  // ==================================================

  if (hasError) {

    console.error('❌ 診断失敗');

    process.exitCode = 1;

  } else {

    console.log('✅ 診断成功');

  }

  // ==================================================
  // saveLogs
  // ==================================================

  function saveLogs() {

    fs.writeFileSync(

      path.join(logDir, `${timestamp}.json`),

      JSON.stringify(logs, null, 2)

    );

  }

})();
