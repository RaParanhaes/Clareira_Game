// Compact clients get player motion on each stream pass; shared world data is sent on changes or refresh.
export function createSnapshotStream({ refreshMs = 5000, maxBufferedBytes = 65536, staleMovementBytes = 8192, wildlifeRefreshMs = 100, personalRefreshMs = 500, compressMovement = false, groupKey, personalize, personalFields } = {}) {
  const sent = new WeakMap();
  const wildlifeSentAt = new WeakMap();
  const playerMetadataSent = new WeakMap();
  const personalSent = new WeakMap();
  const personalSentAt = new WeakMap();
  // Canonical catalog objects are immutable within a revision. Weak references
  // let old revisions disappear without retaining a cache per scene or player.
  const catalogJson = new WeakMap();
  const serializeCatalog = catalog => {
    if (!catalog || typeof catalog !== 'object') return JSON.stringify(catalog);
    const cached = catalogJson.get(catalog);
    if (cached && cached.revision === catalog.revision) return cached.json;
    const json = JSON.stringify(catalog);
    catalogJson.set(catalog, { revision: catalog.revision, json });
    return json;
  };
  const playerMetadataCache = new Map();
  let metadataCachePrunedAt = -Infinity;
  const metadataForPlayer = player => {
    const cached = playerMetadataCache.get(player.id);
    if (cached && cached.name === player.name && cached.location === player.location
        && cached.dimensionId === player.dimensionId && cached.color === player.color
        && cached.hasLodging === player.hasLodging && cached.privateLodging === player.privateLodging
        && cached.appearance === player.appearance) return cached;

    const value = {};
    for (const key of ['name', 'location', 'dimensionId']) {
      if (typeof player[key] === 'string') value[key] = player[key];
    }
    if (Number.isFinite(player.color)) value.color = player.color;
    for (const key of ['hasLodging', 'privateLodging']) {
      if (typeof player[key] === 'boolean') value[key] = player[key];
    }
    if (player.appearance && typeof player.appearance === 'object' && !Array.isArray(player.appearance)) {
      value.appearance = player.appearance;
    }
    const metadata = {
      name: player.name, location: player.location, dimensionId: player.dimensionId,
      color: player.color, hasLodging: player.hasLodging, privateLodging: player.privateLodging,
      appearance: player.appearance, value, signature: JSON.stringify(value),
    };
    playerMetadataCache.set(player.id, metadata);
    return metadata;
  };
  return (peers, buildSnapshot, now, forceWorld = false) => {
    if (now - metadataCachePrunedAt >= 5000) {
      const activePlayerIds = new Set([...peers.values()].map(player => player.id));
      for (const id of playerMetadataCache.keys()) if (!activePlayerIds.has(id)) playerMetadataCache.delete(id);
      metadataCachePrunedAt = now;
    }
    const groups = new Map();
    const recipients = [];
    for (const [socket, player] of peers) {
      if (socket.readyState !== 1 || socket.bufferedAmount > maxBufferedBytes) continue;
      const scene = groupKey?.(player) ?? (player.location === 'clearing' ? 'clearing' : `room:${player.roomKey}`);
      const previous = sent.get(socket);
      const full = !player.compactWorld || !previous || previous.scene !== scene || forceWorld
        || now - previous.at >= refreshMs;
      // On a lossy link queued motion is already stale; the next pass carries newer positions.
      if (!full && socket.bufferedAmount > staleMovementBytes) continue;
      const includeWildlife = full || !player.compactWorld
        || now - (wildlifeSentAt.get(socket) ?? -Infinity) >= wildlifeRefreshMs;
      let group = groups.get(scene);
      if (!group) {
        group = { player, needsWorld: false, needsWildlife: false };
        groups.set(scene, group);
      }
      group.needsWorld ||= full;
      group.needsWildlife ||= includeWildlife;
      recipients.push({ socket, player, scene, full });
    }

    for (const group of groups.values()) {
      const built = buildSnapshot(group.player, group.needsWorld, group.needsWildlife);
      const state = personalize ? { ...built } : built;
      // Shared world serialization must never carry the first viewer's keys,
      // claims or other account state to everyone in the same spatial group.
      if (personalize) {
        const privateKeys = personalFields || Object.keys(personalize(group.player));
        for (const key of privateKeys) delete state[key];
      }
      const { resources, fires, roomFurniture, villageActors, objectCatalog, worldDefinition, dimensions, dimension, dimensionId, ...moving } = state;
      // Most passes only need compact motion. Serialize the metadata-rich
      // version lazily, once per group, for legacy clients or changed metadata.
      group.movingState = moving;
      group.playerMetadata = new Map((Array.isArray(moving.players) ? moving.players : [])
        .filter(player => player?.id)
        .map(player => [player.id, metadataForPlayer(player)]));
      group.playerMetadataSignature = JSON.stringify([...group.playerMetadata]
        .map(([id, metadata]) => [id, metadata.signature]));
      if (Array.isArray(moving.players)) {
        group.movingCompactPlayers = JSON.stringify({
          ...moving,
          players: moving.players.map(({ name, color, appearance, inventory, location, dimensionId,
            hasLodging, privateLodging, ...motion }) => motion),
        });
      }
      group.full = group.needsWorld ? JSON.stringify(state) : null;
    }

    for (const { socket, player, scene, full } of recipients) {
      const group = groups.get(scene);
      const metadataChanged = player.compactPlayers
        && playerMetadataSent.get(socket) !== group.playerMetadataSignature;
      const common = full ? group.full
        : player.compactPlayers && !metadataChanged && group.movingCompactPlayers
          ? group.movingCompactPlayers
          : (group.moving ??= JSON.stringify(group.movingState));
      let packet = common;
      if (personalize && (full || personalSent.get(socket) === undefined
          || now - (personalSentAt.get(socket) ?? -Infinity) >= personalRefreshMs)) {
        const value = personalize(player);
        const { objectCatalog, ...dynamic } = value;
        const hasCatalog = Object.hasOwn(value, 'objectCatalog');
        const dynamicJson = JSON.stringify(dynamic);
        const prior = personalSent.get(socket);
        if (full || !prior || prior.dynamicJson !== dynamicJson || prior.hasCatalog !== hasCatalog
            || prior.catalog !== objectCatalog || prior.revision !== objectCatalog?.revision) {
          const serializedCatalog = hasCatalog ? serializeCatalog(objectCatalog) : undefined;
          const personal = serializedCatalog === undefined ? dynamicJson
            : `${dynamicJson.slice(0, -1)}${dynamicJson.length > 2 ? ',' : ''}"objectCatalog":${serializedCatalog}}`;
          packet = `${common.slice(0, -1)},${personal.slice(1)}`;
          personalSent.set(socket, { dynamicJson, hasCatalog, catalog: objectCatalog, revision: objectCatalog?.revision });
        }
        personalSentAt.set(socket, now);
      }
      if (full) {
        socket.send(packet, { compress: true });
        sent.set(socket, { scene, at:now });
      } else socket.send(packet, { compress: compressMovement });
      if (group.needsWildlife) wildlifeSentAt.set(socket, now);
      playerMetadataSent.set(socket, group.playerMetadataSignature);
    }
  };
}
