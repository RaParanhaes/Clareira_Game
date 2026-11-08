// Isolated real DOM/components with synthetic inventory and staff API replies. No live mutations.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/commerce-function-matrix';await mkdir(output,{recursive:true});
const html=await readFile('game/index.html','utf8');
const lodging=html.match(/<dialog id="lodging-dialog"[\s\S]*?<\/dialog>/)[0];
const staff=html.match(/<dialog id="staff-tools-dialog"[\s\S]*?<\/dialog>/)[0];
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try { for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}],['small',{width:320,height:640}]]) {
 const context=await browser.newContext({viewport,hasTouch:true,ignoreHTTPSErrors:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let posts=0, deny=false, delayReply=false, timeoutReply=false;const sent=[];const coverage=[];
 await page.route('**/dev/ui-commerce-test',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dev/style.css"><body>${lodging}${staff}</body>`}));
 await page.route('**/dev/staff/**',r=>{if(r.request().method()==='POST'){posts++;sent.push(r.request().postDataJSON());if(timeoutReply)return;return new Promise(resolve=>setTimeout(resolve,typeof delayReply==='number'?delayReply:delayReply?350:0)).then(()=>r.fulfill(deny?{status:403,json:{error:'Permissão removida'}}:{json:{ok:true}}));}return r.fulfill({json:r.request().url().includes('reports')?{reports:[{target_username:'teste',status:'open',description:'Denúncia de teste <img src=x>'}]}:{sanctions:[{kind:'mute',expires_at:'2020-01-01T00:00:00Z',reason:'Prazo encerrado'},{kind:'ban',lifted_at:'2021-01-01',reason:'Recurso aceito'},{kind:'warning',reason:'Advertência registrada'},{kind:'kick',reason:'Expulsão registrada'},{kind:'ban',reason:'Ativa sem prazo'}]}});});
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
 await page.evaluate(()=>state.marketQuotes={wood:{sellPrice:2}});await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),0,'changed quote requires new review');
 await tap('[data-service-action=lodgeSell]');await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),1);
 assert.equal(await page.locator('[data-service-action=lodgeSell]').isDisabled(),true,'pending sends blocked');
 await page.evaluate(()=>commerce.notice('Venda concluída'));await tap('#lodging-back');await tap('[data-service-section=tools]');await tap('[data-service-action=lodgeBuyTool][data-tool=stoneAxe]');await fit();await tap('#lodging-back');
 await page.evaluate(()=>{panels.close();point={key:'house',placeId:'cabin-cedar-one',label:'Placa externa',sections:['properties']};commerce.open(point,'test');});await tap('[data-service-section=properties]');await fit();await page.screenshot({path:`${output}/${name}-house.png`});await tap('[data-service-action=lodgeClaim]');await fit();await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).mode),'owned');
 await page.evaluate(()=>{panels.close();point={key:'rent',placeId:'lodging-rill-guesthouse',label:'Recepção',sections:['rooms']};commerce.open(point,'test');});await tap('[data-service-section=rooms]');await page.locator('[data-auto-renew]').check();await page.evaluate(()=>commerce.refresh(point,'test'));assert.equal(await page.locator('[data-auto-renew]').isChecked(),true,'renewal selection survives snapshots');await page.locator('[data-auto-renew]').uncheck();await page.screenshot({path:`${output}/${name}-rent.png`});await tap('[data-service-action=lodgeClaim]');assert.ok((await page.locator('.commerce-review').textContent()).includes('desativada'));await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).autoRenew),false);
 await page.evaluate(()=>{panels.close();state.cabinKeys=[{buildingId:'cabin-cedar-one',isOwner:true}];point={key:'house',placeId:'cabin-cedar-one',label:'Placa',sections:['properties']};commerce.open(point,'test');});await tap('[data-service-section=properties]');await page.locator('#property-asking-price').fill('9876');await page.evaluate(()=>commerce.refresh(point,'test'));assert.equal(await page.locator('#property-asking-price').inputValue(),'9876');await fit();await page.screenshot({path:`${output}/${name}-listing.png`});await tap('[data-service-action=propertyList]');await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.at(-1).askingPriceBronze),9876);

 async function service(place,section,extra={}) {
  await page.evaluate(({place,section,extra})=>{panels.close();actions.length=0;state={guest:false,inventory:{wood:80,gold:5},contracts:[],cabinKeys:[],issuedCabinKeys:[],propertyListings:[],recurringLeasesAvailable:true,...extra};point={key:'matrix',placeId:place,label:'Atendimento',sections:[section]};commerce.open(point,'test');},{place,section,extra});
  await tap(`[data-service-section="${section}"]`);
 }
 async function sendAction(action,fields={},review=false) {
  await tap(`[data-service-action="${action}"]`);
  if(review){assert.equal(await page.evaluate(()=>actions.length),0,`${action} waits for review`);await tap('[data-service-action=__confirm]');}
  const messages=await page.evaluate(()=>actions);assert.equal(messages.length,1,action);
  for(const [key,value]of Object.entries(fields))assert.equal(messages[0][key],value,`${action}.${key}`);
  assert.equal(messages[0].name,action);coverage.push(action+(fields.tool?`:${fields.tool}`:''));
  await page.evaluate(()=>commerce.notice('Resposta sintética recebida; resultado do servidor é testado separadamente.'));
 }
 for(const tool of ['stoneAxe','stonePickaxe']){
  await service('arrival','tools');await tap(`[data-service-action=lodgeBuyTool][data-tool=${tool}]`);await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions[0].tool),tool);coverage.push(`lodgeBuyTool:${tool}`);
 }
 await service('arrival','tools',{inventory:{bronze:1}});assert.equal(await page.locator('[data-service-action=lodgeBuyTool]:disabled').count(),2);assert.ok((await page.locator('#lodging-options').textContent()).includes('Faltam'));
 await service('arrival','tools',{inventory:{gold:5,stoneAxe:1,stonePickaxe:1}});assert.equal(await page.locator('[data-service-action=lodgeBuyTool]:disabled').count(),2);
 await service('arrival','trade',{inventory:{}});assert.ok((await page.locator('#lodging-options').textContent()).includes('ainda não tem materiais'));
 for(const quantity of ['0','-1','1.5','51']){await service('arrival','trade');await page.locator('[data-quantity-item]').fill(quantity);await tap('[data-service-action=lodgeSell]');assert.equal(await page.evaluate(()=>actions.length),0,`invalid quantity ${quantity}`);}
 await service('arrival','trade');await page.locator('[data-quantity-item]').fill('50');await sendAction('lodgeSell',{quantity:50},true);
 await service('arrival','trade');await tap('[data-service-action=lodgeSell]');await page.evaluate(()=>state.inventory.wood=0);await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),0,'stock change blocks sale');
 await service('cabin-cedar-one','properties',{cabinOccupancy:[{buildingId:'cabin-cedar-one'}]});assert.equal(await page.locator('[data-service-action=lodgeClaim]').isDisabled(),true);
 await service('cabin-cedar-one','properties',{guest:true});assert.equal(await page.locator('[data-service-action=lodgeClaim]').isDisabled(),true);
 const owner=[{buildingId:'cabin-cedar-one',isOwner:true}];
 await service('cabin-cedar-one','properties',{cabinKeys:owner});await sendAction('lodgeEnter',{buildingId:'cabin-cedar-one'});
 await service('cabin-cedar-one','keys',{cabinKeys:owner});await page.locator('#cabin-key-recipient').fill('!');await tap('[data-service-action=cabinGrantKey]');assert.equal(await page.evaluate(()=>actions.length),0);await page.locator('#cabin-key-recipient').fill('amigo_teste');await sendAction('cabinGrantKey',{username:'amigo_teste'});
 await service('cabin-cedar-one','keys',{cabinKeys:owner,issuedCabinKeys:[{buildingId:'cabin-cedar-one',profileId:'synthetic-friend',username:'amigo_teste'}]});await sendAction('cabinRevokeKey',{profileId:'synthetic-friend'},true);
 await service('cabin-cedar-one','properties',{cabinKeys:owner,propertyListings:[{buildingId:'cabin-cedar-one',askingPriceBronze:5000}]});await sendAction('propertyDelist',{},true);
 const listing={buildingId:'cabin-cedar-two',sellerName:'Vendedor de teste',askingPriceBronze:5000};
 await service('arrival','directory',{propertyListings:[listing]});await tap('[data-service-action=propertyBuy]');await page.evaluate(()=>state.propertyListings[0].askingPriceBronze=6000);await tap('[data-service-action=__confirm]');assert.equal(await page.evaluate(()=>actions.length),0,'listing price changed');
 await service('arrival','directory',{propertyListings:[listing]});await sendAction('propertyBuy',{buildingId:'cabin-cedar-two'},true);
 await service('cabin-cedar-one','properties',{cabinKeys:owner});await page.locator('#property-asking-price').fill('0');await tap('[data-service-action=propertyList]');assert.equal(await page.evaluate(()=>actions.length),0);await page.locator('#property-asking-price').fill('6500');await sendAction('propertyList',{askingPriceBronze:6500},true);
 for(const autoRenew of [false,true]){
  await service('lodging-rill-guesthouse','rooms',{claim:{buildingId:'lodging-rill-guesthouse',mode:'rent',unitNumber:1,expiresAt:Date.now()+1440000},lodgingLease:{leaseId:'11111111-1111-4111-8111-111111111111',periodMs:1440000,unitNumber:1,status:'active',buildingId:'lodging-rill-guesthouse',autoRenew,rentBronze:6,nextChargeAt:Date.now()+86400000}});
  await fit();await sendAction('setLodgingAutoRenew',{autoRenew:String(!autoRenew)},true);
 }
 await service('lodging-rill-guesthouse','rooms');await page.locator('[data-auto-renew]').check();await sendAction('lodgeClaim',{mode:'rent',autoRenew:true},true);
 await service('lodging-rill-guesthouse','rooms',{claim:{buildingId:'lodging-rill-guesthouse',mode:'rent',unitNumber:1,expiresAt:Date.now()+1440000}});await sendAction('lodgeEnter',{mode:'rent'});
 const contract={id:'matrix-order',title:'Materiais para a vila',item:'wood',quantity:10,reward:20,completed:false};
 for(const patch of [{inventory:{wood:2}},{guest:true},{contracts:[{...contract,completed:true}]}]){await service('arrival','orders',{contracts:[contract],...patch});assert.equal(await page.locator('[data-service-action=lodgeCompleteContract]').isDisabled(),true);}
 await service('arrival','orders',{contracts:[contract]});await sendAction('lodgeCompleteContract',{contractId:'matrix-order'});
 const tax={governmentType:'Vila',settlementId:'surface:arrival',treasuryBalanceBronze:1000,policies:[{taxCode:'market_sale',baseRateBps:200,minimumRateBps:100,maximumRateBps:500,treasuryTargetBronze:10000,treasurySensitivityBps:50}]};
 await service('arrival','government',{governmentTaxPanel:tax});await page.locator('[name=minimumRateBps]').fill('3');await tap('[data-service-action=governmentTaxPolicySet]');assert.equal(await page.evaluate(()=>actions.length),0,'inverted tax limits rejected');
 await page.locator('[name=minimumRateBps]').fill('1');await page.locator('[name=baseRateBps]').fill('2.5');await page.evaluate(()=>commerce.refresh(point,'test'));assert.equal(await page.locator('[name=baseRateBps]').inputValue(),'2.5');await fit();await page.screenshot({path:`${output}/${name}-taxes.png`});
 await tap('[data-service-action=governmentTaxPolicySet]');assert.equal(await page.evaluate(()=>actions[0].baseRateBps),250);assert.equal(await page.locator('[name=baseRateBps]').isDisabled(),true);coverage.push('governmentTaxPolicySet');await page.evaluate(()=>commerce.notice('Recusado no teste de interface'));assert.equal(await page.locator('[name=baseRateBps]').inputValue(),'2.5');await page.evaluate(()=>{state.governmentTaxPanel=null;commerce.refresh(point,'test');});assert.equal(await page.locator('[data-service-action=governmentTaxPolicySet]').count(),0,'lost authority clears tax form');
 await service('arrival','trade');await page.evaluate(()=>commerce.refresh(null,'other-context'));assert.equal(await page.locator('#lodging-dialog').evaluate(el=>el.open),false,'moving away closes the panel');
 await page.evaluate(async()=>{
  panels.close();const {createStaffModeration}=await import('/dev/staff-moderation-ui.mjs');window.caps={readPlayers:true,readReports:true,warnPlayers:true,mutePlayers:true,kickPlayers:true,suspendPlayers:true,banPlayers:true};
  window.mod=createStaffModeration({dialog:document.querySelector('#staff-tools-dialog'),panels,capabilities:()=>caps,generation:()=>0});
  panels.register('staff-tools',document.querySelector('#staff-tools-dialog'),{render(route){for(const el of document.querySelectorAll('#staff-tools-dialog section'))el.hidden=el.id!=='staff-tools-'+route;mod.sync(route);},onClose(){mod.reset();}});panels.open('staff-tools');
 });
 await tap('#staff-moderation-open');await tap('#staff-reports-load');await page.locator('#staff-moderation-list li').waitFor();assert.equal(await page.locator('#staff-moderation-list img').count(),0);
 await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=kind]').selectOption('mute');await page.locator('#staff-moderation-form [name=reason]').fill('Teste de interface');await tap('#staff-moderation-form button');assert.equal(posts,0);await fit();await page.screenshot({path:`${output}/${name}-moderation.png`});await tap('#staff-moderation-confirm');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('registrada'));assert.equal(posts,1);

 await page.locator('#staff-player-lookup [name=username]').fill('conta_teste');await tap('#staff-player-lookup button');await page.waitForFunction(()=>document.querySelector('#staff-moderation-list').textContent.includes('Expirada'));assert.ok((await page.locator('#staff-moderation-list').textContent()).includes('Revogada'));coverage.push('staffLookup');
 for(const kind of ['warning','mute','kick','suspend','ban']){
  await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=kind]').selectOption(kind);await page.locator('#staff-moderation-form [name=reason]').fill('Motivo revisado');await tap('#staff-moderation-form button');
  if(kind==='kick'){await page.locator('#staff-player-lookup [name=username]').fill('outro_teste');await tap('#staff-player-lookup button');assert.equal(await page.locator('#staff-moderation-review').isVisible(),false,'lookup invalidates reviewed target');await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await tap('#staff-moderation-form button');}
  if(kind==='warning'){await page.locator('#staff-moderation-form [name=reason]').fill('Motivo corrigido');assert.equal(await page.locator('#staff-moderation-review').isVisible(),false,'editing invalidates draft');await tap('#staff-moderation-form button');}
  const count=posts;delayReply=true;await tap('#staff-moderation-confirm');assert.equal(await page.locator('#staff-moderation-form [name=username]').isDisabled(),true);await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('registrada'));assert.equal(posts,count+1);
  const request=sent.at(-1);assert.equal(request.kind,kind);assert.equal(Boolean(request.expiresAt),['mute','suspend'].includes(kind));coverage.push(`sanction:${kind}`);delayReply=false;
 }

 // A network deadline must release controls and never retry a mutation automatically.
 timeoutReply=true;await page.evaluate(()=>{window.originalTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===15000?200:ms,...args);});
 await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=reason]').fill('Teste de tempo limite');await tap('#staff-moderation-form button');const timeoutPosts=posts;await tap('#staff-moderation-confirm');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('demorou'));assert.ok(posts-timeoutPosts<=1,'timed out operation is not retried');assert.equal(await page.locator('#staff-moderation-form [name=username]').isDisabled(),false);await page.evaluate(()=>window.setTimeout=originalTimeout);timeoutReply=false;coverage.push('staffTimeoutNoRetry');
 // Closing and reopening while a mutation is pending cannot create a second submission.
 delayReply=1200;await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=reason]').fill('Teste de resposta após fechar');await tap('#staff-moderation-form button');await tap('#staff-moderation-confirm');await page.evaluate(()=>{panels.close();panels.open('staff-tools');});await tap('#staff-moderation-open');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('envio anterior terminou'));assert.equal(await page.locator('#staff-moderation-form [name=username]').isDisabled(),false);delayReply=false;coverage.push('staffClosePending');
 deny=true;await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=reason]').fill('Teste de recusa');await tap('#staff-moderation-form button');await tap('#staff-moderation-confirm');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('Permissão removida'));assert.equal(await page.locator('#staff-moderation-review').isVisible(),false);coverage.push('staffDenied');deny=false;
 await page.locator('#staff-player-lookup [name=username]').fill('conta_teste');await tap('#staff-player-lookup button');await page.waitForFunction(()=>document.querySelector('#staff-moderation-list').textContent.includes('Expirada'));
 await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=reason]').fill('Revisão antes da perda de cargo');await tap('#staff-moderation-form button');
 await page.evaluate(()=>{caps={readReports:true};mod.sync('moderation');});assert.equal(await page.locator('#staff-moderation-review').isVisible(),false,'revocation invalidates pending draft');assert.equal(await page.locator('#staff-moderation-list li').count(),0,'revocation clears private history');
 await page.evaluate(()=>{caps={readPlayers:true};mod.sync('moderation');});assert.equal(await page.locator('#staff-moderation-form').isVisible(),false);assert.deepEqual(errors,[]);results.push({name,sales:true,staleQuote:true,singleSend:true,housePurchase:true,rent:true,moderation:true,fit:true,functions:[...new Set(coverage)]});await context.close();
 } await writeFile(`${output}/result.json`,JSON.stringify({syntheticState:true,results},null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
