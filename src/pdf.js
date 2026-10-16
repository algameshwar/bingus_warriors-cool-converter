import {PDFDocument,degrees} from 'pdf-lib';
import {pack,outputName,result,pageIndices} from './common.js';

async function load(file) {
  try {
    const doc=await PDFDocument.load(await file.arrayBuffer());
    if(doc.getPageCount()>500)throw new Error('Use the installed app for PDFs with more than 500 pages.');
    return doc;
  }catch(e) {
    if(/encrypt/i.test(e.message))throw new Error('This PDF is password protected. Unlock it first in the installed app.');
    throw e;
  }
}
export async function convert(op,files,options,ctx) {
  if(op==='pdf-merge') {
    const output=await PDFDocument.create();let total=0;
    for(let i=0;i<files.length;i++){
      const source=await load(files[i]);total+=source.getPageCount();
      if(total>500)throw new Error('Merge up to 500 pages at a time in the browser.');
      const pages=await output.copyPages(source,source.getPageIndices());
      pages.forEach(p=>output.addPage(p));ctx.progress((i+1)/files.length*100,'Merging PDF '+(i+1)+' of '+files.length+'…');await ctx.yield();
    }
    return result(await output.save(),'still-merged.pdf','application/pdf',{summary:total+' pages'});
  }
  const source=await load(files[0]),indices=pageIndices(options.pages,source.getPageCount());
  if(op==='pdf-rotate'){
    for(const i of indices){const page=source.getPage(i);page.setRotation(degrees((page.getRotation().angle+Number(options.angle||90))%360));}
    return result(await source.save(),outputName(files[0].name,'pdf'),'application/pdf',{summary:indices.length+' pages rotated'});
  }
  if(op==='pdf-optimize'){
    const bytes=await source.save({useObjectStreams:true});
    if(bytes.length>=files[0].size)return {files:[files[0]],note:'This PDF is already compact. Its original file is the smaller version.'};
    return result(bytes,outputName(files[0].name,'pdf'),'application/pdf',{summary:'structure optimized'});
  }
  if(op==='pdf-extract'){
    const output=await PDFDocument.create(),pages=await output.copyPages(source,indices);
    pages.forEach(p=>output.addPage(p));ctx.check();
    return result(await output.save(),outputName(files[0].name,'pdf'),'application/pdf',{summary:pages.length+' pages'});
  }
  const entries={};
  for(let n=0;n<indices.length;n++){
    const page=await PDFDocument.create(),[copy]=await page.copyPages(source,[indices[n]]);page.addPage(copy);
    entries['page-'+String(indices[n]+1).padStart(3,'0')+'.pdf']=await page.save();
    ctx.progress((n+1)/indices.length*95,'Splitting page '+(n+1)+' of '+indices.length+'…');await ctx.yield();
  }
  return result(await pack(entries,ctx),outputName(files[0].name,'zip'),'application/zip',{summary:indices.length+' pages'});
}
