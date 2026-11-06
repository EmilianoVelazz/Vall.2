'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
module.exports={withChatCredits:(meter,operation)=>context.run(meter,operation),chatMeter:()=>context.getStore()};
