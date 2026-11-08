import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { ROOM_FIXTURE_ATLAS, ROOM_MATERIAL_ATLAS } from '../game/room-fixture-renderer.mjs';
import { CONTENT } from '../game/content-catalog.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'game',ROOM_FIXTURE_ATLAS.url);
const directory=path.dirname(output),manifestPath=path.join(directory,'manifest.json');
// Keep hand-edited material tiles on subsequent exports. The flag rebuilds
// the initial tiles explicitly; normal export only rebakes sprite views.
const materialSource=process.argv.includes('--reset-materials')?null:await readFile(path.join(root,'game',ROOM_MATERIAL_ATLAS.url))
  .then(buffer=>buffer.toString('base64')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const bedFrameNames=['bed','bed-open','bed-cover'];
const bedFrameSources=Object.fromEntries(await Promise.all(bedFrameNames.flatMap(name=>[0,1,2,3].map(async rotation=>[
  `${name}:${rotation}`,(await readFile(path.join(root,'game/art/room-furniture/bed-3d-prototype/frames',`${name}-rot${rotation}.png`))).toString('base64'),
]))));
const probe=http.createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-room-furniture-atlas-'));
const preview=createPreviewServer({host:'127.0.0.1',port,gameDirectory:path.join(root,'game'),stateDirectory,allowedOrigin:origin});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless:true,args:['--no-sandbox']});
try{
  await mkdir(directory,{recursive:true});
  await preview.listen();
  const page=await browser.newPage();
  await page.goto(`${origin}/`,{waitUntil:'domcontentloaded'});
  const generated=await page.evaluate(async ({frameSize,anchorX,anchorY,palettes,rows,materials,tileSize,materialSource,bedFrameSources})=>{
    const {paintRoomFixture,fixturePalette}=await import('/room-fixture-renderer.mjs');
    const {fixtureFaceUV,fixtureFaceMaterial,fixtureUVTransform}=await import('/room-fixture-materials.mjs');
    const {CONTENT}=await import('/content-catalog.mjs');
    const bedFrames=new Map();
    for(const [key,base64] of Object.entries(bedFrameSources)){
      const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
      if(image.width!==frameSize||image.height!==frameSize)throw new Error(`Quadro 3D/UV inválido: ${key}`);
      bedFrames.set(key,image);
    }
    // Transparent detail tiles overlay the shaded base color of each face.
    // This preserves directional lighting instead of baking light into UVs.
    const materialAtlas=document.createElement('canvas');
    materialAtlas.width=materials.length*tileSize;materialAtlas.height=palettes.length*tileSize;
    const mc=materialAtlas.getContext('2d'),tiles=new Map();
    for(let pi=0;pi<palettes.length;pi++)for(let mi=0;mi<materials.length;mi++){
      const material=materials[mi],p=fixturePalette(palettes[pi]);
      const tile=document.createElement('canvas');tile.width=tile.height=tileSize;
      const tc=tile.getContext('2d');
      const mark=(x,y,w,h,color,alpha)=>{tc.globalAlpha=alpha;tc.fillStyle=color;tc.fillRect(x,y,w,h);};
      if(material==='wood'){
        mark(0,2,5,1,p.dark,.18);mark(5,6,3,1,p.dark,.2);
        mark(1,3,3,1,p.light,.14);mark(4,0,2,1,p.light,.13);
      }else if(material==='fabric'){
        mark(0,3,8,1,'#302c28',.09);mark(3,0,1,8,'#fff4df',.09);
      }else if(material==='stone'){
        mark(1,2,2,1,'#1f2928',.15);mark(6,6,1,1,'#f4e9d4',.18);
      }else if(material==='metal'){
        mark(0,1,8,1,'#effff6',.15);mark(0,6,8,1,'#263b3d',.11);
      }else if(material==='glass'){
        mark(1,0,1,8,'#eeffff',.12);
      }else{
        mark(3,0,1,8,'#c8d99a',.16);mark(1,2,2,1,'#213f2e',.14);
      }
      mc.drawImage(tile,mi*tileSize,pi*tileSize);tiles.set(`${pi}:${material}`,tile);
    }
    if(materialSource){
      const source=new Image();source.src=`data:image/png;base64,${materialSource}`;await source.decode();
      if(source.width!==materialAtlas.width||source.height!==materialAtlas.height)throw new Error('Dimensoes invalidas no atlas de materiais');
      mc.clearRect(0,0,materialAtlas.width,materialAtlas.height);mc.drawImage(source,0,0);
      for(let pi=0;pi<palettes.length;pi++)for(let mi=0;mi<materials.length;mi++){
        const tile=tiles.get(`${pi}:${materials[mi]}`),tc=tile.getContext('2d');
        tc.globalAlpha=1;tc.clearRect(0,0,tileSize,tileSize);tc.drawImage(source,mi*tileSize,pi*tileSize,tileSize,tileSize,0,0,tileSize,tileSize);
      }
    }
    const cols=4,atlas=document.createElement('canvas');
    atlas.width=frameSize*cols;atlas.height=frameSize*rows.length*palettes.length;
    const context=atlas.getContext('2d');context.imageSmoothingEnabled=false;
    const definitions=new Map(CONTENT.filter(entry=>entry.category==='furniture').map(entry=>[entry.kind,entry]));
    for(let row=0;row<rows.length;row++)for(let paletteIndex=0;paletteIndex<palettes.length;paletteIndex++)
      for(let rotation=0;rotation<4;rotation++){
        const rowName=rows[row],baseKind=rowName==='lamp-off'?'lamp':rowName.startsWith('bed-')?'bed':rowName.startsWith('chair-')?'chair':rowName;
        const definition=definitions.get(baseKind);
        if(!definition)throw new Error(`Móvel sem definição: ${rowName}`);
        const frame=document.createElement('canvas');frame.width=frameSize;frame.height=frameSize;
        const c=frame.getContext('2d');c.imageSmoothingEnabled=false;
        const authoredBedFrame=bedFrames.get(`${rowName}:${rotation}`);
        if(authoredBedFrame){
          context.drawImage(authoredBedFrame,rotation*frameSize,(row*palettes.length+paletteIndex)*frameSize);
          continue;
        }
        const item={kind:rowName==='bed-cover'?'bed-cover':baseKind,x:0,y:0,width:definition.width,
          depth:definition.depth,height:definition.height,rotation,rotatable:true,palette:palettes[paletteIndex],
          enabled:rowName!=='lamp-off',cover:rowName!=='bed-open',renderLayer:rowName.startsWith('chair-')?rowName:'full'};
        const project=(x,y,z)=>({x:anchorX+(x-y)*32,y:anchorY+(x+y)*18-z*32});
        const polygon=(points,color)=>{
          c.beginPath();points.forEach(([x,y],index)=>index?c.lineTo(x,y):c.moveTo(x,y));
          c.closePath();c.fillStyle=color;c.fill();
          const material=fixtureFaceMaterial(color,fixturePalette(item.palette));
          const transform=material&&fixtureUVTransform(points,fixtureFaceUV(points,item));
          if(transform){
            const pattern=c.createPattern(tiles.get(`${paletteIndex}:${material}`),'repeat');
            pattern.setTransform(transform);c.fillStyle=pattern;c.fill();
          }
        };
        paintRoomFixture(item,project,polygon);
        context.drawImage(frame,rotation*frameSize,(row*palettes.length+paletteIndex)*frameSize);
      }
    return {sprites:atlas.toDataURL('image/png').split(',')[1],materials:materialAtlas.toDataURL('image/png').split(',')[1]};
  },{...ROOM_FIXTURE_ATLAS,rows:[...ROOM_FIXTURE_ATLAS.rows],palettes:[...ROOM_FIXTURE_ATLAS.palettes],bedFrameSources,
    materials:[...ROOM_MATERIAL_ATLAS.materials],tileSize:ROOM_MATERIAL_ATLAS.tileSize,materialSource});
  const png=Buffer.from(generated.sprites,'base64'),materialPng=Buffer.from(generated.materials,'base64');
  const materialDigest=createHash('sha256').update(materialPng).digest('hex');
  const digest=createHash('sha256').update(png).digest('hex');
  const manifest={version:ROOM_FIXTURE_ATLAS.version,format:'png-frame-atlas',frameSize:ROOM_FIXTURE_ATLAS.frameSize,
    width:ROOM_FIXTURE_ATLAS.frameSize*4,height:ROOM_FIXTURE_ATLAS.frameSize*ROOM_FIXTURE_ATLAS.rows.length*ROOM_FIXTURE_ATLAS.palettes.length,
    anchor:{x:ROOM_FIXTURE_ATLAS.anchorX,y:ROOM_FIXTURE_ATLAS.anchorY},canonicalProjection:{tileX:32,tileY:18,heightPixels:32},
    rotations:[0,1,2,3],palettes:ROOM_FIXTURE_ATLAS.palettes,rows:ROOM_FIXTURE_ATLAS.rows,
    materials:{url:ROOM_MATERIAL_ATLAS.url,manifest:'art/room-furniture/materials-manifest.json',sha256:materialDigest,baked:true},
    authoredModels:{bed:{source:'art/room-furniture/bed-3d-prototype/medieval-bed.blend',method:'orthographic-3d-render-with-UV-texture',layers:['bed','bed-open','bed-cover'],palette:'cedar',cameraMirrorX:true}},
    sha256:digest,bytes:png.length};
  await writeFile(path.join(root,'game',ROOM_MATERIAL_ATLAS.url),materialPng);
  await writeFile(path.join(directory,'materials-manifest.json'),`${JSON.stringify({version:1,format:'transparent-material-tiles',
    tileSize:ROOM_MATERIAL_ATLAS.tileSize,columns:ROOM_MATERIAL_ATLAS.materials,rows:ROOM_FIXTURE_ATLAS.palettes,
    pixelsPerWorldUnit:16,uvSpace:'object-local',top:['u*width','v*depth'],front:['u*width','-z'],side:['v*depth','-z'],
    lighting:'shaded-base-color-plus-transparent-texture',sha256:materialDigest,bytes:materialPng.length},null,2)}\n`);
  await writeFile(output,png);
  await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
  console.log(JSON.stringify({png:output,manifest:manifestPath,bytes:png.length,sha256:digest,
    frames:ROOM_FIXTURE_ATLAS.rows.length*4*ROOM_FIXTURE_ATLAS.palettes.length}));
}finally{await browser.close();await preview.close();await rm(stateDirectory,{recursive:true,force:true});}
