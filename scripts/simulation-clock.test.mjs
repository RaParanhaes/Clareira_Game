import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationBudget} from './simulation-clock.mjs';
test('retardo de um milissegundo no timer não acumula atraso permanente',()=>{
 let remainder=0,total=0;
 for(let i=0;i<1000;i++){const budget=simulationBudget(remainder,.051);remainder=budget.remainder;total+=budget.steps;}
 assert.equal(total,3060);assert.ok(remainder<1/60);
});
test('trava longa tem recuperação limitada e tempo fracionário preservado',()=>{
 assert.equal(simulationBudget(0,5).steps,15);
 assert.equal(simulationBudget(0,-1).steps,0);
 const first=simulationBudget(0,.008);assert.equal(first.steps,0);
 assert.equal(simulationBudget(first.remainder,.009).steps,1);
});
