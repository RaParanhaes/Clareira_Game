// Validates the real modal DOM and CSS on this commit, without the VPS or live accounts.
// CI installs Playwright only for the temporary runner; screenshots remain in Actions artifacts.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.argv[2] || 'logs/economy-visual';
await mkdir(output, { recursive:true });
const fullHtml = await readFile('game/index.html', 'utf8');
const dialog = fullHtml.match(/<dialog id="lodging-dialog"[\s\S]*?<\/dialog>/)?.[0];
assert.ok(dialog, 'the real game must expose the service dialog');

const server = http.createServer(async (request,response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/dev/ui-economy') {
    response.writeHead(200, {'content-type':'text/html; charset=utf-8'});
    response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<link rel="stylesheet" href="/dev/style.css">' +
      '<style>body{background:#26302c;min-height:100vh}</style><body>' + dialog + '</body></html>');
    return;
  }
  if (!pathname.startsWith('/dev/') || !/^\/dev\/[a-zA-Z0-9/_.-]+$/.test(pathname)
      || pathname.split('/').includes('..')) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const file = path.join(process.cwd(), 'game', pathname.slice('/dev/'.length));
  try {
    const body = await readFile(file);
    const type = file.endsWith('.mjs') || file.endsWith('.js') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json'
      : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    response.writeHead(200, {'content-type':type}); response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/dev/ui-economy';
let browser;
const records = [];
try {
  browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  for (const [name,viewport] of [
    ['desktop',{width:1440,height:900}],
    ['mobile',{width:390,height:844}],
    ['small',{width:320,height:640}],
  ]) {
    const context = await browser.newContext({viewport,hasTouch:true,isMobile:name!=='desktop'});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(url);
    await page.evaluate(async () => {
      const [{createPlacePanel},{createPanelController}] = await Promise.all([
        import('/dev/place-panel.mjs'), import('/dev/panel-controller.mjs'),
      ]);
      window.economyController=createPanelController();
      window.economyActions=[];
      window.economyState={
        guest:false, inventory:{wood:20,gold:1,bronze:90}, contracts:[],
        cabinKeys:[],propertyListings:[],recurringLeasesAvailable:true,
        marketQuotes:{
          wood:{buyPrice:2,sellPrice:3,availableStock:5},
          copperIngot:{buyPrice:51,sellPrice:60,availableStock:1},
        },
      };
      window.economyPoint={key:'visual-exchange',placeId:'arrival',label:'Trocas da vila',
        sections:['trade','orders','tools','government']};
      window.economyPanel=createPlacePanel({
        dialog:document.querySelector('#lodging-dialog'),
        controller:economyController, getState:()=>economyState,
        onAction: message => { economyActions.push(message); return true; },
      });
      economyPanel.open(economyPoint,'visual');
    });
    const click = async locator => page.locator(locator).click();
    const assertLayout = async () => {
      const geometry = await page.locator('dialog[open]').evaluate(el => {
        const r=el.getBoundingClientRect();
        const body=el.querySelector('[data-panel-body]');
        return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,
          viewportWidth:innerWidth,viewportHeight:innerHeight,
          dialogOverflow:el.scrollWidth>el.clientWidth+1,
          contentOverflow:body.scrollWidth>body.clientWidth+1};
      });
      assert.ok(geometry.left>=-1 && geometry.top>=-1
        && geometry.right<=geometry.viewportWidth+1
        && geometry.bottom<=geometry.viewportHeight+1
        && !geometry.dialogOverflow && !geometry.contentOverflow,
        name+' has clipped/overflowing dialog: '+JSON.stringify(geometry));
    };
    await click('[data-service-section="trade"]');
    await page.screenshot({path:`${output}/${name}-market.png`,fullPage:true});
    await assertLayout();
    assert.equal(await page.locator('[data-service-action="lodgeSell"]').count(),1);
    assert.equal(await page.locator('[data-service-action="lodgeBuyMaterial"]').count(),2);
    assert.ok((await page.locator('#lodging-options').textContent()).includes('5 disponíveis'));
    const buy=page.locator('.commerce-purchase').filter({has:page.locator('[data-service-action="lodgeBuyMaterial"][data-item="wood"]')});
    await buy.locator('[data-buy-quantity-item="wood"]').fill('2');
    assert.ok((await buy.textContent()).includes('6 bronzes'));
    await click('[data-service-action="lodgeBuyMaterial"][data-item="wood"]');
    assert.equal(await page.locator('.commerce-review').count(),1,'buying requires confirmation');
    await assertLayout();
    assert.ok((await page.locator('.commerce-review').textContent()).includes('2 ×'));
    await page.screenshot({path:`${output}/${name}-purchase-confirm.png`,fullPage:true});

    // Stock changed while the player was reviewing: never send a stale purchase.
    await page.evaluate(()=>economyState.marketQuotes.wood.availableStock=1);
    await click('[data-service-action="__confirm"]');
    assert.equal(await page.evaluate(()=>economyActions.length),0,'stock changed: purchase blocked');
    assert.equal(await page.locator('.commerce-review').count(),0);
    await page.evaluate(()=>{economyState.marketQuotes.wood.availableStock=5;economyPanel.refresh(economyPoint,'visual');});
    await click('[data-service-action="lodgeBuyMaterial"][data-item="wood"]');
    await click('[data-service-action="__confirm"]');
    const buySent=await page.evaluate(()=>economyActions.at(-1));
    assert.equal(buySent.name,'lodgeBuyMaterial');
    assert.equal(buySent.quantity,2);
    assert.equal(buySent.expectedPriceBronze,3);
    assert.equal(await page.evaluate(()=>economyActions.length),1);
    assert.equal(await page.locator('[data-service-action="lodgeBuyMaterial"][data-item="wood"]').isDisabled(),true);
    await page.evaluate(()=>economyPanel.notice('Compra de teste concluída'));
    await page.evaluate(()=>{economyState.marketQuotes.wood.availableStock=0;economyPanel.refresh(economyPoint,'visual');});
    assert.equal(await page.locator('[data-service-action="lodgeBuyMaterial"][data-item="wood"]').count(),0,'sold-out items disappear');

    // Price changes during review must also cancel without charging anyone.
    await page.evaluate(()=>{economyState.marketQuotes.wood.availableStock=5;economyPanel.refresh(economyPoint,'visual');});
    await click('[data-service-action="lodgeBuyMaterial"][data-item="wood"]');
    await page.evaluate(()=>economyState.marketQuotes.wood.sellPrice=4);
    await click('[data-service-action="__confirm"]');
    assert.equal(await page.evaluate(()=>economyActions.length),1,'changed quote does not submit');

    // Existing commerce and rental user interfaces must remain reachable.
    await page.evaluate(()=>{economyController.close();economyState.marketQuotes.wood.sellPrice=3;economyPanel.open(economyPoint,'visual');});
    await click('[data-service-section="trade"]');
    await click('[data-service-action="lodgeSell"][data-item="wood"]');
    await click('[data-service-action="__confirm"]');
    assert.equal(await page.evaluate(()=>economyActions.at(-1)?.name),'lodgeSell');
    await page.evaluate(()=>{
      economyPanel.notice('Venda de teste concluída');
      economyController.close();
      window.economyPoint={key:'visual-rent',placeId:'lodging-rill-guesthouse',
        label:'Recepção',sections:['rooms']};
      economyPanel.open(economyPoint,'visual-rent');
    });
    await click('[data-service-section="rooms"]');
    await assertLayout();
    await page.screenshot({path:`${output}/${name}-rent.png`,fullPage:true});
    assert.ok(await page.locator('[data-service-action="lodgeClaim"]').count()>=1);
    await click('[data-service-action="lodgeClaim"]');
    assert.ok((await page.locator('.commerce-review').textContent()).includes('Revisar'));
    assert.deepEqual(errors,[],'no uncaught browser exceptions');
    records.push({viewport:name,marketGoods:2,buyConfirmed:true,staleStockBlocked:true,
      stalePriceBlocked:true,sellReview:true,rentReview:true,overflow:false,errors:0});
    await context.close();
  }
  await writeFile(path.join(output,'result.json'),
    JSON.stringify({test:'economy isolated DOM with real UI and CSS',syntheticState:true,liveAccounts:false,records},null,2));
  console.log('ECONOMY_VISUAL_OK '+JSON.stringify(records));
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
