import test from 'node:test';
import assert from 'node:assert/strict';
import {roomView} from './room-view.mjs';
import {builtinRoomLayouts,getRoomLayout} from './world.mjs';

const groups=builtinRoomLayouts();
const layouts=[groups.legacy,groups.arrival,...Object.values(groups.lobbies),...Object.values(groups.cabins),...Object.values(groups.rentals),...Object.values(groups.apartments)];
for(const [width,height] of [[1440,900],[390,844],[320,640]])test(`rooms, walls and exit landing fit around the HUD at ${width}×${height}`,()=>{
  for(const layout of layouts){
    const v=roomView(layout,width,height),b=layout.bounds,wall=layout.wallHeight+(layout.elevation==='raised'?2:0);
    const points=[[b.left,b.top,wall],[b.right,b.top,wall],[b.left,b.bottom,0],[b.right,b.bottom,0],
      [layout.spawn.x-.55,layout.spawn.y-.55,0],[layout.spawn.x+.55,layout.spawn.y+.55,0]];
    for(const [x,y,z] of points){
      const px=v.centerX+(x-y-v.camera.x+v.camera.y)*v.tileX;
      const py=v.centerY+(x+y-v.camera.x-v.camera.y)*v.tileX*9/16-z*v.tileX*.75;
      assert.ok(px>=(width<600?112:184)-1&&px<=width-15,`${layout.id}: horizontal crop ${px}`);
      assert.ok(py>=(width<600?160:144)-1&&py<=height-(width<600?Math.min(300,height*.34):156)+1,`${layout.id}: vertical crop ${py}`);
    }
  }
});
test('a small cabin uses the desktop canvas at a readable scale',()=>{
 assert.ok(roomView(getRoomLayout('lodging','cabin-cedar-one','owned'),1440,900).tileX>=56);
});
test('the room camera frames the whole room and ignores where the player stands',()=>{
  const layout=getRoomLayout('lodging','cabin-cedar-one','owned');
  for(const [width,height] of [[1440,900],[390,844],[320,640]]){
    const fitted=roomView(layout,width,height);
    const target={x:layout.spawn.x+.7,y:layout.spawn.y-.35};
    const followed=roomView(layout,width,height,target);
    assert.deepEqual(followed,fitted,`${width}×${height}: the framing does not move with the player`);
    assert.notDeepEqual(followed.camera,target,`${width}×${height}: the camera rests on the room, not on the player`);
  }
});
