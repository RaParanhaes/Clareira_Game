import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'art-source/login-scene/v6');
const out=path.join(root,'logs/login-v6/previews');await mkdir(out,{recursive:true});
const files={base:'base.webp',dragon:'dragon-atlas.png',dragonGround:'dragon-ground-atlas.png',deer:'deer-atlas.png',rabbit:'rabbit-atlas.png',fox:'fox-atlas.png',traveler:'traveler-atlas.png',fire:'fire-atlas.png',windowOff:'window-upper-off.webp',castleWindowOff:'castle-window-off.png'};
const urls={};for(const[name,file]of Object.entries(files))urls[name]=`data:image/${file.endsWith('.webp')?'webp':'png'};base64,${(await readFile(path.join(source,file))).toString('base64')}`;
const clips=[
 ['01-dragon-approach',86,107,30],['02-dragon-perch-look',108,143,30],['03-dragon-breath',143,158,30],['04-dragon-departure',161,187,30],['05-dragon-return',296,319,30],
 ['06-rabbit-route-a',34,63,30],['07-rabbit-route-b',241,272,30],['08-deer-bridge',184,215,30],['09-fox-sleepy-wake',218,236,30],['10-fox-full-wake',269,299,30],['11-window-off-on',68,83,30],['12-river-current',0,8,30],['13-traveler',213,243,30],['14-castle-window',273,282,30]
];
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 await page.setContent('<!doctype html><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style><canvas width="1280" height="720"></canvas>');
 await page.addScriptTag({content:await readFile(path.join(source,'scene.js'),'utf8')});
 await page.evaluate(async urls=>{const images={};await Promise.all(Object.entries(urls).map(async([name,src])=>{const im=new Image();im.src=src;await im.decode();images[name]=im}));window.film=window.createLoginFilm(images,document.querySelector('canvas'))},urls);
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
 for(const[name,start,end,fps]of clips){
   if(only&&!only.some(prefix=>name.startsWith(prefix)))continue;
   const dir=path.join(out,name);await mkdir(dir,{recursive:true});const total=Math.round((end-start)*fps),batch=10;
   for(let i=0;i<total;i+=batch){
     const indexes=Array.from({length:Math.min(batch,total-i)},(_,j)=>i+j);
     const captures=await page.evaluate(({indexes,start,fps})=>indexes.map(i=>{window.film.render(start+i/fps);return [i,document.querySelector('canvas').toDataURL('image/jpeg',.92).split(',')[1]]}),{indexes,start,fps});
     for(const[i,data]of captures)await writeFile(path.join(dir,`frame-${String(i).padStart(4,'0')}.jpg`),Buffer.from(data,'base64'));
   }
   const mp4=path.join(out,`${name}.mp4`);
   const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',path.join(dir,'frame-%04d.jpg'),'-an','-c:v','libx264','-preset','fast','-qp','20','-g',String(fps*10),'-keyint_min',String(fps*10),'-sc_threshold','0','-pix_fmt','yuv420p','-movflags','+faststart',mp4],{stdio:['ignore','ignore','pipe']});
   let err='';ff.stderr.on('data',b=>err+=b);const[code]=await once(ff,'close');if(code)throw new Error(`${name}: ${err}`);
   console.log(`${name} ${total} frames`);
 }
}finally{await browser.close()}
