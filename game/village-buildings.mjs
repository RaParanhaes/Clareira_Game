import {objectBuildings,subscribeObjectCatalog} from './object-state.mjs';
import { BUILDING_STANDARD } from './building-standard.mjs';
import { DIMENSION_COORDINATE_OFFSET } from './dimension-layout.mjs';

const atVillage = value => value + DIMENSION_COORDINATE_OFFSET;

function building({ id, name, sign, kind, left, top, width, depth, roof, walls, side, foundation,
  roofAxis = 'y', chimney = false, doorOffset = .42, residentialPlan = null, windowObjects = null,
  architectureStyle = kind === 'hotel' ? 'fieldstone' : 'timber-daub', roofMaterial = 'shingles', roofEave = .3,
  roofRise = kind === 'hotel' ? 2.8 : kind === 'inn' ? 2.5 : 2.5, roofForm = 'gable',
  dormers = [], jettyDepth = 0, frontWing = null, flowerColors = kind === 'hotel'
    ? ['#c76349','#e1bc61','#ded2b0'] : kind === 'inn'
      ? ['#c85d48','#d8c28b','#b6c4ae'] : ['#d4a34b','#c96954','#eee0b7'] }) {
  const bounds = {
    left: atVillage(left),
    right: atVillage(left + width),
    top: atVillage(top),
    bottom: atVillage(top + depth),
  };
  return {
    id, name, sign, kind, bounds,
    door: { x: atVillage(left + width / 2), y: bounds.bottom + doorOffset },
    regionId: 'ember-woods',
    doorWidth: BUILDING_STANDARD.doorWidth / width,
    doorHeight: BUILDING_STANDARD.doorHeight,
    storeys: kind === 'hotel' ? 2 : 1,
    height: kind === 'hotel' ? BUILDING_STANDARD.storeyHeight * 2 : BUILDING_STANDARD.storeyHeight,
    roofAxis, chimney,
    roofRise, architectureStyle, roofMaterial, roofEave, roofForm, dormers, jettyDepth, frontWing, flowerColors,
    ...(residentialPlan ? { residentialPlan } : {}),
    ...(windowObjects ? { windowObjects } : {}),
    roof, walls, side, foundation,
  };
}

export const RECEPTION_BUILDING = building({
  id:'arrival',name:'Recepção da vila',sign:'RECEPÇÃO',kind:'reception',
  left:-.6,top:7.45,width:7.6,depth:7.6,doorOffset:.5,chimney:true,
  architectureStyle:'timber-daub',roofMaterial:'thatch',roofRise:2.75,roofEave:.42,
  frontWing:{side:'right',width:2.8,depth:2.7,wallHeight:3.25,roofRise:1.65},
  roof:['#80683b','#a1874c','#bba35f','#51442f'],
  walls:['#c2b48b','#d4c59a','#b8aa82','#a59773'],
  side:['#b5aa88','#c7ba91','#a99b78'],foundation:'#455154',
});

