import { WORLD_SIZE } from './world-scale.mjs';
import { chunkRandom } from './world-chunks.mjs';

// The light wall follows the existing map edge, preserving all authored ground.
// Its pale extension sits outside that edge; fragments farther out are visual only.
export const BOUNDARY_WALL_INSET = 0;
export const BOUNDARY_TILE_SIZE = 1.5;
export const BOUNDARY_WALKABLE_FRINGE = BOUNDARY_TILE_SIZE * 3;
export const BOUNDARY_FRINGE = 18;
export const BOUNDARY_TOTAL_FRINGE = BOUNDARY_WALKABLE_FRINGE + BOUNDARY_FRINGE;

export function boundaryTileMode(row, seed) {
  const tileRow = Math.max(0, Math.floor(row));
  if (tileRow < 3) return 'fixed';
  const brokenRow = tileRow - 3;
  const missingChance = Math.min(.96, .12 + brokenRow * .16);
  if (chunkRandom(seed) < missingChance) return 'missing';
  const fallingChance = Math.min(.42, .07 + brokenRow * .07);
  const floatingChance = Math.min(.36, .12 + brokenRow * .04);
  const motion = chunkRandom(seed + 73013);
  if (motion < fallingChance) return 'falling';
  if (motion < fallingChance + floatingChance) return 'floating';
  return 'fixed';
}

export function insideBoundaryWall(position, radius = 0, size = WORLD_SIZE) {
  const min = BOUNDARY_WALL_INSET + Math.max(0, radius);
  const max = size - BOUNDARY_WALL_INSET - Math.max(0, radius);
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
    && position.x >= min && position.y >= min && position.x <= max && position.y <= max;
}

export function clampInsideBoundaryWall(position, radius = 0, size = WORLD_SIZE) {
  const min = BOUNDARY_WALL_INSET + Math.max(0, radius);
  const max = size - BOUNDARY_WALL_INSET - Math.max(0, radius);
  return {x: Math.max(min, Math.min(max, Number(position?.x) || min)),
    y: Math.max(min, Math.min(max, Number(position?.y) || min))};
}

export function boundarySegments(bounds, size = WORLD_SIZE) {
  const result = [];
  const inset = BOUNDARY_WALL_INSET;
  const edges = [
    {id:0, distance:bounds.left-inset, start:bounds.top, end:bounds.bottom, at:(t,d)=>({x:inset-d,y:t})},
    {id:1, distance:size-inset-bounds.right, start:bounds.top, end:bounds.bottom, at:(t,d)=>({x:size-inset+d,y:t})},
    {id:2, distance:bounds.top-inset, start:bounds.left, end:bounds.right, at:(t,d)=>({x:t,y:inset-d})},
    {id:3, distance:size-inset-bounds.bottom, start:bounds.left, end:bounds.right, at:(t,d)=>({x:t,y:size-inset+d})},
  ];
  for (const edge of edges) {
    if(edge.distance>BOUNDARY_TOTAL_FRINGE)continue;
    const start=Math.max(0,Math.floor(edge.start)-4),end=Math.min(size,Math.ceil(edge.end)+4);
    if(end>start)result.push({...edge,start,end});
  }
  return result;
}
export function boundaryCorners(bounds, size = WORLD_SIZE) {
  const reach = BOUNDARY_TOTAL_FRINGE;
  const inset = BOUNDARY_WALL_INSET;
  return [
    { id:0, name:'northwest', x:inset, y:inset, sx:-1, sy:-1,
      visible:bounds.left <= inset + reach && bounds.top <= inset + reach },
    { id:1, name:'northeast', x:size-inset, y:inset, sx:1, sy:-1,
      visible:bounds.right >= size-inset-reach && bounds.top <= inset + reach },
    { id:2, name:'southwest', x:inset, y:size-inset, sx:-1, sy:1,
      visible:bounds.left <= inset + reach && bounds.bottom >= size-inset-reach },
    { id:3, name:'southeast', x:size-inset, y:size-inset, sx:1, sy:1,
      visible:bounds.right >= size-inset-reach && bounds.bottom >= size-inset-reach },
  ].filter(corner => corner.visible);
}

