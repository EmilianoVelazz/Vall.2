'use strict';
const JSZip=require('jszip');
// Read cached scalar cells only. Never execute formulas or follow workbook links.
const decode=text=>String(text).replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x' ? parseInt(n.slice(1),16) : Number(n);return code>0 && code<=0x10ffff ? String.fromCodePoint(code) : '';}).replace(/&(lt|gt|quot|apos|amp);/g,(_,key)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'})[key]);
const texts=xml=>[...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>decode(match[1])).join('');
async function publicXlsxSheet(buffer,name,{maxRows=15000,maxColumns=100}={}){
    if(!Buffer.isBuffer(buffer) || buffer.length>8*1024*1024 || buffer.subarray(0,2).toString()!=='PK')throw Error('Libro público no válido.');
    const zip=await JSZip.loadAsync(buffer),entries=Object.values(zip.files);
    if(entries.length>600 || entries.reduce((sum,item)=>sum+(item._data?.uncompressedSize || 0),0)>60*1024*1024)throw Error('Libro público demasiado grande.');
    const read=async path=>{const entry=zip.file(path);if(!entry || entry._data?.uncompressedSize>16*1024*1024)throw Error('Hoja pública no válida.');const xml=await entry.async('string');if(xml.length>16*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML no permitido.');return xml;};
    const workbook=await read('xl/workbook.xml'),relations=await read('xl/_rels/workbook.xml.rels');
    const attr=(xml,key)=>decode(xml.match(new RegExp('(?:^|\\s)'+key+'="([^"]*)"'))?.[1] || '');
    const sheet=[...workbook.matchAll(/<sheet\s[^>]*\/?\s*>/g)].map(m=>m[0]).find(xml=>attr(xml,'name')===name);
    const relation=[...relations.matchAll(/<Relationship\s[^>]*\/?\s*>/g)].map(m=>m[0]).find(xml=>attr(xml,'Id')===attr(sheet || '', 'r:id'));
    const target=attr(relation || '', 'Target').replace(/^\/xl\//,'');
    if(!/^(?:worksheets\/)?sheet\d+\.xml$/.test(target) || attr(relation || '', 'TargetMode')==='External')throw Error('Hoja pública ausente.');
    const strings=zip.file('xl/sharedStrings.xml') ? [...(await read('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>texts(m[1])) : [];
    const xml=await read('xl/'+target),rows=[];
    for(const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
        if(rows.length>=maxRows)throw Error('Demasiadas filas públicas.');const row=[];
        for(const cell of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
            const ref=attr(cell[1],'r').match(/^([A-Z]+)\d+$/);if(!ref)continue;
            const index=[...ref[1]].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;if(index>=maxColumns)continue;
            const type=attr(cell[1],'t'),value=cell[2]?.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
            row[index]=type==='s' ? strings[Number(value)] : type==='inlineStr' ? texts(cell[2] || '') : type==='str' ? decode(value || '') : !type && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(value || '') ? Number(value) : undefined;
        }
        rows.push(row);
    }
    return rows;
}
module.exports={publicXlsxSheet};
