import {MEDIEVAL_SPRITE_PROJECTION,medievalSpriteDestination} from './medieval-sprite-projection.mjs';
import { fixtureBounds } from './building-standard.mjs';
import { MEDIEVAL_FURNITURE } from './medieval-furniture.mjs';
const sprites=new Map(),LIMIT=96;
const palettes={
  cedar:{dark:'#49382e',wood:'#815a3d',light:'#bd8b58',fabric:'#a9574b',fabricShade:'#793f3a',accent:'#e0bd75',stone:'#70736a',leaf:'#477452'},
  pine:{dark:'#403a31',wood:'#715538',light:'#a98550',fabric:'#547664',fabricShade:'#3c564c',accent:'#d1b874',stone:'#687162',leaf:'#52815c'},
  hotel:{dark:'#40342f',wood:'#74533e',light:'#c09a62',fabric:'#5a7181',fabricShade:'#3d5261',accent:'#ead19a',stone:'#697074',leaf:'#49715e'},
  vista:{dark:'#393641',wood:'#685d59',light:'#ad9877',fabric:'#64678a',fabricShade:'#45465f',accent:'#d8bf91',stone:'#696875',leaf:'#547663'},
};
export const ROOM_FIXTURE_ATLAS=Object.freeze({
  url:'art/room-furniture/room-furniture-v3.png',version:3,frameSize:192,anchorX:96,anchorY:145,
  palettes:Object.freeze(['cedar','pine','hotel','vista']),
  rotations:Object.freeze([0,1,2,3]),
  rows:Object.freeze(['stool','chair','chair-back','chair-front','lamp','lamp-off','bed','bed-open','bed-cover','shower','nightstand','wardrobe','bookshelf','desk','table','sofa','chest','plant']),
});
export const ROOM_MATERIAL_ATLAS=Object.freeze({
  url:'art/room-furniture/room-materials-v1.png',version:1,tileSize:8,
  materials:Object.freeze(['wood','fabric','stone','metal','glass','leaf']),
});
export const MEDIEVAL_FURNITURE_ATLAS=Object.freeze({url:'art/room-furniture/medieval-furniture-v1.png',version:1,
  frameSize:128,columns:5,anchorX:MEDIEVAL_SPRITE_PROJECTION.anchor.x,anchorY:MEDIEVAL_SPRITE_PROJECTION.anchor.y,
  canonicalTileX:MEDIEVAL_SPRITE_PROJECTION.canonicalTileX,canonicalTileY:MEDIEVAL_SPRITE_PROJECTION.canonicalTileY,rotations:Object.freeze([0,1,2,3])});
const medievalFrameStart=new Map();let nextMedievalFrame=0;
for(const item of MEDIEVAL_FURNITURE){
  medievalFrameStart.set(item.id,nextMedievalFrame);
  nextMedievalFrame+=4+(item.family==='camas'?8:0)+(item.use==='light'?4:0);
}
let roomFixtureAtlas=null,medievalFurnitureAtlas=null;
export function setRoomFixtureAtlas(image){roomFixtureAtlas=image||null;sprites.clear();}
export function setMedievalFurnitureAtlas(image){medievalFurnitureAtlas=image||null;sprites.clear();}
export function hasRoomFixtureAtlas(){return Boolean(roomFixtureAtlas);}
export function hasMedievalFurnitureAtlas(){return Boolean(medievalFurnitureAtlas);}
export function medievalFurnitureFrameIndex(item){
  const catalogId=item?.properties?.catalogId||item?.catalogId||item?.id,start=medievalFrameStart.get(catalogId);
  if(start===undefined)return null;
  const rotation=((item.rotation||0)%4+4)%4,definition=MEDIEVAL_FURNITURE.find(entry=>entry.id===catalogId);
  if(definition.family==='camas'){
    if(item.kind==='bed-cover')return start+8+rotation;
    if(item.cover===false)return start+4+rotation;
    return start+rotation;
  }
  if(definition.use==='light'&&item.enabled===false)return start+4+rotation;
  return start+rotation;
}
export function fixturePalette(name){return palettes[name]||palettes.cedar;}
export function fixtureFrontFaceVisible(rotation=0,rotatable=true){
  if(!rotatable)return true;
  const angle=((rotation%4)+4)%4*Math.PI/2,normalX=-Math.sin(angle),normalY=Math.cos(angle);
  return normalX>.001||normalY>.001;
}

