const https = require('https');
module.exports = async function aiEngine(logs, scanResult, gitDiff, visualResult) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){console.warn('⚠️  ANTHROPIC_API_KEY が未設定です');return{fixes:[],summary:'API key not set',error:true};}
  const body = JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:buildPrompt(logs,scanResult,gitDiff,visualResult)}]});
  return new Promise((resolve)=>{
    const options={hostname:'api.anthropic.com',path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(options,(res)=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{try{const r=JSON.parse(data);const t=r.content?.[0]?.text||'';const m=t.match(/```json\s*([\s\S]*?)\s*```/)||t.match(/(\{[\s\S]*\})/);if(m)resolve(JSON.parse(m[1]));else resolve({fixes:[],summary:t,rawResponse:true});}catch(e){resolve({fixes:[],summary:'Parse error: '+e.message,error:true});}});});
    req.on('error',(e)=>resolve({fixes:[],summary:'Request error: '+e.message,error:true}));
    req.write(body);req.end();
  });
};
function buildPrompt(logs,scanResult,gitDiff,visualResult){
  const ui=visualResult?`\n## UI解析結果\nスコア: ${visualResult.score||'N/A'}\nサマリー: ${visualResult.summary||'なし'}\nUI問題:\n${(visualResult.issues||[]).map((issue,i)=>`[${i}] ${issue.severity}/${issue.type}: ${issue.description} → ${issue.suggestion}`).join('\n')||'なし'}`:'';
  return `あなたは農業機械管理Webアプリ「農機管理PRO」の自動修復AIです。\n## Runtime エラー\n${JSON.stringify(logs,null,2)}\n## 静的解析\n${JSON.stringify(scanResult,null,2)}${ui}\n## Git Diff\n${gitDiff?gitDiff.slice(0,3000):'Not available'}\n必ずJSON形式のみで回答:\n{"summary":"根本原因","severity":"low|medium|high","fixes":[{"type":"add_function|fix_dom|fix_import|fix_syntax|add_stub","target":"index.html","description":"説明","code":"コード","oldCode":"置換前(fix_syntaxのみ)"}]}`;
}
