import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightmapRenderer,paintLightmap} from './lightmap-renderer.mjs';
import {lightAmount} from './scene-lights.mjs';
const source={id:'test-lamp',x:1,y:2,reach:1,height:2,strength:.8,color:'#ffcd8b',nx:0,ny:1};
function recordingDocument(){
 const images=[];
 return {images,createElement(){const polygons=[];let points=[];const ctx={fillStyle:'',setTransform(){},beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},fill(){polygons.push({color:this.fillStyle,points});}};
 const image={width:0,height:0,polygons,getContext:()=>ctx};images.push(image);return image;}};
}
function reference(light,obstacles,bounds,surface){
 const shapes=[],step=.22,extent=Math.ceil(light.reach*2*16)+8,top=extent+Math.ceil(Math.max(0,light.height)*12),rgb=[1,3,5].map(offset=>parseInt(light.color.slice(offset,offset+2),16));
 for(let x=light.x-light.reach;x<=light.x+light.reach;x+=step)for(let y=light.y-light.reach;y<=light.y+light.reach;y+=step){
  if(bounds&&(x<bounds.left||x+step>bounds.right||y<bounds.top||y+step>bounds.bottom))continue;
  const z=surface(x+step/2,y+step/2),strength=lightAmount(light,{x:x+step/2,y:y+step/2,height:z+.05},obstacles);if(strength<.012)continue;
  shapes.push({color:`rgba(${rgb.join(',')},${Math.min(.95,strength*1.3)})`,points:[[0,0],[step,0],[step,step],[0,step]].map(([dx,dy])=>[extent+(x+dx-light.x-y-dy+light.y)*16,top+(x+dx-light.x+y+dy-light.y)*9-z*12])});
 }
 return shapes;
}
test('lightmap requests do no raster work; bounded batches publish only a completed image with identical light/occlusion',()=>{
 const doc=recordingDocument(),renderer=createLightmapRenderer({documentRef:()=>doc,now:()=>0}),surface=(x,y)=>(x+y)*.13;
 const obstacles=[{left:.9,right:1.2,top:2.5,bottom:2.7,height:4},{left:100,right:110,top:100,bottom:110,height:100}];
 assert.equal(renderer.request(source,obstacles,null,surface,'geometry'),null);assert.equal(doc.images.length,0);
 renderer.process(1.5,7);assert.ok(renderer.stats().cells<=7);assert.equal(renderer.request(source,obstacles,null,surface,'geometry'),null);
 while(renderer.stats().pending)assert.ok(renderer.process(1.5,7).work<=7);
 const patch=renderer.request(source,obstacles,null,surface,'geometry');assert.ok(patch);
 assert.deepEqual(patch.image.polygons,reference(source,obstacles,null,surface));
 assert.equal(renderer.stats().completed,1);assert.equal(renderer.stats().pending,0);
});
test('lightmaps retain captured dimension context across slices and invalidate on geometry or light changes',()=>{
 const doc=recordingDocument(),renderer=createLightmapRenderer({documentRef:()=>doc,now:()=>0});let dimension='A';
 const surface=()=>{assert.equal(dimension,'B');return 0;},withContext=fn=>{const previous=dimension;try{dimension='B';return fn();}finally{dimension=previous;}};
 renderer.request(source,[],null,surface,'geometry-1',{withContext});while(renderer.stats().pending){renderer.process(2,11);assert.equal(dimension,'A');}
 assert.ok(renderer.request(source,[],null,surface,'geometry-1',{withContext}));
 assert.equal(renderer.request(source,[],null,surface,'geometry-2',{withContext}),null);
 const fading=renderer.request({...source,strength:.4},[],null,surface,'geometry-1',{withContext});
 assert.ok(fading.image);assert.equal(fading.intensityScale,.5,'fading preserves a completed map while its replacement is built');
 assert.equal(renderer.stats().pending,2);
});
test('lightmap queue, surface resolution and LRU memory stay bounded while revisiting many lights',()=>{
 const doc=recordingDocument(),renderer=createLightmapRenderer({documentRef:()=>doc,now:()=>0,maxEntries:2,maxPending:2,maxBytes:8192,maxPixels:1024});
 for(let i=0;i<8;i++){
  renderer.request({...source,id:'lamp-'+i},[],null,()=>0,'room');
  while(renderer.stats().pending)renderer.process(5,1000);
  const s=renderer.stats();assert.ok(s.entries<=2);assert.ok(s.bytes<=8192);assert.ok(doc.images.at(-1).width*doc.images.at(-1).height<=1024);
 }
 assert.equal(renderer.stats().completed,8);
 for(let i=0;i<4;i++)renderer.request({...source,id:'pending-'+i},[],null,()=>0,'room');assert.equal(renderer.stats().pending,2);
});
test('an unfinished lightmap is never passed to drawImage',()=>{
 const ctx={save(){throw new Error('unfinished lightmaps must not paint');}};paintLightmap(ctx,null,{x:0,y:0},1);
});
