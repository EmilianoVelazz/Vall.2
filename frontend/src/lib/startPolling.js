// Schedule the next request only after the current one settles.
export function startPolling(task,interval,{setTimer=setTimeout,clearTimer=clearTimeout,onError=()=>{}}={}){
 let active=true,timer;
 async function tick(){
  if(!active)return;
  try{await task();}catch(error){if(active)onError(error);}
  finally{if(active)timer=setTimer(tick,interval);}
 }
 void tick();
 return ()=>{active=false;if(timer!==undefined)clearTimer(timer);};
}
