import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const output=process.argv[2]||'logs/cottage-3d-browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const results=[];
try{
  for(const [name,viewport,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,ignoreHTTPSErrors:true});
    const page=await context.newPage(),errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
    await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded',timeout:60000});
    const visitor=page.getByRole('button',{name:'Jogar como visitante',exact:true});
    try{await visitor.waitFor({timeout:180000});}
    catch{
      const body=await page.locator('body').innerText();
      const progress=body.match(/\d+(?:[.,]\d+)?%/g)?.[0]||null;
      const tasks=body.match(/\d+\/\d+ tarefas/)?.[0]||null;
      await page.screenshot({path:`${output}/${name}-loading.png`});
      results.push({name,status:'entry-not-reached',progress,tasks,errors,failedRequests:failed.length});
      await context.close();
      continue;
    }
    await visitor.click();
    await page.waitForFunction(()=>document.querySelector('.shell')?.classList.contains('is-authenticated'),null,{timeout:60000});
    await page.waitForTimeout(1500);
    const canvas=await page.locator('#world').boundingBox();
    await page.screenshot({path:`${output}/${name}-game.png`});
    results.push({name,status:'game-rendered',canvas,errors,failedRequests:failed.length,failed:failed.slice(0,10)});
    await context.close();
  }
}finally{await browser.close();}
await writeFile(`${output}/integration-result.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
