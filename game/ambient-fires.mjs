// The dimension's own fires (the permanent spawn fire, for instance) must always exist. A saved
// fire list written before such a fire existed would otherwise hide it for good, so any ambient
// fire missing from the saved list is put back. Returns true when something was restored.
export function restoreAmbientFires(fires, ambient) {
  let restored = false;
  for (const [id, fire] of ambient) {
    if (fires.has(id)) continue;
    fires.set(id, { ...fire });
    restored = true;
  }
  return restored;
}
