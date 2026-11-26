'use strict';
const fs=require('node:fs/promises');
const lockfile=require('proper-lockfile');

const STALE_MS=30_000;

async function acquireScheduleFileLock(file){
    const lockPath=file+'.lock';
    // Older releases wrote a PID into a regular file. PIDs can be reused by
    // replacement containers, so retire abandoned legacy files by age. The
    // new directory lock cannot be removed by a racing legacy-file unlink.
    try{
        const stat=await fs.lstat(lockPath);
        if(stat.isFile() && Date.now()-stat.mtimeMs>STALE_MS)await fs.unlink(lockPath);
    }catch(error){if(!['ENOENT','EISDIR','EPERM'].includes(error.code))throw error;}

    let compromised=null,release;
    try{
        release=await lockfile.lock(file,{
            realpath:false,stale:STALE_MS,update:10_000,
            retries:{retries:100,factor:1,minTimeout:25,maxTimeout:25},
            onCompromised:error=>{compromised=error;},
        });
    }catch(error){
        if(error.code==='ELOCKED')throw Object.assign(Error('Almacén de programaciones ocupado; reintenta.'),{status:503,code:'SCHEDULE_STORE_BUSY'});
        throw error;
    }
    return {
        assertOwned(){
            if(compromised)throw Object.assign(Error('Se perdió la reserva del almacén de programaciones; reintenta.'),{status:503,code:'SCHEDULE_LOCK_LOST',cause:compromised});
        },
        async release(){if(!compromised)await release();},
    };
}

module.exports={acquireScheduleFileLock};
