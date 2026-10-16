import {FFmpeg} from '@ffmpeg/ffmpeg';
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url';
import {result,outputName,extension} from './common.js';

let engine,coreUrls;
const mime={mp4:'video/mp4',webm:'video/webm',mkv:'video/x-matroska',gif:'image/gif',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',wav:'audio/wav',flac:'audio/flac'};
async function fetchBlob(url,type,ctx) {
  const response=await fetch(url,{signal:ctx.signal});
  if(!response.ok)throw new Error('Engine download failed ('+response.status+'). Check your connection and retry.');
  const total=Number(response.headers.get('content-length')),reader=response.body.getReader(),chunks=[];let loaded=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;
    if(total>1e6)ctx.progress(Math.min(15,loaded/total*15),'Loading conversion engine… '+Math.round(loaded/1e6)+' MB');
  }
  return URL.createObjectURL(new Blob(chunks,{type}));
}
async function load(ctx) {
  if(engine?.loaded)return engine;
  if(!globalThis.WebAssembly||!globalThis.Worker)throw new Error('This browser cannot run the video engine. Try a current Chrome, Edge, Firefox or Safari, or the installed app.');
  if(!coreUrls){
    let lastError;
    for(const base of ['https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/','https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/']){
      const made=[];
      try{
        ctx.progress(null,'Loading the video engine (about 32 MB, first use only)…');
        const coreURL=await fetchBlob(base+'ffmpeg-core.js','text/javascript',ctx);made.push(coreURL);
        const wasmURL=await fetchBlob(base+'ffmpeg-core.wasm','application/wasm',ctx);made.push(wasmURL);
        coreUrls={coreURL,wasmURL};break;
      }catch(e){made.forEach(url=>URL.revokeObjectURL(url));ctx.check();lastError=e;}
    }
    if(!coreUrls)throw lastError;
  }
  ctx.check();engine=new FFmpeg();
  await engine.load({classWorkerURL,...coreUrls},{signal:ctx.signal});
  return engine;
}
function trimOptions(options,duration) {
  const start=Number(options.start||0),end=options.end===''||options.end===undefined?duration:Number(options.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||start>=duration||end>duration+.5)throw new Error('Choose a start and end time within the file duration ('+duration.toFixed(1)+' seconds).');
  return {start,length:Math.min(end,duration)-start};
}
async function clean(e) {
  try{
    for(const item of await e.listDir('/')){
      if(!item.isDir&&!['.','..'].includes(item.name))await e.deleteFile('/'+item.name);
    }
  }catch{}
}
export async function convert(op,files,options,ctx) {
  const file=files[0];
  const targetMB=Number(options.target==='custom'?options.customMb:options.target||30),target=Math.floor(targetMB*1e6);
  if(op==='video-compress'&&file.size<=target&&Number(options.start||0)===0&&!options.end){
    return {files:[file],summary:'already under '+targetMB+' MB',note:'This video already fits your target. Its original quality is preserved.'};
  }
  const abort=()=>{engine?.terminate();engine=null;};
  ctx.signal.addEventListener('abort',abort,{once:true});
  let e,logs=[],progressHandler,logHandler;
  try {
    e=await load(ctx);ctx.check();await clean(e);
    logHandler=({message})=>{logs.push(message);if(logs.length>20)logs.shift();};
    e.on('log',logHandler);
    const input='input.'+extension(file.name);await e.writeFile(input,new Uint8Array(await file.arrayBuffer()));
    ctx.progress(15,'Reading file information…');
    // Probe with FFmpeg itself: this core's standalone ffprobe fails on some WAV inputs.
    // The expected "no output file" exit still provides duration and stream metadata.
    await e.exec(['-hide_banner','-i',input]);
    ctx.check();
    const information=logs.join('\n'),match=information.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const duration=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):NaN;
    if(!Number.isFinite(duration)||duration<=0)throw new Error('The file duration could not be read.');
    const trim=trimOptions(options,duration),hasVideo=/Stream #.*Video:/.test(information),hasAudio=/Stream #.*Audio:/.test(information);
    if(op.startsWith('video-')&&!hasVideo)throw new Error('This file has no video track.');
    const inputArgs=['-ss',String(trim.start),'-i',input,'-t',String(trim.length)];
    let phaseStart=20,phaseSize=75,label='Converting your file…';
    progressHandler=({time})=>ctx.progress(phaseStart+Math.min(1,Math.max(0,time/1e6/trim.length))*phaseSize,label);
    e.on('progress',progressHandler);
    const run=async args=>{
      ctx.check();const code=await e.exec(['-y',...args],600000);ctx.check();
      if(code!==0)throw new Error('The browser engine could not finish this conversion. Try a shorter clip, a different format, or the installed app.');
    };
    if(op==='video-compress'){
      if(!Number.isFinite(target)||target<500000||target>2e9)throw new Error('Choose a target between 0.5 and 2,000 MB.');
      let audioRate=hasAudio?96:0;
      const totalRate=target*.94*8/1000/trim.length;
      if(totalRate<160)audioRate=hasAudio?48:0;
      let videoRate=Math.floor(totalRate-audioRate);
      if(videoRate<36)throw new Error('That target is too small for the video length. Trim the clip or choose a larger target.');
      for(let attempt=0;attempt<2;attempt++){
        const height=options.resolution&&options.resolution!=='auto'?Number(options.resolution):videoRate<350?360:videoRate<800?480:videoRate<1800?720:1080;
        const filter="scale=-2:'trunc(min("+height+",ih)/2)*2'";
        const videoArgs=['-map','0:v:0','-vf',filter,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-b:v',videoRate+'k','-threads','1','-passlogfile','still-pass'];
        phaseStart=attempt?70:20;phaseSize=attempt?10:32;label='Analyzing video'+(attempt?' again':'')+'…';
        await run([...inputArgs,...videoArgs,'-pass','1','-an','-f','null','/dev/null']);
        phaseStart=attempt?80:52;phaseSize=attempt?17:44;label='Compressing to '+targetMB+' MB…';
        const audioArgs=hasAudio?['-map','0:a:0?','-c:a','aac','-b:a',audioRate+'k','-ar','48000','-ac','2']:['-an'];
        await run([...inputArgs,...videoArgs,'-pass','2',...audioArgs,'-movflags','+faststart','output.mp4']);
        const bytes=await e.readFile('output.mp4');ctx.check();
        if(bytes.byteLength<=target)return result(bytes,outputName(file.name,'mp4'),mime.mp4,{summary:'verified under '+targetMB+' MB',note:'Finished size was checked against your target. Your original file is unchanged.'});
        videoRate=Math.floor(videoRate*(target/bytes.byteLength)*.9);
        if(videoRate<36)break;
      }
      throw new Error('This clip could not fit that target with its current settings. Try a larger target or trim the clip.');
    }
    const audioOnly=op==='audio-convert'||op==='video-audio';
    const ext=options.format||(audioOnly?'mp3':'mp4');
    if(audioOnly){
      if(!hasAudio)throw new Error('This file has no audio track.');
      const codecs={mp3:'libmp3lame',m4a:'aac',wav:'pcm_s16le',ogg:'libvorbis',flac:'flac'},codec=codecs[ext];
      if(!codec)throw new Error('Choose a supported audio output.');
      const args=[...inputArgs,'-vn','-c:a',codec,'-ar','48000','-ac','2'];
      if(options.normalize){
        label='Analyzing audio volume…';phaseStart=20;phaseSize=25;
        await run([...inputArgs,'-vn','-af','volumedetect','-f','null','/dev/null']);
        const peak=logs.join('\n').match(/max_volume:\s*(-?[\d.]+)\s*dB/);
        if(peak)args.push('-af','volume='+Math.min(24,-1-Number(peak[1])).toFixed(2)+'dB');
        label='Converting normalized audio…';phaseStart=45;phaseSize=50;
      }
      if(!['wav','flac'].includes(ext))args.push('-b:a',String(options.bitrate||192)+'k');
      await run([...args,'output.'+ext]);
    }else{
      const height=options.resolution&&options.resolution!=='auto'?Number(options.resolution):1080;
      const scale="scale=-2:'trunc(min("+height+",ih)/2)*2'";
      if(ext==='gif'){
        if(trim.length>30)throw new Error('GIF clips must be 30 seconds or shorter. Set an end time in Advanced settings.');
        await run([...inputArgs,'-vf',"fps=12,scale=-2:'min(480,ih)'",'-an','output.gif']);
      }else if(ext==='webm')await run([...inputArgs,'-vf',scale,'-c:v','libvpx','-crf','10','-b:v','1500k','-deadline','realtime','-cpu-used','8','-threads','1','-c:a','libvorbis','-ar','48000','-ac','2','output.webm']);
      else await run([...inputArgs,'-vf',scale,'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-threads','1','-c:a','aac',...(ext==='mp4'?['-movflags','+faststart']:[]),'output.'+ext]);
    }
    const bytes=await e.readFile('output.'+ext);
    if(!bytes.byteLength)throw new Error('The conversion produced no output.');
    return result(bytes,outputName(file.name,ext),mime[ext],{summary:trim.length.toFixed(1)+' seconds'});
  }catch(error){
    if(!ctx.signal.aborted)console.error('Media conversion failed',logs.slice(-5));
    throw error;
  }finally{
    ctx.signal.removeEventListener('abort',abort);
    if(e){if(progressHandler)e.off('progress',progressHandler);if(logHandler)e.off('log',logHandler);e.terminate();}
    engine=null;
  }
}
