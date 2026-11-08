import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/20261025-pixel-loading-timeout-browser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
  for(const mode of ['silent-handshake','open-without-snapshot']){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(mode=>{
      class MockSocket extends EventTarget {
        static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
        constructor(url){super();this.url=url;this.readyState=MockSocket.CONNECTING;this.bufferedAmount=0;
          if(mode==='open-without-snapshot')queueMicrotask(()=>{if(this.readyState!==MockSocket.CONNECTING)return;this.readyState=MockSocket.OPEN;this.dispatchEvent(new Event('open'));});}
        send(){}
        close(code=1000,reason=''){if(this.readyState>=MockSocket.CLOSING)return;this.readyState=MockSocket.CLOSING;setTimeout(()=>{this.readyState=MockSocket.CLOSED;this.dispatchEvent(new CloseEvent('close',{code,reason}));},0);}
      }
      window.WebSocket=MockSocket;
    },mode);
    await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#guest-form button[type=submit]',{state:'visible',timeout:15000});
    await page.locator('#guest-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.shell').classList.contains('is-authenticated'),null,{timeout:15000});
    const started=Date.now();
    await page.waitForFunction(()=>!document.querySelector('#loading-reload').hidden,null,{timeout:75000});
    const result=await page.evaluate(()=>({phase:document.querySelector('#scene-loading').dataset.phase,
      loading:!document.querySelector('#scene-loading').hidden,
      retryVisible:!document.querySelector('#loading-reload').hidden,
      retryText:document.querySelector('#loading-message').textContent,
      inert:document.querySelector('.shell').inert,
      canvas:[document.querySelector('#world').width,document.querySelector('#world').height]}));
    assert.equal(result.phase,"error");
    assert.equal(result.retryVisible,true);
    assert.equal(result.inert,true,'the incomplete world remains inaccessible behind recovery');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`${output}/${mode}.png`});
    results.push({mode,elapsedMs:Date.now()-started,...result,errors});
    await page.close();
  }
} finally {await browser.close();}
await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
