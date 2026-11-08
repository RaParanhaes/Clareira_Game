import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'art-source/login-scene/v5');
const evidence=path.join(root,'logs/login-v5');
const output=path.join(root,'game/art/clareira-login-loop-v5.mp4');
const candidate=path.join(source,'render-candidate.mp4');
await mkdir(evidence,{recursive:true});
const sources={};
const sceneSource=await readFile(path.join(source,'scene.js'),'utf8');
for(const [name,file] of Object.entries({base:'base.webp',dragon:'dragon-atlas.png',deer:'deer-atlas.png',rabbit:'rabbit-atlas.png',fire:'fire-atlas.png'})){
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
  for(const t of [0,3.8,5.5,7.5,10.6,11.5,12.5,14.8,18.5,20.5,23.8,27.1,29.983333333,30]){
    states.push(await page.evaluate(t=>window.film.render(t),t));
    const data=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png').split(',')[1]);
    await writeFile(path.join(evidence,`frame-${t.toFixed(3)}.png`),Buffer.from(data,'base64'));
  }
  assert.deepEqual(await readFile(path.join(evidence,'frame-0.000.png')),await readFile(path.join(evidence,'frame-30.000.png')),'the 30s boundary must have the identical rendered state');
  assert.ok(states.find(s=>s.time===5.5).dragon);
  assert.ok(states.find(s=>s.time===11.5).rabbit);
  assert.ok(states.find(s=>s.time===20.5).deer);
  assert.equal(states[0].dragon,false);
  assert.equal(states.at(-1).deer,false);
  await writeFile(path.join(evidence,'timeline.json'),JSON.stringify(states,null,2));
  if(!process.argv.includes('--preview')){
    for(let frame=0;frame<1800;frame++){
      const file=path.join(frameDirectory,`frame-${String(frame).padStart(4,'0')}.jpg`);
      if(!(await stat(file).catch(()=>null))){
        const data=await page.evaluate(t=>{window.film.render(t);return document.querySelector('canvas').toDataURL('image/jpeg',.94).split(',')[1];},frame/60);
        await writeFile(file,Buffer.from(data,'base64'));
      }
      if(frame%180===0)console.log(JSON.stringify({frame,total:1800,seconds:frame/60}));
    }
    await browser.close();
    encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','60','-i',path.join(frameDirectory,'frame-%04d.jpg'),'-an','-c:v','libx264','-preset','medium','-qp','18','-x264-params','ipratio=1:pbratio=1:aq-mode=0:mbtree=0:psy=0','-g','1800','-keyint_min','1800','-sc_threshold','0','-pix_fmt','yuv420p','-movflags','+faststart','-r','60',candidate],{stdio:['ignore','ignore','pipe']});
    let error='';encoder.stderr.on('data',chunk=>error+=chunk);
    const[code]=await once(encoder,'close');if(code!==0)throw new Error(error);
    await rename(candidate,output);
    await writeFile(path.join(evidence,'render.json'),JSON.stringify({output,frames:1800,fps:60,duration:30,resolution:[1280,720],closedBoundaryPixelsIdentical:true,encoder:{codec:'libx264',qp:18,ipratio:1,pbratio:1,adaptiveQuantization:false,psy:false,gop:1800}},null,2));
    console.log(JSON.stringify({output,frames:1800,fps:60,duration:30}));
  }
}finally{
  await browser.close();if(encoder&&encoder.exitCode===null)encoder.kill('SIGTERM');
}
