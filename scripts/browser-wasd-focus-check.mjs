import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/movement-deep/focus';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.stack));
try{
await page.route('**/dev/update-version**',r=>r.fulfill({json:{version:'wasd-focus-check'}}));
await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});await page.locator('#guest-form button[type=submit]').click();
await page.evaluate(async()=>window.scene=(await import('/dev/main.js')).inspectMovement);await page.waitForFunction(()=>window.scene().readiness.sceneReady);
async function probe(label,expected=true){
 const before=await page.evaluate(()=>window.scene());let moved=0,accepted=[];
 for(const key of ['w','a','s','d']){
  await page.keyboard.down(key);await page.waitForTimeout(450);
  const state=await page.evaluate(()=>({s:window.scene(),focus:{id:document.activeElement.id,tag:document.activeElement.tagName}}));
  moved=Math.max(moved,Math.hypot(state.s.position.x-before.position.x,state.s.position.y-before.position.y));
  accepted.push(state.s.movementKeys.includes(key));
  await page.keyboard.up(key);
 }
 const after=await page.evaluate(()=>({s:window.scene(),focus:{id:document.activeElement.id,tag:document.activeElement.tagName}}));
 const result={label,accepted,moved,focus:after.focus,panel:after.s.panel,clockAdvanced:after.s.animationTime>before.animationTime,serverSequenceAdvanced:after.s.server.inputSeq>before.server.inputSeq};results.push(result);console.log(JSON.stringify(result));
 if(expected){assert.ok(accepted.every(Boolean),`${label}: WASD must be accepted without clicking the canvas`);assert.ok(moved>.1,`${label}: character must move`)}
 else{assert.ok(accepted.every(x=>!x));assert.ok(after.s.animationTime>before.animationTime,'scene continues animating during the input freeze')}
 await page.screenshot({path:`${output}/${label.replace(/[^a-z0-9]+/gi,'-')}.png`});
 await writeFile(`${output}/result.json`,JSON.stringify({results,errors},null,2));
}
if(process.env.EXPECT_FROZEN) {
 await page.locator('#help-toggle').click();await probe('help button focused',false);
} else {
 await page.locator('#inventory-toggle').click();await page.locator('#inventory-close').click();
 await probe('inventory closed by mouse');
}
await page.screenshot({path:`${output}/inventory-closed.png`});
if(!process.env.EXPECT_FROZEN){

 await page.locator('#inventory-toggle').click();
 const stableSlot=await page.evaluate(async()=>{
  const node=document.querySelector('#inventory-quick-grid [data-inventory-slot="2"]');
  node.focus();await new Promise(resolve=>setTimeout(resolve,200));
  return node.isConnected&&node===document.querySelector('#inventory-quick-grid [data-inventory-slot="2"]');
 });
 assert.equal(stableSlot,true,'focusing a slot must not replace the node between pointerdown and click');
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.inventorySlot),'3','native inventory arrow navigation survives focus updates');
 await page.locator('#inventory-close').click();
 await page.locator('.player-menu summary').click();await page.locator('.player-menu summary').click();await probe('player menu closed');
 await page.locator('#help-toggle').click();await probe('help button focused');await page.locator('#help-toggle').click();
 await page.locator('#inventory-toggle').focus();await page.keyboard.press('Space');await page.waitForSelector('#inventory-dialog[open]');
 await probe('modal blocks movement',false);await page.keyboard.press('Escape');await probe('inventory closed by Escape');
 await page.locator('#inventory-toggle').click();await page.evaluate(()=>document.querySelector('#inventory-dialog').close());await probe('native dialog close releases controller');
 await page.locator('#chat-text').focus();await page.keyboard.type('wasd');
 const typing=await page.evaluate(()=>({s:window.scene(),text:document.querySelector('#chat-text').value}));
 assert.deepEqual(typing.s.movementKeys,[]);assert.equal(typing.text,'wasd');await page.locator('#chat-text').fill('');
 await page.keyboard.press('Escape');await page.keyboard.down('w');await page.waitForTimeout(150);
 await page.locator('#chat-text').focus();
 const editFocus=await page.evaluate(()=>window.scene());
 assert.deepEqual(editFocus.movementKeys,[],'entering a text field cancels already-held movement');
 assert.equal(editFocus.walkTarget,undefined,'entering a text field cancels a pending walk');
 await page.keyboard.up('w');await page.keyboard.press('Escape');
 await page.keyboard.down('d');await page.waitForTimeout(100);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.deepEqual((await page.evaluate(()=>window.scene())).movementKeys,[],'window blur cancels held movement');
 await page.keyboard.up('d');await probe('WASD resumes after focus loss');

 assert.deepEqual(errors,[]);
}
}finally{await writeFile(`${output}/result.json`,JSON.stringify({results,errors},null,2));await browser.close()}
