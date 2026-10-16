import {strToU8} from 'fflate';
import Papa from 'papaparse';
import {archive,entryText,xml,xmlText,xmlEscape,pack,result,outputName} from './common.js';
import {parseCsv,objectsCsv} from './files.js';

const utf8=map=>Object.fromEntries(Object.entries(map).map(([name,text])=>[name,strToU8(text)]));
const officeTypes='http://schemas.openxmlformats.org/package/2006/content-types';
const relationType='http://schemas.openxmlformats.org/package/2006/relationships';
const wordType='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
async function word(text,ctx) {
  const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+wordType+'"><w:body>'+text.split(/\r?\n/).map(line=>'<w:p><w:r><w:t xml:space="preserve">'+xmlEscape(line)+'</w:t></w:r></w:p>').join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
  return pack(utf8({
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="'+officeTypes+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="'+relationType+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':documentXml,
  }),ctx);
}
async function textPdf(sections,title,ctx) {
  const {jsPDF}=await import('jspdf');
  const doc=new jsPDF({unit:'pt',format:'a4',compress:true});
  doc.setProperties({title,creator:'Still browser converter'});
  doc.setFont('helvetica');doc.setFontSize(11);
  const width=doc.internal.pageSize.getWidth()-90,height=doc.internal.pageSize.getHeight();
  let first=true;
  for(const section of sections){
    // Avoid silently replacing unsupported characters in the standard PDF font.
    if(/[^\x09\x0A\x0D\x20-\xFF\u2010-\u2027\u20AC]/.test(section))throw new Error('This document needs fonts the browser PDF exporter does not include. Use the Windows app to preserve its characters.');
    if(!first)doc.addPage();first=false;
    let y=48;
    for(const paragraph of section.replace(/\r/g,'').split('\n')){
      const lines=doc.splitTextToSize(paragraph||' ',width);
      for(const line of lines){if(y>height-48){doc.addPage();y=48;}doc.text(line,45,y);y+=15;}
      await ctx.yield();
    }
  }
  return doc.output('arraybuffer');
}
async function pdfText(file,ctx) {
  const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
  const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
  const abort=()=>task.destroy();ctx.signal.addEventListener('abort',abort,{once:true});
  try{
    const doc=await task.promise;
    if(doc.numPages>500)throw new Error('Use the installed app for PDFs with more than 500 pages.');
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),content=await page.getTextContent();
      let lines='',lastY;
      for(const item of content.items){
        if(!('str' in item))continue;
        const y=item.transform[5];
        if(lastY!==undefined&&Math.abs(y-lastY)>3&&!lines.endsWith('\n'))lines+='\n';
        lines+=item.str+(item.hasEOL?'\n':' ');lastY=y;
      }
      pages.push(lines.trim());page.cleanup();ctx.progress(i/doc.numPages*90,'Reading PDF page '+i+' of '+doc.numPages+'…');await ctx.yield();
    }
    if(!pages.join('').trim())throw new Error('This PDF has no selectable text. Use OCR in another app for scanned pages.');
    return pages;
  }catch(e){
    if(e.name==='PasswordException')throw new Error('This PDF needs a password. Unlock it in the installed app first.');
    throw e;
  }finally{ctx.signal.removeEventListener('abort',abort);await task.destroy();}
}
function column(index) {
  let name='';for(index++;index;index=Math.floor((index-1)/26))name=String.fromCharCode(65+(index-1)%26)+name;return name;
}
function columnNumber(name) {
  let number=0;for(const char of name)number=number*26+char.charCodeAt(0)-64;return number-1;
}
async function spreadsheet(rows,ctx) {
  if(rows.length>50000||rows.some(row=>row.length>1000))throw new Error('Use at most 50,000 rows and 1,000 columns in the browser.');
  let count=0;
  const rowXml=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{
    if(++count>200000)throw new Error('This sheet exceeds 200,000 cells. Use the installed app.');
    return '<c r="'+column(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value??'')+'</t></is></c>';
  }).join('')+'</row>').join('');
  return pack(utf8({
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="'+officeTypes+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="'+relationType+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="'+relationType+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rowXml+'</sheetData></worksheet>',
  }),ctx);
}
function readSpreadsheet(entries) {
  const book=xml(entryText(entries,'xl/workbook.xml')),sheet=book.getElementsByTagNameNS('*','sheet')[0];
  if(!sheet)throw new Error('This workbook has no worksheets.');
  const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rels=xml(entryText(entries,'xl/_rels/workbook.xml.rels'));
  const rel=[...rels.getElementsByTagNameNS('*','Relationship')].find(n=>n.getAttribute('Id')===id);
  const target=rel?.getAttribute('Target');
  if(!target)throw new Error('The first worksheet could not be located.');
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const source=xml(entryText(entries,path));
  const strings=entries['xl/sharedStrings.xml']?[...xml(entryText(entries,'xl/sharedStrings.xml')).getElementsByTagNameNS('*','si')].map(node=>xmlText(node,'t').join('')):[];
  const rows=[];let total=0;
  for(const row of source.getElementsByTagNameNS('*','row')){
    const rowIndex=Number(row.getAttribute('r')||rows.length+1)-1;
    if(rowIndex>50000)throw new Error('This worksheet is too large for the browser.');
    const values=[];
    for(const cell of row.getElementsByTagNameNS('*','c')){
      if(++total>200000)throw new Error('Use the installed app for sheets with over 200,000 cells.');
      const col=columnNumber(cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0]||'A');
      if(col>1000)throw new Error('This sheet has too many columns for the browser.');
      const type=cell.getAttribute('t'),raw=xmlText(cell,'v')[0]||'';
      values[col]=type==='s'?strings[Number(raw)]??'':type==='inlineStr'?xmlText(cell,'t').join(''):type==='b'?(raw==='1'?'TRUE':'FALSE'):raw;
    }
    rows[rowIndex]=values;
  }
  return Array.from({length:rows.length},(_,i)=>Array.from({length:rows[i]?.length||0},(_,j)=>rows[i][j]??''));
}
export async function convert(op,files,options,ctx) {
  const file=files[0];
  if(op==='csv-xlsx'){
    const rows=parseCsv(await file.text());
    return result(await spreadsheet(rows,ctx),outputName(file.name,'xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  if(op==='xlsx-csv'||op==='xlsx-json'){
    const rows=readSpreadsheet(archive(new Uint8Array(await file.arrayBuffer())));
    let text,ext;
    if(op==='xlsx-json'){
      const keys=rows[0]||[];text=JSON.stringify(rows.slice(1).map(row=>Object.fromEntries(keys.map((key,i)=>[key,row[i]??'']))),null,2);ext='json';
    }else{text=Papa.unparse(rows);ext='csv';}
    return result(text,outputName(file.name,ext),ext==='csv'?'text/csv':'application/json',{previewText:text});
  }
  let sections;
  if(op.startsWith('pdf-'))sections=await pdfText(file,ctx);
  else if(op.startsWith('docx-')){
    const entries=archive(new Uint8Array(await file.arrayBuffer()));
    const doc=xml(entryText(entries,'word/document.xml'));
    sections=[[...doc.getElementsByTagNameNS('*','p')].map(p=>xmlText(p,'t').join('')).join('\n\n')];
  }else if(op.startsWith('pptx-')){
    const entries=archive(new Uint8Array(await file.arrayBuffer()));
    const presentation=xml(entryText(entries,'ppt/presentation.xml'));
    const relationships=xml(entryText(entries,'ppt/_rels/presentation.xml.rels'));
    const rels=Object.fromEntries([...relationships.getElementsByTagNameNS('*','Relationship')].map(n=>[n.getAttribute('Id'),n.getAttribute('Target')]));
    const slides=[...presentation.getElementsByTagNameNS('*','sldId')].map(n=>{
      const target=rels[n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')];
      if(!target)throw new Error('A slide relationship is missing.');
      return target.startsWith('/')?target.slice(1):'ppt/'+target.replace(/^\.\//,'');
    });
    if(!slides.length)throw new Error('No slides were found in this PowerPoint file.');
    sections=slides.map(name=>xmlText(xml(entryText(entries,name)),'t').join('\n'));
  }else sections=[await file.text()];
  ctx.check();
  const text=sections.join('\n\n');
  if(text.length>2e6)throw new Error('Use the installed app for documents with more than two million text characters.');
  if(op.endsWith('-pdf')){
    return result(await textPdf(sections,file.name,ctx),outputName(file.name,'pdf'),'application/pdf',{note:'Created with basic text layout. The Windows app can preserve more of the original formatting.'});
  }
  if(op.endsWith('-docx')){
    return result(await word(text,ctx),outputName(file.name,'docx'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',{note:'Editable text was preserved. Original page layout and pictures are not recreated.'});
  }
  return result(text,outputName(file.name,'txt'),'text/plain',{previewText:text});
}
