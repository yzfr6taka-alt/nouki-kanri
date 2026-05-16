module.exports = function fixer(analysis) {

  let code = '';

  if (analysis.type.includes('DOM_MISSING')) {

    code += `
document.body.innerHTML += '<div id="toName"></div>';
document.body.innerHTML += '<div id="subject"></div>';
document.body.innerHTML += '<div id="estDate"></div>';
document.body.innerHTML += '<div id="itemTable"></div>';
document.body.innerHTML += '<div id="preview"></div>';
`;
  }

  if (analysis.type.includes('FUNCTION_MISSING')) {

    code += `
window.openQuoteEditor = function(){ console.log('stub'); };
window.calcTotal = function(){ return 0; };
window.buildEstHTML = function(){ return ''; };
`;
  }

  return code;
};
