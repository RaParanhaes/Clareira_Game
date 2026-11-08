import assert from "node:assert/strict";
import {DIMENSION_ROUTES as routes,DIMENSION_SECRET_ROUTES as secretRoutes,DIMENSION_VILLAGE_ROUTES as villageRoutes,isDimensionPathTile,isDimensionSecretPathTile} from "../game/dimension-layout.mjs";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function oldFollows(x,y,collection,radius){return collection.some(route=>route.slice(1).some((point,index)=>{const [ax,ay]=route[index],[bx,by]=point,dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-ax-dx*t,y-ay-dy*t)<=radius}))}
function oldPath(x,y){return oldFollows(x,y,villageRoutes,1.3)||oldFollows(x,y,routes,.72)||oldFollows(x,y,secretRoutes,.32)}
function oldSecret(x,y){return oldFollows(x,y,secretRoutes,.32)}
let checked=0;for(let y=70;y<=720;y++)for(let x=75;x<=720;x++){assert.equal(isDimensionPathTile(x,y),oldPath(x,y),`path ${x},${y}`);checked++}
let seed=712367;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);for(let i=0;i<100000;i++){const x=75+rand()*645,y=70+rand()*650;assert.equal(isDimensionPathTile(x,y),oldPath(x,y),`path random ${x},${y}`);assert.equal(isDimensionSecretPathTile(x,y),oldSecret(x,y),`secret ${x},${y}`)}
const points=Array.from({length:5000},(_,i)=>[75+(i*7919%64500)/100,70+(i*3571%65000)/100]);function bench(fn){for(let k=0;k<2;k++)for(const p of points)fn(...p);const start=performance.now();for(const p of points)for(let n=0;n<40;n++)fn(...p);return +(performance.now()-start).toFixed(1)}
const baselineMs=bench(oldPath),optimizedMs=bench(isDimensionPathTile);assert.equal(checked,420546);console.log(JSON.stringify({checkedGrid:checked,randomPoints:100000,mismatches:0,benchmarkCalls:200000,baselineMs,optimizedMs,speedup:+(baselineMs/optimizedMs).toFixed(2)}));
