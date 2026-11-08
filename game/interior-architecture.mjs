// The same local footprint drives the visible floor and physical exclusions.
// Apply only to the known public hotel lobby; saved private rooms are unchanged.
export function interiorFloorShape(layout) {
  const b=layout.bounds;
  if (layout.id !== 'hotel-lobby' || b.left !== 1.5 || b.right !== 14.5 || b.top !== 2.5 || b.bottom !== 11.5) return null;
  const shoulder=10.25, corridorLeft=4.5, corridorRight=11.5;
  return {
    outline:[[b.left,b.top],[b.right,b.top],[b.right,shoulder],[corridorRight,shoulder],
      [corridorRight,b.bottom],[corridorLeft,b.bottom],[corridorLeft,shoulder],[b.left,shoulder]],
    voids:[{left:b.left,right:corridorLeft,top:shoulder,bottom:b.bottom},
      {left:corridorRight,right:b.right,top:shoulder,bottom:b.bottom}],
  };
}
export function interiorPartitions() { return []; }
