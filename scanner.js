// scanner.js - 全コード静的解析エンジン
const fs = require('fs');
const path = require('path');
const glob = require('glob');

module.exports = function scan(projectDir) {
  const result = {
    syntaxErrors:  [],
    dangerousCode: [],
    missingDeps:   [],
    asyncIssues:   [],
    undefinedVars: [],
    requireErrors: []
  };

  let declared = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch (e) {}

  const jsFiles = glob.sync('**/*.js', {
    cwd: projectDir,
    ignore: ['node_modules/**', 'logs/**']
  });

  jsFiles.forEach(file => {
    const code = fs.readFileSync(path.join(projectDir, file), 'utf8');
    scanCode(code, file, declared, result);
  });

  const htmlFiles = glob.sync('**/*.html', {
    cwd: projectDir,
    ignore: ['node_modules/**']
  });

  htmlFiles.forEach(file => {
    const html = fs.readFileSync(path.join(projectDir, file), 'utf8');
    const scriptRe = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
    let m; let idx = 0;
    while ((m = scriptRe.exec(html)) !== null) {
      idx++;
      const code = m[1].trim();
      if (!code) continue;
      scanCode(code, `${file}[script#${idx}]`, declared, result);
    }
  });

  return result;
};

function scanCode(code, label, declared, result) {
  try { new Function(code); } catch (e) {
    result.syntaxErrors.push({ file: label, error: e.message });
  }
  if (/\beval\s*\(/.test(code))          result.dangerousCode.push({ file: label, type: 'eval' });
  if (/document\.write\s*\(/.test(code)) result.dangerousCode.push({ file: label, type: 'document.write' });
  if (/\.innerHTML\s*=(?!=)/.test(code)) result.dangerousCode.push({ file: label, type: 'innerHTML' });

  const reqRe = /require\(['"`]([^'"`./][^'"`]*?)['"`]\)/g;
  let rm;
  while ((rm = reqRe.exec(code)) !== null) {
    const fullPkg = rm[1].startsWith('@') ? rm[1].split('/').slice(0,2).join('/') : rm[1].split('/')[0];
    if (!declared[fullPkg] && !isBuiltin(fullPkg)) {
      result.missingDeps.push({ file: label, package: fullPkg });
    }
  }

  const hasAsync = /async\s+function|=\s*async\s*\(|async\s+\(/.test(code);
  const hasAwait = /\bawait\b/.test(code);
  if (hasAsync && !/\.catch\s*\(|try\s*\{/.test(code)) result.asyncIssues.push({ file: label, type: 'unhandled_promise' });
  if (hasAwait && !hasAsync) result.asyncIssues.push({ file: label, type: 'await_outside_async' });

  const undefs = (code.match(/\bundefined\b/g) || []).length;
  if (undefs > 3) result.undefinedVars.push({ file: label, count: undefs });
}

function isBuiltin(name) {
  return ['fs','path','http','https','os','crypto','events','stream','util',
    'child_process','process','url','querystring','assert','buffer',
    'net','dns','readline','zlib','cluster','worker_threads'].includes(name);
}
