const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const analyzer = require('./analyzer');
const fixer = require('./fixer');
const diff = require('./diff');

const logDir = path.join(__dirname, 'logs');
fs.mkdirSync(logDir, { recursive: true });

const logs = {
  errors: [],
  domMissing: [],
  functionMissing: [],
  console: []
};

(async () => {

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // console
  page.on('console', msg => {
    const text = msg.text();
    logs.console.push(text);

    if (msg.type() === 'error') {
      logs.errors.push(text);
    }
  });

  // runtime error
  page.on('pageerror', err => {
    logs.errors.push(err.toString());
  });

  await page.goto('http://localhost:3000', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // DOMチェック
  const dom = await page.evaluate(() => {
    const ids = ['toName', 'subject', 'estDate', 'itemTable', 'preview'];
    return ids.filter(id => !document.getElementById(id));
  });

  logs.domMissing = dom;

  // 関数チェック
  const fn = await page.evaluate(() => {
    const fns = ['openQuoteEditor', 'calcTotal', 'buildEstHTML'];
    return fns.filter(f => typeof window[f] !== 'function');
  });

  logs.functionMissing = fn;

  fs.writeFileSync(
    path.join(logDir, 'raw.json'),
    JSON.stringify(logs, null, 2)
  );

  // =========================
  // Analyzer
  // =========================

  const analysis = analyzer(logs);

  fs.writeFileSync(
    path.join(logDir, 'analysis.json'),
    JSON.stringify(analysis, null, 2)
  );

  // =========================
  // Fix Generator
  // =========================

  const fixedCode = fixer(analysis);

  fs.writeFileSync(
    path.join(logDir, 'fix.js'),
    fixedCode
  );

  // =========================
  // Diff
  // =========================

  const original = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  const diffText = diff(original, fixedCode);

  fs.writeFileSync(
    path.join(logDir, 'diff.txt'),
    diffText
  );

  await browser.close();

})();
