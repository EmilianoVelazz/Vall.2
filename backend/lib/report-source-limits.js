'use strict';
// Keep the same bounded source capacity in private editions and downloads.
function reportSourceLimit(report){
 const key=report.baseReport?.key || report.key;
 if(key==='equities' || require('../../shared/report-panorama.mjs').isPanorama(report) || require('../../shared/report-commodity-executive.mjs').isCommodityExecutive(report))return 192;
 return report.periodType==='annual' || ['proteins','bonds'].includes(key) ? 96 : 40;
}
module.exports={reportSourceLimit};
