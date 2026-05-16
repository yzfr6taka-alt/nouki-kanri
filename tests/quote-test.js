const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {

  let browser;

  try {

    console.log("🚜 診断開始");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();

    // =========================
    // ログ監視
    // =========================

    page.on('console', msg => {
      console.log(`🖥 console.${msg.type()}: ${msg.text()}`);
    });

    page.on('pageerror', err => {
      console.error(`❌ PAGE ERROR: ${err.toString()}`);
    });

    page.on('requestfailed', req => {
      console.error(`🌐 REQUEST FAILED: ${req.url()}`);
    });

    page.on('response', res => {
      if (res.status() >= 400) {
        console.error(`⚠️ HTTP ${res.status()} : ${res.url()}`);
      }
    });

    // =========================
    // index.html存在確認
    // =========================

    const indexPath = `${process.cwd()}/index.html`;

    if (!fs.existsSync(indexPath)) {
      throw new Error(`index.html が存在しません: ${indexPath}`);
    }

    console.log(`📄 index.html確認OK`);

    // =========================
    // ページ読み込み
    // =========================

    await page.goto(
      `file://${indexPath}`,
      {
        waitUntil: 'networkidle0',
        timeout: 30000
      }
    );

    console.log("✅ ページ読込成功");

    // =========================
    // DOM確認
    // =========================

    const domCheck = await page.evaluate(() => {

      const ids = [
        'toName',
        'subject',
        'estDate'
      ];

      const missing = [];

      ids.forEach(id => {
        if (!document.getElementById(id)) {
          missing.push(id);
        }
      });

      return {
        missing
      };
    });

    if (domCheck.missing.length > 0) {
      throw new Error(
        `DOM不足: ${domCheck.missing.join(', ')}`
      );
    }

    console.log("✅ DOM確認OK");

    // =========================
    // 関数存在チェック
    // =========================

    const fnCheck = await page.evaluate(() => {

      return {
        openQuoteEditor: typeof openQuoteEditor,
        calcTotal: typeof calcTotal,
        buildEstHTML: typeof buildEstHTML,
        qItems: typeof qItems
      };

    });

    console.log("📦 関数チェック:", fnCheck);

    // =========================
    // メインテスト
    // =========================

    const testResult = await page.evaluate(() => {

      let passed = 0;
      let failed = 0;
      let logs = [];

      function assert(condition, msg) {
        if (condition) {
          passed++;
          logs.push("✅ " + msg);
        } else {
          failed++;
          logs.push("❌ " + msg);
        }
      }

      try {

        openQuoteEditor('');

        document.getElementById('toName').value = 'テスト 太郎';
        document.getElementById('subject').value = 'トラクター一式';
        document.getElementById('estDate').value = '2026-05-16';

        qItems[0] = {
          name: 'トラクター',
          brand: 'ヤンマー',
          model: 'YT222',
          qty: 1,
          price: 2000000,
          note: ''
        };

        qItems[1] = {
          name: 'ロータリー',
          brand: 'ニプロ',
          model: 'SX1705',
          qty: 1,
          price: 500000,
          note: ''
        };

        calcTotal();

        const htmlOutput = buildEstHTML();

        assert(
          htmlOutput.includes('2,750,000'),
          '合計金額 OK'
        );

        assert(
          htmlOutput.includes('height:296mm'),
          'A4高さ制御 OK'
        );

        assert(
          htmlOutput.includes('<svg'),
          'SVG生成 OK'
        );

        assert(
          htmlOutput.includes('text-overflow:ellipsis'),
          '文字溢れ制御 OK'
        );

        return {
          success: failed === 0,
          passed,
          failed,
          logs
        };

      } catch (e) {

        return {
          success: false,
          logs: [
            '❌ 致命的エラー',
            e.toString(),
            e.stack
          ]
        };

      }

    });

    // =========================
    // ログ表示
    // =========================

    console.log('\n===== TEST LOG =====');

    testResult.logs.forEach(log => {
      console.log(log);
    });

    console.log(
      `\n📊 成功:${testResult.passed} 失敗:${testResult.failed}`
    );

    // =========================
    // スクリーンショット保存
    // =========================

    await page.screenshot({
      path: 'debug-screenshot.png',
      fullPage: true
    });

    console.log("📸 スクリーンショット保存");

    // =========================
    // HTML保存
    // =========================

    const html = await page.content();

    fs.writeFileSync(
      'debug-page.html',
      html
    );

    console.log("💾 HTML保存");

    // =========================
    // 終了判定
    // =========================

    if (!testResult.success) {

      throw new Error(
        'テスト失敗'
      );

    }

    console.log("🎉 全テスト成功");

    process.exit(0);

  } catch (err) {

    console.error("\n❌ 致命的失敗");
    console.error(err);

    process.exit(1);

  } finally {

    if (browser) {
      try {
        await browser.close();
      } catch(e){}
    }

  }

})();
