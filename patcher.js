// patcher.js - 自動修復エンジン
const fs   = require('fs');
const path = require('path');

module.exports = function patcher(projectDir, aiResult) {
  const applied = [], errors = [];
  if (!aiResult?.fixes?.length) return { applied, errors, message: '適用する修正がありません' };

  aiResult.fixes.forEach((fix, i) => {
    try {
      const targetPath = path.join(projectDir, fix.target);
      if (!fs.existsSync(targetPath)) { errors.push({ index: i, error: `ファイルが見つかりません: ${fix.target}` }); return; }
      let content = fs.readFileSync(targetPath, 'utf8');
      const before = content;

      switch (fix.type) {
        case 'add_function': case 'add_stub':
          if (fix.target.endsWith('.html')) {
            content = content.includes('</script>')
              ? content.replace(/(<\/script>)(?![\s\S]*<\/script>)/, `${fix.code}\n$1`)
              : content + `\n<script>\n${fix.code}\n</script>`;
          } else { content += '\n\n' + fix.code; }
          break;
        case 'fix_dom':
          content = content.includes('</body>')
            ? content.replace('</body>', `${fix.code}\n</body>`)
            : content + '\n' + fix.code;
          break;
        case 'fix_import':
          content = fix.code + '\n' + content;
          break;
        case 'fix_syntax':
          content = (fix.oldCode && content.includes(fix.oldCode))
            ? content.split(fix.oldCode).join(fix.code)
            : content + `\n/* AUTO-FIX:\n${fix.code}\n*/`;
          break;
        default: content += '\n' + fix.code;
      }

      if (content !== before) {
        fs.writeFileSync(targetPath, content, 'utf8');
        applied.push({ index: i, type: fix.type, target: fix.target, description: fix.description });
        console.log(`  ✅ [${i}] ${fix.type} → ${fix.target}`);
      } else {
        errors.push({ index: i, error: '変更なし' });
      }
    } catch (e) { errors.push({ index: i, error: e.message }); }
  });
  return { applied, errors };
};
