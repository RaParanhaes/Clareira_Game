import {
  addInventoryItem, canAddInventoryItems, inventorySnapshot,
  restoreInventory, selectedInventoryItem,
} from './inventory.mjs';
import { AXE_TOOL_IDS } from './tool-progression.mjs';
import { WILDLIFE_BY_ID } from './wildlife.mjs';
import { attributeAttackBonus } from './progression.mjs';

const HUNT_REACH = 1.45;

export async function huntWildlifeTarget({
  player, animal, population, hasClearPath=()=>true, now=Date.now(), persist=async()=>{},
  rangeOverride=null, damageOverride=null, weaponOverride=null,
}) {
  const definition=animal&&WILDLIFE_BY_ID.get(animal.speciesId);
  if(!animal||!definition||animal.dimensionId!==(player.dimensionId||'surface')||animal.health<=0||animal.sheltered)
    return {status:'missing'};
  const allowedRange=Number.isFinite(rangeOverride)?Math.max(0,rangeOverride):HUNT_REACH;
  if(Math.hypot(player.position.x-animal.x,player.position.y-animal.y)>allowedRange)
    return {status:'too-far',definition};
  if(!hasClearPath(player.position,animal,definition))return {status:'blocked',definition};

  const weapon=weaponOverride||selectedInventoryItem(player.inventory);
  const isAxe=AXE_TOOL_IDS.includes(weapon);
  if(!weaponOverride&&weapon!=='knife'&&!isAxe)return {status:'no-tool',definition};

  const previousHealth=animal.health;
  const previousProvokedUntil=animal.provokedUntil||0;
  animal.provokedUntil=now+5000;
  const damage=Number.isFinite(damageOverride)?Math.max(1,Math.floor(damageOverride)):(isAxe?2:1)+attributeAttackBonus(player.inventory.attributes,player.inventory.learnedAbilities);
  animal.health=Math.max(0,animal.health-damage);
  if(animal.health>0){
    animal.state='ferido';
    animal.sheltered=false;animal.thinkAt=now;
    animal.targetX=animal.x;
    animal.targetY=animal.y;
    return {status:'injured',definition,health:animal.health,damage};
  }

  const loot={};
  for(const [item,quantity,chance] of definition.drops){
    if(Number.isFinite(chance)&&Math.random()>=Math.max(0,Math.min(1,chance)))continue;
    loot[item]=quantity;
  }
  if(!canAddInventoryItems(player.inventory,loot)){
    animal.health=previousHealth;
    animal.provokedUntil=previousProvokedUntil;
    return {status:'inventory-full',definition};
  }
  const before=inventorySnapshot(player.inventory);
  for(const [item,quantity] of Object.entries(loot))addInventoryItem(player.inventory,item,quantity);
  try{await persist(player);}
  catch{
    restoreInventory(player.inventory,before);
    animal.health=previousHealth;
    animal.provokedUntil=previousProvokedUntil;
    return {status:'save-failed',definition};
  }
  population?.delete(animal.id);
  return {status:'killed',definition,loot};
}
