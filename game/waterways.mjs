import { DIMENSION_COORDINATE_OFFSET } from './dimension-layout.mjs';
import { getWorldDefinition, worldEditsAt, worldGeometryCacheKey } from './world-edits.mjs';
import { lakeSignedDepthAt } from './water-geometry.mjs';

export const WATER_WADING_DEPTH = .86;
export const WATER_BANK_WIDTH = .68;
export const WATER_SHORE_BANDS = Object.freeze({
  sandMin: 1.4, sandMax: 2.15, sandBase: .8, sandWidthPerWaterWidth: .5,
  mixed: .95, earth: .95, grass: 1.2, treeBuffer: 1.25,
});
const WATER_SHORE_MAX_REACH = WATER_SHORE_BANDS.sandMax + WATER_SHORE_BANDS.mixed
  + WATER_SHORE_BANDS.earth + WATER_SHORE_BANDS.grass + WATER_SHORE_BANDS.treeBuffer;
export function waterCurrentScale(depth) {
  const amount=Number(depth);
  if(!Number.isFinite(amount)||amount<=0)return 0;
  return Math.min(.58,Math.max(.18,amount/WATER_WADING_DEPTH*.58));
}
export const SOLID_WATER = Object.freeze({
  left: 7.05 + DIMENSION_COORDINATE_OFFSET,
  right: 9.9 + DIMENSION_COORDINATE_OFFSET,
  top: 7.8 + DIMENSION_COORDINATE_OFFSET,
  bottom: 10.25 + DIMENSION_COORDINATE_OFFSET,
});

const SURFACE_STREAMS = Object.freeze([
  {
    id: 'surface-river-north', width: 1.05, speed: .31,
    points: [[314,74],[326,91],[340,112],[357,126],[376,137],[393,154],[401,176],[398,198],[388,220],[384,241],[397,260],[390,286]],
    renderWidths: [1.5,1.5,1.48,1.48,1.5,1.52,1.55,1.58,1.6,1.55,1.6,1.62],
    waterfalls: [{ point: [376,137], drop: .9 }, { point: [384,241], drop: 1.1 }],
  },
  {
    id: 'surface-river-east', width: 1.15, speed: .29,
    points: [[390,286],[412,302],[435,317],[459,329],[483,337],[506,340],[522,339],[538,339],[554,341]],
    renderWidths: [1.62,1.65,1.68,1.72,1.78,1.84,1.9,2.0,2.05],
    currentFadeLength: 5,
    waterfalls: [{ point: [459,329], drop: .85 }],
  },
  {
    id: 'surface-brook-south', width: .82, speed: .23,
    points: [[450,388],[466,402],[482,416],[500,412],[510,423],[512,439],[514,451]],
    waterfalls: [{ point: [510,423], drop: 1.05 }],
  },
  {
    id: 'surface-brook-reeds', width: .78, speed: .22,
    points: [[181,174],[188,200],[195,226],[194,252],[190,281],[190,314]],
    waterfalls: [{ point: [194,252], drop: .7 }],
  },
]);

