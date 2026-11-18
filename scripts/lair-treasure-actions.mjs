import { addInventoryItem, canAddInventoryItems, inventorySnapshot, restoreInventory } from '../game/inventory.mjs';
import { ownsGear } from '../game/equipment.mjs';

// dimensionId: onde o baú fica (a superfície para o covil exterior, a instância da masmorra para o chefe).
export async function openLairTreasure({ player, lair, state, store, storage, now = Date.now(), actionId, hasClearPath = () => true, runExclusive = fn => fn(), dimensionId = 'surface' }) {
  if (!player.accountId) return { ok:false, reason:'conta' };
  if (player.location !== 'clearing' || (player.dimensionId || 'surface') !== dimensionId) return { ok:false, reason:'local' };
  if (player.vitals?.waking || player.vitals?.downed || player.vitals?.health <= 0) return { ok:false, reason:'caido' };
  if (Math.hypot(player.position.x-lair.chest.x,player.position.y-lair.chest.y)>lair.interactRadius || !hasClearPath(player.position,lair.chest)) return { ok:false, reason:'longe' };
  if (state.guards.some(animal => animal.lairId === lair.id && animal.health > 0)) return { ok:false, reason:'guardas' };
  if (!state.contributors.has(player.id)) return { ok:false, reason:'contribuicao' };
  const currentClaim=(player.lairClaims||[]).find(claim=>claim.lairId===lair.id);
  if (currentClaim?.availableAt>now) return { ok:false, reason:'recarregando', availableAt:currentClaim.availableAt };
  const itemNeeded = !ownsGear(player.inventory, 'ironShortSword');
  if (itemNeeded && !canAddInventoryItems(player.inventory, { ironShortSword:1 })) return { ok:false, reason:'inventario' };
  return runExclusive(async () => {
    const before = inventorySnapshot(player.inventory);
    const reserved = await store.reserve(player.accountId, lair.id, { actionId, now, cooldownMs:lair.cooldownMs });
    if (!reserved.ok) return { ok:false, reason:'recarregando', availableAt:reserved.availableAt };
    if (itemNeeded && addInventoryItem(player.inventory, 'ironShortSword', 1) !== 1) {
      restoreInventory(player.inventory, before);
      try { await store.release(player.accountId, lair.id, actionId); }
      catch (releaseError) { console.error('Falha ao liberar claim do baú após falha de inventário.', releaseError); }
      return { ok:false, reason:'inventario' };
    }
    try {
      const wallet = await storage.creditWalletAndSaveProgress(player.accountId, lair.reward.bronze, inventorySnapshot(player.inventory));
      if (wallet) Object.assign(player.inventory, wallet.wallet || wallet);
      player.lairClaims = [...(player.lairClaims || []).filter(claim => claim.lairId !== lair.id),
        { lairId:lair.id, claimedAt:now, availableAt:reserved.availableAt, claimCount:1, lastActionId:actionId }];
      return { ok:true, availableAt:reserved.availableAt, sword:itemNeeded };
    } catch (error) {
      restoreInventory(player.inventory, before);
      let releaseError;
      try { await store.release(player.accountId, lair.id, actionId); }
      catch (caughtReleaseError) {
        releaseError=caughtReleaseError;
        console.error('Falha ao liberar claim do baú após erro no salvamento.', caughtReleaseError);
      }
      return { ok:false, reason:'falha-salvamento', error, ...(releaseError?{releaseError}:{}) };
    }
  });
}
