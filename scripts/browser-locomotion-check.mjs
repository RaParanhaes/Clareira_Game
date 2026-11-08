import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const output=process.argv[2]||'logs/locomotion-browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
 await page.locator('#guest-form button[type=submit]').click();
 await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>window.scene=(await import('/dev/main.js')).inspectMovement);
 await page.waitForFunction(()=>window.scene().server);
 await page.waitForFunction(()=>{const state=window.scene();return state.readiness.sceneReady&&state.readiness.predictionReady&&!state.readiness.loading&&state.readiness.connected});
 await page.waitForTimeout(400);
 await page.locator('#world').focus();
 const inspect=()=>page.evaluate(()=>window.scene());
 const initial=await inspect();
 await page.screenshot({path:`${output}/desktop-idle.png`});

 await page.keyboard.down(' ');
 await page.waitForFunction(()=>window.scene().position.z>.2,{},{timeout:1800});
 const jump=await inspect();
 await page.screenshot({path:`${output}/desktop-jump.png`});
 await page.keyboard.up(' ');
 await page.waitForFunction(()=>window.scene().position.z===0,{},{timeout:2500});

 await page.keyboard.press('Alt+1');
 await page.waitForFunction(()=>window.scene().pose.gesture==='wave');
 await page.screenshot({path:`${output}/desktop-wave.png`});
 await page.keyboard.press('Alt+2');
 await page.waitForFunction(()=>window.scene().pose.gesture==='dance');
 await page.screenshot({path:`${output}/desktop-dance.png`});
 await page.locator('#world').focus();
 await page.keyboard.down('c');
 await page.waitForFunction(()=>window.scene().position.crouching);
 await page.screenshot({path:`${output}/desktop-crouch.png`});
 await page.keyboard.up('c');
 await page.keyboard.press('Alt+3');
 await page.waitForFunction(()=>window.scene().body.sit>.05);
 await page.screenshot({path:`${output}/desktop-sit.png`});

 await page.setViewportSize({width:390,height:844});
 await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>window.scene=(await import('/dev/main.js')).inspectMovement);
 await page.waitForFunction(()=>{const state=window.scene();return state.readiness.sceneReady&&state.readiness.predictionReady&&!state.readiness.loading&&state.readiness.connected});
 await page.waitForTimeout(300);
 await page.screenshot({path:`${output}/mobile-idle.png`});
 const button=await page.locator('[data-motion-key=" "]').boundingBox();
 await page.mouse.move(button.x+button.width/2,button.y+button.height/2);
 await page.mouse.down();
 await page.waitForFunction(()=>window.scene().position.z>.2,{},{timeout:2000});
 await page.screenshot({path:`${output}/mobile-jump.png`});
 await page.mouse.up();
 assert.deepEqual(errors,[]);
 const result={appearance:initial.appearance,jump:jump.position,actions:['jump','wave','dance','crouch','sit'],errors};
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
