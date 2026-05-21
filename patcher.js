const fs=require('fs');const path=require('path');
module.exports=function patcher(projectDir,aiResult){
  const applied=[],errors=[];
  if(!aiResult?.fixes?.length)return{applied,errors,message:'適用する修正がありません'};
  aiResult.fixes.forEach((fix,i)=>{
    try{
      const tp=path.join(projectDir,fix.target);
      if(!fs.existsSync(tp)){errors.push({index:i,error:`ファイルが見つかりません: ${fix.target}`});return;}
      let c=fs.readFileSync(tp,'utf8');const before=c;
      switch(fix.type){
        case 'add_function':case 'add_stub':
          if(fix.target.endsWith('.html')){c=c.includes('</script>')?c.replace(/(<\/script>)(?![\s\S]*<\/script>)/,`${fix.code}\n$1`):c+`\n<script>\n${fix.code}\n</script>`;}else{c+='\n\n'+fix.code;}break;
        case 'fix_dom':c=c.includes('</body>')?c.replace('</body>',`${fix.code}\n</body>`):c+'\n'+fix.code;break;
        case 'fix_import':c=fix.code+'\n'+c;break;
        case 'fix_syntax':c=(fix.oldCode&&c.includes(fix.oldCode))?c.split(fix.oldCode).join(fix.code):c+`\n/* AUTO-FIX:\n${fix.code}\n*/`;break;
        default:c+='\n'+fix.code;
      }
      if(c!==before){fs.writeFileSync(tp,c,'utf8');applied.push({index:i,type:fix.type,target:fix.target,description:fix.description});console.log(`  ✅ [${i}] ${fix.type} → ${fix.target}`);}
      else{errors.push({index:i,error:'変更なし'});}
    }catch(e){errors.push({index:i,error:e.message});}
  });
  return{applied,errors};
};
