const diffLib = require('diff');

module.exports = function createDiff(oldCode, newCode) {

  return diffLib.createPatch(
    'index.html',
    oldCode,
    newCode
  );
};