// All normalized parts fit the logical footprint. Pixels are projected from
// its contact point; navigation uses the authored physical collider instead.
export function paintRoomFixture(item,project,polygon) {
  const kind=item.renderKind||item.kind,variant=item.variantIndex||0,renderLayer=item.renderLayer||'full';
  const p={...fixturePalette(item.palette),...(item.colors||{})},h=item.height;
  const vertex=(u,v,z)=>{
    let x=item.width*(u-.5),y=item.depth*(v-.5);
    if(item.rotatable||kind==='stool'){const angle=(item.rotation||0)*Math.PI/2;[x,y]=[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];}
    const point=project(item.x+x,item.y+y,z);
    // Keep local coordinates beside the projected point. The atlas exporter
    // uses these as UVs for top, side and front faces before baking each view.
    return [Math.round(point.x),Math.round(point.y),u,v,z];
  };
  const plane=(u1,v1,u2,v2,z,color)=>polygon([vertex(u1,v1,z),vertex(u2,v1,z),vertex(u2,v2,z),vertex(u1,v2,z)],color);
  const box=(u1,v1,u2,v2,z0,z1,top=p.light,front=p.wood,side=p.dark)=>{
    const sides=[[[u1,v1],[u2,v1]],[[u2,v1],[u2,v2]],[[u2,v2],[u1,v2]],[[u1,v2],[u1,v1]]];
    sides.sort((a,b)=>a.reduce((sum,[u,v])=>sum+vertex(u,v,0)[1],0)-b.reduce((sum,[u,v])=>sum+vertex(u,v,0)[1],0));
    for(const [a,b] of sides){
      const [ax,ay]=vertex(...a,0),[bx,by]=vertex(...b,0);
      polygon([vertex(...a,z0),vertex(...b,z0),vertex(...b,z1),vertex(...a,z1)],(bx-ax)*(by-ay)>=0?front:side);
    }
    plane(u1,v1,u2,v2,z1,top);
  };
  // Panels belong to the furniture's local front face. Projecting from the
  // same rotated vertices as the body makes doors, shelves and trim turn with
  // the object instead of staying glued to one world-facing wall.
  const frontPanel=(u1,v1,u2,v2,color,z0=0,z1=h)=>{
    // These panels belong to one physical face. The opposite two rotations
    // turn that face away from the room camera, so painting them last would
    // make doors, drawers and shelf contents bleed through the far side.
    if(!fixtureFrontFaceVisible(item.rotation||0,item.rotatable||kind==='stool'))return;
    const bottom=z0+(z1-z0)*v1,top=z0+(z1-z0)*v2,side=1;
    polygon([vertex(u1,side,bottom),vertex(u2,side,bottom),
      vertex(u2,side,top),vertex(u1,side,top)],color);
  };
  const legs=(height,layer='all')=>{
    const positions=[];for(const u of [.05,.86])for(const v of [.05,.84])positions.push({u,v,depth:vertex(u+.045,v+.055,0)[1]});
    positions.sort((a,b)=>a.depth-b.depth);
    for(const [index,{u,v}] of positions.entries())if(layer==='all'||(layer==='back'&&index<2)||(layer==='front'&&index>=2))box(u,v,u+.09,v+.11,0,height,p.wood,p.wood,p.dark);
  };
  const headboard=()=>box(0,0,.075,1,.4,h+.72,p.light,p.wood,p.dark);
  const headboardInFront=vertex(0,.5,0)[1]>vertex(.5,.5,0)[1];
  if(item.catalogId&&['banheiras','lavatorios'].includes(item.family)){
    // A medieval wash tub is an open basin with raised stone/wood rim, feet,
    // visible water and forged taps, rather than a modern glass shower cabin.
    for(const [u,v]of [[.12,.12],[.78,.12],[.12,.78],[.78,.78]])box(u,v,u+.1,v+.1,0,.2,p.dark,p.wood,p.dark);
    box(.06,.06,.94,.94,.13,.36,p.stone,p.wood,p.dark);
    plane(.18,.18,.82,.82,.365,item.family==='banheiras'?'#668f91':'#d4c9aa');
    for(const [u,v,w,d]of [[.08,.08,.84,.12],[.08,.8,.84,.92],[.08,.2,.14,.8],[.86,.2,.92,.8]])box(u,v,w,d,.32,.49,p.light,p.wood,p.dark);
    box(.38,.04,.62,.12,.42,.68,p.accent,p.dark,p.dark);
    for(const u of [.38,.56])box(u,.06,u+.055,.1,.68,.78,p.accent,p.accent,p.dark);
    if(item.family==='banheiras')for(let ripple=0;ripple<3;ripple++)plane(.27+ripple*.16,.45,.37+ripple*.16,.48,.37,'#a1c3ad');
  }else if(item.catalogId&&item.family==='tochas'){
    box(.28,.42,.72,.58,0,.16,p.dark,p.wood,p.dark);
    box(.42,.42,.58,.58,.12,h-.38,p.wood,p.dark,p.dark);
    box(.34,.38,.66,.62,h-.52,h-.36,p.accent,p.dark,p.dark);
    polygon([vertex(.5,.5,h+.04),vertex(.37,.5,h-.34),vertex(.48,.5,h-.22),vertex(.55,.5,h-.43),vertex(.66,.5,h-.3)],'#dc7240');
    polygon([vertex(.5,.5,h-.02),vertex(.45,.5,h-.27),vertex(.53,.5,h-.18),vertex(.57,.5,h-.32)],'#f6d075');
  }else if(item.catalogId&&['velas','candelabros','lustres','lanternas'].includes(item.family)){
    const hanging=item.family==='lustres',branchCount=item.family==='velas'?1:item.family==='lanternas'?1:item.family==='candelabros'?3:5;
    const baseZ=h*(hanging?.86:.12), stemTop=h*(hanging?.98:.68);
    if(hanging)box(.46,.46,.54,.54,stemTop,h,p.dark,p.accent,p.dark);
    else box(.38,.38,.62,.62,0,.12,p.stone,p.dark,p.dark);
    box(.46,.46,.54,.54,hanging?stemTop*.6:.12,hanging?stemTop:stemTop*.72,p.accent,p.dark,p.dark);
    for(let flame=0;flame<branchCount;flame++){
      const angle=flame*Math.PI*2/branchCount,u=.5+Math.cos(angle)*(hanging?.34:.25),v=.5+Math.sin(angle)*(hanging?.34:.25),z=baseZ+(hanging?0:flame%2*.06);
      if(item.family==='lanternas'){
        box(u-.12,v-.12,u+.12,v+.12,z,z+.42,'#e7bd70','#795a3b',p.dark);
        box(u-.08,v-.08,u+.08,v+.08,z+.08,z+.34,'#ffe3a366','#b18952',p.dark);
        box(u-.15,v-.15,u+.15,v-.15,z+.4,z+.46,p.accent,p.accent,p.dark);
      }else{
        box(u-.035,v-.035,u+.035,v+.035,z-.12,z+.03,p.accent,p.dark,p.dark);
        polygon([vertex(u,v,z+.19),vertex(u-.07,v,z+.02),vertex(u,v,z+.07),vertex(u+.06,v,z+.02)],'#e78742');
        polygon([vertex(u,v,z+.15),vertex(u-.025,v,z+.04),vertex(u+.025,v,z+.04)],'#f8d77b');
        if(item.family!=='velas')box(.5,.5,u,v,z-.04,z,p.accent,p.dark,p.dark);
      }
    }
  }else if(item.catalogId&&item.family==='bercos'){
    box(.05,.05,.95,.95,.12,.34,p.dark,p.wood,p.dark);
    box(.11,.11,.89,.89,.34,.52,'#e2d6b6','#b6a589','#89795f');
    for(const u of [.08,.84])box(u,.06,u+.08,.94,.35,h,p.light,p.wood,p.dark);
    for(let rail=0;rail<5;rail++){const v=.13+rail*.16;box(.1,v,.9,v+.035,.46,h-.08,p.accent,p.wood,p.dark);}
    box(.08,.04,.92,.15,h-.12,h,p.light,p.wood,p.dark);
    box(.18,.16,.42,.42,h,h+.1,'#f1e6cd','#d2c5a9','#b4a287');
  }else if(kind==='stool'){
    for(const u of [.22,.66])for(const v of [.22,.66])box(u,v,u+.12,v+.12,0,h-.12,p.wood,p.wood,p.dark);
    const ring=Array.from({length:8},(_,i)=>[.5+Math.cos(i*Math.PI/4)*.5,.5+Math.sin(i*Math.PI/4)*.5]);
    const edges=ring.map((a,i)=>[a,ring[(i+1)%ring.length]]).sort((a,b)=>a.flat().reduce((n,v)=>n+v,0)-b.flat().reduce((n,v)=>n+v,0));
    for(const [a,b] of edges)polygon([vertex(...a,h-.12),vertex(...b,h-.12),vertex(...b,h),vertex(...a,h)],p.wood);
    polygon(ring.map(([u,v])=>vertex(u,v,h)),p.light);
    // An offset wood joint shows the turn without painting a UI arrow on wood.
    plane(.22,.24,.78,.3,h+.01,p.wood);
    plane(.25,.35,.42,.39,h+.012,p.wood);
  }else if(kind==='lamp'){
    box(.08,.08,.92,.92,0,.16,p.stone,p.stone,p.dark);
    const low=h-.82,high=h-.22,lit=item.enabled!==false,glow=item.light?.color||'#ffe5a5';
    if(item.family==='tochas'){
      box(.36,.4,.64,.62,.12,h*.52,p.dark,p.wood,p.dark);
      box(.3,.34,.7,.68,h*.52,h*.78,p.accent,p.wood,p.dark);
      box(.38,.42,.62,.58,h*.78,h*.91,lit?glow:'#59615a',lit?'#e9a85e':'#53615b',p.dark);
      if(lit)polygon([vertex(.5,.5,h*.99),vertex(.34,.5,h*.88),vertex(.46,.5,h*.75),vertex(.55,.5,h*.87),vertex(.68,.5,h*.77),vertex(.62,.5,h*.96)],'#f2a34f');
      return;
    }
    if(item.family==='velas'){
      box(.12,.12,.88,.88,0,.18,p.stone,p.dark,p.dark);
      box(.45,.45,.55,.55,.18,h*.83,lit?'#e7d5a1':'#867e68','#c8b78e','#70634e');
      box(.44,.44,.56,.56,h*.83,h*.9,p.accent,p.dark,p.dark);
      if(lit)polygon([vertex(.5,.5,h),vertex(.42,.5,h*.88),vertex(.52,.5,h*.84),vertex(.59,.5,h*.92)],'#ffe29a');
      return;
    }
    if(item.family==='candelabros'||item.family==='lustres'){
      const hanging=item.family==='lustres',stemBottom=h*(hanging?.72:.3),stemTop=h*.8,arms=h*(hanging?.84:.76);
      box(.46,.46,.54,.54,stemBottom,stemTop,p.accent,p.wood,p.dark);
      for(const u of [.18,.42,.66]){
        const center=u+.08;
        box(center-.025,.46,center+.025,.54,arms-.12,arms,p.accent,p.wood,p.dark);
        box(center-.1,.39,center+.1,.61,arms-.16,arms-.1,p.accent,p.dark,p.dark);
        if(lit)polygon([vertex(center,.5,arms+.08),vertex(center-.045,.5,arms),vertex(center,.5,arms-.04),vertex(center+.04,.5,arms)],'#ffe29a');
      }
      if(hanging){box(.05,.05,.95,.95,h*.25,h*.33,p.dark,p.wood,p.dark);box(.46,.46,.54,.54,h*.33,stemBottom,p.dark,p.wood,p.dark);}
      else box(.15,.15,.85,.85,0,.2,p.stone,p.wood,p.dark);
      return;
    }
    if(item.family==='lanternas'){
      box(.12,.12,.88,.88,0,.18,p.stone,p.dark,p.dark);
      box(.25,.25,.75,.75,.18,h*.82,lit?(item.light?.color||'#ffd28c'):'#6b7771','#624d37','#44392f');
      for(const u of [.19,.75])box(u,.19,u+.06,.81,.18,h*.86,p.accent,p.dark,p.dark);
      box(.2,.2,.8,.8,h*.82,h*.9,p.dark,p.wood,p.dark);
      box(.42,.42,.58,.58,h*.9,h*.97,p.dark,p.dark,p.dark);
      if(lit)polygon([vertex(.5,.5,h*.82),vertex(.44,.5,h*.58),vertex(.5,.5,h*.46),vertex(.57,.5,h*.64)],'#ffe29a');
      return;
    }
    box(.44,.44,.56,.56,.16,low,p.light,p.wood,p.dark);
    box(.03,.03,.97,.97,low-.08,low,p.wood,p.dark,p.dark);
    box(.1,.1,.9,.9,low,high,lit?glow:'#7c8b86',lit?'#edc57c':'#596c68',lit?'#c39b59':'#40544f');
    for(const u of [.04,.86])for(const v of [.04,.86])box(u,v,u+.1,v+.1,low,high,p.wood,p.dark,p.dark);
    box(0,0,1,1,high,high+.08,p.wood,p.dark,p.dark);
    for(const [a,b,color] of [[[0,0],[1,0],p.dark],[[0,0],[0,1],p.wood],[[1,0],[1,1],p.wood],[[0,1],[1,1],p.light]])
      polygon([vertex(...a,high+.08),vertex(...b,high+.08),vertex(.5,.5,h+.1)],color);
    // A small pull at the front gives the usable lantern a physical detail.
    box(.72,.92,.77,.98,low-.2,low+.2,p.accent,p.accent,p.dark);
  }else if(kind==='bed'){
    legs(.42);box(0,0,1,1,.4,.65,p.light,p.wood,p.dark);
    box(.03,.04,.97,.96,.65,h,'#e2d6b6','#b6a589','#89795f');
    // u is the LONG axis: the headboard belongs at u=0. Paint the
    // near headboard last so bedding cannot appear through its solid back.
    if(!headboardInFront)headboard();
    box(.12,.16,.31,.84,h,h+.14,'#f1e6cd','#d2c5a9','#b4a287');
    if(item.cover!==false)paintBedCover(item,vertex,plane,polygon,p,h);
    if(headboardInFront)headboard();
  }else if(kind==='bed-cover'){
    paintBedCover(item,vertex,plane,polygon,p,h);
    // This layer is drawn over a sleeping avatar too. The near headboard
    // must still occlude both the sleeper and the duvet in those facings.
    if(headboardInFront)headboard();
  }else if(kind==='shower'){
    const metal='#819496',metalLight='#b6c5bd',glass='#9bc5bc70';
    box(.04,.04,.96,.96,0,.12,p.stone,p.stone,p.dark);
    box(.09,.09,.91,.91,.12,.22,'#b5c4b6','#738782','#4b5c58');
    // Three glass panels keep one side open as a clear entrance; rotation chooses its face.
    for(const [u,v] of [[.08,.08],[.84,.08],[.84,.84]])box(u,v,u+.055,v+.055,.2,h-.08,metalLight,metal,metal);
    for(const [a,b] of [[[[.08,.08],[.92,.08]]],[[[.92,.08],[.92,.92]]],[[[.92,.92],[.08,.92]]]]){
      const [[u1,v1],[u2,v2]]=a;
      polygon([vertex(u1,v1,.24),vertex(u2,v2,.24),vertex(u2,v2,h-.12),vertex(u1,v1,h-.12)],glass);
      polygon([vertex(u1,v1,h-.12),vertex(u2,v2,h-.12),vertex(u2,v2,h-.07),vertex(u1,v1,h-.07)],metalLight);
    }
    box(.08,.08,.92,.92,h-.08,h,metalLight,metal,metal);
    box(.18,.08,.28,.18,h-.12,h-.02,p.accent,metal,metal);
    box(.15,.08,.31,.16,h-.22,h-.12,metalLight,metal,metal);
    for(let drop=0;drop<3;drop++)plane(.19+drop*.035,.2,.205+drop*.035,.22,h-.28-drop*.04,'#9ccbd2');
  }else if(kind==='chair'){
    if(renderLayer==='chair-front'){legs(.95,'front');return;}
    legs(.95,renderLayer==='chair-back'?'back':'all');
    if(renderLayer==='chair-front')return;
    box(0,0,1,1,.95,1.08,p.fabric,p.wood,p.dark);
    box(.03,.03,.15,.97,1.05,h,p.light,p.wood,p.dark);
    box(.01,.04,.18,.96,h-.08,h,p.light,p.wood,p.dark);
    if(item.family==='tronos'){
      box(.03,.08,.2,.22,.88,1.05,p.accent,p.wood,p.dark);box(.8,.08,.97,.22,.88,1.05,p.accent,p.wood,p.dark);
      box(.04,.06,.14,.94,1.05,h+.12,p.accent,p.wood,p.dark);
    }
  }else if(kind==='sofa'){
    legs(.3);box(0,0,1,1,.25,.65,p.wood,p.wood,p.dark);
    box(.06,.08,.94,.94,.65,1.0,p.fabric,p.fabric,p.dark);
    box(.02,.02,.98,.18,.8,h,p.fabric,p.wood,p.dark);
    box(.01,.18,.13,.98,.6,1.35,p.fabric,p.fabric,p.dark);
    box(.87,.18,.99,.98,.6,1.35,p.fabric,p.fabric,p.dark);
    box(.49,.2,.51,.92,.99,1.015,p.accent,p.fabric,p.dark);
  }else if(['table','desk','nightstand','counter'].includes(kind)){
    if(kind==='counter'||kind==='nightstand'){
      box(.03,.03,.97,.97,.08,h-.12,p.wood,p.wood,p.dark);
      frontPanel(.08,.2,.92,.82,p.light,0,h-.12);
      if(kind==='nightstand')frontPanel(.45,.65,.55,.7,p.accent,0,h-.12);
      else for(const u of [.08,.5,.9])frontPanel(u,.13,u+.025,.88,p.wood,0,h-.12);
    }else legs(h-.12);
    box(0,0,1,1,h-.12,h,p.light,p.wood,p.dark);
    if(kind==='counter'){
      plane(.1,.17,.26,.7,h+.012,'#e5d6b3');plane(.13,.27,.23,.3,h+.018,p.wood);
      plane(.13,.4,.23,.43,h+.018,p.wood);
    }
    if(kind==='desk'){
      plane(.15,.2,.55,.7,h+.015,'#e7ddbd');
      plane(.22,.28,.48,.31,h+.02,p.fabric);plane(.22,.42,.43,.45,h+.02,p.wood);
    }
  }else if(kind==='wardrobe'||kind==='bookshelf'){
    box(0,0,1,1,.06,h,p.light,p.wood,p.dark);
    frontPanel(.06,.07,.94,.94,p.dark);
    if(kind==='wardrobe'){
      frontPanel(.09,.1,.48,.91,p.wood);frontPanel(.52,.1,.91,.91,p.wood);
      frontPanel(.4,.43,.44,.49,p.accent);frontPanel(.56,.43,.6,.49,p.accent);
      frontPanel(.13,.14,.17,.87,p.light);frontPanel(.86,.14,.9,.87,p.light);
    }else for(let row=0;row<3;row++){
      const bottom=.1+row*.28;
      frontPanel(.07,bottom,.93,bottom+.035,p.light);
      for(let book=0;book<6;book++)frontPanel(.11+book*.13,bottom+.04,.19+book*.13,bottom+.2,
        ['#92564d','#587b70','#c7af73','#6c7391'][((book+row)%4)]);
    }
    box(-.015,-.015,1.015,1.015,h-.08,h+.03,p.light,p.wood,p.dark);
  }else if(kind==='fireplace'){
    box(0,0,1,1,0,h*.72,p.stone,p.stone,p.dark);
    box(.2,.03,.8,.5,h*.72,h,p.stone,p.stone,p.dark);
    for(const row of [.18,.36,.54]){
      frontPanel(.04,row,.14,row+.035,p.light,0,h*.72);
      frontPanel(.86,row,.96,row+.035,p.light,0,h*.72);
    }
    frontPanel(.17,.68,.83,.73,p.dark,0,h*.72);
    frontPanel(.2,.73,.8,.79,p.light,0,h*.72);
    frontPanel(.15,.08,.85,.65,p.dark,0,h*.72);
    polygon([vertex(.25,1,.15),vertex(.42,1,h*.4),vertex(.52,1,h*.24),vertex(.68,1,h*.42),vertex(.79,1,.15)],'#d27d43');
    polygon([vertex(.39,1,.15),vertex(.53,1,h*.34),vertex(.67,1,.15)],'#f2c578');
    frontPanel(0,.68,1,.75,p.light,0,h*.72);
  }else if(kind==='plant'){
    box(.2,.2,.8,.8,0,h*.3,'#ac7955','#88583f',p.dark);
    box(.15,.15,.85,.85,h*.24,h*.34,p.accent,p.wood,p.dark);
    plane(.24,.24,.76,.76,h*.345,p.dark);
    for(const [u,v,top] of [[.1,.2,.78],[.8,.2,.88],[.45,.8,1]]){
      polygon([vertex(.48,.48,h*.22),vertex(u,v,h*top*.72),vertex(u,v,h*top),vertex(.55,.55,h*.5)],p.leaf);
      polygon([vertex(.5,.5,h*.24),vertex(u+.07,v,h*top),vertex(.58,.54,h*.62)],'#7d9c62');
    }
  }else{
    box(0,0,1,1,.05,h,p.light,p.wood,p.dark);
    frontPanel(.05,.65,.95,.7,p.dark);frontPanel(.44,.4,.56,.57,p.accent);
  }
  // Variants alter the actual silhouette and joinery: crests, turned posts,
  // forged corner bands and feet are rendered in the same projected faces.
  if(item.catalogId){
    const profile=item.silhouette||'plain',span=profile==='arched'?.26:profile==='gothic'?.18:.12;
    if(['carved','gothic','ceremonial','arched'].includes(profile)&&['chair','sofa','bed','wardrobe','bookshelf'].includes(kind)){
      const crestY=kind==='bed'?.92:.08,crestZ=kind==='bed'?h+.58:h+.06;
      polygon([vertex(.5-span,crestY,crestZ),vertex(.5,crestY,crestZ+.13+variant%3*.025),vertex(.5+span,crestY,crestZ)],p.accent);
    }
    if(['ironbound','reinforced'].includes(profile))for(const [u,v]of [[.08,.12],[.82,.12],[.08,.8],[.82,.8]])box(u,v,u+.1,v+.06,h*.18,h*.24,p.accent,p.dark,p.dark);
    if(['turned','woven'].includes(profile))for(let n=0;n<2+variant%3;n++){
      const x=.18+n*(.64/(1+variant%3));plane(x,.12,x+.035,.88,h+.012,n%2?p.accent:p.dark);
    }
    if(['chair','stool','sofa'].includes(kind)&&variant%2===1){
      for(const u of [.12,.82])box(u,.04,u+.07,.13,h*.48,h*.56,p.accent,p.wood,p.dark);
    }
    if(kind==='lamp'&&variant%3===2){
      for(let n=0;n<1+variant%4;n++){const angle=n*Math.PI*2/(1+variant%4),u=.5+Math.cos(angle)*.26,v=.5+Math.sin(angle)*.26;box(u-.035,v-.035,u+.035,v+.035,h*.72,h*.82,p.accent,p.wood,p.dark);}
    }
  }
}

