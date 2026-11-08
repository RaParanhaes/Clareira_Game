import test from 'node:test';
import assert from 'node:assert/strict';
import {gameDaysToMs,gameDayKey,gameDurationLabel,gameTimeRemaining} from './game-calendar.mjs';
import {resourceContractDayKey} from './resource-contracts.mjs';
import {LODGING_DAY_MS} from './lodging-catalog.mjs';
test('housing, daily contracts and economy share continuous world days',()=>{
 const day=24*60*1000;assert.equal(LODGING_DAY_MS,day);assert.equal(gameDaysToMs(7),day*7);assert.equal(gameDaysToMs(30),day*30);
 const start=Math.floor(Date.UTC(2026,9,29)/day)*day;
 assert.equal(resourceContractDayKey(start),gameDayKey(start));assert.equal(gameDayKey(start+day-1),gameDayKey(start));assert.notEqual(gameDayKey(start+day),gameDayKey(start));
 assert.equal(gameTimeRemaining(start+day/2,start),'0d 12h do jogo');assert.match(gameDurationLabel(day*30),/mês do jogo/);
});
