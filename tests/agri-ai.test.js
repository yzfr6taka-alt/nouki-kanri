const vm = require('vm');
// または
const vm = { runInThisContext: (code) => eval(code) };
// 農機管理PRO AI共通モジュールの自前テスト（外部依存なし / node tests/agri-ai.test.js）
// index.html 内の AGRI_SHARED ブロックを抽出し、純粋ロジックを検証する。
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

// 1) 共通モジュールブロックの抽出
const m=html.match(/\/\/ ===AGRI_SHARED_START===[\s\S]*?\/\/ ===AGRI_SHARED_END===/);
if(!m){console.error('❌ AGRI_SHARED ブロックが見つかりません');process.exit(1);}
const ctx=vm.createContext({});
// ブロックと export 式を同一スクリプトで評価し、const/関数束縛を取り出す
const exported=vm.runInContext(m[0]+'\n;({normalizeMaker,getRegisteredCustomers,getRegisteredMachines,machineListText,isLowConfidence,normalizeNameplate,ORG_NAME,AGRI_MAKER_DICT})',ctx);

// 2) インラインスクリプト全体が構文エラーなくパースできるか（実行はしない）
const scStart=html.indexOf('<script>')+8;
const scEnd=html.indexOf('</script>',scStart);
const mainScript=html.substring(scStart,scEnd);
try{ new vm.Script(mainScript); }catch(e){ console.error('❌ index.html のメインスクリプトに構文エラー:',e.message);process.exit(1); }

let pass=0,fail=0;
function eq(actual,expected,name){
  const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(ok){pass++;}else{fail++;console.error(`❌ ${name}\n   期待: ${JSON.stringify(expected)}\n   実際: ${JSON.stringify(actual)}`);}
}
function truthy(v,name){if(v){pass++;}else{fail++;console.error('❌ '+name);}}

const {normalizeMaker,getRegisteredCustomers,getRegisteredMachines,machineListText,isLowConfidence,normalizeNameplate,ORG_NAME,AGRI_MAKER_DICT}=exported;

// --- 組織名固定 ---
eq(ORG_NAME,'そお鹿児島農業協同組合','ORG_NAME は固定');

// --- メーカー正規化（表記ゆれ → 正式名）---
eq(normalizeMaker('やんまー'),'ヤンマー','ひらがな yanmar');
eq(normalizeMaker('YANMAR'),'ヤンマー','ローマ字大文字');
eq(normalizeMaker('ヤンマ'),'ヤンマー','略称ヤンマ');
eq(normalizeMaker('KUBOTA'),'クボタ','kubota');
eq(normalizeMaker('久保田'),'クボタ','漢字 久保田');
eq(normalizeMaker('iseki'),'井関','iseki');
eq(normalizeMaker('イセキ'),'井関','カタカナ イセキ');
eq(normalizeMaker('三菱'),'三菱マヒンドラ農機','三菱');
eq(normalizeMaker('mitsubishi'),'三菱マヒンドラ農機','mitsubishi');
eq(normalizeMaker('まるやま'),'丸山製作所','丸山');
eq(normalizeMaker('筑水'),'筑水キャニコム','筑水');
eq(normalizeMaker('キャニコム'),'筑水キャニコム','キャニコム');
eq(normalizeMaker('共立'),'共立','共立');
eq(normalizeMaker('やまびこ'),'共立','やまびこ→共立');
eq(normalizeMaker('ニプロ'),'ニプロ','ニプロ');
eq(normalizeMaker('IHI'),'IHIアグリテック','IHI');
eq(normalizeMaker('  クボタ  '),'クボタ','前後空白');
// 未知メーカーはそのまま（推測で寄せない）
eq(normalizeMaker('オリジナル機械社'),'オリジナル機械社','未知はそのまま');
eq(normalizeMaker(''),'','空文字');
eq(normalizeMaker(null),'','null');

