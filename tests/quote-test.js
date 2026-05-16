const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// フォルダ自動生成 (おすすめ順①)
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// ⑭ 自動原因推定AIっぽい解析関数
function analyzeError(msg) {
  if (msg.includes('is not defined')) return '関数または変数未定義';
  if (msg.includes('null')) return 'DOM取得失敗';
  if (msg.includes('Target closed')) return 'ブラウザクラッシュ';
  if (msg.includes('ERR_FILE_NOT_FOUND')) return 'index.html不足';
  if (msg.includes('Unexpected token')) return 'JavaScript構文エラー';
  return '不明';
}

(async () => {
  let hasError = false;
  const timestamp = Date.now();

  // ⑤ 無限ループ・タイムアウト検知 (60秒で強制終了)
  const timeout = setTimeout(() => {
    console.error('❌ ⏰ 無限ループ疑いによるタイムアウト');
    process.exit(1);
  }, 60000);

  // ③ Promise Error監視
  process.on('unhandledRejection', reason => {
    console.error('❌ Promise Error');
    console.error(reason);
    hasError = true;
  });

  try {
    // Puppeteerの起動（CI環境用にサンドボックスをオフに設定）
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // ④ ブラウザクラッシュ検知
    browser.on('disconnected', () => {
      console.error('💥 Chromiumクラッシュ');
      hasError = true;
    });

    const page = await browser.newPage();

    // ① JS Runtime Error分類
    page.on('pageerror', err => {
      const msg = err.toString();
      console.error('❌ JS Runtime Error');
      if (msg.includes('is not defined')) console.error('👉 関数または変数未定義');
      if (msg.includes('Cannot set properties of null')) console.error('👉 DOM要素不足');
      if (msg.includes('Unexpected token')) console.error('👉 JavaScript構文エラー');
      console.error(`[推定原因]: ${analyzeError(msg)}`);
      console.error(msg);
      hasError = true;
    });

    // ② Console Error解析
    page.on('console', msg => {
      const text = msg.text();
      console.log(`🖥 ${msg.type()} : ${text}`);

      if (msg.type() === 'error') {
        if (text.includes('404')) console.error('👉 ファイル不足');
        if (text.includes('Failed to fetch')) console.error('👉 API通信失敗');
        if (text.includes('CORS')) console.error('👉 CORSエラー');
        console.error(`[推定原因]: ${analyzeError(text)}`);
        hasError = true;
      }
    });

    // ⑩ ネットワーク監視
    page.on('requestfailed', req => {
      console.error('🌐 通信失敗');
      console.error(`${req.url()} - ${req.failure().errorText}`);
      hasError = true;
    });

    // --- [診断対象ページの読み込み] ---
    // ※ 読み込む対象（ローカルのindex.htmlなど）に合わせてパスを調整してください
    const targetUrl = `file://${path.join(__dirname, 'index.html')}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // ⑨ 空HTML検知
    const html = await page.content();
    if (html.length < 1000) {
      console.error('❌ HTML生成失敗 (ファイルが空、または内容が極端に少ないです)');
      hasError = true;
    }

    // ⑥ DOM欠落を全部列挙
    const requiredIds = ['toName', 'subject', 'estDate', 'itemTable', 'preview'];
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
      console.error('❌ DOM不足');
      missingIds.forEach(v => {
        console.error(`👉 ${v} が存在しません`);
      });
      hasError = true;
    }

    // ⑦ 関数不足を全部表示
    const requiredFunctions = ['openQuoteEditor', 'calcTotal', 'buildEstHTML'];
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
      missingFunctions.forEach(fn => {
        console.error(`❌ 関数不足: ${fn}`);
      });
      hasError = true;
    }

    // ⑧ CSS崩れ検知
    const layout = await page.evaluate(() => {
      const body = document.body;
      return {
        width: body.scrollWidth,
        height: body.scrollHeight,
        overflow: body.scrollWidth > window.innerWidth
      };
    });

    if (layout.overflow) {
      console.error('❌ 横スクロール発生 (レイアウトが崩れている可能性があります)');
      hasError = true;
    }

    // ⑪ メモリ使用量監視
    const metrics = await page.metrics();
    console.log('📊 Memory Metrics:', metrics);

    // ⑫ スクリーンショット自動保存
    await page.screenshot({
      path: path.join(logDir, `${timestamp}.png`),
      fullPage: true
    });

    // ⑬ HTMLダンプ保存
    fs.writeFileSync(path.join(logDir, `${timestamp}.html`), html);

    await browser.close();

  } catch (error) {
    console.error('❌ 診断中に予期せぬエラーが発生しました:', error);
    hasError = true;
  } finally {
    // ⑤ 成功時：タイマーのクリア
    clearTimeout(timeout);

    // エラーが1つでも検知されていたらプロセスを異常終了させ、GitHub Actionsに通知
    if (hasError) {
      console.error('❌ 診断テストで問題が検出されました。Artifactのログを確認してください。');
      process.exit(1);
    } else {
      console.log('✅ 診断テストがすべて正常に完了しました！');
      process.exit(0);
    }
  }
})();
