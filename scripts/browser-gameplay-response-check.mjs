import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/gameplay-response/browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
 for(const mobile of [false,true].filter(mobile=>!process.env.CHECK_ONLY||process.env.CHECK_ONLY===(mobile?'mobile':'desktop'))) {
  const name=mobile?'mobile':'desktop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const Native=WebSocket;window.gameSockets=[];window.networkDelay=0;window.dropSocket=null;
   window.WebSocket=class extends Native {
    constructor(...args){super(...args);window.gameSockets.push(this)}
    send(data){
     const socket=this;let message=JSON.parse(data);
     if(window.rejectNextInventory&&message.name==='moveInventorySlot') {
      window.rejectNextInventory=false;
      message={...message,expectedSlots:[{slot:message.from,stack:{itemId:'stone',quantity:999}}]};
      data=JSON.stringify(message);
     }
     setTimeout(()=>{if(socket.readyState===1)super.send(data)},window.networkDelay);
    }
    addEventListener(type,fn,options){
     return super.addEventListener(type,type==='message'?event=>{
      if(this===window.dropSocket&&JSON.parse(event.data).type==='state')return;
      setTimeout(()=>fn.call(this,event),window.networkDelay);
     }:fn,options);
    }
   };
  });
  await page.route('**/dev/update-version**',r=>r.fulfill({json:{version:'gameplay-response-check'}}));
  await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});
  await page.locator('#guest-form button[type=submit]').click();
  await page.evaluate(async()=>{const m=await import('/dev/main.js');window.scene=m.inspectMovement;window.profile=m.inspectPerformance});
  await page.waitForFunction(()=>window.scene().readiness.sceneReady&&window.scene().server);
  await page.evaluate(()=>window.networkDelay=350); // 700 ms artificial round trip, plus actual network
  if(mobile)await page.locator('.mobile-menu-toggle').click();
  await page.locator('#inventory-toggle').click();
  const initial=await page.evaluate(()=>window.scene().inventory);
  assert.equal(initial.slots[0].itemId,'knife');
  await page.evaluate(()=>{
   window.addEventListener('click',event=>{if(event.target.closest('#inventory-equip'))window.inventoryClickAt=performance.now()},true);
   window.addEventListener('click',event=>{if(event.target.closest('#inventory-equip'))window.inventoryResponse={
    elapsed:performance.now()-window.inventoryClickAt,item:window.scene().inventory.slots[9]?.itemId,pending:window.scene().inventoryPending,
   }});
  });
  await page.locator('#inventory-equip').click();
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[9].itemId,'knife',`${name}: first move is immediate`);
  const immediate=await page.evaluate(()=>window.inventoryResponse);
  const responseMs=immediate.elapsed;
  assert.equal(immediate.item,'knife','item changes in the click handler before any server reply');
  assert.ok(immediate.pending>0,'item is visible while still awaiting server confirmation');
  for(const [from,to] of [[9,10],[10,11]]) {
   await page.locator(`#inventory-grid [data-inventory-slot="${from}"]`).click();
   await page.locator(`#inventory-grid [data-inventory-slot="${to}"]`).click();
   assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[to].itemId,'knife');
  }
  await page.waitForTimeout(150);
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[11].itemId,'knife','old snapshots cannot undo prediction');
  await page.waitForFunction(()=>window.scene().inventoryPending===0);
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[11].itemId,'knife');
  await page.evaluate(()=>window.rejectNextInventory=true);
  await page.locator('#inventory-grid [data-inventory-slot="11"]').click();
  await page.locator('#inventory-grid [data-inventory-slot="12"]').click();
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[12].itemId,'knife','rejected move starts with immediate prediction');
  await page.waitForFunction(()=>window.scene().inventoryPending===0);
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[11].itemId,'knife','server rejection restores the original item');
  assert.equal((await page.evaluate(()=>window.scene())).inventory.slots[12],null);
  await page.screenshot({path:`${output}/${name}-inventory.png`});
  await page.locator('#inventory-close').click();
  if(mobile)await page.locator('.mobile-menu-toggle').click();
  await page.locator('#world').focus();
  await page.keyboard.press('3');
  assert.equal((await page.evaluate(()=>window.scene())).inventory.selectedSlot,2);
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(()=>window.scene())).inventory.selectedSlot,2,'old snapshots cannot undo tool selection');
  await page.waitForFunction(()=>window.scene().inventoryPending===0);
  await page.evaluate(()=>{window.networkDelay=0;window.profile(true)});
  const samples=[];
  if(!mobile)await page.keyboard.down('Shift');
  for(let i=0;i<(mobile?4:16);i++) {
   const key=['s','d','w','a'][i%4];
   if(mobile){
    const box=await page.locator('#world').boundingBox();
    const [dx,dy]=[[48,35],[-48,35],[0,65],[-48,20]][i%4];
    await page.touchscreen.tap(box.x+box.width/2+dx,box.y+box.height/2+dy);
    await page.waitForTimeout(1500);
   }else{await page.keyboard.down(key);await page.waitForTimeout(3000);await page.keyboard.up(key)}
   const s=await page.evaluate(()=>window.scene());samples.push({position:s.position,pending:s.pending,seq:s.server.inputSeq});
   assert.ok(s.pending<100,`${name}: movement queue remains bounded`);
  }
  if(!mobile)await page.keyboard.up('Shift');
  await page.waitForFunction(()=>window.scene().pending===0).catch(async error=>{
   console.error(JSON.stringify({name,finalMovementState:await page.evaluate(()=>window.scene())}));throw error;
  });
  let state=await page.evaluate(()=>window.scene());
  assert.ok(Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.08,`${name}: final server agreement`);
  assert.ok(samples.some(s=>Math.hypot(s.position.x-samples[0].position.x,s.position.y-samples[0].position.y)>1),`${name}: movement responds across direction changes`);
  const profile=await page.evaluate(()=>window.profile());
  await page.screenshot({path:`${output}/${name}-world.png`});
  let recovery=null;
  if(!mobile) {
   const previousSocketCount=await page.evaluate(()=>window.gameSockets.length);
   await page.evaluate(()=>window.gameSockets.at(-1)?.close(4001,'gameplay check transport drop'));
   await page.locator('#world').focus();await page.keyboard.down('s');
   await page.waitForFunction(count=>window.gameSockets.length>count&&window.scene().readiness.sceneReady&&window.scene().readiness.connected,
    previousSocketCount,{timeout:18000});
   await page.keyboard.up('s');await page.waitForFunction(()=>window.scene().pending===0);
   state=await page.evaluate(()=>window.scene());
   recovery={connected:state.readiness.connected,pending:state.pending,position:state.position};
   assert.equal(recovery.connected,true);assert.equal(state.inventory.slots[11].itemId,'knife');
   await page.screenshot({path:`${output}/desktop-recovered.png`});
  }
  assert.deepEqual(errors,[]);
  results.push({name,responseMs,artificialRoundTripMs:700,samples,profile,recovery,errors});
  await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify({name,responseMs,maxPending:Math.max(...samples.map(s=>s.pending)),recovery,frameMetrics:profile?.metrics}));
  await context.close();
 }
}finally{await browser.close()}