// 辞書に主要メーカーが含まれる
['ヤンマー','クボタ','井関','三菱マヒンドラ農機','丸山製作所','筑水キャニコム','共立'].forEach(k=>{
  truthy(AGRI_MAKER_DICT[k],'辞書に '+k+' が存在');
});

// --- 登録顧客一覧（読み取り専用・重複除去）---
const mockDB={
  customers:[{name:'田中'},{name:'山田'},{name:'田中'},{name:''}],
  machines:[{maker:'くぼた',model:'GL241'}],
  repairs:[{maker:'YANMAR',model:'YT222'},{maker:'クボタ',model:'GL241'}],
  products:[{maker:'iseki',model:'PZ60'}],
};
eq(getRegisteredCustomers(mockDB),['田中','山田'],'顧客一覧 重複・空除去');
eq(getRegisteredCustomers({}),[],'空DBでも安全');

// --- 登録機械一覧（メーカー正規化＋重複除去）---
const machines=getRegisteredMachines(mockDB);
// くぼたGL241 と クボタGL241 は正規化後に同一 → 1件に統合
eq(machines.length,3,'機械 正規化後に重複統合で3件');
truthy(machines.some(x=>x.maker==='クボタ'&&x.model==='GL241'),'クボタ GL241 を含む');
truthy(machines.some(x=>x.maker==='ヤンマー'&&x.model==='YT222'),'ヤンマー YT222 を含む');
truthy(machines.some(x=>x.maker==='井関'&&x.model==='PZ60'),'井関 PZ60 を含む');
truthy(machineListText(mockDB).indexOf('クボタ GL241')>=0,'プロンプト用テキスト生成');
eq(machineListText({}),'なし','機械なしは「なし」');

// --- confidence 判定 ---
eq(isLowConfidence(0.4),true,'0.4 は低');
eq(isLowConfidence(0.9),false,'0.9 は高');
eq(isLowConfidence(0.6),false,'0.6 は閾値');
eq(isLowConfidence('low'),true,'low は低');
eq(isLowConfidence('high'),false,'high は高');
eq(isLowConfidence('0.3'),true,'文字列数値 0.3 は低');
eq(isLowConfidence(undefined),false,'undefined は低でない');
eq(isLowConfidence(''),false,'空は低でない');

// --- 銘板正規化（項目固定＋confidence整形＋メーカー正規化）---
const n1=normalizeNameplate({
  maker:{value:'くぼた',confidence:0.9},
  model:{value:'GL241',confidence:0.5},
  serialNo:{value:'A12345',confidence:0.3},
  hourMeter:{value:'320.5h',confidence:0.8},
});
eq(n1.maker,'クボタ','銘板 maker 正規化');
eq(n1.model,'GL241','銘板 model');
eq(n1.serialNo,'A12345','銘板 serialNo 英数字保持');
eq(n1.hourMeter,'320.5','銘板 hourMeter 数値のみ');
eq(n1.confidence.serialNo,0.3,'confidence マップ保持');
eq(isLowConfidence(n1.confidence.serialNo),true,'serialNo 低確信');
eq(isLowConfidence(n1.confidence.maker),false,'maker 高確信');

// フラット形式＋別confidenceオブジェクトにも対応
const n2=normalizeNameplate({maker:'YANMAR',model:'YT222',serialNo:'',hourMeter:'',confidence:{maker:0.95,model:0.4}});
eq(n2.maker,'ヤンマー','フラット maker 正規化');
eq(isLowConfidence(n2.confidence.model),true,'フラット別confidence model 低');
const n3=normalizeNameplate({});
eq(n3,{maker:'',model:'',serialNo:'',hourMeter:'',confidence:{maker:undefined,model:undefined,serialNo:undefined,hourMeter:undefined}},'空入力でも安全');

// --- 結果 ---
console.log(`\n${fail===0?'✅ 全テスト通過':'❌ 失敗あり'}: ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
