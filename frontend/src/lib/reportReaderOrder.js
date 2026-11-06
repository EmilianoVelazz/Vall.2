// Keep the main data tables in the reading flow before chart explorers.
// This only orders UI blocks; canonical evidence and export models stay intact.
const tableBlocks=new Set(['comparisons','tables','equityContext','derivatives','history','statistics']);
const chartBlocks=new Set(['leadChart','charts']);
export function reportReaderOrder(blocks=[]){
 const firstChart=blocks.findIndex(block=>chartBlocks.has(block.key));
 if(firstChart<0 || !blocks.slice(firstChart+1).some(block=>tableBlocks.has(block.key)))return blocks;
 const before=blocks.slice(0,firstChart),after=blocks.slice(firstChart);
 return [...before,...after.filter(block=>tableBlocks.has(block.key)),...after.filter(block=>!tableBlocks.has(block.key))].map((block,index)=>({...block,number:String(index+1)}));
}
