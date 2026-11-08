import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/20261024-scene-visibility/browser';await mkdir(output,{recursive:true});
let source=await readFile(new URL('../game/main.js',import.meta.url),'utf8');
// Browser-only observations and quality control; the running game gets no test hooks.
source=source.replace('function updateDecorativeDetail(frameSeconds) {','function updateDecorativeDetail(frameSeconds) { if(window.visibilityDetail!==undefined){decorativeDetailLevel=window.visibilityDetail;return;}');
source=source.replace('function updateVisibleWorldChunks() {','function updateVisibleWorldChunks() { window.visibilityAudit={expected:[],drawn:[],lights:[]};');
source=source.replace("    if (thing.type === 'tree') {","    if (thing.type === 'tree') { window.visibilityAudit.expected.push(thing.tree.id);");
source=source.replace('  const scale=spriteScale*.7;','  window.visibilityAudit.drawn.push(tree.id);\n  const scale=spriteScale*.7;');
source=source.replace('    const patch=lightmapFor(light,scene.obstacles,scene.bounds,scene.surface,scene.key);','    window.visibilityAudit.lights.push({id:light.id,distance:Math.hypot(light.x-localPosition.x,light.y-localPosition.y)});\n    const patch=lightmapFor(light,scene.obstacles,scene.bounds,scene.surface,scene.key);');
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});const results=[];
try{for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/dev/main.js',route=>route.fulfill({body:source,contentType:'text/javascript'}));
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
 await page.locator('#guest-form button').click();await page.evaluate(async()=>window.visibilityState=(await import('/dev/main.js')).inspectMovement);
 await page.waitForFunction(()=>window.visibilityState().readiness.sceneReady);
 const samples=[];
 for(const level of [2,0,1,0]){
  await page.evaluate(level=>window.visibilityDetail=level,level);await page.waitForTimeout(250);
  const audit=await page.evaluate(()=>({state:window.visibilityState(),...window.visibilityAudit}));
  assert.ok(audit.expected.length>0);assert.deepEqual(audit.drawn,audit.expected,'quality must preserve every tree');samples.push({level,trees:audit.drawn.length,farLights:audit.lights.filter(l=>l.distance>8).length});
 }
 await page.screenshot({path:`${output}/${name}-before.png`});const before=await page.evaluate(()=>window.visibilityState().position);
 await page.locator('#world').focus();
 if(width>=600){await page.keyboard.down('ArrowDown');await page.waitForTimeout(900);await page.keyboard.up('ArrowDown');}
 else {const box=await page.locator('[data-move="0,1"]').boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.waitForTimeout(900);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 await page.waitForTimeout(400);const after=await page.evaluate(()=>({position:window.visibilityState().position,...window.visibilityAudit}));
 assert.ok(Math.hypot(after.position.x-before.x,after.position.y-before.y)>.25);assert.deepEqual(after.drawn,after.expected);assert.deepEqual(errors,[]);
 if(name==='desktop')assert.ok(samples.some(s=>s.farLights>0),'visible lighting beyond the old cutoff must be rendered');
 await page.screenshot({path:`${output}/${name}-after.png`});results.push({name,samples,before,after:after.position,errors});await context.close();
}await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
