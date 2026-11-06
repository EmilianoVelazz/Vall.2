'use strict';
const fs=require('node:fs/promises');
const {setTimeout:pause}=require('node:timers/promises');
// Windows indexers/scanners can briefly hold the destination open. Never
// unlink the valid destination to make a failed replacement succeed.
async function atomicFileReplace(source,destination,{rename=fs.rename,wait=pause}={}) {
    const delays=[25,50,100,200,400,800];
    for(let attempt=0;;attempt++) {
        try {await rename(source,destination);return;}
        catch(error) {
            if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length) throw error;
            await wait(delays[attempt]);
        }
    }
}
module.exports={atomicFileReplace};
