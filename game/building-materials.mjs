const TILE=16;
const columns=Object.freeze({timber:0,masonry:1,shingles:2,foundation:3,daub:4,thatch:5});
let atlas=null;
const tinted=new Map();

export function setBuildingMaterialAtlas(image){atlas=image||null;tinted.clear();}
export function hasBuildingMaterialAtlas(){return Boolean(atlas?.naturalWidth);}
export function architectureUvMatrix(corners,columnsAcross,rowsDown,tileWidth=TILE,tileHeight=TILE){
  const [a,b,,d]=corners;
  return {a:(b[0]-a[0])/(columnsAcross*tileWidth),
    b:(b[1]-a[1])/(columnsAcross*tileWidth),
    c:(d[0]-a[0])/(rowsDown*tileHeight),
    d:(d[1]-a[1])/(rowsDown*tileHeight),e:a[0],f:a[1]};
}
function tintedTile(material,palette){
  const key=`${material}:${palette.join(',')}`;
  if(tinted.has(key))return tinted.get(key);
  const canvas=document.createElement('canvas');canvas.width=TILE;canvas.height=TILE;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(atlas,columns[material]*TILE,0,TILE,TILE,0,0,TILE,TILE);
  const image=ctx.getImageData(0,0,TILE,TILE),colors=palette.map(hex=>hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)));
  for(let i=0;i<image.data.length;i+=4){
    const value=image.data[i],band=Math.min(colors.length-2,Math.floor(value/256*(colors.length-1))),mix=value/255*(colors.length-1)-band;
    for(let channel=0;channel<3;channel++)image.data[i+channel]=Math.round(colors[band][channel]*(1-mix)+colors[band+1][channel]*mix);
  }
  ctx.putImageData(image,0,0);tinted.set(key,canvas);
  if(tinted.size>64)tinted.delete(tinted.keys().next().value);
  return canvas;
}

// Maps one repeating UV tile over a projected planar building face. Its
// projected parallelogram keeps UV grain aligned to world-space wall axes.
export function drawArchitectureUvFace(ctx,polygon,corners,material,palette,columnsAcross,rowsDown){
  if(!hasBuildingMaterialAtlas()||columns[material]===undefined)return false;
  const points=corners.map(point=>[Math.round(point[0]),Math.round(point[1])]);
  const tile=tintedTile(material,palette),pattern=ctx.createPattern(tile,'repeat');
  if(!pattern?.setTransform)return false;
  const matrix=architectureUvMatrix(points,columnsAcross,rowsDown);
  pattern.setTransform(new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]));
  ctx.save();ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.clip();ctx.fillStyle=pattern;
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  ctx.fillRect(Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)-Math.min(...xs)+2,Math.max(...ys)-Math.min(...ys)+2);
  ctx.restore();
  return true;
}
