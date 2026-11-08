import {MEDIEVAL_SPRITE_PROJECTION,MEDIEVAL_SOURCE_CAMERA} from '../game/medieval-sprite-projection.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIEVAL_FURNITURE } from '../game/medieval-furniture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'game/art/room-furniture/medieval-3d-v1');
const atlasPath=path.join(root,'game/art/room-furniture/medieval-furniture-v1.png');
const frameSize=128,columns=5;
let nextFrame=0;
const models=MEDIEVAL_FURNITURE.map(item=>{
  const states=['covered'];
  if(item.family==='camas')states.push('open','cover');
  if(item.use==='light')states.push('off');
  const model={...item,frameStart:nextFrame,states,frameCount:states.length*4};
  nextFrame+=model.frameCount;
  return model;
});
const rows=Math.ceil(nextFrame/columns);
const contract={version:1,frameSize,columns,rows,width:columns*frameSize,height:rows*frameSize,
  ...MEDIEVAL_SPRITE_PROJECTION,sourceCamera:MEDIEVAL_SOURCE_CAMERA,rotations:[0,1,2,3],models};
await mkdir(source,{recursive:true});
await writeFile(path.join(source,'catalog.json'),`${JSON.stringify(contract,null,2)}\n`);
const blenderScript=path.join(root,'scripts/build-medieval-furniture-3d-atlas.py');
const blender=process.env.BLENDER_PATH||'/usr/bin/blender';
await new Promise((resolve,reject)=>{
  const child=spawn(blender,['--background','--python',blenderScript,'--',path.join(source,'catalog.json'),source,atlasPath],
    {stdio:'inherit'});
  child.once('error',reject);
  child.once('exit',code=>code===0?resolve():reject(new Error(`Blender terminou com código ${code}`)));
});
