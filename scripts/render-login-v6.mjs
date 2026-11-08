import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'art-source/login-scene/v6');
const evidence=path.join(root,'logs/login-v6');
const output=path.join(root,'game/art/clareira-login-loop-v6.mp4');
const candidate=path.join(source,'render-candidate.mp4');
await mkdir(evidence,{recursive:true});
const sources={};
const sceneSource=await readFile(path.join(source,'scene.js'),'utf8');
for(const [name,file] of Object.entries({base:'base.webp',dragon:'dragon-atlas.png',dragonGround:'dragon-ground-atlas.png',deer:'deer-atlas.png',rabbit:'rabbit-atlas.png',fox:'fox-atlas.png',traveler:'traveler-atlas.png',fire:'fire-atlas.png',windowOff:'window-upper-off.webp',castleWindowOff:'castle-window-off.png'})){
  sources[name]=`data:image/${file.endsWith('.webp')?'webp':'png'};base64,${(await readFile(path.join(source,file))).toString('base64')}`;
}
const fingerprint=createHash('sha256').update(sceneSource+JSON.stringify(sources)).digest('hex').slice(0,16);
const frameDirectory=path.join(evidence,`frames-${fingerprint}`);
await mkdir(frameDirectory,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
let encoder;
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await page.setContent('<!doctype html><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style><canvas width="1280" height="720"></canvas>');
  await page.addScriptTag({content:sceneSource});
  await page.evaluate(async sources=>{
    const images={};
    await Promise.all(Object.entries(sources).map(async([name,src])=>{const im=new Image();im.src=src;await im.decode();images[name]=im;}));
    window.film=window.createLoginFilm(images,document.querySelector('canvas'));
  },sources);
  const states=[];
  const checkpoints=[0,35,43,53,60,73,89,96,99.5,103,120,136,148,152,164,180,194,201,212,218,225,230,237,250,260,275,284,295,300,309,315,332,359.983333333,360];
  for(const t of checkpoints){
    states.push(await page.evaluate(t=>window.film.render(t),t));
    const data=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png').split(',')[1]);
    await writeFile(path.join(evidence,`frame-${t.toFixed(3)}.png`),Buffer.from(data,'base64'));
  }
  assert.deepEqual(await readFile(path.join(evidence,'frame-0.000.png')),await readFile(path.join(evidence,'frame-360.000.png')),'the 360s boundary must have the identical rendered state');
  assert.ok(states.find(s=>s.time===99.5).dragon);
  assert.ok(states.find(s=>s.time===43).rabbit);
  assert.ok(states.find(s=>s.time===201).deer);
  assert.ok(states.find(s=>s.time===284).fox.pose>3);
  assert.equal(states[0].dragon,false);
  assert.equal(states.at(-1).deer,false);
  await writeFile(path.join(evidence,'timeline.json'),JSON.stringify(states,null,2));
  if(!process.argv.includes('--preview')){
    const totalFrames=21600,batchSize=6;
    for(let start=0;start<totalFrames;start+=batchSize){
      const indexes=[];
      for(let frame=start;frame<Math.min(start+batchSize,totalFrames);frame++){
        const file=path.join(frameDirectory,`frame-${String(frame).padStart(5,'0')}.jpg`);
        if(!(await stat(file).catch(()=>null)))indexes.push(frame);
      }
      if(indexes.length){
        const captures=await page.evaluate(frames=>frames.map(frame=>{
          window.film.render(frame/60);
          return [frame,document.querySelector('canvas').toDataURL('image/jpeg',.94).split(',')[1]];
        }),indexes);
        for(const [frame,data] of captures){
          const file=path.join(frameDirectory,`frame-${String(frame).padStart(5,'0')}.jpg`);
          await writeFile(file,Buffer.from(data,'base64'));
        }
      }
      if(start%600===0)console.log(JSON.stringify({frame:start,total:totalFrames,seconds:start/60}));
    }
    await browser.close();
    encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','60','-i',path.join(frameDirectory,'frame-%05d.jpg'),'-an','-c:v','libx264','-preset','medium','-qp','20','-x264-params','ipratio=1:pbratio=1:aq-mode=0:mbtree=0:psy=0','-g','1200','-keyint_min','1200','-sc_threshold','0','-pix_fmt','yuv420p','-movflags','+faststart','-r','60',candidate],{stdio:['ignore','ignore','pipe']});
    let error='';encoder.stderr.on('data',chunk=>error+=chunk);
    const[code]=await once(encoder,'close');if(code!==0)throw new Error(error);
    await rename(candidate,output);
    await writeFile(path.join(evidence,'render.json'),JSON.stringify({output,frames:totalFrames,fps:60,duration:360,resolution:[1280,720],closedBoundaryPixelsIdentical:true,encoder:{codec:'libx264',qp:20,ipratio:1,pbratio:1,adaptiveQuantization:false,psy:false,gop:1200}},null,2));
    console.log(JSON.stringify({output,frames:totalFrames,fps:60,duration:360}));
  }
}finally{
  await browser.close();if(encoder&&encoder.exitCode===null)encoder.kill('SIGTERM');
}
