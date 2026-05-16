const puppeteer = require('puppeteer');

(async () => {
  console.log("🚜 見えないブラウザを起動してテストを開始します...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // GitHubアクション上のローカルファイル（index.html）を読み込む
  await page.goto(`file://${process.cwd()}/index.html`, { waitUntil: 'networkidle0' });

  // ページ内でテスト用のJavaScriptを実行する
  const testResult = await page.evaluate(() => {
    let passed = 0; let failed = 0; let logs = [];
    function assert(condition, msg) {
      if(condition) { passed++; logs.push("✅ " + msg); } 
      else { failed++; logs.push("❌ " + msg); }
    }

    try {
      openQuoteEditor('');
      document.getElementById('toName').value = 'テスト 太郎';
      document.getElementById('subject').value = 'トラクター一式';
      document.getElementById('estDate').value = '2026-05-16';

      // ダミーデータ注入
      qItems[0] = { name: 'トラクター', brand: 'ヤンマー', model: 'YT222', qty: 1, price: 2000000, note: '' };
      qItems[1] = { name: 'ロータリー', brand: 'ニプロ', model: 'SX1705', qty: 1, price: 500000, note: '' };
      calcTotal();
      
      const htmlOutput = buildEstHTML();
      
      assert(htmlOutput.includes('2,750,000'), "合計金額 (2,750,000円) が正常");
      assert(htmlOutput.includes('height:296mm') && htmlOutput.includes('overflow:hidden'), "A4サイズ超過防止が適用済");
      assert(htmlOutput.includes('<svg'), "余白の斜線SVGが生成済");
      assert(htmlOutput.includes('text-overflow:ellipsis'), "文字溢れ防止(...)が適用済");
      
      return { success: failed === 0, passed, failed, logs };
    } catch(e) {
      return { success: false, logs: ["❌ 致命的なエラー: " + e.toString()] };
    }
  });

  // テスト結果をコンソールに出力
  testResult.logs.forEach(log => console.log(log));
  console.log(`\n📊 結果: ${testResult.passed}件成功 / ${testResult.failed}件失敗`);

  await browser.close();

  // 失敗が1つでもあればエラーとして終了（GitHubに異常を知らせる）
  if (!testResult.success) {
    console.error("⚠️ テストに失敗しました。レイアウトや計算ロジックが壊れている可能性があります。");
    process.exit(1);
  } else {
    console.log("🎉 全テスト成功！見積書ロジックは完璧です。");
    process.exit(0);
  }
})();
