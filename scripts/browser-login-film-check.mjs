import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const output=process.argv[2]||'logs/login-v5/live';
const origin=process.env.CLAREIRA_LOGIN_ANIMATION_URL||'https://vmi3579939.contaboserver.net/dev/';
const visualOnly=process.argv.includes('--visual-only');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try{
  for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,isMobile:name==='mobile',hasTouch:name==='mobile'});
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    console.log(JSON.stringify({name,stage:'page-loaded'}));
    await page.waitForFunction(()=>document.querySelector('#scene-loading').hidden&&!document.querySelector('.shell').inert,{}, {timeout:90000});
    await page.waitForFunction(()=>document.querySelector('#auth-scene-video').currentTime>.1,{}, {timeout:45000});
    const published=await page.locator('#auth-scene-video').getAttribute('data-src');assert.match(published,/loop-v5\.mp4$/);
    console.log(JSON.stringify({name,stage:'film-playing'}));
    const samples=[];
    for(const version of (visualOnly?[]:['v4','v5'])){
      await page.evaluate(version=>{
        const video=document.querySelector('#auth-scene-video');video.preload='auto';
        video.src=`/dev/art/clareira-login-loop-${version}.mp4`;video.load();
      },version);
      await page.waitForFunction(()=>document.querySelector('#auth-scene-video').readyState>=2,{}, {timeout:30000});
      await page.locator('#auth-scene-video').evaluate(video=>video.play());
      console.log(JSON.stringify({name,stage:'comparison',version}));
      for(let sample=0;sample<3;sample++){
        await page.locator('#auth-scene-video').evaluate(async(video,time)=>{video.currentTime=time;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));},4+sample*8);
        await page.waitForTimeout(400);
        const data=await page.evaluate(async()=>{
          const video=document.querySelector('#auth-scene-video'),start=video.getVideoPlaybackQuality();
          const frames=[];let previous=performance.now(),initial=previous;
          await new Promise(resolve=>{const tick=now=>{frames.push(now-previous);previous=now;if(now-initial<2500)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
          frames.sort((a,b)=>a-b);const end=video.getVideoPlaybackQuality();
          return {p95:frames[Math.floor(frames.length*.95)],p99:frames[Math.floor(frames.length*.99)],max:Math.max(...frames),total:end.totalVideoFrames-start.totalVideoFrames,dropped:end.droppedVideoFrames-start.droppedVideoFrames,heap:performance.memory?.usedJSHeapSize};
        });samples.push({version,sample,...data});
      }
    }
    const scenes=[];
    for(const [event,time,point] of [['dragon',5.5,[602,114]],['rabbit',11.5,[1141,773]],['deer',20.5,[280,355]]]){
      await page.locator('#auth-scene-video').evaluate(async(video,time)=>{video.pause();video.currentTime=time;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));},time);
      await page.waitForTimeout(550);
      const composition=await page.evaluate(point=>{
        const video=document.querySelector('#auth-scene-video'),r=video.getBoundingClientRect(),access=document.querySelector('.auth-access').getBoundingClientRect(),style=getComputedStyle(video);
        const width=video.clientWidth,height=video.clientHeight,fit=Math.max(width/1672,height/941),position=parseFloat(style.objectPosition)/100,scale=r.width/width;
        const x=r.left+(point[0]*fit-(1672*fit-width)*position)*scale;
        const y=r.top+(point[1]*fit-(941*fit-height)*.5)*scale;
        return {x,y,position:style.objectPosition,transform:style.transform,access:{left:access.left,right:access.right,top:access.top,bottom:access.bottom},viewport:[innerWidth,innerHeight]};
      },point);
      await page.screenshot({path:`${output}/${name}-${event}.png`});
      assert.ok(composition.x>=0&&composition.x<=viewport.width,`${name} ${event} must fit horizontally: ${JSON.stringify(composition)}`);
      assert.ok(composition.y>=0&&composition.y<=viewport.height,`${name} ${event} must fit vertically`);
      const a=composition.access;
      assert.ok(composition.x<a.left||composition.x>a.right||composition.y<a.top||composition.y>a.bottom,`${name} ${event} is covered by the login form: ${JSON.stringify(composition)}`);
      scenes.push({event,time,...composition});
    }
    assert.deepEqual(errors,[]);results.push({name,published,samples,scenes,errors});
    await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));await context.close();
  }
  console.log(JSON.stringify(results));
}finally{await browser.close();}