const THEME_STREAMS = Object.freeze({
  forest: { points: [[-24,-20],[-18,-13],[-13,-5],[-11,3],[-6,10],[3,16],[15,21],[29,26]], falls: [[-11,3,1.05],[3,16,.85]] },
  dark: { points: [[-24,-16],[-18,-9],[-12,0],[-10,10],[-2,19],[11,27],[27,34]], falls: [[-12,0,1.15],[11,27,.9]] },
  sky: { points: [[-24,-20],[-18,-13],[-12,-7],[-8,1],[-3,9],[7,18],[20,26],[34,30]], falls: [[-12,-7,1.3],[7,18,1.1]] },
  magic: { points: [[22,-20],[18,-14],[13,-8],[8,-2],[6,7],[9,16],[17,24],[25,32]], falls: [[13,-8,1],[9,16,.9]] },
  inferno: { points: [[-24,-21],[-18,-14],[-12,-5],[-10,4],[-5,12],[5,19],[17,25],[31,31]], falls: [[-10,4,1.2],[5,19,.95]] },
  giants: { points: [[-25,-19],[-19,-11],[-14,-2],[-12,8],[-3,17],[11,25],[27,33],[39,38]], falls: [[-12,8,1.25],[11,25,1.05]] },
  energy: { points: [[-23,-19],[-16,-11],[-13,-6],[-12,0],[-14,7],[-10,14],[0,21],[12,27]], falls: [[-12,0,1.05],[-10,14,.9]] },
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const routeCache = new Map();

function makeRoute(route, shiftX, shiftY) {
  const points = route.points.map(([x, y]) => ({ x: x + shiftX, y: y + shiftY }));
  const bounds = points.reduce((result, point) => ({
    left: Math.min(result.left, point.x), right: Math.max(result.right, point.x),
    top: Math.min(result.top, point.y), bottom: Math.max(result.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const waterfalls = (route.waterfalls || route.falls || []).map(fall => {
    const [x, y, drop] = Array.isArray(fall) ? fall : [...fall.point, fall.drop];
    return { x: x + shiftX, y: y + shiftY, drop };
  });
  const width=route.width||.94;
  const renderWidths=Array.isArray(route.renderWidths)&&route.renderWidths.length===points.length
    ?route.renderWidths.map(value=>Math.max(.5,Number(value)||width)):points.map(()=>width);
  const directions=[];
  for(let index=0;index<points.length-1;index++){
    const a=points[index],b=points[index+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    directions.push({x:dx/length,y:dy/length});
  }
  const tangents=points.map((_,index)=>{
    if(index===0)return directions[0];
    if(index===points.length-1)return directions.at(-1);
    const x=directions[index-1].x+directions[index].x,y=directions[index-1].y+directions[index].y,length=Math.hypot(x,y)||1;
    return {x:x/length,y:y/length};
  });
  const segments=[];
  let totalLength=0;
  for(let index=0;index<points.length-1;index++){
    const a=points[index],b=points[index+1],length=Math.hypot(b.x-a.x,b.y-a.y);
    segments.push({a,b,flowStartX:tangents[index].x,flowStartY:tangents[index].y,flowEndX:tangents[index+1].x,flowEndY:tangents[index+1].y,
      distanceStart:totalLength,length,
      left:Math.min(a.x,b.x)-width,right:Math.max(a.x,b.x)+width,
      top:Math.min(a.y,b.y)-width,bottom:Math.max(a.y,b.y)+width});
    totalLength+=length;
  }
  return { id: route.id, width, renderWidths, maxRenderWidth:Math.max(...renderWidths),
    speed: route.speed || .27, currentFadeLength:Math.max(0,Number(route.currentFadeLength)||0),
    totalLength, points, segments, bounds, waterfalls };
}

export function waterwayRoutesForDimension(dimensionId = 'surface', theme = 'forest', origin = null) {
  const offset = DIMENSION_COORDINATE_OFFSET;
  if (dimensionId === 'breu' || (typeof dimensionId === 'string' && dimensionId.startsWith('arrival-'))) return [];
  if (dimensionId === 'surface') {
    const key = 'surface';
    if (!routeCache.has(key)) routeCache.set(key, SURFACE_STREAMS.map(route => makeRoute(route, offset, offset)));
    return routeCache.get(key);
  }
  const centerX = Number.isFinite(origin?.x) ? origin.x : 419.5;
  const centerY = Number.isFinite(origin?.y) ? origin.y : 419.5;
  const key = `${dimensionId}:${theme}:${centerX}:${centerY}`;
  if (!routeCache.has(key)) {
    const preset = THEME_STREAMS[theme] || THEME_STREAMS.forest;
    routeCache.set(key, [makeRoute({ id: `${dimensionId}-stream`, width: theme === 'sky' ? .9 : 1.02, speed: .28, ...preset }, centerX, centerY)]);
    if (routeCache.size > 64) routeCache.delete(routeCache.keys().next().value);
  }
  return routeCache.get(key);
}

function rectangleWaterDepth(x, y, bounds) {
  if (x <= bounds.left || x >= bounds.right || y <= bounds.top || y >= bounds.bottom) return 0;
  return Math.min(x - bounds.left, bounds.right - x, y - bounds.top, bounds.bottom - y);
}

function rectangleSignedDepth(x, y, bounds) {
  const outsideX = Math.max(bounds.left - x, 0, x - bounds.right);
  const outsideY = Math.max(bounds.top - y, 0, y - bounds.bottom);
  if (outsideX > 0 || outsideY > 0) return -Math.hypot(outsideX, outsideY);
  return Math.min(x - bounds.left, bounds.right - x, y - bounds.top, bounds.bottom - y);
}

function measureWaterAt(x,y,{dimensionId,theme,origin}={},includeCurrent,bankWidth=0,renderSurface=false) {
  const definition = getWorldDefinition();
  const activeDimension = dimensionId || definition.dimensionId;
  const activeTheme = theme || definition.theme;
  let depth = 0;
  if (activeDimension === 'surface') {
    depth = bankWidth > 0
      ? rectangleSignedDepth(x, y, SOLID_WATER) + bankWidth
      : rectangleWaterDepth(x, y, SOLID_WATER);
  }
  let currentX = 0, currentY = 0, currentSpeed = 0, routeId = null;

  for (const edit of worldEditsAt(x, y)) {
    if (edit.type !== 'lake') continue;
    const lakeDepth = lakeSignedDepthAt(edit, x, y) + bankWidth;
    if (lakeDepth > depth) { depth = lakeDepth; currentX = 0; currentY = 0; currentSpeed = 0; routeId = null; }
  }

  for (const route of waterwayRoutesForDimension(activeDimension, activeTheme, origin)) {
    const routeReach=(renderSurface?route.maxRenderWidth:route.width)+bankWidth;
    if (x < route.bounds.left - routeReach || x > route.bounds.right + routeReach
        || y < route.bounds.top - routeReach || y > route.bounds.bottom + routeReach) continue;
    for (let segmentIndex=0;segmentIndex<route.segments.length;segmentIndex++) {
      const segment=route.segments[segmentIndex];
      const widthStart=renderSurface?route.renderWidths[segmentIndex]:route.width;
      const widthEnd=renderSurface?route.renderWidths[segmentIndex+1]:route.width;
      const segmentReach=Math.max(widthStart,widthEnd)+bankWidth;
      if(x<Math.min(segment.a.x,segment.b.x)-segmentReach||x>Math.max(segment.a.x,segment.b.x)+segmentReach
          ||y<Math.min(segment.a.y,segment.b.y)-segmentReach||y>Math.max(segment.a.y,segment.b.y)+segmentReach)continue;
      const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,lengthSquared=dx*dx+dy*dy;
      const along=lengthSquared?clamp(((x-segment.a.x)*dx+(y-segment.a.y)*dy)/lengthSquared,0,1):0;
      const distance=Math.hypot(x-(segment.a.x+dx*along),y-(segment.a.y+dy*along));
      const channelWidth=widthStart+(widthEnd-widthStart)*along;
      const channelDepth = channelWidth + bankWidth - distance;
      if (channelDepth <= depth) continue;
      depth = channelDepth;
      if(!includeCurrent)continue;
      const blend = clamp(channelDepth / route.width, 0, 1);
      let cascade=0;
      for(const fall of route.waterfalls){
        const distanceToFall=Math.hypot(x-fall.x,y-fall.y);
        const influence=clamp(1-distanceToFall/(route.width*1.6),0,1);
        cascade=Math.max(cascade,influence*clamp(fall.drop,0,1.2));
      }
      const flowX=segment.flowStartX+(segment.flowEndX-segment.flowStartX)*along;
      const flowY=segment.flowStartY+(segment.flowEndY-segment.flowStartY)*along;
      const flowLength=Math.hypot(flowX,flowY)||1;
      currentX = flowX/flowLength;
      currentY = flowY/flowLength;
      const distanceAlong=segment.distanceStart+segment.length*along;
      const fadeLength=route.currentFadeLength;
      const fadeProgress=fadeLength>0?clamp((route.totalLength-distanceAlong)/fadeLength,0,1):1;
      const currentFade=fadeProgress*fadeProgress*(3-2*fadeProgress);
      currentSpeed = route.speed * blend * (1+cascade*.75) * currentFade;
      routeId = route.id;
    }
  }

  if(!includeCurrent)return Math.max(0,depth);
  return {depth:Math.max(0,depth),currentX:currentX*currentSpeed,currentY:currentY*currentSpeed,routeId};
}

export function waterStateAt(x, y, options) {
  return measureWaterAt(x,y,options,true);
}

export function waterDepthAt(x, y, options) {
  return measureWaterAt(x,y,options,false);
}

export function waterSurfaceDepthAt(x, y, options) {
  return measureWaterAt(x,y,options,false,0,true);
}

let shoreLakesKey = '', shoreLakes = [];
function lakesForShoreProfile(definition, dimensionId) {
  const key = `${dimensionId}:${worldGeometryCacheKey(definition)}`;
  if (key !== shoreLakesKey) {
    shoreLakesKey = key;
    shoreLakes = (definition.edits || []).filter(edit => edit.type === 'lake').map(lake => {
      const points = Array.isArray(lake.outline) && lake.outline.length >= 3
        ? lake.outline.map(([offsetX, offsetY]) => [lake.x + offsetX, lake.y + offsetY])
        : [[lake.x - lake.radius, lake.y - lake.radius], [lake.x + lake.radius, lake.y + lake.radius]];
      return {
        lake,
        bounds: {
          left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
          top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])),
        },
      };
    });
  }
  return shoreLakes;
}

export function waterShoreProfileAt(x, y, options = {}) {
  const definition = getWorldDefinition();
  const dimensionId = options.dimensionId || definition.dimensionId;
  const theme = options.theme || definition.theme;
  const matchingDefinition = dimensionId === definition.dimensionId;
  let distance = Infinity, waterWidth = 0;

  if (matchingDefinition) for (const { lake, bounds } of lakesForShoreProfile(definition, dimensionId)) {
    if (x < bounds.left - WATER_SHORE_MAX_REACH || x > bounds.right + WATER_SHORE_MAX_REACH
        || y < bounds.top - WATER_SHORE_MAX_REACH || y > bounds.bottom + WATER_SHORE_MAX_REACH) continue;
    const lakeDistance = -lakeSignedDepthAt(lake, x, y);
    if (lakeDistance < distance) {
      distance = lakeDistance;
      waterWidth = Math.max(0, Number(lake.radius) || 0);
    }
  }

  for (const route of waterwayRoutesForDimension(dimensionId, theme, options.origin)) {
    const reach = route.maxRenderWidth + WATER_SHORE_MAX_REACH;
    if (x < route.bounds.left - reach || x > route.bounds.right + reach
        || y < route.bounds.top - reach || y > route.bounds.bottom + reach) continue;
    for (let index = 0; index < route.segments.length; index++) {
      const segment = route.segments[index];
      const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const along = clamp(((x - segment.a.x) * dx + (y - segment.a.y) * dy) / lengthSquared, 0, 1);
      const nearestX = segment.a.x + dx * along, nearestY = segment.a.y + dy * along;
      const pointDistance = Math.hypot(x - nearestX, y - nearestY);
      const widthStart = route.renderWidths[index] ?? route.width;
      const widthEnd = route.renderWidths[index + 1] ?? route.width;
      const channelWidth = widthStart + (widthEnd - widthStart) * along;
      const shoreDistance = pointDistance - channelWidth;
      if (shoreDistance < distance) {
        distance = shoreDistance;
        waterWidth = channelWidth;
      }
    }
  }

  const sandWidth = clamp(WATER_SHORE_BANDS.sandBase
    + waterWidth * WATER_SHORE_BANDS.sandWidthPerWaterWidth,
  WATER_SHORE_BANDS.sandMin, WATER_SHORE_BANDS.sandMax);
  return { distance, waterWidth, sandWidth };
}

export function waterShoreDistanceAt(x, y, options = {}) {
  return waterShoreProfileAt(x, y, options).distance;
}

export function waterShoreBandAt(x, y, options = {}) {
  const profile = waterShoreProfileAt(x, y, options);
  if (profile.distance <= .08) return 0;
  let boundary = profile.sandWidth;
  if (profile.distance <= boundary) return 1;
  boundary += WATER_SHORE_BANDS.mixed;
  if (profile.distance <= boundary) return 2;
  boundary += WATER_SHORE_BANDS.earth;
  if (profile.distance <= boundary) return 3;
  boundary += WATER_SHORE_BANDS.grass;
  if (profile.distance <= boundary) return 4;
  return 0;
}

const shoreRandom = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function waterShoreTileAt(x, y, options = {}) {
  const tileX = Math.floor(x), tileY = Math.floor(y);
  const band = waterShoreBandAt(tileX + .5, tileY + .5, options);
  if (!band) return null;
  const mix = shoreRandom(Math.floor(tileX / 2), Math.floor(tileY / 2));
  const gravel = shoreRandom(Math.floor(tileX / 3) + 19, Math.floor(tileY / 3) + 43) < .42;
  const soilTile = gravel ? 'shore-gravel' : 'shore-dirt';
  if (band === 1) return 'sand';
  if (band === 2) return mix < .6 ? 'sand' : soilTile;
  if (band === 3) return mix < .22 ? 'sand' : soilTile;
  return mix < .2 ? soilTile : 'shore-grass';
}

// Keep foliage sprites from overhanging a neighboring sand tile.
export function waterPlantExcludedAt(x, y, options = {}) {
  const profile = waterShoreProfileAt(x, y, options);
  if (!Number.isFinite(profile.distance) || profile.distance > profile.sandWidth + 2) return false;
  const tileX = Math.floor(x), tileY = Math.floor(y);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (waterShoreTileAt(tileX + dx + .5, tileY + dy + .5, options) === 'sand') return true;
  }
  return false;
}

// Keep standing trees beyond all four shoreline layers and a canopy-clearance buffer.
export function waterTreeExcludedAt(x, y, options = {}) {
  const profile = waterShoreProfileAt(x, y, options);
  const gradientWidth = profile.sandWidth + WATER_SHORE_BANDS.mixed
    + WATER_SHORE_BANDS.earth + WATER_SHORE_BANDS.grass;
  return profile.distance <= gradientWidth + WATER_SHORE_BANDS.treeBuffer;
}

export function waterBankDepthAt(x, y, options, extraClearance = 0) {
  const clearance=Number.isFinite(extraClearance)?Math.max(0,extraClearance):0;
  return measureWaterAt(x,y,options,false,WATER_BANK_WIDTH+clearance);
}

export function waterSurfaceBankDepthAt(x, y, options, extraClearance = 0) {
  const clearance=Number.isFinite(extraClearance)?Math.max(0,extraClearance):0;
  return measureWaterAt(x,y,options,false,WATER_BANK_WIDTH+clearance,true);
}
