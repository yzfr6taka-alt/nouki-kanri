const puppeteer=require('puppeteer');const fs=require('fs');const path=require('path');
const scanner=require('./scanner');const analyzer=require('./analyzer');
const aiEngine=require('./ai-engine');const patcher=require('./patcher');
const createDiff=require('./diff');const visualChecker=require('./visual-checker');
const logDir=path.join(__dirname,'logs');fs.mkdirSync(logDir,{recursive:true});
const logs={errors:[],domMissing:[],functionMissing:[],console:[]};
(async()=>{
  console.log('\n🔍 Phase 1: 静的解析...');
  const scanResult=scanner(__dirname);save('scan.json',scanResult);
  let gitDiff='';const diffPath=process.env.GIT_DIFF_FILE;
  if(diffPath&&fs.existsSync(diffPath))gitDiff=fs.readFileSync(diffPath,'utf8');
  console.log('\n🌐 Phase 2: Runtimeテスト...');
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844});
  page.on('console',msg=>{logs.console.push(msg.text());if(msg.type()==='error')logs.errors.push(msg.text());});
  page.on('pageerror',err=>logs.errors.push(err.toString()));
  try{
    await page.goto('http://localhost:3000',{waitUntil:'networkidle0',timeout:30000});
    logs.domMissing=await page.evaluate(()=>['toName','subject','estDate','itemTable','preview'].filter(id=>!document.getElementById(id)));
    logs.functionMissing=await page.evaluate(()=>['openQuoteEditor','calcTotal','buildEstHTML'].filter(f=>typeof window[f]!=='function'));
  }catch(e){logs.errors.push('Navigation error: '+e.message);}
  save('raw.json',logs);
  console.log('\n📸 Phase 2.5: UI解析...');
  const apiKey=process.env.ANTHROPIC_API_KEY;
  const visualResult=await visualChecker(page,logDir,apiKey);
  save('visual.json',visualResult);
  if(visualResult.issues.length>0){console.log(`   UI問題: ${visualResult.issues.length}件`);visualResult.issues.forEach((issue,i)=>console.log(`   [${i}] ${issue.severity} ${issue.type}: ${issue.description}`));}
  else{console.log('   UI問題: なし ✅');}
  await browser.close();
  console.log('\n📊 Phase 3: 原因分析...');
  const analysis=analyzer(logs,scanResult);save('analysis.json',analysis);
  console.log('\n🤖 Phase 4: AI修正生成...');
  const aiResult=await aiEngine(logs,scanResult,gitDiff,visualResult);save('ai-result.json',aiResult);
  console.log('\n🔧 Phase 5: パッチ適用...');
  const htmlPath=path.join(__dirname,'index.html');
  const originalHtml=fs.existsSync(htmlPath)?fs.readFileSync(htmlPath,'utf8'):'';
  const patchResult=patcher(__dirname,aiResult);save('patch-result.json',patchResult);
  if(originalHtml&&fs.existsSync(htmlPath)){const p=fs.readFileSync(htmlPath,'utf8');if(originalHtml!==p)fs.writeFileSync(path.join(logDir,'diff.txt'),createDiff(originalHtml,p));}
  const summary={phase1_staticIssues:Object.values(scanResult).flat().length,phase2_runtimeErrors:logs.errors.length,phase25_uiIssues:visualResult.issues.length,phase25_uiScore:visualResult.score||'N/A',phase4_fixesGenerated:aiResult.fixes?.length||0,phase5_applied:patchResult.applied.length};
  save('summary.json',summary);console.log('\n✅ 完了:',JSON.stringify(summary,null,2));
})().catch(err=>{console.error('Fatal:',err);process.exit(1);});
function save(name,data){fs.writeFileSync(path.join(logDir,name),JSON.stringify(data,null,2));}

/* AUTO-FIX:
async function loadData(){
  try{
    const result=await fetchData();
    return result;
  }catch(e){
    console.error('Load failed:',e);
  }
}
*/