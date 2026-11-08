import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRoomTransition} from './room-transition.mjs';

test('room passage covers immediately without copying a frame and blocks input until reveal completes',async()=>{
 const priorDocument=globalThis.document,priorWindow=globalThis.window;const nodes=[],listeners=new Map();let finish;
 const node=tag=>{const el={tag,hidden:false,style:{},dataset:{},setAttribute(){},append(){},addEventListener(type,fn){listeners.set(type,fn);},
  animate(){return {cancel(){},finished:new Promise(resolve=>{finish=resolve;})};}};nodes.push(el);return el;};
 globalThis.document={createElement:node,body:{append(){}}};globalThis.window={addEventListener(type,fn){listeners.set(type,fn);}};
 try{
  const transition=createRoomTransition({getBoundingClientRect:()=>assert.fail('black cover must not copy the old scene')});
  transition.start();const root=nodes[0],shade=nodes[2];assert.equal(root.hidden,false);assert.equal(shade.style.opacity,'1');
  let blocked=0;listeners.get('keydown')({preventDefault(){blocked++;},stopImmediatePropagation(){blocked++;}});assert.equal(blocked,2);
  const revealing=transition.reveal();await Promise.resolve();assert.equal(transition.active,true);
  finish();await revealing;assert.equal(transition.active,false);assert.equal(root.hidden,true);
 }finally{globalThis.document=priorDocument;globalThis.window=priorWindow;}
});

test('a rendering exception cannot permanently terminate the animation loop',()=>{
 const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 const frame=source.slice(source.indexOf('function frame(now){'),source.indexOf('function advanceFrame(now)'));
 const callbacks=[],diagnostics=[];let fail=true,frames=0;
 const context={authenticated:true,frameStarted:true,lastFrameErrorAt:-Infinity,lastFrame:10,accumulator:1,pendingInputs:[],outboundInputs:[],
  advanceFrame(){frames++;if(fail)throw new Error('temporary canvas failure');},console:{error(){}},
  recordMovementDiagnostic:(...args)=>diagnostics.push(args),requestAnimationFrame:fn=>callbacks.push(fn)};
 runInNewContext(`${frame};frame(100);`,context);
 assert.equal(callbacks.length,1);assert.equal(diagnostics[0][0],'runtime-error');assert.equal(context.accumulator,0);
 fail=false;callbacks.shift()(120);assert.equal(frames,2);assert.equal(callbacks.length,1,'exactly one next frame');
 context.authenticated=false;callbacks.shift()(140);assert.equal(callbacks.length,0);assert.equal(context.frameStarted,false);
});
