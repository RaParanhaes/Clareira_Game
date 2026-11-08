import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(projectRoot,'scripts');
const roles=[
 {role_key:'moderator',display_name:'Moderador',role_kind:'staff',hierarchy_level:2,is_staff:true,active:true,member_count:3,permissions:['players.read','players.warn','players.kick'],inherited_permissions:[]},
 {role_key:'manager',display_name:'Gerente',role_kind:'staff',hierarchy_level:3,is_staff:true,active:true,member_count:1,permissions:['world.build'],inherited_permissions:['players.read','players.kick']},
 {role_key:'owner',display_name:'Proprietário',role_kind:'staff',hierarchy_level:5,is_staff:true,active:true,member_count:1,permissions:['*','roles.manage','permissions.delegate','audit.read'],inherited_permissions:[]},
];
const permissions=[
 {permission_key:'*',domain:'all',description:'Todas as capacidades atuais e futuras do jogo',assignable:false,canDelegate:true},
 {permission_key:'players.read',domain:'players',description:'Consultar dados mínimos de jogadores',assignable:true,canDelegate:true},
 {permission_key:'players.kick',domain:'moderation',description:'Expulsar jogadores',assignable:true,canDelegate:true},
 {permission_key:'economy.adjust',domain:'economy',description:'Conceder ou retirar moeda',assignable:true,canDelegate:false},
 {permission_key:'roles.manage',domain:'staff',description:'Atribuir e revogar cargos',assignable:true,canDelegate:true},
];
const events=[{event_id:'12',happened_at:new Date().toISOString(),action:'role.assignment.granted',actor_username:'owner_test',target_username:'moderator_test',reason:'Teste visual isolado'},{event_id:'11',happened_at:new Date(Date.now()-3600000).toISOString(),action:'role.created',actor_username:'owner_test',target_username:null,reason:'Estrutura inicial'}];
const capabilities={manageRoles:true,delegatePermissions:true,readAudit:true,readReports:true,manageReports:true,readPlayers:true,warnPlayers:true,mutePlayers:true,kickPlayers:true,suspendPlayers:true,banPlayers:true,revokeSanctions:true,adjustEconomy:true};
const reports=[{report_id:'42',reporter_username:'viajante_01',target_account_id:'target-1',target_username:'player_test',category:'harassment',description:'A conta repetiu mensagens ofensivas no espaço público.',status:'open',created_at:new Date().toISOString()}];
const sanctions=[];
let walletAdjustment=null;
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 const headers={'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:",'x-content-type-options':'nosniff'};
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(pathname==='/staff') {res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8'});res.end(await readFile(`${root}/staff-panel.html`));return;}
 if(pathname==='/staff-panel.mjs'||pathname==='/staff-panel.css'){const ext=pathname.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/css; charset=utf-8';res.writeHead(200,{...headers,'content-type':ext});res.end(await readFile(`${root}${pathname}`));return;}
 if(pathname==='/staff/roles'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({roles}));return;}
 if(pathname==='/staff/permissions'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({permissions}));return;}
 if(pathname==='/staff/capabilities'){json(200,{capabilities});return;}
 if(pathname==='/staff/audit'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({events}));return;}
 if(pathname==='/staff/reports'){json(200,{reports:reports.filter(report=>report.status===new URL(req.url,'http://localhost').searchParams.get('status'))});return;}
 if(pathname==='/staff/accounts/player_test/sanctions'){json(200,{sanctions});return;}
 if(pathname==='/staff/accounts/moderator_test/roles'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({account:{id:'synthetic',username:'moderator_test'},assignments:[]}));return;}
 if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const payload=raw?JSON.parse(raw):{};
   if(pathname==='/staff/reports/42'){reports[0].status=payload.action==='resolve'?'resolved':payload.action==='dismiss'?'dismissed':payload.action==='claim'?'claimed':'open';json(200,{changed:true});return;}
   if(pathname==='/staff/sanctions'){sanctions.push({sanction_id:'7',kind:payload.kind,reason:payload.reason,created_at:new Date().toISOString(),expires_at:payload.expiresAt,lifted_at:null});json(201,{sanctionId:'7'});return;}
   if(pathname==='/staff/sanctions/7/revoke'){sanctions[0].lifted_at=new Date().toISOString();json(200,{revoked:true});return;}
   if(pathname==='/staff/wallet'){walletAdjustment=payload;const total=payload.operation==='credit'?Number(payload.amount):-Number(payload.amount);const gold=Math.floor(total/10000),silver=Math.floor((total-gold*10000)/100),bronze=total-gold*10000-silver*100;json(200,{username:payload.username,wallet:{gold,silver,bronze,total,delta:total}});return;}
   json(pathname==='/staff/roles'?201:200,{ok:true,roleKey:'synthetic_role',changed:true,revoked:true,assignmentId:'1'});return;}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const errors=[];
