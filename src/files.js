import Papa from 'papaparse';
import {archive,pack,result,outputName,binaryMime} from './common.js';

export function parseCsv(text,header=false) {
  const parsed=Papa.parse(text,{header,skipEmptyLines:'greedy',transformHeader:v=>v.trim()});
  const serious=parsed.errors.filter(e=>e.type!=='Delimiter');
  if(serious.length)throw new Error('CSV is inconsistent: '+serious[0].message);
  return parsed.data;
}
export function objectsCsv(data) {
  if(!Array.isArray(data)||data.some(row=>!row||Array.isArray(row)||typeof row!=='object'))throw new Error('Use a JSON array of objects for CSV conversion.');
  return Papa.unparse(data.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value!==null&&typeof value==='object'?JSON.stringify(value):value]))));
}
export async function convert(op,files,options,ctx) {
  const file=files[0];
  if(op==='zip-create'){
    const entries=Object.create(null);
    for(let i=0;i<files.length;i++){
      const f=files[i],name=f.name.replaceAll('\\','_').replaceAll('/','_');
      if(Object.hasOwn(entries,name))throw new Error('Two selected files have the same name. Rename one before creating the ZIP.');
      entries[name]=new Uint8Array(await f.arrayBuffer());await ctx.yield();
    }
    return result(await pack(entries,ctx),'still-files.zip','application/zip',{summary:files.length+' files'});
  }
  if(op==='zip-extract'){
    const entries=archive(new Uint8Array(await file.arrayBuffer()),200);
    const extracted=Object.entries(entries).filter(([name])=>!name.endsWith('/')).map(([name,bytes])=>new File([bytes],name,{type:binaryMime(name)}));
    if(!extracted.length)throw new Error('This ZIP contains no files.');
    return {files:extracted,note:'Choose a file link above to download it. Folder names are shown; each download saves a separate file.'};
  }
  if(op==='sha256'){
    const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());ctx.check();
    const hex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const text=hex+'  '+file.name+'\n';
    return result(text,file.name+'.sha256','text/plain',{previewText:text});
  }
  if(op==='base64-encode'){
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768){binary+=String.fromCharCode(...bytes.subarray(i,i+32768));if(i%1048576===0)await ctx.yield();}
    const text=btoa(binary);
    return result(text,file.name+'.base64.txt','text/plain',{previewText:text});
  }
  let text=await file.text();ctx.check();
  if(op==='base64-decode'){
    const dataUrl=text.trim().match(/^data:([^;,]*)(?:;[^,]*)?;base64,([\s\S]+)$/i);
    const body=(dataUrl?dataUrl[2]:text).replace(/\s+/g,'');
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(body)||body.length%4===1)throw new Error('This file does not contain valid Base64 text.');
    const binary=atob(body),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return result(bytes,'still-decoded.bin',dataUrl?.[1]||'application/octet-stream');
  }
  if(op==='csv-json')text=JSON.stringify(parseCsv(text,true),null,2);
  else if(op==='json-csv')text=objectsCsv(JSON.parse(text));
  else text=JSON.stringify(JSON.parse(text),null,op==='json-minify'?0:2);
  const ext=op==='json-csv'?'csv':'json';
  return result(text,outputName(file.name,ext),ext==='csv'?'text/csv':'application/json',{previewText:text});
}
