import test from 'node:test';
import assert from 'node:assert/strict';
import {clippedShadowBounds,avatarShadowProfile,avatarDirectionalShadowProfile,createGroundShadowLayer,moonShadowProfile,projectedRoofShadow,strongestBuildingShadowDirection,buildingGroundShadowStrength,attenuateShadowWithLocalLight,fillFootprintShadowPath,actorShadowOutline,casterShadowOpacity,localShadowProfile,celestialShadowDirection} from './ground-shadow-layer.mjs';
test('shadow patches clip to viewport and discard offscreen work',()=>{
 assert.deepEqual(clippedShadowBounds({left:-5,top:2.2,right:40,bottom:80},20,30),{left:0,top:2,width:20,height:28});
 assert.equal(clippedShadowBounds({left:30,top:30,right:60,bottom:60},20,20),null);
});
test('jumping softens the grounded contact without changing its world anchor',()=>{
 const floor=avatarShadowProfile(),jump=avatarShadowProfile({z:2});
 assert.ok(jump.contactOpacity<floor.contactOpacity);assert.ok(jump.contactWidth<floor.contactWidth);
 assert.ok(jump.castLength>floor.castLength);assert.ok(avatarShadowProfile({swimming:true}).contactOpacity<floor.contactOpacity);
});
test('avatar shadow scales consistently and bounds extreme light strength',()=>{
 const a=avatarShadowProfile({scale:1,strength:1}),b=avatarShadowProfile({scale:2,strength:100});
 for(const key of ['contactWidth','contactHeight','castLength','castWidth'])assert.equal(b[key],a[key]*2);
 assert.equal(b.castOpacity,a.castOpacity);assert.ok(a.castOpacity<=.42);
});
test('night avatar shadows stay attached and lose the detached hard silhouette',()=>{
 const profile=avatarShadowProfile({scale:1,strength:.3,lengthScale:1});
 const day=avatarDirectionalShadowProfile(profile,{daylight:1,sourceKind:'window'});
 const moonlit=avatarDirectionalShadowProfile(profile,{daylight:0,sourceKind:'moon'});
 const moonless=avatarDirectionalShadowProfile(profile,{daylight:0,sourceKind:'ambient'});
 assert.equal(day.hardSilhouette,true);assert.equal(day.length,profile.castLength);
 assert.equal(moonlit.hardSilhouette,false);assert.ok(moonlit.length<day.length);
 assert.ok(moonlit.opacity<day.opacity);assert.equal(moonless.opacity,0);
});
test('layer is inactive after compositing and restores scene context',()=>{
 const calls=[];const c={setTransform(){},fillRect(){},save(){calls.push('save');},restore(){calls.push('restore');},drawImage(){calls.push('draw');}};
 const layer=createGroundShadowLayer(()=>({getContext:()=>c}));layer.begin(20,30);assert.equal(layer.active,true);layer.composite(c);assert.equal(layer.active,false);assert.deepEqual(calls,['save','restore','save','draw','restore']);
 layer.composite(c);assert.equal(calls.length,5);
});

test('moon shadows remain faint and bounded, including extreme or absent moonlight',()=>{
 assert.equal(moonShadowProfile(0).strength,0);
 assert.ok(moonShadowProfile(.07).strength<moonShadowProfile(.14).strength);
 for(const strength of [0,.01,.14,1,10,NaN])for(const elevation of [-1,0,.5,1,3,NaN]){
  const p=moonShadowProfile(strength,elevation);assert.ok(p.strength>=0&&p.strength<=.30);assert.ok(p.lengthScale>=.45&&p.lengthScale<=1.1);
 }
 assert.ok(moonShadowProfile(.14,1).lengthScale<moonShadowProfile(.14,0).lengthScale);
});

test('actor projection follows the visible eighty-pixel body rather than a small contact ellipse',()=>{
 const p=avatarShadowProfile({scale:.52,lengthScale:.6,strength:.8});assert.ok(p.castLength>24&&p.castLength<26);
 const outline=actorShadowOutline({x:10,y:20},{x:1,y:0},p.castLength,p.castWidth);
 assert.equal(Math.max(...outline.map(p=>p.x)),10+p.castLength);assert.equal(Math.min(...outline.map(p=>p.x)),10);
});
test('roof projection includes wall height, ridge rise and eave beyond the ground footprint',async()=>{
 const {roofGeometry}=await import('./building-standard.mjs');
 const project=(x,y)=>({x:x*10,y:y*10});const direction={x:1,y:0,lengthScale:1};
 const building={bounds:{left:0,right:4,top:0,bottom:4},height:4,roofRise:3,roofEave:.5,roofAxis:'y'};
 const hull=projectedRoofShadow(building,roofGeometry(building),project,direction,12);
 assert.equal(Math.max(...hull.map(p=>p.x)),104); // ridge x=20 plus (4+3)*12
 assert.equal(Math.min(...hull.map(p=>p.y)),-5);assert.equal(Math.max(...hull.map(p=>p.y)),45);
 const taller={...building,height:8};const high=projectedRoofShadow(taller,roofGeometry(taller),project,direction,12);
 assert.ok(Math.max(...high.map(p=>p.x))>Math.max(...hull.map(p=>p.x)));
 const opposite=projectedRoofShadow(building,roofGeometry(building),project,{...direction,x:-1},12);
 assert.ok(Math.min(...opposite.map(p=>p.x))<0);
});

