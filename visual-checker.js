const https=require('https');const fs=require('fs');const path=require('path');
module.exports=async function visualCheck(page,logDir,apiKey){
  const result={screenshots:[],issues:[],summary:'',error:null};
  try{
    const fp=path.join(logDir,'screenshot-full.png');
    await page.screenshot({path:fp,fullPage:true});
    result.screenshots.push('screenshot-full.png');
    const vp=path.join(logDir,'screenshot-view.png');
    await page.screenshot({path:vp,fullPage:false});
    result.screenshots.push('screenshot-view.png');
    console.log('  📸 スクリーンショット撮影完了');
  }catch(e){result.error='スクリーンショット撮影失敗: '+e.message;console.error('  ❌',result.error);return result;}
  if(!apiKey){result.error='ANTHROPIC_API_KEY が未設定のためAI解析をスキップ';console.warn('  ⚠️',result.error);return result;}
  try{
    const imgPath=path.join(logDir,'screenshot-view.png');
    const imgBase64=fs.readFileSync(imgPath).toString('base64');
    const analysis=await analyzeImage(imgBase64,apiKey);
    result.issues=analysis.issues||[];result.summary=analysis.summary||'';result.score=analysis.score;
    console.log(`  🤖 UI解析完了: ${result.issues.length}件の問題を検出`);
  }catch(e){result.error='AI画像解析失敗: '+e.message;console.error('  ❌',result.error);}
  return result;
};
function analyzeImage(base64,apiKey){
  const body=JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:base64}},{type:'text',text:'あなたは農業機械管理Webアプリ「農機管理PRO」のUIレビュアーです。このスクリーンショットを見て以下をチェックしてください。\n- レイアウトが崩れていないか\n- ボタンや入力欄が正しく表示されているか\n- テキストが見切れていないか\n- 見積書の表示エリアが正しいか\n- テーブル・リストが正しく表示されているか\n必ずJSON形式のみで回答（マークダウン不要）:\n{"summary":"全体評価","score":0-100,"issues":[{"type":"layout|button|text|table|other","severity":"low|medium|high","description":"問題の説明","suggestion":"改善提案"}]}'}]}]});
  return new Promise((resolve)=>{
    const options={hostname:'api.anthropic.com',path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(options,(res)=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{try{const r=JSON.parse(data);const t=r.content?.[0]?.text||'';const m=t.match(/```json\s*([\s\S]*?)\s*```/)||t.match(/(\{[\s\S]*\})/);if(m)resolve(JSON.parse(m[1]));else resolve({summary:t,issues:[]});}catch(e){resolve({summary:'Parse error: '+e.message,issues:[]});}});});
    req.on('error',(e)=>resolve({summary:'Request error: '+e.message,issues:[]}));
    req.write(body);req.end();
  });
}
