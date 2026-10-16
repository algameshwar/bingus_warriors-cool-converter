import './styles.css';
import {groups,tools,groupTools} from './tools.js';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['convert-form','file-input','drop-zone','drop-title','drop-hint','selected-files','clear-files','operation','primary-options','advanced-options','tool-note','convert','status','error','progress-wrap','progress','cancel','preview','result-row','result-name','result-size','save','share','result-note','categories','category-picker','category-description','remember','reset'].map(id=>[id.replaceAll('-','_'),$(id)]));
const release='https://github.com/algameshwar/bingus_warriors-cool-converter/releases/latest/download/';
$('windows-download').href=release+'Still-Toolbox-Windows-v3.zip';
$('android-download').href=release+'Still-Android.apk';
const storageKey='still-browser-settings-v4';
let saved={remember:true,operations:{}};
try {const data=JSON.parse(localStorage.getItem(storageKey));if(data?.operations&&typeof data.operations==='object')saved=data;}catch{}
let group='video',op='video-compress',selected=[],busy=false,controller,currentResult=[],urls=[];
ui.remember.checked=saved.remember!==false;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatBytes=n=>n<1e6?`${Math.max(1,Math.round(n/1000))} KB`:`${(n/1e6).toFixed(2)} MB`;
const status=s=>ui.status.textContent=s;
const fail=message=>{ui.error.textContent=message;ui.error.hidden=false;};
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}}
function formField(f){
 const value=(ui.remember.checked?saved.operations?.[op]?.[f.id]:undefined)??f.value??'';
 const attrs=Object.entries({min:f.min,max:f.max,step:f.step,placeholder:f.placeholder}).filter(([,v])=>v!==undefined).map(([k,v])=>`${k}="${escape(v)}"`).join(' ');
 if(f.type==='checkbox')return `<label class="check-label"><input data-setting="${f.id}" type="checkbox" ${value?'checked':''}>${escape(f.label)}</label>`;
 const control=f.type==='select'?`<select data-setting="${f.id}">${f.options.map(([v,t])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${escape(t)}</option>`).join('')}</select>`:`<input data-setting="${f.id}" type="${f.type}" value="${escape(value)}" ${attrs}>`;
 return `<label class="field"><span>${escape(f.label)}</span>${control}</label>`;
}
function settings(){
 const values={};document.querySelectorAll('[data-setting]').forEach(input=>{values[input.dataset.setting]=input.type==='checkbox'?input.checked:input.value;});
 if(tools[op].primary==='target')values.target=ui.primary_options.querySelector('[aria-pressed="true"]')?.dataset.target||'30';
 return values;
}
function rememberSettings(){
 saved.remember=ui.remember.checked;
 if(saved.remember){const values=settings();delete values.start;delete values.end;delete values.pages;saved.operations[op]=values;}
 else saved.operations={};
 persist();
}
function renderOptions(){
 const tool=tools[op];
 if(tool.primary==='target'){
  const value=(ui.remember.checked?saved.operations[op]?.target:null)||'30';
  ui.primary_options.innerHTML=`<div class="field"><span>Target size</span><div class="chips">${['10','20','30','custom'].map(v=>`<button type="button" data-target="${v}" aria-pressed="${value===v}">${v==='custom'?'Custom':v+' MB'}</button>`).join('')}</div><div id="custom-target" class="custom-size" ${value==='custom'?'':'hidden'}>${formField({id:'customMb',label:'Custom size (MB)',type:'number',value:30,min:.5,max:2000,step:.5})}</div></div>`;
  $('custom-target').querySelector('input').disabled=value!=='custom';
  ui.primary_options.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>{ui.primary_options.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('custom-target').hidden=button.dataset.target!=='custom';$('custom-target').querySelector('input').disabled=button.dataset.target!=='custom';rememberSettings();}));
 }else ui.primary_options.innerHTML=(tool.primary||[]).map(formField).join('');
 ui.advanced_options.innerHTML=tool.advanced?.length?`<details class="advanced"><summary>Advanced settings</summary><div class="advanced-grid">${tool.advanced.map(formField).join('')}</div></details>`:'';
 ui.tool_note.textContent=tool.note;ui.convert.textContent=tool.action;
 ui.file_input.accept=tool.accept==='*'?'':tool.accept;ui.file_input.multiple=!!tool.multiple;
 const noun={video:'video',audio:'audio file',images:tool.multiple?'images':'image',pdf:tool.multiple?'PDFs':'PDF',documents:'document',files:tool.multiple?'files':'file'}[tool.group];
 ui.drop_title.textContent=`Drop ${tool.multiple?'':'a '}${noun} here`;
 ui.drop_hint.textContent=`or click to browse${tool.multiple?' · choose multiple files':''}`;
 if(!tool.multiple&&selected.length>1)selected=[];
 updateSelected();
}
function setOperation(id){
 op=id;ui.error.hidden=true;renderOptions();
 if(ui.remember.checked){saved.operation=op;saved.group=group;persist();}
}
function setGroup(id){
 if(busy)return;group=id;
 ui.categories.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
 ui.category_picker.value=group;ui.category_description.textContent=groups.find(g=>g.id===group).description;
 const options=groupTools(id);ui.operation.replaceChildren(...options.map(t=>new Option(t.label,t.id)));
 selected=[];ui.file_input.value='';
 const previous=tools[saved.operation]?.group===group?saved.operation:options[0].id;
 ui.operation.value=previous;setOperation(previous);
}
function updateSelected(){
 ui.selected_files.textContent=selected.length?selected.map(f=>`${f.name} (${formatBytes(f.size)})`).join(' · '):'No file selected';
 ui.clear_files.hidden=!selected.length;ui.convert.disabled=!selected.length||busy;
 if(!busy)status(selected.length?'Ready when you are.':'Choose a file to begin.');
}
function pickFiles(files){
 if(busy)return;ui.error.hidden=true;selected=Array.from(files);
 if(!tools[op].multiple&&selected.length>1){selected=[];fail('This tool takes one file at a time.');}
 updateSelected();
}
function validate(){
 if(!selected.length)throw new Error('Choose a file first.');
 if(op==='pdf-merge'&&selected.length<2)throw new Error('Choose at least two PDFs to merge.');
 if(selected.length>200)throw new Error('Choose at most 200 files per job.');
 const total=selected.reduce((n,f)=>n+f.size,0),limit=tools[op].engine==='media'?256e6:100e6;
 if(total>limit)throw new Error(`This browser tool accepts up to ${limit/1e6} MB per job. Use the Windows or Android app for this file.`);
 if(op==='video-compress'){const values=settings(),target=Number(values.target==='custom'?values.customMb:values.target);if(!Number.isFinite(target)||target<.5||target>2000)throw new Error('Choose a target size from 0.5 to 2,000 MB.');}
 const accepts=tools[op].accept.split(',');
 for(const file of selected){if(accepts.includes('*'))continue;const valid=accepts.some(a=>a.startsWith('.')?file.name.toLowerCase().endsWith(a):a.endsWith('/*')?file.type.startsWith(a.slice(0,-1)):file.type===a);if(!valid)throw new Error(`Choose a compatible file for “${tools[op].label}”.`);}
}
function setBusy(on){
 busy=on;document.querySelectorAll('#convert-form input,#convert-form select,#convert-form button,#categories button,#category-picker').forEach(e=>e.disabled=on);
 ui.cancel.disabled=false;ui.progress_wrap.hidden=!on;
 if(!on){const custom=$('custom-target');if(custom?.hidden)custom.querySelector('input').disabled=true;updateSelected();}
}
function showResult(result){
 for(const old of urls)URL.revokeObjectURL(old);urls=[];currentResult=result.files;ui.preview.replaceChildren();
 const file=result.files[0],url=URL.createObjectURL(file);urls.push(url);
 if(result.files.length>1){
  const list=document.createElement('div');list.className='extracted-files';
  for(const item of result.files){const itemUrl=URL.createObjectURL(item);urls.push(itemUrl);const link=document.createElement('a');link.href=itemUrl;link.download=item.name.split('/').pop();link.textContent=`${item.name} · ${formatBytes(item.size)} ↓`;list.append(link);}ui.preview.append(list);
 }else if(file.type.startsWith('image/')){const img=document.createElement('img');img.src=url;img.alt='Converted image';ui.preview.append(img);}
 else if(file.type.startsWith('video/')||file.type.startsWith('audio/')){const media=document.createElement(file.type.startsWith('video/')?'video':'audio');media.src=url;media.controls=true;media.preload='metadata';ui.preview.append(media);}
 else if(result.previewText){const pre=document.createElement('pre');pre.textContent=result.previewText.slice(0,5000);ui.preview.append(pre);}
 else{const icon=document.createElement('span');icon.className='file-icon';icon.textContent=file.name.split('.').pop().toUpperCase();ui.preview.append(icon);const text=document.createElement('p');text.textContent='Your file is ready.';ui.preview.append(text);}
 ui.result_name.textContent=result.files.length>1?`${result.files.length} extracted files`:file.name;
 ui.result_size.textContent=`${formatBytes(result.files.reduce((n,f)=>n+f.size,0))}${result.summary?' · '+result.summary:''}`;
 ui.save.href=url;ui.save.download=file.name.split('/').pop();ui.save.hidden=result.files.length>1;ui.result_row.hidden=false;
 ui.result_note.textContent=result.note||'Your file has been processed locally. Choose Download to save a copy.';
 ui.share.hidden=!navigator.canShare?.({files:result.files});
}
async function convert(event){
 event.preventDefault();if(busy)return;ui.error.hidden=true;
 try{validate();}catch(error){fail(error.message);return;}
 rememberSettings();const options=settings();controller=new AbortController();
 const activeController=controller;
 const ctx={signal:activeController.signal,check:()=>activeController.signal.throwIfAborted(),progress:(percent,message)=>{if(percent===null)ui.progress.removeAttribute('value');else ui.progress.value=Math.min(100,Math.max(0,percent));status(message);},yield:async()=>{await new Promise(r=>setTimeout(r,0));activeController.signal.throwIfAborted();}};
 setBusy(true);let finished='';
 try{
  ctx.progress(null,'Preparing your file…');
  const modules={media:()=>import('./media.js'),images:()=>import('./images.js'),pdf:()=>import('./pdf.js'),files:()=>import('./files.js'),documents:()=>import('./documents.js')};
  const module=await modules[tools[op].engine]();ctx.check();
  const result=await module.convert(op,selected,options,ctx);
  ctx.check();showResult(result);finished='Done. Choose Download to save your file.';
 }catch(error){
  if(activeController.signal.aborted)finished='Conversion cancelled. Your original file is unchanged.';
  else{console.error(error);fail(error.message||'This file could not be converted in this browser. Try the installed app.');finished='Conversion did not finish.';}
 }finally{setBusy(false);status(finished);controller=null;}
}
ui.categories.innerHTML=groups.map(g=>`<button type="button" data-group="${g.id}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${g.path}"/></svg>${g.label}</button>`).join('');
ui.category_picker.replaceChildren(...groups.map(g=>new Option(g.label,g.id)));
ui.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setGroup(b.dataset.group)));
ui.category_picker.addEventListener('change',()=>setGroup(ui.category_picker.value));
ui.operation.addEventListener('change',()=>setOperation(ui.operation.value));
ui.file_input.addEventListener('change',()=>pickFiles(ui.file_input.files));
ui.drop_zone.addEventListener('dragover',e=>{e.preventDefault();if(!busy)ui.drop_zone.classList.add('drag');});
ui.drop_zone.addEventListener('dragleave',()=>ui.drop_zone.classList.remove('drag'));
ui.drop_zone.addEventListener('drop',e=>{e.preventDefault();ui.drop_zone.classList.remove('drag');pickFiles(e.dataTransfer.files);});
ui.clear_files.addEventListener('click',()=>{selected=[];ui.file_input.value='';updateSelected();});
ui.convert_form.addEventListener('submit',convert);
ui.convert_form.addEventListener('change',e=>{if(e.target.matches('[data-setting],#remember'))rememberSettings();});
ui.reset.addEventListener('click',()=>{delete saved.operations[op];persist();renderOptions();});
ui.cancel.addEventListener('click',()=>controller?.abort(new DOMException('Cancelled','AbortError')));
ui.share.addEventListener('click',async()=>{try{await navigator.share({files:currentResult});}catch(e){if(e.name!=='AbortError')fail('Sharing is unavailable here. Use Download to save the file.');}});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
setGroup(groups.some(g=>g.id===saved.group)?saved.group:'video');
