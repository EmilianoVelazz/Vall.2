'use strict';
let status={active:false,lastCheckedAt:null,nextCheckAt:null,lastCompletedAt:null,lastFailureAt:null,lastFailureCode:null};

// One wake-up at each minute boundary, including after sleep/clock changes.
// Startup drains overdue work immediately; the delivery runner is single-flight.
function startReportEmailWorker(run,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onError=error=>console.warn('[report-email-schedules]',error.code || error.message)}={}) {
    let timer,stopped=false;
    status={active:true,lastCheckedAt:null,nextCheckAt:null,lastCompletedAt:null,lastFailureAt:null,lastFailureCode:null};
    const invoke=()=>Promise.resolve().then(()=>{if(!stopped) {status.lastCheckedAt=new Date(now()).toISOString();return run();}}).then(result=>{
        if(stopped)return;
        status.lastCompletedAt=new Date(now()).toISOString();
        if(result?.errors>0){status.lastFailureAt=status.lastCompletedAt;status.lastFailureCode='REPORT_EMAIL_DELIVERY_FAILED';}
    }).catch(error=>{
        if(stopped)return;
        status.lastFailureAt=new Date(now()).toISOString();
        status.lastFailureCode='REPORT_EMAIL_WORKER_FAILED';
        onError(error);
    });
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
