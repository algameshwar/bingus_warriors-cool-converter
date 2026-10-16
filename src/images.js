import {PDFDocument} from 'pdf-lib';
import {outputName,result} from './common.js';

async function decode(file) {
  const url=URL.createObjectURL(file),image=new Image();
  try {
    image.src=url;await image.decode();
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40e6)throw new Error('Choose an image with no more than 40 megapixels.');
    return image;
  }finally{URL.revokeObjectURL(url);}
}
function draw(image,width,height,white=false) {
  const ratio=Math.min(1,width>0?width/image.naturalWidth:1,height>0?height/image.naturalHeight:1);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const context=canvas.getContext('2d');
  if(white){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);}
  context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}
async function blob(canvas,type,quality=.9) {
  const output=await new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  if(!output||output.type!==type)throw new Error('This browser cannot encode the requested image format. Try PNG or JPG.');
  return output;
}
export async function convert(op,files,options,ctx) {
  if(op==='images-pdf') {
    const pdf=await PDFDocument.create();
    for(let i=0;i<files.length;i++){
      ctx.check();ctx.progress(i/files.length*100,'Adding image '+(i+1)+' of '+files.length+'…');
      const image=await decode(files[i]),canvas=draw(image,3000,3000);
      const imageBytes=await (await blob(canvas,'image/png')).arrayBuffer();
      const embedded=await pdf.embedPng(imageBytes);
      const dims=options.paper==='fit'?[canvas.width*.75,canvas.height*.75]:[595.28,841.89];
      const page=pdf.addPage(dims),margin=options.paper==='fit'?0:28;
      const scale=Math.min((dims[0]-margin*2)/embedded.width,(dims[1]-margin*2)/embedded.height);
      const w=embedded.width*scale,h=embedded.height*scale;
      page.drawImage(embedded,{x:(dims[0]-w)/2,y:(dims[1]-h)/2,width:w,height:h});
      canvas.width=canvas.height=1;await ctx.yield();
    }
    return result(await pdf.save(),'still-images.pdf','application/pdf',{summary:files.length+' pages'});
  }
  const image=await decode(files[0]),ext=options.format||'jpg';
  const width=Number(options.width||0),height=Number(options.height||0),quality=Number(options.quality||90);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0||width>10000||height>10000||quality<10||quality>100)throw new Error('Enter valid image dimensions and a quality from 10 to 100.');
  const canvas=draw(image,width,height,ext==='jpg');
  ctx.check();
  const output=await blob(canvas,ext==='jpg'?'image/jpeg':'image/'+ext,quality/100);
  const dims=canvas.width+' × '+canvas.height;
  canvas.width=canvas.height=1;
  return result(output,outputName(files[0].name,ext),output.type,{summary:dims});
}
