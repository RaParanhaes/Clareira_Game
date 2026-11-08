// Facade details are defined in world coordinates so they follow the wall plane.
export function roomWallSections(bounds, level, shape = null) {
  if (shape) return [
    {x1:bounds.left,y1:bounds.top,x2:bounds.right,y2:bounds.top,z:level.height,side:false},
    {x1:bounds.left,y1:bounds.top,x2:bounds.left,y2:shape.voids[0].top,z:level.height,side:true},
  ];
  return [
    {x1:bounds.left,y1:bounds.top,x2:bounds.right,y2:bounds.top,z:level.height,side:false},
    {x1:bounds.left,y1:bounds.top,x2:bounds.left,y2:level.bottom,z:level.height,side:true},
    {x1:bounds.left,y1:level.bottom,x2:bounds.left,y2:bounds.bottom,z:0,side:true},
  ];
}

export function facadePanel(project, wall, u1, v1, u2, v2) {
  const vertex=(u,v)=>{const p=project(wall.x1+(wall.x2-wall.x1)*u,
    wall.y1+(wall.y2-wall.y1)*u,wall.bottom+(wall.top-wall.bottom)*v);return [Math.round(p.x),Math.round(p.y)]};
  return [vertex(u1,v2),vertex(u2,v2),vertex(u2,v1),vertex(u1,v1)];
}

export function drawFacadeWindow(polygon, project, wall, {lit=true}={}) {
  const panel=(u1,v1,u2,v2,color)=>polygon(facadePanel(project,wall,u1,v1,u2,v2),color);
  // Recessed opening, heavy timber surround and a two-light medieval frame.
  panel(-.1,-.1,1.1,1.1,'#241f23');
  panel(-.02,-.02,1.02,1.02,'#49372a');
  panel(.055,.055,.945,.945,'#b68a52');
  panel(.115,.12,.485,.91,lit?'#e8a963':'#708b7a');
  panel(.515,.12,.885,.91,lit?'#f2c77f':'#829987');
  // Small leaded panes and a sturdy central mullion, visible at native scale.
  panel(.12,.48,.88,.55,'#4b382b');
  panel(.475,.1,.525,.93,'#4b382b');
  for(const u of [.29,.71])panel(u-.018,.13,u+.018,.91,'#5c4938');
  panel(.02,.02,.105,.98,'#d0a363');
  panel(.895,.02,.98,.98,'#614631');
  // Projecting lintel and sill catch light separately from the wall plane.
  panel(-.13,1,1.13,1.13,'#c39a62');
  panel(-.13,-.14,1.13,-.055,'#604832');
  panel(-.08,-.015,1.08,.075,'#a97d49');
  // Hinged plank shutters stand open at both jambs, with brace boards.
  panel(-.3,.06,-.12,.92,'#715338');
  panel(1.12,.06,1.3,.92,'#5b4231');
  panel(-.28,.1,-.14,.16,'#b18a57');
  panel(1.14,.1,1.28,.16,'#8e6843');
  polygon(facadePanel(project,wall,-.28,.18,-.14,.76),'#49372a');
  polygon(facadePanel(project,wall,1.14,.2,1.28,.78),'#382f2a');
  for(const v of [.28,.49,.7]){
    panel(-.3,v,-.12,v+.025,'#382e2c');panel(1.12,v,1.3,v+.025,'#302a2c');
  }
}