let expectedAuditFailure=false;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!expectedAuditFailure)errors.push(m.text())});
 await page.goto(`http://127.0.0.1:${port}/staff`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Cargos e permissões'}).waitFor({state:'visible'});await page.getByRole('button',{name:'Cargos e permissões'}).click();await page.locator('#roles-body tr').first().waitFor();
 if(await page.locator('#roles-body tr').count()!==3)throw new Error('Expected three role rows');
 await page.getByRole('button',{name:'+ Criar cargo'}).click();await page.locator('#role-dialog[open]').waitFor();await page.getByRole('button',{name:'Cancelar'}).click();
 await page.locator('#roles-body tr').filter({hasText:'Gerente'}).focus();await page.keyboard.press('Enter');await page.locator('.permission-matrix').waitFor();
 if(await page.evaluate(()=>document.activeElement?.dataset.roleKey)!=='manager')throw new Error('Keyboard role selection lost focus when the table was rendered');
 if(await page.locator('.permission-row').filter({hasText:'Herdada'}).count()!==2)throw new Error('Inherited permissions were not labeled read-only');
 await page.locator('.permission-row').filter({hasText:'Atribuir e revogar cargos'}).locator('input').check();
 await page.locator('#confirm-dialog[open]').waitFor();await page.getByRole('button',{name:'Cancelar'}).click();
 await page.locator('#confirm-dialog[open]').waitFor({state:'hidden'});
 const permissionCheckbox=page.locator('.permission-row').filter({hasText:'Atribuir e revogar cargos'}).locator('input');
 await page.waitForFunction(()=>{const row=[...document.querySelectorAll('.permission-row')].find(el=>el.textContent.includes('Atribuir e revogar cargos'));return row&&!row.querySelector('input').checked;});
 if(await permissionCheckbox.isChecked())throw new Error('Cancelling permission grant left the checkbox enabled');
 await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-panel-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const mobileRoleLayout=await page.evaluate(()=>({columns:getComputedStyle(document.querySelector('.permission-matrix')).gridTemplateColumns.split(' ').length,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}));
 if(mobileRoleLayout.columns!==1||mobileRoleLayout.documentWidth>mobileRoleLayout.viewportWidth)throw new Error(`Role matrix does not fit a mobile viewport: ${JSON.stringify(mobileRoleLayout)}`);
 if(await page.locator('#role-table-hint').isVisible()!==true||await page.locator('.role-table-wrap').getAttribute('tabindex')!=='0')throw new Error('The mobile role table has no visible or keyboard-accessible scroll hint');
 const roleTableOverflow=await page.locator('.role-table-wrap').evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
 if(roleTableOverflow.scrollWidth<=roleTableOverflow.clientWidth)throw new Error(`Role table does not expose its clipped columns for horizontal scrolling: ${JSON.stringify(roleTableOverflow)}`);
 await page.locator('.role-table-wrap').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 await page.locator('.role-table-wrap').getByText('Estado',{exact:true}).waitFor();
 await page.locator('.role-table-wrap').evaluate(el=>{el.scrollLeft=0;});
 await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-roles-mobile.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 const reducedMotionDuration=await page.locator('.nav-item').first().evaluate(el=>getComputedStyle(el).transitionDuration);
 if(reducedMotionDuration.split(',').some(duration=>parseFloat(duration)!==0))throw new Error(`Reduced motion leaves navigation transitions enabled: ${reducedMotionDuration}`);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:1440,height:1050});
 await page.getByRole('button',{name:'Atribuições',exact:true}).click();
 let releaseRoles,rolesStarted,rolesFinished;const rolesGate=new Promise(resolve=>{releaseRoles=resolve;});const rolesSeen=new Promise(resolve=>{rolesStarted=resolve;});const rolesDone=new Promise(resolve=>{rolesFinished=resolve;});
 const accountRolesRoute=async route=>{const username=route.request().url().includes('/slow_user/')?'slow_user':'fast_user';if(username==='slow_user'){rolesStarted();await rolesGate;}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({account:{id:username,username},assignments:[]})});if(username==='slow_user')rolesFinished();};
 await page.route('**/staff/accounts/*/roles',accountRolesRoute);await page.locator('#lookup-username').fill('slow_user');await page.getByRole('button',{name:'Consultar conta'}).click();await rolesSeen;
 await page.locator('#lookup-username').fill('fast_user');await page.getByRole('button',{name:'Consultar conta'}).click();await page.locator('#account-panel').getByRole('heading',{name:'fast_user'}).waitFor();releaseRoles();await rolesDone;await page.waitForTimeout(100);
 if(await page.locator('#account-panel').getByRole('heading',{name:'fast_user'}).count()!==1)throw new Error('A stale role lookup replaced the latest selected account');
 await page.unroute('**/staff/accounts/*/roles',accountRolesRoute);
 await page.getByRole('button',{name:'Auditoria'}).click();await page.locator('#audit-body tr').first().waitFor();
 if(await page.locator('#audit-body tr').count()!==2)throw new Error('Audit view did not render');
 const auditPage=Array.from({length:50},(_,index)=>({...events[0],event_id:String(100-index)}));
 const auditRoute=async route=>{const url=new URL(route.request().url());if(url.searchParams.has('before')){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha simulada ao carregar anteriores.'})});}else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:auditPage})});};
 await page.route('**/staff/audit?*',auditRoute);await page.locator('#audit-refresh').click();await page.locator('#audit-more').waitFor({state:'visible'});
 expectedAuditFailure=true;await page.locator('#audit-more').click();await page.getByText('Falha simulada ao carregar anteriores.').waitFor();
 if(await page.locator('#audit-body tr').count()!==50||await page.locator('#audit-more').isDisabled())throw new Error('An audit pagination error discarded loaded rows or prevented retry');
 expectedAuditFailure=false;await page.unroute('**/staff/audit?*',auditRoute);
 await page.getByRole('button',{name:'Moderação'}).click();await page.locator('#reports-body tr').first().waitFor();
 if(await page.locator('#reports-body tr').count()!==1)throw new Error('Moderation queue did not render');
 let releaseReport,reportStarted,reportFinished;const reportGate=new Promise(resolve=>{releaseReport=resolve;});const reportSeen=new Promise(resolve=>{reportStarted=resolve;});const reportDone=new Promise(resolve=>{reportFinished=resolve;});
 const reportRoute=async route=>{const status=new URL(route.request().url()).searchParams.get('status');if(status==='claimed'){reportStarted();await reportGate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reports:[{...reports[0],status:'claimed'}]})});reportFinished();}else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reports:[]})});};
 await page.route('**/staff/reports?*',reportRoute);await page.locator('#reports-status').selectOption('claimed');await reportSeen;await page.locator('#reports-status').selectOption('resolved');await page.getByText('Nenhuma denúncia neste estado.').waitFor();releaseReport();await reportDone;
 await page.waitForTimeout(100);
 if(!(await page.locator('#reports-body').textContent()).includes('Nenhuma denúncia neste estado.'))throw new Error('A stale moderation response replaced the selected filter');
 await page.unroute('**/staff/reports?*',reportRoute);await page.locator('#reports-status').selectOption('open');await page.getByRole('button',{name:'Assumir'}).waitFor();
 await page.getByRole('button',{name:'Assumir'}).click();await page.locator('#confirm-dialog[open]').waitFor();
 await page.locator('#confirm-reason').fill('Teste de assunção da denúncia');await page.getByRole('button',{name:'Assumir denúncia'}).click();
 await page.locator('#reports-status').selectOption('claimed');await page.getByRole('button',{name:'Concluir'}).click();await page.locator('#confirm-dialog[open]').waitFor();
 await page.locator('#confirm-reason').fill('Teste de encerramento da denúncia');await page.getByRole('button',{name:'Concluir análise'}).click();
 await page.locator('#reports-status').selectOption('resolved');
 await page.locator('#reports-body').getByText('Resolvida').waitFor();
 let releaseAccount,accountStarted,accountFinished;const accountGate=new Promise(resolve=>{releaseAccount=resolve;});const accountSeen=new Promise(resolve=>{accountStarted=resolve;});const accountDone=new Promise(resolve=>{accountFinished=resolve;});
 const sanctionRoute=async route=>{if(route.request().url().includes('/slow_user/')){accountStarted();await accountGate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sanctions:[]})});accountFinished();}else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sanctions:[]})});};
 await page.route('**/staff/accounts/*/sanctions',sanctionRoute);await page.locator('#sanction-username').fill('slow_user');await page.getByRole('button',{name:'Consultar histórico'}).click();await accountSeen;
 await page.locator('#sanction-username').fill('fast_user');await page.getByRole('button',{name:'Consultar histórico'}).click();await page.locator('#sanction-account').getByRole('heading',{name:'fast_user'}).waitFor();releaseAccount();await accountDone;
 await page.waitForTimeout(100);
 if(await page.locator('#sanction-account').getByRole('heading',{name:'fast_user'}).count()!==1)throw new Error('A stale account response replaced the latest selected account');
 await page.unroute('**/staff/accounts/*/sanctions',sanctionRoute);
 await page.locator('#sanction-username').fill('player_test');await page.getByRole('button',{name:'Consultar histórico'}).click();
 await page.locator('#sanction-account').getByRole('heading',{name:'player_test'}).waitFor();
 await page.locator('#sanction-account select[name="kind"]').selectOption('mute');
 await page.getByRole('button',{name:'Aplicar medida'}).click();await page.locator('#confirm-dialog[open]').waitFor();
 await page.locator('#confirm-reason').fill('Teste visual isolado de sanção');await page.getByRole('button',{name:'Aplicar medida'}).last().click();
 await page.locator('#sanction-account tbody tr').getByText('Silenciamento').waitFor();
 await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-moderation-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 if(await page.locator('#view-moderation .role-table-hint').first().isVisible()!==true||await page.locator('#view-moderation .table-wrap[tabindex="0"]').count()!==2)throw new Error('Mobile moderation tables lack scroll guidance or keyboard access');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Moderation page overflows the mobile viewport');
 await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-moderation-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1050});
 await page.getByRole('button',{name:'Economia'}).click();
 await page.locator('#wallet-username').fill('player_test');await page.locator('#wallet-amount').fill('10000123');
 if(await page.locator('#wallet-amount').getAttribute('max')!=='21474836479999')throw new Error('The wallet form still limits owner adjustments to the old cap');
 await page.getByRole('button',{name:'Revisar ajuste'}).click();await page.locator('#confirm-dialog[open]').waitFor();
 await page.locator('#confirm-reason').fill('Teste visual isolado de ajuste de saldo');await page.getByRole('button',{name:'Adicionar moedas'}).click();
 await page.locator('#confirm-dialog').waitFor({state:'hidden',timeout:3000}).catch(async()=>{throw new Error(`Wallet confirmation stayed open: ${await page.locator('#confirm-copy').textContent()}`)});
 await page.waitForFunction(()=>document.querySelector('#wallet-result').textContent.includes('10.000.123 moedas no total'));
 const walletResult=await page.locator('#wallet-result').textContent();
 if(!walletResult.includes('10.000.123 moedas no total'))throw new Error(`Unexpected wallet result: ${walletResult}`);
 if(walletAdjustment?.reason!=='Teste visual isolado de ajuste de saldo'||walletAdjustment?.amount!==10_000_123)throw new Error('Wallet adjustment was not sent with confirmation reason');
 await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-economy-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(projectRoot,'logs/housekeeping-panel-mobile.png'),fullPage:true});
 if(errors.length)throw new Error(`Browser errors: ${errors.join(' | ')}`);
 process.stdout.write(JSON.stringify({ok:true,roleRows:3,inheritedReadOnlyRows:2,permissionCancelReverted:true,mobileRoleMatrix:mobileRoleLayout,reducedMotion:reducedMotionDuration,auditPaginationErrorRetainsRows:true,latestAccountAndReportResultsWin:true,moderationRows:1,sanctionRows:sanctions.length,walletAdjustment:!!walletAdjustment,desktop:'logs/housekeeping-panel-desktop.png',rolesMobile:'logs/housekeeping-roles-mobile.png',moderation:'logs/housekeeping-moderation-desktop.png',moderationMobile:'logs/housekeeping-moderation-mobile.png',economy:'logs/housekeeping-economy-desktop.png',mobile:'logs/housekeeping-panel-mobile.png',pageErrors:errors},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
