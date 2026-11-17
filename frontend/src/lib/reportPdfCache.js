// Keep a few completed previews in this mounted library only. Keys cover the
// complete edition; account changes and unmounts discard all private bytes.
export function createReportPdfCache({maxEntries=4,maxBytes=32*1024*1024,ttlMs=5*60*1000,now=Date.now}={}) {
  const entries=new Map();let bytes=0;
  const keyOf=(owner,edition,language)=>JSON.stringify([owner?.toLowerCase(),language,edition]);
  const remove=key=>{const hit=entries.get(key);if(hit){bytes-=hit.size;entries.delete(key);}};
  return {
    get(owner,edition,language){
      if(!owner)return null;
      const key=keyOf(owner,edition,language),hit=entries.get(key);
      if(!hit)return null;
      if(hit.expires<=now()){remove(key);return null;}
      entries.delete(key);entries.set(key,hit);return hit.value;
    },
    set(owner,edition,language,blob){
      if(!owner)return;
      const key=keyOf(owner,edition,language),size=blob.size+key.length*2;
      remove(key);if(size>maxBytes || maxEntries<=0)return;
      for(const [saved,hit]of entries)if(hit.expires<=now())remove(saved);
      while(entries.size>=maxEntries || bytes+size>maxBytes)remove(entries.keys().next().value);
      entries.set(key,{size,expires:now()+ttlMs,value:{blob,edition,language}});bytes+=size;
    },
    clear(){entries.clear();bytes=0;},
    snapshot:()=>({entries:entries.size,bytes}),
  };
}
