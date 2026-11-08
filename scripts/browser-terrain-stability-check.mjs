import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/terrain-stability';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try {
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
   const {createSceneArt}=await import('/dev/scene-art.mjs');
   const {getWorldDefinition,applyWorldDefinition,SPAWN_CAMPFIRE}=await import('/dev/world.mjs');
   const art=createSceneArt(),definition=getWorldDefinition();
   const cx=Math.floor(SPAWN_CAMPFIRE.x/8),cy=Math.floor(SPAWN_CAMPFIRE.y/8);
   const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=308;
   canvas.style='width:100%;image-rendering:pixelated;background:white';
   const ctx=canvas.getContext('2d');
   const sample=offset=>{
    ctx.save();ctx.translate(offset,0);art.terrain(ctx,{x:256,y:20},cx,cy,32);ctx.restore();
    const x=Math.floor(SPAWN_CAMPFIRE.x)-cx*8,y=Math.floor(SPAWN_CAMPFIRE.y)-cy*8;
    return [...ctx.getImageData(offset+256+(x-y)*32,20+(x+y+1)*18,1,1).data];
   };
   art.preloadTerrainChunks([{cx,cy}]);art.processTerrainQueue(64,10000);
   const before=sample(0);
   applyWorldDefinition({...definition,revision:definition.revision+1});
   const refresh=sample(512);
   art.processTerrainQueue(1,10000);
   const partial=sample(1024);
   art.processTerrainQueue(64,10000);
   ctx.clearRect(1024,0,512,308);
   const complete=sample(1024);
   applyWorldDefinition({...definition,revision:definition.revision+2,edits:[...definition.edits,
     {id:'terrain-regression-lake',type:'lake',waterKind:'pond',x:SPAWN_CAMPFIRE.x,y:SPAWN_CAMPFIRE.y,radius:4}]});
   sample(1024);art.processTerrainQueue(64,10000);
   ctx.clearRect(1024,0,512,308);
   const changed=sample(1024);
   applyWorldDefinition({...definition,seed:definition.seed+1});
   ctx.clearRect(1024,0,512,308);
   const differentWorld=sample(1024);
   document.body.replaceChildren(canvas);
   return {before,refresh,partial,complete,changed,differentWorld};
  });
  await page.screenshot({path:`${output}/${name}.png`});
  await writeFile(`${output}/${name}.json`,JSON.stringify(result,null,2));
  assert.deepEqual(result.refresh,result.before,`${name}: completed brown ground must remain visible during revision refresh`);
  assert.deepEqual(result.partial,result.before,`${name}: partial chunk must not replace completed ground`);
  assert.deepEqual(result.complete,result.before,`${name}: a completed refresh keeps identical ground`);
  assert.notDeepEqual(result.changed,result.before,`${name}: completed real terrain edits become visible`);
  assert.notDeepEqual(result.differentWorld,result.before,`${name}: no previous world leaks into a new seed`);
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#guest-form button[type=submit]').click();
  await page.evaluate(async()=>{window.groundState=(await import('/dev/main.js')).inspectMovement;});
  await page.waitForFunction(()=>window.groundState().readiness.sceneReady);
  await page.screenshot({path:`${output}/${name}-world-before.png`});
  await page.locator('#world').focus();
  if(name==='desktop')await page.keyboard.down('ArrowDown');
  else {const b=await page.locator('[data-move="0,1"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
  await page.waitForTimeout(1500);
  if(name==='desktop')await page.keyboard.up('ArrowDown');else await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({path:`${output}/${name}-world-after.png`});
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Terrain remains stable during revision refresh and partial rendering in desktop/mobile.');
}finally{await browser.close()}