export function* boundaryCornerTiles(corner) {
  const rows=Math.ceil(BOUNDARY_TOTAL_FRINGE/BOUNDARY_TILE_SIZE);
  for(let col=0;col<rows;col++)for(let row=0;row<rows;row++){
    const x0=corner.sx<0?corner.x-(col+1)*BOUNDARY_TILE_SIZE:corner.x+col*BOUNDARY_TILE_SIZE;
    const y0=corner.sy<0?corner.y-(row+1)*BOUNDARY_TILE_SIZE:corner.y+row*BOUNDARY_TILE_SIZE;
    yield {col,row,ring:Math.max(col,row),x0,y0};
  }
}

// Each cell has its own period, phase, duration, and occasional echo, so the
// under-floor flashes feel like irregular bursts rather than a synchronized pulse.
export function boundaryGlowPulse(time, seed, reducedMotion = false) {
  if (reducedMotion) return .08;
  const period = 1.65 + chunkRandom(seed + 107) * 6.5;
  const phase = ((time + chunkRandom(seed + 217) * period) % period + period) % period;
  const duration = .075 + chunkRandom(seed + 317) * .31;
  const echoDelay = duration + .055 + chunkRandom(seed + 417) * .19;
  const pulse = (elapsed, length) => elapsed >= 0 && elapsed < length
    ? Math.pow(Math.sin(Math.PI * elapsed / length), 2.4) : 0;
  return Math.max(pulse(phase, duration), pulse(phase-echoDelay, duration*.48)*.7);
}

// Sparse pinpoints outside the broken floor twinkle on independent clocks and
// drift only a few screen pixels, like distant stars rather than loose debris.
export function boundaryStarFrame(time, seed, reducedMotion = false) {
  const period = 2.2 + chunkRandom(seed + 1103) * 4.4;
  const phase = ((time + chunkRandom(seed + 1201) * period) % period + period) % period;
  const duration = .65 + chunkRandom(seed + 1301) * .9;
  const pulse = phase < duration ? Math.pow(Math.sin(Math.PI * phase / duration), 1.5) : 0;
  const driftPhase = time * (.14 + chunkRandom(seed + 1409) * .1) + chunkRandom(seed + 1511) * Math.PI * 2;
  return {
    alpha: reducedMotion ? .12 : .006 + pulse * (.36 + chunkRandom(seed + 1601) * .26),
    dx: reducedMotion ? 0 : Math.sin(driftPhase) * (.6 + chunkRandom(seed + 1709) * 1.4),
    dy: reducedMotion ? 0 : Math.cos(driftPhase * .83 + chunkRandom(seed + 1801)) * (.5 + chunkRandom(seed + 1901) * 1.1),
    radius: .75 + chunkRandom(seed + 2003),
    flare: reducedMotion ? 0 : pulse,
  };
}

function polygon(ctx,points,fill) {
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}

