import { lightAmount } from './scene-lights.mjs';

const TX=16,TY=9,HZ=12,STEP=.22;
// Requests never rasterize in draw(). One bounded queue owns both in-progress
// and completed surfaces; each cell preserves the original ray/height math.
export function createLightmapRenderer({documentRef=()=>globalThis.document,now=()=>performance.now(),
  maxEntries=64,maxPending=32,maxBytes=64*1024*1024,maxPixels=1024*1024}={}){
  const cache=new Map(),pending=new Map(),previousBySource=new Map();let bytes=0,revision=0,completed=0,cells=0;
  const remove=key=>{const patch=cache.get(key);if(patch){bytes-=patch.bytes;cache.delete(key);
    if(previousBySource.get(patch.sourceKey)===patch)previousBySource.delete(patch.sourceKey);}};
  function* build(job){
    const {light,bounds,surface}=job;
    const extent=Math.ceil(light.reach*2*TX)+8,top=extent+Math.ceil(Math.max(0,light.height)*HZ);
    const rasterScale=Math.min(1,Math.sqrt(Math.min(maxPixels,maxBytes/4)/(extent*2*(top+extent))));
    const image=documentRef().createElement('canvas');image.width=Math.max(1,Math.floor(extent*2*rasterScale));image.height=Math.max(1,Math.floor((top+extent)*rasterScale));
    job.bytes=image.width*image.height*4;
    while(cache.size&&(bytes+job.bytes>maxBytes||cache.size>=maxEntries))remove(cache.keys().next().value);
    bytes+=job.bytes;
    const c=image.getContext('2d');c.setTransform(rasterScale,0,0,rasterScale,0,0);
    const color=light.color||'#ffcd8b',rgb=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
    // A ray ending inside this light's footprint cannot intersect a box wholly
    // outside it. Cull once, instead of scanning every house for every cell.
    const obstacles=job.obstacles.filter(box=>box.right>=light.x-light.reach&&box.left<=light.x+light.reach
      &&box.bottom>=light.y-light.reach&&box.top<=light.y+light.reach);
    yield;
    for(let x=light.x-light.reach;x<=light.x+light.reach;x+=STEP)for(let y=light.y-light.reach;y<=light.y+light.reach;y+=STEP){
      if(!bounds||!(x<bounds.left||x+STEP>bounds.right||y<bounds.top||y+STEP>bounds.bottom)){
        const z=surface(x+STEP/2,y+STEP/2),strength=lightAmount(light,{x:x+STEP/2,y:y+STEP/2,height:z+.05},obstacles);
        if(strength>=(light.kind==='window'?.004:.012)){
          c.fillStyle=`rgba(${rgb.join(',')},${Math.min(.95,strength*1.3)})`;c.beginPath();
          for(const [index,[dx,dy]] of [[0,[0,0]],[1,[STEP,0]],[2,[STEP,STEP]],[3,[0,STEP]]]){
            const px=extent+(x+dx-light.x-y-dy+light.y)*TX,py=top+(x+dx-light.x+y+dy-light.y)*TY-z*HZ;
            if(index)c.lineTo(px,py);else c.moveTo(px,py);
          }
          c.closePath();c.fill();
        }
      }
      cells++;yield;
    }
    return {image,left:extent,top,rasterScale,bytes:job.bytes,sourceKey:job.sourceKey,strength:light.strength};
  }
  return {
    request(light,obstacles,bounds,surface,sceneKey,{withContext=callback=>callback()}={}){
      const sourceKey=`${sceneKey}:${light.id}:${light.x}:${light.y}:${light.height}:${light.reach}:${light.nx||0}:${light.ny||0}:${light.color}:${light.falloffExponent||1.7}`;
      const key=`${sourceKey}:${light.strength}`;
      const patch=cache.get(key);if(patch){cache.delete(key);cache.set(key,patch);return patch;}
      if(!pending.has(key)&&pending.size<maxPending){
        const job={key,sourceKey,light:{...light},obstacles,bounds,surface,withContext,bytes:0};job.builder=build(job);pending.set(key,job);
      }
      // Day/night intensity changes can reuse the last completed geometry
      // while its replacement is built, instead of briefly extinguishing it.
      const previous=previousBySource.get(sourceKey);
      return previous?{...previous,intensityScale:Math.min(1,light.strength/previous.strength)}:null;
    },
    process(budgetMs=1.5,maxCells=256){
      const started=now();let work=0;
      while(pending.size&&work<maxCells&&now()-started<budgetMs){
        const [key,job]=pending.entries().next().value;
        job.withContext(()=>{
          do{
            const result=job.builder.next();work++;
            if(result.done){pending.delete(key);cache.set(key,result.value);previousBySource.set(job.sourceKey,result.value);revision++;completed++;break;}
          }while(work<maxCells&&now()-started<budgetMs);
        });
      }
      return {work,durationMs:now()-started};
    },
    stats:()=>({entries:cache.size,pending:pending.size,bytes,revision,completed,cells,maxEntries,maxPending,maxBytes}),
  };
}
const renderer=createLightmapRenderer();
export const lightmapFor=(...args)=>renderer.request(...args);
export const processLightmapQueue=(...args)=>renderer.process(...args);
export const lightmapStats=()=>renderer.stats();
export function paintLightmap(ctx,patch,origin,scale,alpha=1){
  if(!patch)return;
  const rasterScale=patch.rasterScale||1;
  ctx.save();ctx.globalAlpha=alpha*(patch.intensityScale??1);ctx.imageSmoothingEnabled=true;
  ctx.drawImage(patch.image,Math.round(origin.x-patch.left*scale),Math.round(origin.y-patch.top*scale),patch.image.width*scale/rasterScale,patch.image.height*scale/rasterScale);ctx.restore();
}