function paintBedCover(item,vertex,plane,polygon,p,h){
  boxLocal();
  const quiltDiamond=(u,v,size,color)=>polygon([
    vertex(u,v-size,h+.055),vertex(u+size*.72,v,h+.055),vertex(u,v+size,h+.055),vertex(u-size*.72,v,h+.055),
  ],color);
  for(const v of [.29,.5,.71]){quiltDiamond(.69,v,.075,p.fabricShade);quiltDiamond(.69,v,.034,p.accent);}
  plane(.34,.08,.96,.12,h+.052,p.accent);plane(.34,.88,.96,.92,h+.052,p.accent);
  plane(.34,.12,.38,.88,h+.052,p.accent);plane(.92,.12,.96,.88,h+.052,p.accent);
  function boxLocal(){
    const [u1,v1,u2,v2,z0,z1]=[.33,.03,.98,.97,h-.08,h+.04];
    const corners=[[u1,v1],[u2,v1],[u2,v2],[u1,v2]];
    const edges=corners.map((a,i)=>[a,corners[(i+1)%4]]);
    edges.sort((a,b)=>a.reduce((sum,v)=>sum+vertex(...v,0)[1],0)-b.reduce((sum,v)=>sum+vertex(...v,0)[1],0));
    for(const [a,b] of edges)polygon([vertex(...a,z0),vertex(...b,z0),vertex(...b,z1),vertex(...a,z1)],p.fabricShade);
    polygon(corners.map(([u,v])=>vertex(u,v,z1)),p.fabric);
  }
}