function paintBoundaryGlow(ctx, point, seed, time, scale, reducedMotion) {
  const intensity = boundaryGlowPulse(time, seed, reducedMotion);
  if (intensity < .005) return;
  const r = chunkRandom(seed + 571);
  const radius = (150 + r * 140) * scale;
  const center = point();
  const rgb = ['255,82,66','93,157,255','255,195,91','194,119,255'][Math.floor(r*4)];
  ctx.save();
  ctx.globalAlpha = intensity;
  const glow = ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,radius);
  glow.addColorStop(0,`rgba(${rgb},.98)`);
  glow.addColorStop(.16,`rgba(${rgb},.68)`);
  glow.addColorStop(.48,`rgba(${rgb},.21)`);
  glow.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle=glow;ctx.fillRect(center.x-radius,center.y-radius,radius*2,radius*2);
  if (!reducedMotion && intensity > .32) {
    ctx.globalAlpha = intensity * .18;
    ctx.strokeStyle=`rgba(${rgb},.9)`;ctx.lineWidth=Math.max(1,scale*1.4);
    ctx.beginPath();ctx.ellipse(center.x,center.y,radius*.24,radius*.12,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function paintBoundaryStar(ctx, point, seed, time, scale, reducedMotion) {
  const frame = boundaryStarFrame(time, seed, reducedMotion);
  if (frame.alpha < .008) return;
  ctx.save();
  ctx.translate(point.x + frame.dx * scale, point.y + frame.dy * scale);
  ctx.globalAlpha = frame.alpha;
  ctx.fillStyle = chunkRandom(seed + 2101) > .82 ? '#ffe7bf'
    : chunkRandom(seed + 2203) > .5 ? '#d7e6ff' : '#f2fbff';
  const radius = frame.radius * scale;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  if (frame.flare > .78 && !reducedMotion) {
    ctx.globalAlpha = frame.alpha * .42;
    ctx.fillRect(-.35 * scale, -2.1 * scale, .7 * scale, 4.2 * scale);
    ctx.fillRect(-2.1 * scale, -.35 * scale, 4.2 * scale, .7 * scale);
  }
  ctx.restore();
}

export function drawWorldBoundary(ctx,{bounds,project,time=0,reducedMotion=false,height,scale=1,theme='forest'}) {
  const visibleEdges=boundarySegments(bounds);
  if(!visibleEdges.length)return;
  const corners=boundaryCorners(bounds);
  const clock=reducedMotion?0:time;
  const floor=theme==='inferno'?'#f4ede5':theme==='sky'?'#f2f6f4':theme==='dark'?'#e9eef0':'#f0f2eb';
  const shard=theme==='inferno'?'#eee6dd':theme==='sky'?'#e9f0ef':theme==='dark'?'#e2e9ed':'#e8eee8';
  const tileSize=BOUNDARY_TILE_SIZE;
  const rowCount=Math.ceil(BOUNDARY_TOTAL_FRINGE/tileSize);
  const edges=visibleEdges.map(edge=>({
    ...edge,
    p:(t,d=0,drop=0)=>{const w=edge.at(t,d),s=project(w.x,w.y);return{x:s.x,y:s.y+drop*scale};},
  }));
  const projectCorner=(corner,x,y,drop=0)=>{
    const point=project(x,y);return{x:point.x,y:point.y+drop*scale};
  };

  ctx.save();
  // Backdrop first, including the diagonal quadrant outside each visible corner.
  for(const edge of edges){
    const a=edge.p(edge.start),b=edge.p(edge.end),c=edge.p(edge.end,80),d=edge.p(edge.start,80);
    polygon(ctx,[a,b,c,d],'#02030a');
  }
  for(const corner of corners){
    const x=corner.x,y=corner.y,sx=corner.sx,sy=corner.sy;
    polygon(ctx,[projectCorner(corner,x,y),projectCorner(corner,x+sx*80,y),
      projectCorner(corner,x+sx*80,y+sy*80),projectCorner(corner,x,y+sy*80)],'#02030a');
  }

  // The translucent curtain is behind every floor face; only its thin seam is
  // restored later, so no shaft can wash across the white tiles.
  for(const edge of edges){
    for(let t=edge.start;t<edge.end;t+=.65){
      const a=edge.p(t),b=edge.p(Math.min(t+.68,edge.end));
      const beamHeight=Math.max(height+180,700*scale);
      const strength=.022+.012*Math.sin(t*1.7+clock*.45);
      const curtain=ctx.createLinearGradient(0,Math.min(a.y,b.y)-beamHeight,0,Math.max(a.y,b.y));
      curtain.addColorStop(0,'rgba(185,212,255,.008)');curtain.addColorStop(.65,`rgba(174,216,255,${strength})`);
      curtain.addColorStop(.96,'rgba(255,242,192,.045)');curtain.addColorStop(1,'rgba(255,255,237,.16)');
      polygon(ctx,[a,b,{x:b.x,y:b.y-beamHeight},{x:a.x,y:a.y-beamHeight}],curtain);
      const r=chunkRandom(edge.id*981+Math.floor(t/.65));
      if(r>.7){ctx.globalAlpha=.025+(reducedMotion?0:.018*Math.sin(clock*.6+r*9));ctx.fillStyle='#eff8ff';
        ctx.fillRect(a.x,a.y-beamHeight,Math.max(1,scale),beamHeight);ctx.globalAlpha=1;}
    }
  }

  // Stars sit under the broken outer rows, so intact faces mask them and gaps
  // reveal them against the abyss. Layout is seeded; each point drifts alone.
  const starSpacing = 3.7;
  for(const edge of edges){
    const firstCell=Math.floor(edge.start/starSpacing),lastCell=Math.ceil(edge.end/starSpacing);
    for(let cell=firstCell;cell<lastCell;cell++){
      const seed=edge.id*81919+cell*1877+4201;
      if(chunkRandom(seed+17)<.4)continue;
      const along=cell*starSpacing+chunkRandom(seed+31)*starSpacing;
      const outward=BOUNDARY_WALKABLE_FRINGE+1+chunkRandom(seed+47)*(BOUNDARY_FRINGE-3);
      paintBoundaryStar(ctx,edge.p(along,outward),seed,clock,scale,reducedMotion);
    }
  }
  for(const corner of corners){
    for(let xCell=0;xCell<6;xCell++)for(let yCell=0;yCell<6;yCell++){
      const seed=corner.id*99173+xCell*2137+yCell*7919+5309;
      if(chunkRandom(seed+17)<.62)continue;
      const minStarDistance=BOUNDARY_WALKABLE_FRINGE+1;
      const maxStarDistance=BOUNDARY_TOTAL_FRINGE-.5;
      const range=maxStarDistance-minStarDistance;
      const outwardX=minStarDistance+xCell*range/6+chunkRandom(seed+31)*range/6;
      const outwardY=minStarDistance+yCell*range/6+chunkRandom(seed+47)*range/6;
      paintBoundaryStar(ctx,projectCorner(corner,corner.x+corner.sx*outwardX,
        corner.y+corner.sy*outwardY),seed,clock,scale,reducedMotion);
    }
  }

  // Broad flashes live well below the edge. The white floor, gaps, and loose
  // fragments are painted afterward, naturally masking the light from above.
  for(const edge of edges){
    const first=Math.floor(edge.start/(tileSize*3))*(tileSize*3);
    for(let t=first;t<edge.end;t+=tileSize*3){
      const seed=edge.id*981+Math.floor(t/(tileSize*3))*719;
      const r=chunkRandom(seed+41);
      const belowSurface=38+r*82;
      paintBoundaryGlow(ctx, ()=>edge.p(t,BOUNDARY_WALKABLE_FRINGE+1+r*6,belowSurface),
        seed,clock,scale,reducedMotion);
    }
  }
  for(const corner of corners){
    const seed=corner.id*71783+1907,r=chunkRandom(seed+41);
    const outward=BOUNDARY_WALKABLE_FRINGE+2+r*4;
    const belowSurface=100+r*100;
    paintBoundaryGlow(ctx, ()=>projectCorner(corner,
      corner.x+corner.sx*outward,corner.y+corner.sy*outward,belowSurface),
      seed,clock,scale,reducedMotion);
  }

  // Three intact edge rows continue over the corner quadrants too.
  for(const edge of edges){
    const firstTile=Math.floor(edge.start/tileSize)*tileSize;
    for(let t=firstTile;t<edge.end;t+=tileSize){
      const column=Math.floor(t/tileSize),seed=edge.id*91771+column*719;
      for(let distance=0;distance<BOUNDARY_WALKABLE_FRINGE;distance+=tileSize){
        const r=chunkRandom(seed+Math.floor(distance/tileSize)*167);
        const q=Math.min(1,distance/BOUNDARY_WALKABLE_FRINGE);
        const top=edge.p(t,distance),topRight=edge.p(t+tileSize,distance),
          bottomRight=edge.p(t+tileSize,distance+tileSize),bottom=edge.p(t,distance+tileSize);
        const gradient=ctx.createLinearGradient(top.x,top.y,bottom.x,bottom.y);
        gradient.addColorStop(0,floor);gradient.addColorStop(1,q>.7?shard:floor);
        polygon(ctx,[top,topRight,bottomRight,bottom],gradient);
        if(r>.82){ctx.globalAlpha=.24;ctx.strokeStyle=shard;ctx.lineWidth=Math.max(.7,scale*.35);
          ctx.beginPath();ctx.moveTo(topRight.x,topRight.y);ctx.lineTo(bottomRight.x,bottomRight.y);ctx.stroke();ctx.globalAlpha=1;}
      }
    }
    for(let t=firstTile;t<edge.end;t+=tileSize){
      const column=Math.floor(t/tileSize),columnSeed=edge.id*91771+column*719;
      for(let row=Math.ceil(BOUNDARY_WALKABLE_FRINGE/tileSize);row<rowCount;row++){
        const distance=row*tileSize,depth=Math.min(tileSize,BOUNDARY_TOTAL_FRINGE-distance);
        const seed=columnSeed+row*313,mode=boundaryTileMode(row,seed);
        if(mode==='missing')continue;
        const phase=chunkRandom(seed+998),cycle=(clock*.075+phase)%1;
        const fall=mode==='falling'?Math.pow(reducedMotion?phase:cycle,2)*(16+row*3):0;
        const lift=mode==='floating'?(4.5+Math.min(3,(row-3)*.65)
          +(reducedMotion?phase*1.2:Math.sin(clock*.8+phase*Math.PI*2)*1.4))*scale:0;
        const drift=mode==='floating'&&!reducedMotion?Math.sin(clock*.55+phase*Math.PI*2)*.6*scale:0;
        const face=[[t,distance],[t+tileSize,distance],[t+tileSize,distance+depth],[t,distance+depth]]
          .map(([along,out])=>{const point=edge.p(along,out,fall);return{x:point.x+drift,y:point.y-lift};});
        const fade=Math.min(1,(distance-BOUNDARY_WALKABLE_FRINGE)/BOUNDARY_FRINGE);
        ctx.globalAlpha=mode==='falling'?Math.max(.2,(1-fade)*(.96-phase*.2)):mode==='floating'?Math.max(.62,1-fade*.28):1;
        polygon(ctx,face,chunkRandom(seed+421)>.62?floor:shard);
        ctx.globalAlpha=1;
      }
    }
  }

  // Fill the four outside quadrants. Ring distance keeps the same three solid
  // rows as the straight edges, then lets the corner break apart gradually.
  for(const corner of corners){
    for(const tile of boundaryCornerTiles(corner)){
      const {col,row,ring,x0,y0}=tile,seed=corner.id*91771+col*719+row*313;
      if(ring<Math.ceil(BOUNDARY_WALKABLE_FRINGE/tileSize)){
        const face=[[x0,y0],[x0+tileSize,y0],[x0+tileSize,y0+tileSize],[x0,y0+tileSize]]
          .map(([x,y])=>projectCorner(corner,x,y));
        const r=chunkRandom(seed+167),tint=r>.78?shard:floor;
        const top=face[0],bottom=face[3],gradient=ctx.createLinearGradient(top.x,top.y,bottom.x,bottom.y);
        gradient.addColorStop(0,floor);gradient.addColorStop(1,tint);
        polygon(ctx,face,gradient);
        continue;
      }
      const mode=boundaryTileMode(ring,seed);
      if(mode==='missing')continue;
      const phase=chunkRandom(seed+998),cycle=(clock*.075+phase)%1;
      const fall=mode==='falling'?Math.pow(reducedMotion?phase:cycle,2)*(16+ring*3):0;
      const lift=mode==='floating'?(4.5+Math.min(3,(ring-3)*.65)
        +(reducedMotion?phase*1.2:Math.sin(clock*.8+phase*Math.PI*2)*1.4))*scale:0;
      const drift=mode==='floating'&&!reducedMotion?Math.sin(clock*.55+phase*Math.PI*2)*.6*scale:0;
      const face=[[x0,y0],[x0+tileSize,y0],[x0+tileSize,y0+tileSize],[x0,y0+tileSize]]
        .map(([x,y])=>{const point=projectCorner(corner,x,y,fall);return{x:point.x+drift,y:point.y-lift};});
      const fade=Math.min(1,(ring-BOUNDARY_WALKABLE_FRINGE/tileSize)/BOUNDARY_FRINGE);
      ctx.globalAlpha=mode==='falling'?Math.max(.2,(1-fade)*(.96-phase*.2)):mode==='floating'?Math.max(.62,1-fade*.28):1;
      polygon(ctx,face,chunkRandom(seed+421)>.62?floor:shard);
      ctx.globalAlpha=1;
    }
  }

  // Keep a fine, low-glow seam at the exact physical wall line.
  for(const edge of edges){
    const first=edge.p(edge.start);
    ctx.beginPath();ctx.moveTo(first.x,first.y);
    for(let t=edge.start;t<edge.end;t+=.65){
      const b=edge.p(Math.min(t+.68,edge.end));ctx.lineTo(b.x,b.y);
    }
    ctx.strokeStyle='rgba(255,255,230,.52)';ctx.lineWidth=1.25*scale;ctx.shadowColor='#b8e7ff';ctx.shadowBlur=4*scale;
    ctx.stroke();ctx.shadowBlur=0;
  }
  ctx.restore();
}
