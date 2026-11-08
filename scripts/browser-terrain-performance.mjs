import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/terrain-performance';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.route('**/dev/terrain-performance-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Terrain performance probe</title>'}));
 await page.goto('https://vmi3579939.contaboserver.net/dev/terrain-performance-probe');
 const result=await page.evaluate(async()=>{
  const {createSceneArt}=await import('/dev/scene-art.mjs');
  const {getWorldDefinition,applyWorldDefinition}=await import('/dev/world.mjs');
  const initial=getWorldDefinition(),chunks=[];
  for(let cy=10;cy<16;cy++)for(let cx=10;cx<16;cx++)chunks.push({cx,cy});
  const samples=[];
  for(const maxTiles of [12,256]){
   const art=createSceneArt();art.prioritizeTerrainChunks(chunks);art.requestTerrainChunks(chunks);
   let frames=0,workMs=0,maxWorkMs=0;const start=performance.now();
   while(!art.terrainChunksReady(chunks)&&frames<1000){
    const at=performance.now();art.processTerrainQueue(maxTiles,1.8);const work=performance.now()-at;
    workMs+=work;maxWorkMs=Math.max(maxWorkMs,work);frames++;
    await new Promise(requestAnimationFrame);
   }
   samples.push({maxTiles,frames,workMs,maxWorkMs,elapsedMs:performance.now()-start,ready:art.terrainChunksReady(chunks),stats:art.stats()});
  }
  const art=createSceneArt(),near=chunks.slice(0,9);
  const prepare=()=>{art.prioritizeTerrainChunks(near);art.requestTerrainChunks(near);let passes=0;while(!art.terrainChunksReady(near)&&passes<1000){art.processTerrainQueue(256,5);passes++;}return passes;};
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=308;const context=canvas.getContext('2d');
  const image=()=>{context.clearRect(0,0,512,308);art.terrain(context,{x:256,y:20},near[0].cx,near[0].cy,32);return canvas.toDataURL();};
  const cold=prepare(),sourceImage=image();
  applyWorldDefinition({...initial,dimensionId:'perf-alternate',theme:'magic',seed:initial.seed+1});
  const alternate=prepare(),alternateImage=image();applyWorldDefinition(initial);const returned=prepare(),returnedImage=image();
  const travel={cold,alternate,returned,stats:art.stats(),sourceRestored:sourceImage===returnedImage,distinctDimension:sourceImage!==alternateImage};
  const cycles=[];
  for(let cycle=0;cycle<10;cycle++){
   applyWorldDefinition({...initial,seed:initial.seed+cycle+100,dimensionId:`perf-cycle-${cycle}`});prepare();
   cycles.push(art.stats());
  }
  applyWorldDefinition(initial);
  return {samples,travel,cycles};
 });
 assert.equal(result.travel.returned,0,'returning to an unchanged dimension requires no terrain rebuild');
 assert.equal(result.travel.sourceRestored,true);assert.equal(result.travel.distinctDimension,true);
 assert.ok(result.cycles.every(s=>s.terrainBytes<=160*512*308*4&&s.terrainCachedScenes<=8));
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
