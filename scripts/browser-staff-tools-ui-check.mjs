// UI review with simulated staff replies; never changes real player wallets.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/staff-tools-ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
const inspect=page=>page.evaluate(async()=> (await import('/dev/main.js')).inspectMovement());
async function fit(page){
 const result=await page.locator('#staff-tools-dialog').evaluate(el=>{
  const box=el.getBoundingClientRect(),header=el.querySelector('header').getBoundingClientRect(),close=el.querySelector('#staff-tools-close').getBoundingClientRect();
  return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,
   clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,headerTop:header.top,closeSize:Math.min(close.width,close.height)};
 });
 assert.ok(result.left>=-1&&result.right<=result.viewportWidth+1&&result.top>=-1&&result.bottom<=result.viewportHeight+1,JSON.stringify(result));
 assert.ok(result.headerTop>=-1&&result.headerTop<result.viewportHeight,'header stays accessible during scrolling');
 assert.ok(result.scrollWidth<=result.clientWidth+1,'dialog must not scroll horizontally');assert.ok(result.closeSize>=44,`close touch target: ${JSON.stringify(result)}`);
 return result;
}
try{
 for(const [name,viewport,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,ignoreHTTPSErrors:true});const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let posts=0,moderationPosts=0,denyAudit=false,allow=true;
  const press=async selector=>mobile?await page.locator(selector).tap():await page.locator(selector).click();
  await page.route('**/dev/auth/guest',async route=>{const response=await route.fetch();const body=await response.json();body.profile.guest=false;body.profile.username='ui_review';await route.fulfill({response,json:body});});
  await context.route('**/dev/staff/capabilities',route=>route.fulfill(allow?{json:{capabilities:{adjustEconomy:true,inspectPlayers:true,readAudit:true,readPlayers:true,readReports:true,warnPlayers:true,mutePlayers:true}}}:{status:403,json:{error:'Sem acesso'}}));
  await context.route('**/dev/staff/players/conta_teste',route=>route.fulfill({json:{player:{username:'conta_teste',displayName:'Viajante',progression:{level:3,xp:10,attributes:{force:2}},wallet:{gold:1,silver:2,bronze:3},properties:[{building_id:'cabana',unit_number:1,tenant_username:'visita'}],leases:[]}}}));
  await context.route('**/dev/staff/economy-overview',route=>route.fulfill({json:{goods:[{item_id:'wood',buy_price_bronze:2,sell_price_bronze:3,available:12}],banks:[{bank_id:'vila',rate_bps:200}]}}));
  await context.route('**/dev/staff/audit?*',route=>{
   const more=new URL(route.request().url()).searchParams.has('before');
   const events=Array.from({length:more?1:20},(_,i)=>({event_id:String(more?80:100-i),happened_at:'2026-10-29T12:00:00Z',action:'player.wallet.adjusted',actor_username:'equipe',target_username:'conta_teste',reason:'Ajuste autorizado para revisão da interface. <img src=x>'}));
   return route.fulfill(denyAudit?{status:403,json:{error:'Sem acesso'}}:{json:{events}});
  });
  await context.route('**/dev/staff/accounts/*/sanctions',route=>route.fulfill({json:{sanctions:[]}}));
  await context.route('**/dev/staff/reports?*',route=>route.fulfill({json:{reports:[{target_username:'conta_teste',status:'open',description:'Revisão simulada'}]}}));
  await context.route('**/dev/staff/sanctions',route=>{moderationPosts++;const body=route.request().postDataJSON();assert.equal(body.username,'conta_teste');assert.equal(body.kind,'mute');assert.equal(body.reason,'Revisão de interface');return route.fulfill({json:{ok:true}});});
  await context.route('**/dev/staff/wallet',async route=>{posts++;assert.deepEqual(route.request().postDataJSON(),{username:'conta_teste',operation:posts===1?'debit':'credit',amount:123,reason:'Correção de teste'});await new Promise(resolve=>setTimeout(resolve,450));await route.fulfill({json:{username:'conta_teste',wallet:{gold:1,silver:2,bronze:3}}});});
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  await page.locator('#scene-loading').waitFor({state:'hidden',timeout:120000});await press('#guest-form button[type=submit]');
  await page.locator('.shell.is-authenticated').waitFor();await page.locator('#scene-loading').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('#arrival-tutorial-title')?.textContent==='A chama despertou',null,{timeout:120000});
  await page.evaluate(()=>document.querySelector('#arrival-tutorial-skip').click());
  await page.waitForFunction(()=>!document.querySelector('.shell').classList.contains('arrival-tutorial-mode'),null,{timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('#staff-tools-toggle').hidden);
  await page.evaluate(async()=>window.menuInspect=(await import('/dev/main.js')).inspectMovement);
  await page.waitForFunction(()=>window.menuInspect().readiness.sceneReady&&!window.menuInspect().readiness.loading,null,{timeout:120000});
  if(mobile)await press('.mobile-menu-toggle');await press('#staff-tools-toggle');await page.locator('#staff-tools-dialog[open]').waitFor();
  const bounds=await fit(page);await page.screenshot({path:`${output}/${name}-home.png`});
  for(let i=0;i<9;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#staff-tools-dialog').contains(document.activeElement)),true,'Tab stays inside menu');}
  const stopped=await inspect(page);await page.keyboard.down('ArrowDown');await page.waitForTimeout(250);await page.keyboard.up('ArrowDown');const still=await inspect(page);assert.ok(Math.hypot(stopped.position.x-still.position.x,stopped.position.y-still.position.y)<.05,'menu blocks walking');
  await press('#staff-player-open');await page.locator('#staff-player-form [name=username]').fill('conta_teste');await press('#staff-player-form button');await page.getByText('locatário visita',{exact:false}).waitFor();await fit(page);await page.screenshot({path:`${output}/${name}-player.png`});await press('#staff-player-back');
  await press('#staff-market-open');await page.getByText('wood: compra 2',{exact:false}).waitFor();await fit(page);await page.screenshot({path:`${output}/${name}-market.png`});await press('#staff-market-back');
  await press('#staff-moderation-open');await page.locator('#staff-player-lookup [name=username]').fill('conta_teste');await press('#staff-player-lookup button');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('Nenhum registro'));await press('#staff-reports-load');await page.locator('#staff-moderation-list li').waitFor();
  await page.locator('#staff-moderation-form [name=username]').fill('conta_teste');await page.locator('#staff-moderation-form [name=kind]').selectOption('mute');await page.locator('#staff-moderation-form [name=reason]').fill('Revisão de interface');await press('#staff-moderation-form button');assert.equal(moderationPosts,0);await fit(page);await page.screenshot({path:`${output}/${name}-moderation.png`});await press('#staff-moderation-confirm');await page.waitForFunction(()=>document.querySelector('#staff-moderation-status').textContent.includes('registrada'));assert.equal(moderationPosts,1);await press('#staff-moderation-back');
  await press('#staff-wallet-open');await press('#staff-wallet-form button[type=submit]');assert.equal(posts,0);assert.equal(await page.locator('#staff-tools-review').isVisible(),false,'invalid form stays editable');
  await page.locator('#staff-wallet-form [name=username]').fill('conta_teste');await page.locator('#staff-wallet-form [name=operation]').selectOption('debit');await page.locator('#staff-wallet-form [name=amount]').fill('123');await page.locator('#staff-wallet-form [name=reason]').fill('Correção de teste');
  await fit(page);await page.screenshot({path:`${output}/${name}-wallet.png`});await press('#staff-wallet-form button[type=submit]');assert.equal(posts,0);assert.equal(await page.locator('#staff-review-reason').textContent(),'Correção de teste');
  await page.screenshot({path:`${output}/${name}-review.png`});await press('#staff-review-back');assert.equal(await page.locator('#staff-wallet-form [name=amount]').inputValue(),'123');await press('#staff-wallet-form button[type=submit]');
  await press('#staff-wallet-confirm');assert.equal(await page.locator('#staff-wallet-confirm').isDisabled(),true);await page.waitForFunction(()=>document.querySelector('#staff-wallet-status').textContent.includes('Ajuste registrado'));assert.equal(posts,1);
  await page.locator('#staff-wallet-form [name=username]').fill('conta_teste');await page.locator('#staff-wallet-form [name=operation]').selectOption('credit');await page.locator('#staff-wallet-form [name=amount]').fill('123');await page.locator('#staff-wallet-form [name=reason]').fill('Correção de teste');await press('#staff-wallet-form button[type=submit]');await press('#staff-wallet-confirm');await page.waitForFunction(()=>document.querySelector('#staff-tools-wallet').hidden===false&&document.querySelector('#staff-wallet-status').textContent.includes('Ajuste registrado'));assert.equal(posts,2);
  await press('#staff-wallet-back');await press('#staff-audit-open');await page.locator('#staff-audit-list li').first().waitFor();assert.equal(await page.locator('#staff-audit-list img').count(),0);
  await page.screenshot({path:`${output}/${name}-audit.png`});await press('#staff-audit-more');await page.waitForFunction(()=>document.querySelectorAll('#staff-audit-list li').length===21);await fit(page);
  assert.equal(await page.locator('#staff-tools-close').isVisible(),true,'close stays visible during long history');
  if(mobile){
   for(const [variant,size] of [['small',{width:320,height:640}],['landscape',{width:844,height:390}]]){
    await page.setViewportSize(size);await fit(page);await page.screenshot({path:`${output}/${variant}-audit.png`});
    await press('#staff-audit-back');await press('#staff-wallet-open');await fit(page);await page.screenshot({path:`${output}/${variant}-wallet.png`});await press('#staff-wallet-back');await press('#staff-audit-open');await page.locator('#staff-audit-list li').first().waitFor();
   }
   await page.setViewportSize(viewport);
  }
  denyAudit=true;await press('#staff-audit-refresh');await page.waitForFunction(()=>document.querySelector('#staff-audit-status').textContent.includes('não tem mais acesso'));assert.equal(await page.locator('#staff-audit-list li').count(),0);
  await press('#staff-tools-close');assert.equal(await page.locator('#staff-tools-dialog').evaluate(el=>el.open),false);
  if(mobile)assert.equal(await page.evaluate(()=>document.activeElement.id),'world','closed mobile menu returns focus to world');
  if(mobile)await press('.mobile-menu-toggle');await press('#settings-toggle');await page.locator('#settings-dialog[open]').waitFor();await page.screenshot({path:`${output}/${name}-settings.png`});await press('#settings-close');
  await page.locator('#world').focus();const before=await inspect(page);await page.keyboard.down('ArrowDown');await page.waitForTimeout(500);await page.keyboard.up('ArrowDown');const after=await inspect(page);assert.ok(Math.hypot(before.position.x-after.position.x,before.position.y-after.position.y)>.1,'walking resumes after closing menus');
  if(mobile)await press('.mobile-menu-toggle');allow=false;await press('#staff-tools-toggle');await page.waitForFunction(()=>document.querySelector('#staff-tools-toggle').hidden);
  assert.deepEqual(errors,[]);results.push({name,bounds,touch:mobile,keyboardFocus:true,walkingBlockedAndRestored:true,reviewAndSingleSubmit:true,moderation:true,walletCreditAndDebit:true,auditPagination:true,deniedAccess:true});await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify({results,simulatedStaff:true},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}
