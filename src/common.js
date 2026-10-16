import {zip,unzipSync,strFromU8} from 'fflate';

export const extension=name=>name.split('.').pop().toLowerCase();
export const outputName=(name,ext)=>name.replace(/\.[^.]+$/,'').slice(0,120)+'-still.'+ext;
export function result(bytes,name,type,extra={}) {
  return {files:[new File([bytes],name,{type})],...extra};
}
export const xmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function xml(text) {
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('This document contains invalid XML.');
  return doc;
}
export const xmlText=(doc,local)=>[...doc.getElementsByTagNameNS('*',local)].map(n=>n.textContent);
export function archive(bytes,maxFiles=2000) {
  let total=0,count=0;
  const entries=unzipSync(bytes,{filter:entry=>{
    total+=entry.originalSize;count++;
    if(count>maxFiles||total>100e6||entry.originalSize>100e6)throw new Error('This archive expands beyond the browser limit (100 MB).');
    const name=entry.name.replaceAll('\\','/');
    if(name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').includes('..')||name.includes('\0'))throw new Error('This archive contains an unsafe file path.');
    return true;
  }});
  const actual=Object.values(entries).reduce((n,b)=>n+b.byteLength,0);
  if(actual>100e6)throw new Error('The extracted files exceed the 100 MB browser limit.');
  return entries;
}
export function entryText(entries,name) {
  if(!entries[name])throw new Error('This file is missing a required document part: '+name);
  return strFromU8(entries[name]);
}
export function pack(entries,ctx,level=6) {
  ctx.check();
  return new Promise((resolve,reject)=>{
    let stop;
    const abort=()=>{stop?.();reject(ctx.signal.reason);};
    ctx.signal.addEventListener('abort',abort,{once:true});
    stop=zip(entries,{level},(err,bytes)=>{
      ctx.signal.removeEventListener('abort',abort);
      if(ctx.signal.aborted)reject(ctx.signal.reason);
      else if(err)reject(err);else resolve(bytes);
    });
  });
}
export function pageIndices(text,count) {
  if(!String(text||'').trim())return Array.from({length:count},(_,i)=>i);
  const pages=[];
  for(const token of text.split(',')) {
    const match=token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!match)throw new Error('Use page numbers such as 1-3, 5.');
    const start=Number(match[1]),end=Number(match[2]||match[1]);
    if(start<1||end>count||start>end)throw new Error('Page range is outside this PDF (1–'+count+').');
    for(let n=start;n<=end;n++)if(!pages.includes(n-1))pages.push(n-1);
  }
  return pages;
}
export const binaryMime=name=>({
  pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
  json:'application/json',csv:'text/csv',txt:'text/plain',mp4:'video/mp4',mp3:'audio/mpeg',
  wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg',flac:'audio/flac',zip:'application/zip'
}[extension(name)]||'application/octet-stream');
