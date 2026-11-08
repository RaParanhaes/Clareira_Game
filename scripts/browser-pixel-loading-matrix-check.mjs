import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/20261025-pixel-loading-matrix';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try{
  const cases=[['desktop-dpr1',{width:1440,height:900},1],['desktop-dpr2',{width:1280,height:800},2],
    ['mobile-dpr1',{width:390,height:844},1],['mobile-dpr2',{width:390,height:844},2]];
  for(const [name,viewport,dpr] of cases){
    const context=await browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:viewport.width<600,hasTouch:viewport.width<600});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#guest-form button[type=submit]',{state:'visible',timeout:20000});
    await page.screenshot({path:`${output}/${name}-entry.png`});
    await page.locator('#guest-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.shell').classList.contains('is-authenticated'),null,{timeout:15000});
    await page.evaluate(async()=>{const module=await import('/dev/main.js');window.__pixelDiagnostics=()=>module.inspectMovement();});
    const progress=[],started=Date.now();
    while(Date.now()-started<60000){
      const s=await page.evaluate(()=>({state:window.__pixelDiagnostics?.(),percent:document.querySelector('#loading-progress')?.getAttribute('aria-valuenow'),
        stage:document.querySelector('[data-loading-step=current]')?.dataset.stage,detail:document.querySelector('[data-loading-detail]')?.textContent}));
      progress.push({elapsedMs:Date.now()-started,percent:s.percent,stage:s.stage,detail:s.detail});
      if(s.state?.readiness.sceneReady&&!s.state.readiness.loading)break;
      await page.waitForTimeout(180);
    }
    const state=await page.evaluate(()=>{
      const canvas=document.querySelector('#world'),rect=canvas.getBoundingClientRect(),s=window.__pixelDiagnostics();
      return {dpr:devicePixelRatio,ratio:s.canvasPixelRatio,canvas:{width:canvas.width,height:canvas.height},
        css:{width:rect.width,height:rect.height},pixelRatioX:canvas.width/rect.width,location:s.location,
        position:s.position,camera:s.camera,terrainRetention:s.terrainRetention,loading:s.readiness.loading};
    });
    assert.equal(state.ratio,.5,`${name}: fixed ratio`);
    assert.ok(Math.abs(state.pixelRatioX-.5)<.01,`${name}: backing canvas is half CSS dimensions`);
    assert.equal(state.loading,false,`${name}: scene ready`);
    await page.screenshot({path:`${output}/${name}-before.png`});
    const movement=[];
    if(name==='desktop-dpr1'){
      await page.locator('#world').focus();
      await page.keyboard.down('Shift');await page.keyboard.down('ArrowDown');
      for(let i=0;i<48;i++){
        await page.waitForTimeout(250);
        movement.push(await page.evaluate(()=>{const s=window.__pixelDiagnostics();return {
          position:s.position,camera:s.camera,retention:s.terrainRetention,ratio:s.canvasPixelRatio};}));
      }
      await page.keyboard.up('ArrowDown');await page.keyboard.up('Shift');await page.waitForTimeout(300);
      await page.screenshot({path:`${output}/${name}-after-run.png`});
    }
    assert.deepEqual(errors,[]);
    results.push({name,dpr,state,progress,movement,errors});
    await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
    await context.close();
  }
}finally{await browser.close();}
console.log(JSON.stringify(results.map(r=>({name:r.name,dpr:r.dpr,ratio:r.state.ratio,pixelRatioX:r.state.pixelRatioX,
  position:r.state.position,framesHeld:r.state.terrainRetention.frames,totalMs:r.state.terrainRetention.totalMs,
  maxMs:r.state.terrainRetention.maxMs,currentMs:r.state.terrainRetention.currentMs,
  cache:r.state.terrainRetention.cache,worldWarm:r.state.terrainRetention.worldWarm,movementSamples:r.movement.length}))));
