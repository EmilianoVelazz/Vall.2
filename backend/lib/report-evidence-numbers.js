'use strict';
function numericTokens(value) {
    return new Set((String(value).match(/\d+(?:[.,]\d+)*/g)||[]).map(token=>token.replace(/,/g,'.').replace(/\.0+$/,'')));
}
module.exports={numericTokens};