// Buildings are measured in the same world tiles as the 7×7 starter interior.
// Their different footprints make the first village read as a place, not a row
// of identical doors into magically repeated rooms.
export const VILLAGE_BUILDINGS = [
  building({
  id: 'lodging-pine-inn', name: 'Pousada dos Pinheiros', sign: 'POUSADA', kind: 'inn',
    left: 11, top: 22, width: 8, depth: 6,
    architectureStyle:'timber-daub',roofMaterial:'shingles',roofEave:.42,roofRise:2.8,
    dormers:[{offsetX:-1.65,width:1.4,depth:.9,height:.86,rise:.52},{offsetX:1.65,width:1.4,depth:.9,height:.86,rise:.52}],
    roof: ['#564339', '#796047', '#947453', '#40342e'],
    walls: ['#c5b58d', '#d5c79f', '#b7a77e', '#a39470'], side: ['#ad9d78', '#c3b18b', '#988968'],
    foundation: '#455154', chimney: true,
  }),
  building({
    id: 'lodging-ember-hotel', name: 'Hotel das Brasas', sign: 'HOTEL', kind: 'hotel',
    left: 22, top: 1, width: 14, depth: 10,
    architectureStyle:'fieldstone',roofMaterial:'shingles',roofEave:.65,roofRise:2.8,roofForm:'hipped',jettyDepth:.55,
    frontWing:{side:'left',width:3.8,depth:3.1,wallHeight:3.45,roofRise:1.45},
    roof: ['#414a4a', '#586364', '#707975', '#333b3d'],
    walls: ['#77766c', '#908d7e', '#706e64', '#5c5e58'], side: ['#656b68', '#777d75', '#555e5b'],
    foundation: '#38474b',
  }),
  building({
  id: 'lodging-rill-guesthouse', name: 'Hospedaria do Riacho', sign: 'HOSPEDARIA', kind: 'inn',
    left: 0, top: 25, width: 7, depth: 6,
    architectureStyle:'fieldstone',roofMaterial:'thatch',roofEave:.4,roofRise:2.65,
    frontWing:{side:'right',width:2.55,depth:2.5,wallHeight:3.15,roofRise:1.6},
    roof: ['#5b674b', '#778257', '#919767', '#424d3c'],
    walls: ['#8a8772', '#a49e82', '#7b7968', '#686b5e'], side: ['#777766', '#929078', '#696b5f'],
    foundation: '#46514e',
  }),
  building({
    id: 'cabin-cedar-one', name: 'Cabana do Cedro', sign: 'CABANA', kind: 'cabin',
    left: 22, top: 17, width: 7, depth: 7,
    // Residential pilot: a single open-plan room (sleeping + hearth) has one
    // bedroom window. Keep this record as the source for exterior and interior.
    residentialPlan: { storeys: 1, bedrooms: 1, bathrooms: 0,
      rooms: [{ id: 'cedar-main', use: 'sleeping-living', windowCount: 1 }],
      windowLimitPerBedroom: 1 },
    windowObjects: [{ id: 'cabin-cedar-one/window-bedroom', x: atVillage(27.65), y: atVillage(24),
      z: 1.95, nx: 0, ny: 1, width: 1.2, bottom: 1.05, top: 2.85,
      roomId: 'cedar-main', light: { strength: .8, color: '#efbc79', reach: 5.8 } }],
    architectureStyle:'timber-daub',roofMaterial:'thatch',roofEave:.5,roofRise:2.8,
    dormers:[{offsetX:-1.45,width:1.4,depth:.9,height:.86,rise:.52}],
    roof: ['#816a3d', '#a38a50', '#c0a75e', '#554630'],
    walls: ['#c2b48b', '#d4c59a', '#b8aa82', '#a59773'], side: ['#b5aa88', '#c7ba91', '#a99b78'],
    foundation: '#435052', chimney: true,
  }),
  building({
    id: 'cabin-cedar-two', name: 'Cabana da Samambaia', sign: 'CABANA', kind: 'cabin',
    left: 30, top: 28, width: 7, depth: 7,
    architectureStyle:'timber-daub',roofMaterial:'thatch',roofEave:.38,roofRise:2.65,roofForm:'hipped',
    frontWing:{side:'right',width:2.65,depth:2.45,wallHeight:3.1,roofRise:1.6},
    roof: ['#53634e', '#70805b', '#84946a', '#404e43'],
    walls: ['#98724e', '#aa8154', '#846343', '#6f543c'], side: ['#564a40', '#625044', '#4a413b'],
    foundation: '#435052', roofAxis: 'x',
  }),
  building({
    id: 'cabin-cedar-three', name: 'Cabana do Mirante', sign: 'CABANA', kind: 'cabin',
    left: 38, top: 7, width: 7, depth: 7,
    architectureStyle:'timber-daub',roofMaterial:'shingles',roofEave:.34,roofRise:2.8,
    frontWing:{side:'left',width:2.65,depth:2.6,wallHeight:3.15,roofRise:1.65},
    roof: ['#564034', '#72513a', '#8e6545', '#40312b'],
    walls: ['#d2ba8b', '#e2cd9e', '#bda074', '#8f704e'], side: ['#a7835c', '#b9956c', '#886649'],
    foundation: '#4a4941', roofAxis: 'x', chimney: true,
  }),
];

subscribeObjectCatalog(()=>{
 const values=objectBuildings(),arrival=values.find(b=>b.id==='arrival');
 Object.assign(RECEPTION_BUILDING.bounds,arrival.bounds);Object.assign(RECEPTION_BUILDING.door,arrival.door);
 const bounds=RECEPTION_BUILDING.bounds,door=RECEPTION_BUILDING.door;Object.assign(RECEPTION_BUILDING,arrival,{bounds,door});
 VILLAGE_BUILDINGS.splice(0,VILLAGE_BUILDINGS.length,...values.filter(b=>b.id!=='arrival'));
});

export function villageBuildingAt(x, y, padding = 0) {
  return VILLAGE_BUILDINGS.find(({ bounds }) => x >= bounds.left - padding && x <= bounds.right + padding
    && y >= bounds.top - padding && y <= bounds.bottom + padding) || null;
}

export function villageBuildingsInBounds(bounds, padding = 0) {
  return VILLAGE_BUILDINGS.filter(({ bounds: buildingBounds }) => buildingBounds.right + padding >= bounds.left
    && buildingBounds.left - padding <= bounds.right
    && buildingBounds.bottom + padding >= bounds.top
    && buildingBounds.top - padding <= bounds.bottom);
}
