// ai-engine.js - AI原因分析・修正コード生成エンジン
const https = require('https');

module.exports = async function aiEngine(logs, scanResult, gitDiff) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY が未設定です');
    return { fixes: [], summary: 'API key not set', error: true };
  }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildPrompt(logs, scanResult, gitDiff) }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const text = response.content?.[0]?.text || '';
          const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
          if (jsonMatch) resolve(JSON.parse(jsonMatch[1]));
          else resolve({ fixes: [], summary: text, rawResponse: true });
        } catch (e) {
          resolve({ fixes: [], summary: 'Parse error: ' + e.message, error: true });
        }
      });
    });
    req.on('error', (e) => resolve({ fixes: [], summary: 'Request error: ' + e.message, error: true }));
    req.write(body);
    req.end();
  });
};

function buildPrompt(logs, scanResult, gitDiff) {
  return `You are a JavaScript/HTML auto-repair AI for a Japanese agricultural machinery management web app.
## Runtime Errors
${JSON.stringify(logs, null, 2)}
## Static Analysis
${JSON.stringify(scanResult, null, 2)}
## Git Diff
${gitDiff ? gitDiff.slice(0, 3000) : 'Not available'}
Respond ONLY with valid JSON:
{"summary":"根本原因","severity":"low|medium|high","fixes":[{"type":"add_function|fix_dom|fix_import|fix_syntax|add_stub","target":"index.html","description":"説明","code":"コード","oldCode":"置換前(fix_syntaxのみ)"}]}`;
}
