import test from 'node:test';
import assert from 'node:assert/strict';
import {FALLEN_TREES,canOccupy,stepPlayer} from './world.mjs';
test('fallen trunks block movement instead of behaving as floor decorations',()=>{
 const tree=FALLEN_TREES[0];assert.equal(canOccupy(tree),false);
 let p={x:tree.x-3,y:tree.y};for(let i=0;i<120;i++)p=stepPlayer(p,{x:1,y:0},1/60);
 assert.ok(p.x<tree.x-1);assert.ok(canOccupy(p));
});
