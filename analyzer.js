module.exports = function analyze(logs, scanResult) {
  const result = { type: [], severity: 'low', details: {} };
  if (logs.domMissing?.length)      { result.type.push('DOM_MISSING');      result.details.domMissing = logs.domMissing; }
  if (logs.functionMissing?.length)  { result.type.push('FUNCTION_MISSING'); result.details.functionMissing = logs.functionMissing; }
  logs.errors.forEach(e => {
    if (e.includes('Cannot read'))        result.type.push('NULL_ACCESS');
    if (e.includes('is not defined'))     result.type.push('REFERENCE_ERROR');
    if (e.includes('Unexpected token'))   result.type.push('SYNTAX_ERROR');
    if (e.includes('Cannot find module')) result.type.push('MISSING_MODULE');
  });
  if (scanResult) {
    if (scanResult.syntaxErrors?.length)  { result.type.push('STATIC_SYNTAX_ERROR'); result.details.syntaxErrors = scanResult.syntaxErrors; }
    if (scanResult.missingDeps?.length)   { result.type.push('MISSING_DEPENDENCY');  result.details.missingDeps  = scanResult.missingDeps; }
    if (scanResult.asyncIssues?.length)   { result.type.push('ASYNC_BUG');           result.details.asyncIssues  = scanResult.asyncIssues; }
    if (scanResult.dangerousCode?.length) { result.type.push('DANGEROUS_CODE');      result.details.dangerousCode = scanResult.dangerousCode; }
  }
  result.type = [...new Set(result.type)];
  if (result.type.length >= 4) result.severity = 'high';
  else if (result.type.length >= 2) result.severity = 'medium';
  return result;
};