test('building shadow source samples exposed facades instead of its occluded center',()=>{
 const samples=[];
 const direction=strongestBuildingShadowDirection({left:2,right:8,top:4,bottom:10},(x,y)=>{
  samples.push({x,y});return {x,y,strength:x>8?.7:.12};
 });
 assert.deepEqual(samples,[{x:5,y:3.78},{x:8.22,y:7},{x:5,y:10.22},{x:1.78,y:7}]);
 assert.equal(direction.strength,.7);
 assert.equal(direction.x,8.22);
});

test('building ground shadows stay solar by day and survive weak moon or window light at night',()=>{
 assert.ok(Math.abs(buildingGroundShadowStrength({source:{kind:'sun'},strength:.84})-.5208)<1e-12);
 assert.ok(Math.abs(buildingGroundShadowStrength({source:{kind:'moon'},strength:.18})-.108)<1e-12);
 assert.ok(Math.abs(buildingGroundShadowStrength({source:{kind:'moon'},strength:.30})-.18)<1e-12);
assert.ok(buildingGroundShadowStrength({source:{kind:'moon'},strength:1})<=.20+1e-12);
 assert.equal(buildingGroundShadowStrength({source:{kind:'window'},strength:.04}),.28);
 assert.equal(buildingGroundShadowStrength({source:{kind:'fire'},strength:.04}),.28);
 assert.equal(buildingGroundShadowStrength({source:{kind:'ambient'},strength:0}),0);
});

test('nearby local lights fill house projections while unlit areas keep moon shadows',()=>{
 const shadow=.4;
 assert.equal(attenuateShadowWithLocalLight(shadow,0),shadow);
 assert.ok(attenuateShadowWithLocalLight(shadow,.8)<shadow*.1);
 assert.equal(attenuateShadowWithLocalLight(shadow,1),0);
 assert.equal(attenuateShadowWithLocalLight(shadow,NaN),shadow);
});

test('zero-offset house and actor shadows fill one non-canceling silhouette',()=>{
 const points=[{x:0,y:0},{x:6,y:0},{x:3,y:4}],paths=[];
 const context={beginPath:()=>paths.push('begin'),moveTo:(x,y)=>paths.push(['move',x,y]),
  lineTo:(x,y)=>paths.push(['line',x,y]),closePath:()=>paths.push('close'),fill:()=>paths.push('fill')};
 assert.equal(fillFootprintShadowPath(context,points),true);
 assert.deepEqual(paths,['begin',['move',0,0],['line',6,0],['line',3,4],'close','fill']);
 paths.length=0;fillFootprintShadowPath(context,points,2,1);
 assert.equal(paths.filter(path=>Array.isArray(path)&&path[0]==='line').length,5,'offset shadows keep their connecting contour');
 assert.equal(fillFootprintShadowPath(context,[]),false);
});

test('characters and trees use the same response to moonlight and local lights',()=>{
 for(const strength of [0,.001,.05,.18,.44,.8,1])assert.equal(avatarShadowProfile({strength}).castOpacity,casterShadowOpacity(strength));
 assert.equal(avatarShadowProfile({strength:0}).castOpacity,0);
 assert.ok(avatarShadowProfile({strength:0}).contactOpacity>0,'contact is separate from projection');
});
test('local lights fade out without an artificial minimum shadow',()=>{
 for(const kind of ['window','fire','lantern']){
  assert.equal(localShadowProfile(0,kind).strength,0);
  assert.ok(localShadowProfile(.001,kind).strength<.001);
  assert.ok(localShadowProfile(.1,kind).strength<localShadowProfile(.9,kind).strength);
 }
});
test('celestial direction is normalized and independent of viewport or actor position',()=>{
 const direction=celestialShadowDirection({x:.2,y:.1});assert.ok(direction.x>0&&direction.y>0);
 assert.ok(Math.abs(Math.hypot(direction.x,direction.y)-1)<1e-10);
 assert.deepEqual(direction,celestialShadowDirection({x:.2,y:.1}));
});
