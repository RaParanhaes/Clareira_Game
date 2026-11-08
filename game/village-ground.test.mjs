import test from 'node:test';
import assert from 'node:assert/strict';
import {isReceptionFootway} from './village-ground.mjs';
const reception={door:{x:83.2,enabled:true},bounds:{bottom:95.05}};
test('reception footway joins its frontage to the existing village route',()=>{
 for(const [x,y] of [[83.5,97.5],[84.5,97.5],[85.5,97.5],[86.5,97.5],[87.5,97.5],[87.5,98.5]])assert.equal(isReceptionFootway(x,y,reception),true,`${x},${y}`);
 assert.equal(isReceptionFootway(84.5,95.5,reception),false);
});
test('the footway is disabled when the entrance moves or is disabled',()=>{
 assert.equal(isReceptionFootway(84.5,97.5,{...reception,door:{x:84,enabled:true}}),false);
 assert.equal(isReceptionFootway(84.5,97.5,{...reception,door:{x:83.2,enabled:false}}),false);
});
