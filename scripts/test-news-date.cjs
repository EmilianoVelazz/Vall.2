'use strict';
const assert=require('node:assert/strict');
const {newsIsoDate}=require('../backend/lib/news-date');
for(const value of ['20261105T142530Z','20261105142530','20261105T142530'])assert.equal(newsIsoDate(value),'2026-11-05T14:25:30.000Z');
for(const value of ['',null,undefined,'not a date','20261305T142530Z','20260230T142530Z','20261105T252530Z','20261105T142560Z'])assert.equal(newsIsoDate(value),null);
assert.equal(newsIsoDate('2024-02-29T23:59:59Z'),'2024-02-29T23:59:59.000Z');
assert.equal(newsIsoDate('2026-11-05T09:00:00-06:00'),'2026-11-05T15:00:00.000Z');
console.log('News dates: 13 cases; invalid upstream dates return null without dropping the feed.');
