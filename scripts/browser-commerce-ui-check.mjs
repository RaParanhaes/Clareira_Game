// Isolated real DOM/components with synthetic inventory and staff API replies. No live mutations.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/commerce-ui';await mkdir(output,{recursive:true});
const html=await readFile('game/index.html','utf8');
const lodging=html.match(/<dialog id="lodging-dialog"[\s\S]*?<\/dialog>/)[0];
const staff=html.match(/<dialog id="staff-tools-dialog"[\s\S]*?<\/dialog>/)[0];
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try { for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}],['small',{width:320,height:640}]]) {
 const context=await browser.newContext({viewport,hasTouch:true,ignoreHTTPSErrors:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let posts=0;
 await page.route('**/dev/ui-commerce-test',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dev/style.css"><body>${lodging}${staff}</body>`}));
 await page.route('**/dev/staff/**',r=>{if(r.request().method()==='POST'){posts++;return r.fulfill({json:{ok:true}});}return r.fulfill({json:r.request().url().includes('reports')?{reports:[{target_username:'teste',status:'open',description:'Denúncia de teste <img src=x>'}]}:{sanctions:[]}});});
 await page.goto('https://vmi3579939.contaboserver.net/dev/ui-commerce-test');
 await page.evaluate(async()=>{
  const {createPlacePanel}=await import('/dev/place-panel.mjs'),{createPanelController}=await import('/dev/panel-controller.mjs');
  window.panels=createPanelController();window.actions=[];window.state={guest:false,inventory:{wood:80,gold:5},contracts:[],cabinKeys:[],propertyListings:[],recurringLeasesAvailable:true};
  window.point={key:'test',placeId:'arrival',label:'Balcão',sections:['trade','directory','tools']};
  window.commerce=createPlacePanel({dialog:document.querySelector('#lodging-dialog'),controller:panels,getState:()=>state,onAction:message=>{actions.push(message);return true;}});commerce.open(point,'test');
 });
 const tap=s=>page.locator(s).tap();
 const fit=async()=>{const b=await page.locator('dialog[open]').evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth+1};});assert.ok(b.x>=0&&b.y>=0&&b.right<=b.width+1&&b.bottom<=b.height+1&&!b.overflow,JSON.stringify(b));};
 await tap('[data-service-section=trade]');await fit();assert.equal(await page.locator('[data-quantity-item]').count(),1,'only owned materials');
 await tap('[data-quantity-step="1"]');assert.equal(await page.locator('[data-quantity-item]').inputValue(),'2');
 await page.locator('[data-quantity-item]').fill('51');await tap('[data-service-action=lodgeSell]');assert.equal(await page.evaluate(()=>actions.length),0);
 await page.locator('[data-quantity-item]').fill('12');await page.locator('[data-quantity-item]').blur();await page.screenshot({path:`${output}/${name}-sell.png`});await tap('[data-service-action=lodgeSell]');assert.equal(await page.evaluate(()=>actions.length),0);
 await fit();await page.screenshot({path:`${output}/${name}-review.png`});
 await page.evaluate(()=>state.marketQuotes={wood:{buyPrice:2,sellPrice:3}});await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),0,'changed quote requires new review');
 await tap('[data-service-action=lodgeSell]');await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),1);
 assert.equal(await page.locator('[data-service-action=lodgeSell]').isDisabled(),true,'pending sends blocked');
 await page.evaluate(()=>commerce.notice('Venda concluída'));await tap('#lodging-back');await tap('[data-service-section=tools]');await tap('[data-service-action=lodgeBuyTool][data-tool=stoneAxe]');await fit();await tap('#lodging-back');
 await page.evaluate(()=>{panels.close();point={key:'house',placeId:'cabin-cedar-one',label:'Placa externa',sections:['properties']};commerce.open(point,'test');});await tap('[data-service-section=properties]');await fit();await page.screenshot({path:`${output}/${name}-house.png`});await tap('[data-service-action=lodgeClaim]');await fit();await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).mode),'owned');
 await page.evaluate(()=>{panels.close();point={key:'rent',placeId:'lodging-rill-guesthouse',label:'Recepção',sections:['rooms']};commerce.open(point,'test');});await tap('[data-service-section=rooms]');await page.locator('[data-auto-renew]').check();await page.evaluate(()=>commerce.refresh(point,'test'));assert.equal(await page.locator('[data-auto-renew]').isChecked(),true,'renewal selection survives snapshots');await page.locator('[data-auto-renew]').uncheck();await page.screenshot({path:`${output}/${name}-rent.png`});await tap('[data-service-action=lodgeClaim]');assert.ok((await page.locator('.commerce-review').textContent()).includes('desativada'));await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).autoRenew),false);
 await page.evaluate(()=>{panels.close();state.cabinKeys=[{buildingId:'cabin-cedar-one',isOwner:true}];point={key:'house',placeId:'cabin-cedar-one',label:'Placa',sections:['properties']};commerce.open(point,'test');});await tap('[data-service-section=properties]');await page.locator('#property-asking-price').fill('9876');await page.evaluate(()=>commerce.refresh(point,'test'));assert.equal(await page.locator('#property-asking-price').inputValue(),'9876');await fit();await page.screenshot({path:`${output}/${name}-listing.png`});await tap('[data-service-action=propertyList]');await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).askingPriceBronze),9876);
 await page.evaluate(async()=>{
  panels.close();const {createStaffModeration}=await import('/dev/staff-moderation-ui.mjs');window.caps={readPlayers:true,readReports:true,warnPlayers:true,mutePlayers:true};
  window.mod=createStaffModeration({dialog:document.querySelector('#staff-tools-dialog'),panels,capabilities:()=>caps,generation:()=>0});
  panels.register('staff-tools',document.querySelector('#staff-tools-dialog'),{render(route){for(const el of document.querySelectorAll('#staff-tools-dialog section'))el.hidden=el.id!=='staff-tools-'+route;mod.sync(route);},onClose(){mod.reset();}});panels.open('staff-tools');
 });
 await tap('#staff-moderation-open');await tap('#staff-reports-load');await page.locator('#staff-moderation-list li').waitFor();assert.equal(await page.locator('#staff-moderation-list img').count(),0);
 await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=kind]').selectOption('mute');await page.locator('#staff-moderation-form [name=reason]').fill('Teste de interface');await tap('#staff-moderation-form button');assert.equal(posts,0);await fit();await page.screenshot({path:`${output}/${name}-moderation.png`});await tap('#staff-moderation-confirm');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('registrada'));assert.equal(posts,1);
 await page.evaluate(()=>{caps={readPlayers:true};mod.sync('moderation');});assert.equal(await page.locator('#staff-moderation-form').isVisible(),false);assert.deepEqual(errors,[]);results.push({name,sales:true,staleQuote:true,singleSend:true,housePurchase:true,rent:true,moderation:true,fit:true});await context.close();
 } await writeFile(`${output}/result.json`,JSON.stringify({syntheticState:true,results},null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
