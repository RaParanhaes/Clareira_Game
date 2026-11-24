import {
  addInventoryItem, canAddInventoryItems, inventorySnapshot,
  restoreInventory, selectedInventoryItem,
} from './inventory.mjs';
import { isWeapon, weaponDamageFor } from './equipment.mjs';
import { WILDLIFE_BY_ID } from './wildlife.mjs';
import { dungeonWildlifeDefinition } from './dungeon-bestiary.mjs';
import { attributeAttackBonus } from './progression.mjs';

const HUNT_REACH = 1.45;

export async function huntWildlifeTarget({
  player, animal, population, hasClearPath=()=>true, now=Date.now(), persist=async()=>{},
  rangeOverride=null, damageOverride=null, weaponOverride=null, onHit=()=>{}, deathRetentionMs=0,
}) {
  const definition=animal&&(WILDLIFE_BY_ID.get(animal.speciesId)||dungeonWildlifeDefinition(animal.speciesId));
  if(!animal||!definition||animal.dimensionId!==(player.dimensionId||'surface')||animal.health<=0||animal.sheltered)
    return {status:'missing'};
  const allowedRange=Number.isFinite(rangeOverride)?Math.max(0,rangeOverride):HUNT_REACH;
  if(Math.hypot(player.position.x-animal.x,player.position.y-animal.y)>allowedRange)
    return {status:'too-far',definition};
  if(!hasClearPath(player.position,animal,definition))return {status:'blocked',definition};

  const weapon=weaponOverride||selectedInventoryItem(player.inventory);
  const usableWeapon=isWeapon(weapon);
  if(!weaponOverride&&!usableWeapon)return {status:'no-tool',definition};

  const previousHealth=animal.health;
  const previousProvokedUntil=animal.provokedUntil||0;
  const previousProvokedBy=animal.provokedBy;
  animal.provokedUntil=now+5000;animal.provokedBy=player.id;
  const damage=Number.isFinite(damageOverride)?Math.max(1,Math.floor(damageOverride)):weaponDamageFor(weapon)+attributeAttackBonus(player.inventory.attributes,player.inventory.learnedAbilities);
  animal.health=Math.max(0,animal.health-damage);
  if(animal.health>0){
    animal.state='ferido';
    animal.sheltered=false;animal.thinkAt=now;
    animal.targetX=animal.x;
    animal.targetY=animal.y;
    onHit(animal, player);
    return {status:'injured',definition,health:animal.health,damage};
  }

  const loot={};
  for(const [item,quantity,chance] of definition.drops){
    if(Number.isFinite(chance)&&Math.random()>=Math.max(0,Math.min(1,chance)))continue;
    loot[item]=quantity;
  }
  if(!canAddInventoryItems(player.inventory,loot)){
    animal.health=previousHealth;
    animal.provokedUntil=previousProvokedUntil;animal.provokedBy=previousProvokedBy;
    return {status:'inventory-full',definition};
  }
  const before=inventorySnapshot(player.inventory);
  for(const [item,quantity] of Object.entries(loot))addInventoryItem(player.inventory,item,quantity);
  try{await persist(player);}
  catch{
    restoreInventory(player.inventory,before);
    animal.health=previousHealth;
    animal.provokedUntil=previousProvokedUntil;animal.provokedBy=previousProvokedBy;
    return {status:'save-failed',definition};
  }
  animal.diedAt=now;
  animal.state='morto';
  if(deathRetentionMs>0)animal.removeAt=now+deathRetentionMs;
  else population?.delete(animal.id);
  onHit(animal, player);
  return {status:'killed',definition,loot};
}
