'use strict';
let status={active:false,lastCheckedAt:null,nextCheckAt:null};

// One wake-up at each minute boundary, including after sleep/clock changes.
// Startup drains overdue work immediately; the delivery runner is single-flight.
function startReportEmailWorker(run,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onError=error=>console.warn('[report-email-schedules]',error.code || error.message)}={}) {
    let timer,stopped=false;
    status={active:true,lastCheckedAt:null,nextCheckAt:null};
    const invoke=()=>Promise.resolve().then(()=>{if(!stopped) {status.lastCheckedAt=new Date(now()).toISOString();return run();}}).catch(onError);
    function arm() {
        if(stopped) return;
        const time=now(),delay=60_000-((time%60_000+60_000)%60_000);
        status.nextCheckAt=new Date(time+delay).toISOString();
        timer=setTimer(()=>{arm();void invoke();},delay);
        timer.unref?.();
    }
    arm();void invoke();
    return ()=>{stopped=true;clearTimer(timer);status={...status,active:false,nextCheckAt:null};};
}
function reportEmailWorkerStatus(){return {...status};}
module.exports={startReportEmailWorker,reportEmailWorkerStatus};
