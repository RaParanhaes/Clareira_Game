import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/freeze-performance'; await mkdir(output,{recursive:true});
const coreModuleFiles=['game/main.js','game/world.mjs','game/building-depth.mjs','game/prediction.mjs','game/input.mjs','game/obstacle-collision.mjs'];
const coreModuleHashes=Object.fromEntries(await Promise.all(coreModuleFiles.map(async path=>[
 path,createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex'),
])));
const pinnedVersion=createHash('sha256').update(JSON.stringify(coreModuleHashes)).digest('hex');
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[],wire=[];
  page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameReceived',({response})=>{try{const m=JSON.parse(response.payloadData);if(m.type==='state')wire.push({bytes:Buffer.byteLength(response.payloadData),static:!!m.resources,resources:m.resources?.length??0})}catch{}});
  await page.route('**/dev/update-version',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:pinnedVersion})}));
  await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');await page.evaluate(async()=>{const m=await import('/dev/main.js');window.scene=m.inspectMovement;window.profile=m.inspectPerformance});
  await page.waitForFunction(()=>window.scene().readiness.sceneReady && window.scene().server);await page.waitForTimeout(1500);
  async function sample(label,seconds=6){await page.evaluate(()=>window.profile(true));wire.length=0;await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.waitForTimeout(seconds*1000);const {profile}=await cdp.send('Profiler.stop');
   const nodes=new Map(profile.nodes.map(n=>[n.id,n])),hot={};for(let i=0;i<(profile.samples||[]).length;i++){const node=nodes.get(profile.samples[i]),f=(node.callFrame.functionName||'(anonymous)')+':'+node.callFrame.url.split('/').pop()+':'+(node.callFrame.lineNumber+1);hot[f]=(hot[f]||0)+(profile.timeDeltas?.[i]||0)/1000}
   const data=await page.evaluate(()=>window.profile());const row={name,label,...data,network:{packets:wire.length,totalBytes:wire.reduce((n,x)=>n+x.bytes,0),staticPackets:wire.filter(x=>x.static).length},cpuTop:Object.entries(hot).sort((a,b)=>b[1]-a[1]).slice(0,12)};results.push(row);await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(row));
   assert.ok(data.samples>20);await page.screenshot({path:`${output}/${name}-${label}.png`});
  }
  await sample('arrival');
  await page.locator('#world').focus();
  const before = await page.evaluate(()=>window.scene().position);
  if(name==='desktop') await page.keyboard.down('ArrowDown');
  else {
    const button=await page.locator('[data-move="0,1"]').boundingBox();
    await page.mouse.move(button.x+button.width/2,button.y+button.height/2);
    await page.mouse.down();
  }
  await sample('moving',3);
  if(name==='desktop') await page.keyboard.up('ArrowDown');
  else await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await page.evaluate(()=>window.scene());
  assert.ok(Math.hypot(after.position.x-before.x,after.position.y-before.y)>1, `${name}: movement`);
  assert.ok(Math.hypot(after.position.x-after.server.x,after.position.y-after.server.y)<.08, `${name}: server agreement`);
  assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,label,metrics,network,cpuTop})=>({name,label,metrics,network,cpuTop})),null,2));
}finally{await browser.close()}
