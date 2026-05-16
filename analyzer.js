module.exports = function analyze(logs) {

  const result = {
    type: [],
    severity: 'low'
  };

  if (logs.domMissing.length > 0) {
    result.type.push('DOM_MISSING');
  }

  if (logs.functionMissing.length > 0) {
    result.type.push('FUNCTION_MISSING');
  }

  logs.errors.forEach(e => {

    if (e.includes('Cannot read')) {
      result.type.push('NULL_ACCESS');
    }

    if (e.includes('is not defined')) {
      result.type.push('REFERENCE_ERROR');
    }

    if (e.includes('Unexpected token')) {
      result.type.push('SYNTAX_ERROR');
    }

  });

  if (result.type.length > 2) {
    result.severity = 'high';
  }

  return result;
};