export function drawRoomFixtureAsset(ctx,item,position,{tileX,tileY,heightPixels,scale}){
  const authoredIndex=medievalFurnitureFrameIndex(item);
  if(medievalFurnitureAtlas&&authoredIndex!==null){
    const size=MEDIEVAL_FURNITURE_ATLAS.frameSize,destination=medievalSpriteDestination(position,tileX,tileY);
    const sourceX=(authoredIndex%MEDIEVAL_FURNITURE_ATLAS.columns)*size;
    const sourceY=Math.floor(authoredIndex/MEDIEVAL_FURNITURE_ATLAS.columns)*size;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(medievalFurnitureAtlas,sourceX,sourceY,size,size,
      destination.x,destination.y,destination.width,destination.height);ctx.restore();return;
  }
  const kind=item.catalogId?null:item.renderLayer==='chair-back'?'chair-back':item.renderLayer==='chair-front'?'chair-front':item.kind==='bed'&&item.cover===false?'bed-open'
    :item.kind==='lamp'&&item.enabled===false?'lamp-off':item.kind;
  const row=ROOM_FIXTURE_ATLAS.rows.indexOf(kind),palette=ROOM_FIXTURE_ATLAS.palettes.indexOf(item.palette||'cedar');
  if(roomFixtureAtlas&&row>=0&&palette>=0&&!item.colors&&!(kind.startsWith('lamp')&&item.light?.color)){
    const rotation=((item.rotation||0)%4+4)%4,size=ROOM_FIXTURE_ATLAS.frameSize,sourceX=rotation*size;
    const sourceY=(row*ROOM_FIXTURE_ATLAS.palettes.length+palette)*size;
    const unit=tileX/32;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(roomFixtureAtlas,sourceX,sourceY,size,size,
      Math.round(position.x-ROOM_FIXTURE_ATLAS.anchorX*unit),Math.round(position.y-ROOM_FIXTURE_ATLAS.anchorY*unit),
      Math.round(size*unit),Math.round(size*unit));ctx.restore();return;
  }
  const key=[item.catalogId||item.kind,item.renderLayer||'',item.silhouette||'',item.variantIndex||0,item.width,item.depth,item.height,item.palette,JSON.stringify(item.colors||{}),item.rotation||0,item.enabled!==false,item.light?.color||'',tileX,tileY,scale].join(':');
  let sprite=sprites.get(key);
  if(!sprite){
    const half=(item.width+item.depth)/2,left=Math.ceil(half*tileX)+4;
    const top=Math.ceil(half*tileY+(item.height+1)*heightPixels*scale)+4;
    const image=document.createElement('canvas');image.width=left*2;image.height=top+Math.ceil(half*tileY)+8;
    const c=image.getContext('2d');c.imageSmoothingEnabled=false;
    const project=(x,y,z)=>({x:left+(x-y)*tileX,y:top+(x+y)*tileY-z*heightPixels*scale});
    const polygon=(points,color)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();};
    paintRoomFixture({...item,x:0,y:0},project,polygon);
    sprite={image,left,top};sprites.set(key,sprite);
    if(sprites.size>LIMIT)sprites.delete(sprites.keys().next().value);
  }
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite.image,Math.round(position.x-sprite.left),Math.round(position.y-sprite.top));ctx.restore();
}
